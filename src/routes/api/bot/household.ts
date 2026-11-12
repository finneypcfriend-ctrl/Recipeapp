import { FIREBASE_WEB } from "@/lib/cloud/firebase-web";
import { createFileRoute } from "@tanstack/react-router";

const DOC_CAP = 200;

export const Route = createFileRoute("/api/bot/household")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { email?: string; password?: string; refreshToken?: string };
        try {
          body = (await request.json()) as { email?: string; password?: string; refreshToken?: string };
        } catch {
          return Response.json({ error: "Send JSON with the household email and password, or a refreshToken from an earlier read." }, { status: 400 });
        }
        const session = await openSession(body);
        if (!session.ok) return Response.json({ error: session.error }, { status: session.status });
        const documents = await readAll(session.idToken);
        return Response.json({
          projectId: FIREBASE_WEB.projectId,
          uid: session.uid,
          email: session.email,
          expiresIn: session.expiresIn,
          refreshToken: session.refreshToken,
          documents,
        });
      },
    },
  },
});

async function openSession(body: { email?: string; password?: string; refreshToken?: string }): Promise<
  { ok: true; idToken: string; refreshToken: string; uid: string; email: string; expiresIn: string } | { ok: false; status: number; error: string }
> {
  if (body.refreshToken?.trim()) {
    const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_WEB.apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: body.refreshToken.trim() }),
    });
    const payload = (await response.json()) as { id_token?: string; refresh_token?: string; user_id?: string; expires_in?: string; error?: { message?: string } };
    if (!response.ok || !payload.id_token) return { ok: false, status: 401, error: "That refresh token is no longer valid. Sign in with email and password again." };
    return { ok: true, idToken: payload.id_token, refreshToken: payload.refresh_token || body.refreshToken.trim(), uid: payload.user_id || "", email: "", expiresIn: payload.expires_in || "" };
  }
  const email = body.email?.trim() ?? "";
  const password = body.password ?? "";
  if (!email || !password) return { ok: false, status: 400, error: "Email and password are required." };
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB.apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const payload = (await response.json()) as { idToken?: string; refreshToken?: string; localId?: string; email?: string; expiresIn?: string; error?: { message?: string } };
  if (!response.ok || !payload.idToken) {
    const code = payload.error?.message ?? "";
    if (code.includes("INVALID_LOGIN_CREDENTIALS") || code.includes("EMAIL_NOT_FOUND") || code.includes("INVALID_PASSWORD")) {
      return { ok: false, status: 401, error: "That email or password does not match." };
    }
    return { ok: false, status: 401, error: "Could not sign in to the household." };
  }
  return { ok: true, idToken: payload.idToken, refreshToken: payload.refreshToken || "", uid: payload.localId || "", email: payload.email || email, expiresIn: payload.expiresIn || "" };
}

async function readAll(idToken: string): Promise<Record<string, unknown>> {
  const root = await listCollections(idToken, "");
  const names = root.length ? root : ["household"];
  const documents: Record<string, unknown> = {};
  for (const name of names) documents[name] = await readCollection(idToken, name);
  return documents;
}

async function readCollection(idToken: string, path: string): Promise<Record<string, unknown>> {
  const listed = await firestore<{ documents?: Array<{ name?: string; fields?: Record<string, unknown> }> }>(idToken, `documents/${path}?pageSize=${DOC_CAP}`);
  const out: Record<string, unknown> = {};
  for (const doc of listed.documents ?? []) {
    const id = doc.name?.split("/").pop() ?? "";
    if (!id) continue;
    const childPath = `${path}/${id}`;
    const nested = await listCollections(idToken, childPath);
    const children: Record<string, unknown> = {};
    for (const name of nested) children[name] = await readCollection(idToken, `${childPath}/${name}`);
    out[id] = { ...(doc.fields ? decodeFields(doc.fields) : {}), ...(nested.length ? { _collections: children } : {}) };
  }
  if ((listed.documents?.length ?? 0) >= DOC_CAP) out._truncated = true;
  return out;
}

async function listCollections(idToken: string, parent: string): Promise<string[]> {
  const root = `projects/${FIREBASE_WEB.projectId}/databases/(default)/documents`;
  const response = await fetch(`https://firestore.googleapis.com/v1/${root}${parent ? `/${parent}` : ""}:listCollectionIds`, {
    method: "POST",
    headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
    body: "{}",
  });
  if (!response.ok) return parent ? [] : ["household"];
  const payload = (await response.json()) as { collectionIds?: string[] };
  return payload.collectionIds ?? [];
}

async function firestore<T>(idToken: string, suffix: string): Promise<T> {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_WEB.projectId}/databases/(default)/${suffix}`, {
    headers: { authorization: `Bearer ${idToken}` },
  });
  if (!response.ok) return {} as T;
  return (await response.json()) as T;
}

function decodeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) out[key] = decodeValue(value);
  return out;
}

function decodeValue(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const entry = value as Record<string, unknown>;
  if ("stringValue" in entry) return entry.stringValue;
  if ("integerValue" in entry) return Number(entry.integerValue);
  if ("doubleValue" in entry) return entry.doubleValue;
  if ("booleanValue" in entry) return entry.booleanValue;
  if ("nullValue" in entry) return null;
  if ("timestampValue" in entry) return entry.timestampValue;
  if ("arrayValue" in entry) {
    const values = (entry.arrayValue as { values?: unknown[] } | undefined)?.values ?? [];
    return values.map((item) => decodeValue(item));
  }
  if ("mapValue" in entry) return decodeFields(((entry.mapValue as { fields?: Record<string, unknown> } | undefined)?.fields) ?? {});
  return null;
}
