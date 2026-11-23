import type { EstimatedIngredient, IngredientObj, Recipe } from "@/lib/recipes/types";
import { parseAmount } from "@/lib/recipes/amount";
import { isMeatName, usedLibraryServings } from "@/lib/sourced/meal";
import { getIngredient } from "@/lib/sourced/index";
import type { PlanBatch } from "./model";

type Line = IngredientObj | EstimatedIngredient | string;

/** Servings one batch makes, using the same rule as the batch settings page. */
export function definedBatchServings(batch: PlanBatch, recipe: Recipe | undefined, catalog: ReadonlyMap<string, Recipe>): number {
  if (batch.servingOverride != null && batch.servingOverride > 0) return batch.servingOverride;
  if (recipe) {
    const meat = meatPounds(recipe, catalog);
    const perServing = batch.meatLbPerServing != null && batch.meatLbPerServing > 0 ? batch.meatLbPerServing : meat > 0 ? 0.5 : null;
    if (perServing && meat > 0) return Math.max(0.1, Math.round((meat / perServing) * 10) / 10);
  }
  if (batch.servings > 1) return batch.servings;
  const written = recipeServings(recipe);
  if (written > 1) return written;
  const parent = recipe?.mod_of ? catalog.get(recipe.mod_of) : undefined;
  const base = recipeServings(parent);
  if (base > 1) return base;
  return batch.servings > 0 ? batch.servings : written || 1;
}

export function meatPounds(recipe: Recipe, catalog: ReadonlyMap<string, Recipe>): number {
  const raw = rawMeatPounds(recipe, catalog, new Set());
  if (raw > 0) return Math.round(raw * 10) / 10;
  return libraryMeatPounds(recipe, catalog);
}

function recipeServings(recipe: Recipe | undefined): number {
  const raw = recipe?.servings;
  const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function rawMeatPounds(recipe: Recipe, catalog: ReadonlyMap<string, Recipe>, seen: Set<string>): number {
  if (recipe.uid && seen.has(recipe.uid)) return 0;
  if (recipe.uid) seen.add(recipe.uid);
  let pounds = 0;
  for (const line of recipeLines(recipe)) {
    if (typeof line !== "string" && line.sourced_recipe) {
      const nested = catalog.get(line.sourced_recipe);
      if (nested) {
        const copies = parseAmount(line.quantity ?? null) ?? 1;
        pounds += rawMeatPounds(nested, catalog, seen) * (copies > 0 ? copies : 1);
        continue;
      }
    }
    const name = lineName(line);
    if (!isMeatName(name)) continue;
    const amount = lineAmount(line);
    if (!amount) continue;
    const poundsEach = toPounds(amount.qty, amount.unit);
    if (poundsEach) pounds += poundsEach;
  }
  return pounds;
}

function libraryMeatPounds(recipe: Recipe, catalog: ReadonlyMap<string, Recipe>): number {
  let pounds = 0;
  for (const row of usedLibraryServings(recipe, catalog, 1)) {
    if (!isMeatName(row.name)) continue;
    const item = getIngredient(row.name);
    if (!item) continue;
    const size = item.servingSize.toLowerCase();
    const amount = Number(size.match(/[\d.]+/)?.[0] ?? 0);
    if (!amount) continue;
    const total = amount * row.servings;
    const poundsEach = toPounds(total, size);
    if (poundsEach) pounds += poundsEach;
  }
  return Math.round(pounds * 10) / 10;
}

function recipeLines(recipe: Recipe): Line[] {
  if (Array.isArray(recipe.ingredient_sections) && recipe.ingredient_sections.some((section) => section.items?.length)) {
    return recipe.ingredient_sections.flatMap((section) => section.items ?? []);
  }
  if (Array.isArray(recipe.ingredients) && recipe.ingredients.length) return recipe.ingredients;
  if (Array.isArray(recipe.estimated_ingredients) && recipe.estimated_ingredients.length) return recipe.estimated_ingredients;
  return [];
}

function lineName(line: Line): string {
  if (typeof line === "string") return line;
  return line.item?.trim() || ("raw" in line ? line.raw?.trim() : "") || "";
}

function lineAmount(line: Line): { qty: number; unit: string } | null {
  if (typeof line === "string") return amountFromText(line);
  const unit = (line.unit ?? "").trim();
  const quantity = line.quantity == null ? "" : String(line.quantity).trim();
  const qty = parseAmount(quantity);
  if (qty != null && qty > 0 && unit) return { qty, unit };
  const raw = "raw" in line && line.raw ? line.raw : "";
  return amountFromText([quantity, unit, line.item].filter(Boolean).join(" ")) ?? (raw ? amountFromText(raw) : null);
}

function amountFromText(text: string): { qty: number; unit: string } | null {
  const match = text.trim().match(/^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?|\d+\s*[½⅓⅔¼¾⅛⅜⅝⅞]|[½⅓⅔¼¾⅛⅜⅝⅞])\s+([a-zA-Z]+)/);
  if (!match) return null;
  const qty = parseAmount(match[1]);
  if (qty == null || qty <= 0) return null;
  return { qty, unit: match[2] };
}

function toPounds(qty: number, unit: string): number | null {
  const text = unit.toLowerCase();
  if (/\blb\b|pound/.test(text)) return qty;
  if (/\boz\b|ounce/.test(text)) return qty / 16;
  if (/\bkg\b/.test(text)) return qty * 2.20462;
  if (/(^|\s)g\b|gram/.test(text)) return qty / 453.592;
  return null;
}
