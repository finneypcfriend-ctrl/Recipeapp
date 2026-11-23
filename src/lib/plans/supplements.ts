import { emitCloud } from "@/lib/cloud/bridge";
import { replaceSupplementTags, seedSupplements, setSupplement, supplementNames } from "@/lib/sourced/tags";

const KEY = "recipes.supplements";
const RANK_KEY = "recipes.supplement-ranks";

export interface SupplementItem {
  kind: "ingredient" | "side";
  name: string;
  uid?: string;
  starred?: boolean;
}

/** Per person. Names are household supplements, in the order Tailor should try them. */
export interface SupplementRank {
  personId: string;
  order: string[];
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
  replaceSupplementTags(items.filter((item) => item.kind === "ingredient").map((item) => item.name));
}

export function householdSupplementNames(): string[] {
  ensureSupplementTags();
  return supplementNames();
}

export function ensureSupplementTags() {
  const seeded = loadSupplements().filter((item) => item.kind === "ingredient").map((item) => item.name);
  seedSupplements(seeded);
}

export function tagSupplement(name: string, on: boolean) {
  ensureSupplementTags();
  setSupplement(name, on);
  const items = loadSupplements().filter((item) => item.kind !== "ingredient" || item.name !== name);
  if (on && !items.some((item) => item.kind === "ingredient" && item.name === name)) items.push({ kind: "ingredient", name });
  saveSupplements(items);
}

function cleanRank(value: unknown): SupplementRank | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<SupplementRank>;
  if (typeof record.personId !== "string" || !record.personId) return null;
  const names = (list: unknown) => (Array.isArray(list) ? list.filter((name): name is string => typeof name === "string" && Boolean(name.trim())) : []);
  const legacy = record as { meals?: unknown; snacks?: unknown };
  const order = names(record.order);
  const meals = names(legacy.meals);
  const snacks = names(legacy.snacks);
  const merged = order.length ? order : [...meals, ...snacks.filter((name) => !meals.includes(name))];
  return { personId: record.personId, order: merged };
}

export function loadSupplementRanks(): SupplementRank[] {
  try {
    const raw = localStorage.getItem(RANK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const rank = cleanRank(item);
      return rank ? [rank] : [];
    });
  } catch {
    return [];
  }
}

export function saveSupplementRanks(ranks: SupplementRank[]) {
  localStorage.setItem(RANK_KEY, JSON.stringify(ranks));
  emitCloud({ supplementRanks: ranks });
}

export function writePersonRank(rank: SupplementRank) {
  const rest = loadSupplementRanks().filter((item) => item.personId !== rank.personId);
  saveSupplementRanks([rank, ...rest]);
}

export function rankFor(personId: string): SupplementRank {
  return loadSupplementRanks().find((rank) => rank.personId === personId) ?? { personId, order: [] };
}

/** Person's numbered order first, then the rest of the household list. */
export function orderedSupplements(personId: string | undefined): string[] {
  const base = householdSupplementNames();
  if (!personId) return base;
  const ranked = rankFor(personId).order.filter((name) => base.includes(name));
  return [...ranked, ...base.filter((name) => !ranked.includes(name))];
}
