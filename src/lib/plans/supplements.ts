import { emitCloud } from "@/lib/cloud/bridge";

const KEY = "recipes.supplements";

export interface SupplementItem {
  kind: "ingredient" | "side";
  name: string;
  uid?: string;
  starred?: boolean;
}

const ON_LIST = ["beef tallow", "MCT oil", "coconut oil", "beef cracklings", "eggs (large)", "pork rinds"];

const DEFAULTS: SupplementItem[] = ON_LIST.map((name) => ({ kind: "ingredient", name, starred: name === "beef tallow" }));

function ensurePreferred(items: SupplementItem[]): SupplementItem[] {
  const otherFats = new Set(["MCT oil", "coconut oil", "beef cracklings"]);
  const next = items.map((item) => {
    if (item.kind !== "ingredient") return item;
    if (item.name === "beef tallow") return { ...item, starred: true };
    if (otherFats.has(item.name)) return { ...item, starred: false };
    return item;
  });
  for (const name of ON_LIST) {
    if (!next.some((item) => item.kind === "ingredient" && item.name === name)) next.push({ kind: "ingredient", name, starred: name === "beef tallow" });
  }
  const tallow = next.find((item) => item.kind === "ingredient" && item.name === "beef tallow");
  if (!tallow) return next;
  return [tallow, ...next.filter((item) => item !== tallow)];
}

export function loadSupplements(): SupplementItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return DEFAULTS;
    const parsed = JSON.parse(raw) as SupplementItem[];
    if (!Array.isArray(parsed)) return DEFAULTS;
    const kept = parsed.filter((item) => item && (item.kind === "ingredient" || item.kind === "side") && typeof item.name === "string").map((item) => ({ ...item, starred: Boolean(item.starred) }));
    return ensurePreferred(kept);
  } catch {
    return DEFAULTS;
  }
}

export function saveSupplements(items: SupplementItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  emitCloud({ supplements: items });
}
