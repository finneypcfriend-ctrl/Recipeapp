import { useEffect, useState } from "react";
import { authError, createHouseholdAccount, signInHousehold, watchAuth, watchCloudStatus, watchHouseholdName } from "@/lib/cloud/sync";

export function useHouseholdName() {
  const [name, setName] = useState("Household");
  useEffect(() => watchHouseholdName(setName), []);
  return name;
}

export function useHouseholdEmail() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  useEffect(() => watchAuth((next) => setEmail(next)), []);
  return email;
}

export function AccountBar() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => watchCloudStatus(setNotice), []);

  const run = async (create: boolean) => {
    setPending(true);
    setError("");
    setNotice("");
    try {
      if (create) await createHouseholdAccount(email, password);
      else await signInHousehold(email, password);
      setPassword("");
    } catch (err) {
      setError(authError(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-2 rounded-card border border-line bg-surface px-3 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        void run(false);
      }}
    >
      <p className="text-sm font-semibold">Household sign-in</p>
      <p className="text-xs text-muted">Sign in once on this browser. After that, a wiped browser can sign in again and get the same plans and lists.</p>
      <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" placeholder="Email" className="h-11 rounded-2xl border border-line bg-bg px-3 text-sm outline-none focus:border-tomato" />
      <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="Password" className="h-11 rounded-2xl border border-line bg-bg px-3 text-sm outline-none focus:border-tomato" />
      {error ? <p className="text-sm text-tomato">{error}</p> : null}
      {notice ? <p className="text-sm text-tomato">{notice}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending || !email || !password} className="h-11 rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink disabled:opacity-50">
          {pending ? "Working…" : "Sign in"}
        </button>
        <button type="button" disabled={pending || !email || !password} onClick={() => void run(true)} className="h-11 rounded-full border border-line px-4 text-sm font-semibold disabled:opacity-50">
          Create account
        </button>
      </div>
    </form>
  );
}
