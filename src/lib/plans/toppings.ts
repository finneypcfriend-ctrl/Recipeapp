import { emitCloud } from "@/lib/cloud/bridge";
import type { IngredientObj } from "@/lib/recipes/types";
import { getIngredient } from "@/lib/sourced";

export interface ToppingLine {
  name: string;
  servings: number;
}

export interface ToppingRecipe {
  id: string;
  title: string;
  baseId: string;
  version: number;
  versionLabel: string;
  lines: ToppingLine[];
}

const KEY = "recipes.toppings";
const TEMPLATE_KEY = "recipes.plate-templates";

export interface PlateTemplate {
  id: string;
  title: string;
  beefName: string;
  beef: number;
  extras: ToppingLine[];
  rows: Array<{ title: string; sourceId: string | null; baseId: string | null; lines: ToppingLine[] }>;
}

const STARTERS: ToppingRecipe[] = [
  plate("taco", "Taco", 1, [
    ["taco seasoning", 1],
    ["sour cream", 1],
    ["cheddar", 1],
    ["lettuce", 0.5],
    ["salsa", 1],
    ["hot sauce", 0.15],
  ]),
  plate("bbq", "BBQ", 1, [
    ["BBQ sauce (G Hughes sugar free)", 1],
    ["American cheese (Kraft Singles)", 1],
    ["mustard", 1],
  ]),
  plate("pasta", "Pasta", 1, [
    ["pasta sauce (bettergoods basil garlic)", 2],
    ["olives (pimento-stuffed)", 1],
    ["parmesan", 2],
  ]),
  plate("egg", "Egg and cheese", 1, [
    ["coconut aminos", 1],
    ["eggs (large)", 1],
    ["American cheese (Kraft Singles)", 1],
    ["lettuce", 0.3],
  ]),
];

function plate(id: string, title: string, version: number, lines: Array<[string, number]>): ToppingRecipe {
  return {
    id: `${id}-v${version}`,
    title,
    baseId: id,
    version,
    versionLabel: `V${version}`,
    lines: lines.map(([name, servings]) => ({ name, servings })),
  };
}

export function loadToppings(): ToppingRecipe[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return STARTERS;
    const parsed = JSON.parse(raw) as ToppingRecipe[];
    if (!Array.isArray(parsed) || !parsed.length) return STARTERS;
    return parsed.filter((item) => item && typeof item.id === "string" && typeof item.title === "string" && Array.isArray(item.lines));
  } catch {
    return STARTERS;
  }
}

export function saveToppings(items: ToppingRecipe[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  emitCloud({ toppings: items });
}

export function loadPlateTemplates(): PlateTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    const parsed = raw ? (JSON.parse(raw) as PlateTemplate[]) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === "string" && typeof item.title === "string" && Array.isArray(item.rows) && Array.isArray(item.extras));
  } catch {
    return [];
  }
}

export function savePlateTemplates(items: PlateTemplate[]) {
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(items));
  emitCloud({ plateTemplates: items });
}

export function nextToppingVersion(items: ToppingRecipe[], baseId: string): number {
  return items.filter((item) => item.baseId === baseId).reduce((max, item) => Math.max(max, item.version || 0), 0) + 1;
}

export function servingsFromRaw(raw: string | null | undefined): number | null {
  const match = raw?.match(/^(\d+(?:\.\d+)?) serving\b/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function restorePlate(lines: Array<{ name: string; servings: number }>, recipes: ToppingRecipe[]) {
  const left = new Map<string, number>();
  let beefName = "";
  let beef = 0;
  for (const line of lines) {
    if (/ground beef/.test(line.name)) {
      beefName = line.name;
      beef = line.servings;
    } else left.set(line.name, (left.get(line.name) ?? 0) + line.servings);
  }
  const rows: Array<{ title: string; sourceId: string | null; baseId: string | null; lines: ToppingLine[] }> = [];
  const ranked = [...recipes].sort((a, b) => b.lines.length - a.lines.length);
  for (const recipe of ranked) {
    if (!recipe.lines.length) continue;
    if (!recipe.lines.every((line) => (left.get(line.name) ?? 0) + 0.02 >= line.servings)) continue;
    for (const line of recipe.lines) left.set(line.name, (left.get(line.name) ?? 0) - line.servings);
    rows.push({ title: recipe.title, sourceId: recipe.id, baseId: recipe.baseId, lines: recipe.lines.map((line) => ({ ...line })) });
  }
  const extras = [...left].filter(([, servings]) => servings > 0.02).map(([name, servings]) => ({ name, servings: Math.round(servings * 100) / 100 }));
  return { beefName: beefName || "ground beef 80/20", beef, extras, rows };
}

export function newToppingId(): string {
  return `topping-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function ingredientFromServings(name: string, servings: number): IngredientObj {
  const size = getIngredient(name)?.servingSize ?? "";
  const grams = size.match(/\(\s*~?\s*(\d+(?:\.\d+)?)\s*g/i);
  if (grams) {
    const total = Math.round(Number(grams[1]) * servings * 10) / 10;
    return { raw: `${servings} serving ${name} (${total} g)`, quantity: String(total), unit: "g", item: name };
  }
  const lead = size.match(/^(\d+(?:\.\d+)?)\s+([^\s(]+)/);
  if (lead) {
    const qty = Math.round(Number(lead[1]) * servings * 100) / 100;
    return { raw: `${qty} ${lead[2]} ${name}`, quantity: String(qty), unit: lead[2], item: name };
  }
  return { raw: `${servings} serving ${name}`, quantity: String(servings), unit: "serving", item: name };
}
