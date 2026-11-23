import { emitCloud } from "@/lib/cloud/bridge";
import type { PlanBatch } from "@/lib/plans/model";

const KEY = "recipes.leftovers";

export type Leftover = PlanBatch;

export function loadLeftovers(): Leftover[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(isLeftover) : [];
  } catch {
    return [];
  }
}

export function saveLeftovers(items: Leftover[]) {
  const next = items.filter(isLeftover);
  localStorage.setItem(KEY, JSON.stringify(next));
  emitCloud({ leftovers: next });
  window.dispatchEvent(new Event("leftovers-changed"));
}

export function addLeftover(batch: PlanBatch): Leftover {
  const saved: Leftover = {
    id: crypto.randomUUID(),
    recipeUid: batch.recipeUid,
    title: batch.title,
    versionLabel: batch.versionLabel,
    servings: batch.servings,
    meatLbPerServing: batch.meatLbPerServing ?? null,
    servingOverride: batch.servingOverride ?? null,
  };
  saveLeftovers([saved, ...loadLeftovers()]);
  return saved;
}

export function removeLeftover(id: string) {
  saveLeftovers(loadLeftovers().filter((item) => item.id !== id));
}

function isLeftover(value: unknown): value is Leftover {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<Leftover>;
  return typeof record.id === "string" && typeof record.recipeUid === "string" && typeof record.title === "string" && typeof record.servings === "number" && record.servings > 0;
}
