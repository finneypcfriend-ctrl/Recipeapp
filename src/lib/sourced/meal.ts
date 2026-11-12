import type { BeefChoice, GoalTargets, PlannedMeal } from "@/lib/plans/model";
import { formatAmount, formatTsp, parseAmount } from "@/lib/recipes/amount";
import { stepGroups } from "@/lib/recipes/present";
import type { EstimatedIngredient, IngredientObj, Recipe } from "@/lib/recipes/types";
import { amountFromText, libraryServings, snapSpiceTsp, spoonGrams, spoonLabel } from "./convert";
import { addMacros, emptyMacros, getIngredient, macrosForServings, scaleMacros, type Macros } from "./index";
import { linkedRecipe, pairLine } from "./pair";

/**
 * Macros for a planned meal. Amounts come from the recipe on the plan
 * (including a day-only edited list), then Fit's ratio, the day's portion,
 * Hone's meat trim, and any ingredient tweaks. A linked recipe is counted
 * whole, scaled by how many of that recipe the line asks for.
 */

export interface MealMath {
  macros: Macros;
  partial: boolean;
}

export interface IngredientScale {
  name: string;
  factor: number;
}

type Line = IngredientObj | EstimatedIngredient | string;

let beefPick: BeefChoice | undefined;

export function useBeefChoice<T>(choice: BeefChoice | undefined, run: () => T): T {
  const previous = beefPick;
  beefPick = choice;
  try {
    return run();
  } finally {
    beefPick = previous;
  }
}

function chosenBeef(name: string): string {
  if (!/ground beef|hamburger|beef mince/i.test(name)) return name;
  if (beefPick === "73/27") return "ground beef 73/27";
  if (beefPick === "80/20") return "ground beef 80/20";
  return name;
}

export function isMeatName(name: string): boolean {
  const text = name.toLowerCase();
  if (/eggplant|egg roll|egg noodle|egglife|egg life/.test(text)) return false;
  if (/\beggs?\b/.test(text)) return true;
  return /beef|pork|chicken|lamb|duck|bacon|\bham\b|sausage|pepperoni|salami|kielbasa|andouille|prosciutto|jerky|hot dog|steak|brisket|chuck|ribeye|oxtail|tenderloin|short rib|drumstick|\bwings?\b|thigh|breast|liver|cornish|rotisserie|shrimp|fish|salmon|tuna|tilapia|ground/.test(text);
}

export function recipeFromLines(recipe: Recipe, lines: Array<{ quantity: string; unit: string; name: string }>): Recipe {
  return {
    ...recipe,
    ingredient_sections: null,
    estimated_ingredients: null,
    ingredients: lines.map((line) => ({ quantity: line.quantity, unit: line.unit, item: line.name })),
  };
}

export function mealMacros(recipe: Recipe, catalog: ReadonlyMap<string, Recipe> | undefined): MealMath {
  let macros = emptyMacros();
  let partial = false;
  let any = false;
  for (const line of linesOf(recipe)) {
    const nested = catalog ? referencedRecipe(line, catalog, recipe.uid) : null;
    if (nested) {
      const math = mealMacros(nested.recipe, catalog);
      macros = addMacros(macros, scaleMacros(math.macros, nested.qty));
      partial = partial || math.partial;
      any = true;
      continue;
    }
    const pair = pairLine(line);
    if (!pair) continue;
    if (!pair.name || pair.match === "zero" || pair.match === "none") {
      if (pair.match === "none") partial = true;
      continue;
    }
    const name = chosenBeef(pair.name);
    const item = getIngredient(name);
    const amount = readAmount(line);
    const servings = item ? libraryServings(amount.qty, amount.unit, item, amount.hint) : null;
    if (!item || servings == null) {
      partial = true;
      continue;
    }
    const piece = macrosForServings(name, servings);
    if (!piece) {
      partial = true;
      continue;
    }
    macros = addMacros(macros, piece);
    any = true;
  }
  return { macros, partial: partial || !any };
}

export function meatMacros(recipe: Recipe, catalog: ReadonlyMap<string, Recipe> | undefined): Macros {
  let macros = emptyMacros();
  for (const leaf of recipeLeaves(recipe, catalog, 1)) {
    if (!isMeatName(leaf.name)) continue;
    macros = addMacros(macros, leaf.macros);
  }
  return macros;
}

export function topCarbLine(
  recipe: Recipe,
  catalog: ReadonlyMap<string, Recipe> | undefined,
  portion: number,
  meatTrim: number,
): { name: string; netCarbs: number } | null {
  let best: { name: string; netCarbs: number } | null = null;
  for (const leaf of recipeLeaves(recipe, catalog, meatTrim)) {
    const net = leaf.macros.netCarbsG * (portion > 0 ? portion : 1);
    if (net <= 0) continue;
    if (!best || net > best.netCarbs) best = { name: leaf.name, netCarbs: net };
  }
  return best;
}

export function mealScale(meal: { portion?: number; fitScale?: number; lines?: readonly unknown[] }): number {
  if (meal.lines?.length) return meal.portion ?? 1;
  return (meal.fitScale ?? 1) * (meal.portion ?? 1);
}

export function planMealMath(
  meal: { recipeUid: string; portion?: number; fitScale?: number; meatTrim?: number; sideName?: string; sideServings?: number; carbItem?: string; carbScale?: number; tweaks?: IngredientScale[]; lines?: Array<{ quantity: string; unit: string; name: string }> },
  catalog: ReadonlyMap<string, Recipe>,
  beef?: BeefChoice,
): MealMath | null {
  const run = () => {
    let macros = emptyMacros();
    let partial = false;
    let any = false;
    const recipe = meal.recipeUid ? catalog.get(meal.recipeUid) : undefined;
    if (recipe) {
      const basis = meal.lines?.length ? recipeFromLines(recipe, meal.lines) : recipe;
      const math = scaledMealMacros(basis, catalog, mealScale(meal), meal.meatTrim ?? 1, meal.carbItem, meal.carbScale, meal.tweaks);
      macros = addMacros(macros, math.macros);
      partial = math.partial;
      any = true;
    } else if (meal.recipeUid) {
      partial = true;
    }
    const side = sideMacros(meal.sideName, meal.sideServings);
    if (side) {
      macros = addMacros(macros, side);
      any = true;
    }
    return any ? { macros, partial } : null;
  };
  if (beef === undefined) return run();
  return useBeefChoice(beef, run);
}

export function trimmedMealMacros(recipe: Recipe, catalog: ReadonlyMap<string, Recipe> | undefined, meatTrim = 1): MealMath {
  const full = mealMacros(recipe, catalog);
  if (meatTrim >= 0.999) return full;
  const meat = meatMacros(recipe, catalog);
  return { macros: addMacros(full.macros, scaleMacros(meat, meatTrim - 1)), partial: full.partial };
}

export function cutMealMacros(
  recipe: Recipe,
  catalog: ReadonlyMap<string, Recipe> | undefined,
  meatTrim = 1,
  carbItem?: string,
  carbScale?: number,
  tweaks?: IngredientScale[],
): MealMath {
  const full = trimmedMealMacros(recipe, catalog, meatTrim);
  const leaves = recipeLeaves(recipe, catalog, meatTrim);
  const factors = scaleMap(leaves, carbItem, carbScale, tweaks);
  if (!factors.size) return full;
  let macros = full.macros;
  for (const [index, factor] of factors) {
    const leaf = leaves[index];
    if (!leaf) continue;
    macros = addMacros(macros, scaleMacros(leaf.macros, factor - 1));
  }
  return { macros, partial: full.partial };
}

/** Macros for the amounts you actually cook: the scaled recipe, then the small kitchen rounding. */
export function scaledMealMacros(
  recipe: Recipe,
  catalog: ReadonlyMap<string, Recipe> | undefined,
  portion = 1,
  meatTrim = 1,
  carbItem?: string,
  carbScale?: number,
  tweaks?: IngredientScale[],
): MealMath {
  const rows = usedLibraryServings(recipe, catalog, portion, meatTrim, carbItem, carbScale, tweaks);
  let macros = emptyMacros();
  for (const row of rows) {
    const piece = macrosForServings(row.name, row.servings);
    if (piece) macros = addMacros(macros, piece);
  }
  const raw = mealMacros(recipe, catalog);
  return { macros, partial: raw.partial || rows.length === 0 };
}

export function usedIngredientLines(
  recipe: Recipe,
  catalog: ReadonlyMap<string, Recipe> | undefined,
  portion = 1,
  meatTrim = 1,
  carbItem?: string,
  carbScale?: number,
  tweaks?: IngredientScale[],
  beef?: BeefChoice,
): string[] {
  const run = () => {
    const leaves = recipeLeaves(recipe, catalog, meatTrim);
    const factors = scaleMap(leaves, carbItem, carbScale, tweaks);
    const share = portion > 0 ? portion : 1;
    return leaves.flatMap((leaf, index) => {
      const extra = factors.get(index) ?? 1;
      const text = formatUsedLine(leaf.line, leaf.scale * share * extra).replace(" || ", " ");
      return text ? [text] : [];
    });
  };
  if (beef === undefined) return run();
  return useBeefChoice(beef, run);
}

export interface CookPart {
  title: string;
  image: string;
  steps: string[];
  ingredients: string[];
  subs: CookPart[];
}

export function cookParts(
  recipe: Recipe,
  catalog: ReadonlyMap<string, Recipe> | undefined,
  portion = 1,
  meatTrim = 1,
  carbItem?: string,
  carbScale?: number,
  tweaks?: IngredientScale[],
  beef?: BeefChoice,
): CookPart {
  const run = () => walkParts(recipe, catalog, portion > 0 ? portion : 1, meatTrim, carbItem, carbScale, tweaks, new Set());
  if (beef === undefined) return run();
  return useBeefChoice(beef, run);
}

function walkParts(
  recipe: Recipe,
  catalog: ReadonlyMap<string, Recipe> | undefined,
  nest: number,
  meatTrim: number,
  carbItem: string | undefined,
  carbScale: number | undefined,
  tweaks: IngredientScale[] | undefined,
  seen: Set<string>,
): CookPart {
  if (recipe.uid && seen.has(recipe.uid)) return { title: recipe.title || "Recipe", image: recipePhoto(recipe), steps: [], ingredients: [], subs: [] };
  const next = new Set(seen);
  if (recipe.uid) next.add(recipe.uid);
  const direct: CarbLeaf[] = [];
  const subs: CookPart[] = [];
  for (const line of linesOf(recipe)) {
    const nested = catalog ? referencedRecipe(line, catalog, recipe.uid) : null;
    if (nested) {
      if (Number.isFinite(nested.qty) && !next.has(nested.recipe.uid)) {
        subs.push(walkParts(nested.recipe, catalog, nest * nested.qty, meatTrim, carbItem, carbScale, tweaks, next));
      }
      continue;
    }
    const name = lineLabel(line).trim();
    const scale = nest * (isMeatName(name) ? meatTrim : 1);
    const lone: Recipe = {
      ...recipe,
      uid: `${recipe.uid}::cook`,
      ingredient_sections: null,
      estimated_ingredients: null,
      ingredients: [line as IngredientObj],
    };
    const math = mealMacros(lone, catalog);
    direct.push({ name, line, scale, macros: scaleMacros(math.macros, scale) });
  }
  const factors = scaleMap(direct, carbItem, carbScale, tweaks);
  const ingredients = direct.flatMap((leaf, index) => {
    const extra = factors.get(index) ?? 1;
    const text = formatUsedLine(leaf.line, leaf.scale * extra);
    if (!text || /^0(?:\.0+)?\s/.test(text)) return [];
    return [text];
  });
  return {
    title: recipe.title || "Recipe",
    image: recipePhoto(recipe),
    steps: stepGroups(recipe).flatMap((section) => section.steps),
    ingredients,
    subs,
  };
}

function recipePhoto(recipe: Recipe): string {
  return recipe.image_url?.trim() || recipe.video_thumbnail_url?.trim() || "";
}

export function usedLibraryServings(
  recipe: Recipe,
  catalog: ReadonlyMap<string, Recipe> | undefined,
  portion = 1,
  meatTrim = 1,
  carbItem?: string,
  carbScale?: number,
  tweaks?: IngredientScale[],
  beef?: BeefChoice,
): Array<{ name: string; servings: number }> {
  const run = () => {
    const leaves = recipeLeaves(recipe, catalog, meatTrim);
    const factors = scaleMap(leaves, carbItem, carbScale, tweaks);
    const share = portion > 0 ? portion : 1;
    const totals = new Map<string, number>();
    leaves.forEach((leaf, index) => {
      const pair = pairLine(leaf.line);
      if (!pair?.name || pair.match === "zero" || pair.match === "none") return;
      const name = chosenBeef(pair.name);
      const item = getIngredient(name);
      if (!item) return;
      const amount = readAmount(leaf.line);
      const base = libraryServings(amount.qty, amount.unit, item, amount.hint);
      if (base == null || base <= 0) return;
      const extra = factors.get(index) ?? 1;
      const servings = smoothedServings(name, base * leaf.scale * share * extra);
      if (servings <= 0) return;
      totals.set(name, (totals.get(name) ?? 0) + servings);
    });
    return [...totals].map(([name, servings]) => ({ name, servings }));
  };
  if (beef === undefined) return run();
  return useBeefChoice(beef, run);
}

interface CarbLeaf {
  name: string;
  line: Line;
  scale: number;
  macros: Macros;
}

function recipeLeaves(recipe: Recipe, catalog: ReadonlyMap<string, Recipe> | undefined, meatTrim: number): CarbLeaf[] {
  return walkLeaves(recipe, catalog, 1, meatTrim, new Set());
}

function walkLeaves(recipe: Recipe, catalog: ReadonlyMap<string, Recipe> | undefined, nest: number, meatTrim: number, seen: Set<string>): CarbLeaf[] {
  if (recipe.uid && seen.has(recipe.uid)) return [];
  const next = new Set(seen);
  if (recipe.uid) next.add(recipe.uid);
  const leaves: CarbLeaf[] = [];
  for (const line of linesOf(recipe)) {
    const nested = catalog ? referencedRecipe(line, catalog, recipe.uid) : null;
    if (nested) {
      if (Number.isFinite(nested.qty)) leaves.push(...walkLeaves(nested.recipe, catalog, nest * nested.qty, meatTrim, next));
      continue;
    }
    const name = lineLabel(line).trim();
    const scale = nest * (isMeatName(name) ? meatTrim : 1);
    const lone: Recipe = {
      ...recipe,
      uid: `${recipe.uid}::leaf`,
      ingredient_sections: null,
      estimated_ingredients: null,
      ingredients: [line as IngredientObj],
    };
    const math = mealMacros(lone, catalog);
    leaves.push({ name, line, scale, macros: scaleMacros(math.macros, scale) });
  }
  return leaves;
}

function scaleMap(leaves: CarbLeaf[], carbItem?: string, carbScale?: number, tweaks?: IngredientScale[]): Map<number, number> {
  const factors = new Map<number, number>();
  const consider = (name: string, factor: number) => {
    if (!(factor > 0) || Math.abs(factor - 1) < 0.001) return;
    const index = richestIndex(leaves, name);
    if (index < 0) return;
    const prev = factors.get(index);
    if (prev == null || factor < prev || (prev >= 0.999 && factor > prev)) factors.set(index, factor);
  };
  if (carbItem && carbScale != null) consider(carbItem, carbScale);
  for (const tweak of tweaks ?? []) consider(tweak.name, tweak.factor);
  return factors;
}

export function eggSnapTweaks(
  recipe: Recipe,
  catalog: ReadonlyMap<string, Recipe> | undefined,
  portion: number,
  meatTrim: number,
): IngredientScale[] {
  const leaves = recipeLeaves(recipe, catalog, meatTrim);
  const tweaks: IngredientScale[] = [];
  const seen = new Set<string>();
  const share = portion > 0 ? portion : 1;
  for (const leaf of leaves) {
    if (!isCookingEgg(leaf.name)) continue;
    const key = leaf.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    const amount = readAmount(leaf.line);
    const qty = (amount.qty ?? 0) * leaf.scale * share;
    if (!(qty > 0)) continue;
    const nearest = Math.round(qty * 2) / 2;
    const practical = nearest > 0 ? nearest : qty >= 0.25 ? 0.5 : 0;
    if (!(practical > 0)) continue;
    const factor = Math.round((practical / qty) * 1000) / 1000;
    if (Math.abs(factor - 1) < 0.02) continue;
    seen.add(key);
    tweaks.push({ name: leaf.name, factor });
  }
  return tweaks;
}

function isCookingEgg(name: string): boolean {
  const text = name.toLowerCase();
  if (/eggplant|egg roll|egg noodle|egglife|egg life/.test(text)) return false;
  return /\beggs?\b/.test(text);
}

export function practicalTweaks(
  recipe: Recipe,
  catalog: ReadonlyMap<string, Recipe> | undefined,
  portion: number,
  meatTrim: number,
): IngredientScale[] {
  const leaves = recipeLeaves(recipe, catalog, meatTrim);
  const tweaks: IngredientScale[] = [];
  const seen = new Set<string>();
  const share = portion > 0 ? portion : 1;
  for (const leaf of leaves) {
    if (isCookingEgg(leaf.name)) continue;
    const key = leaf.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    const amount = readAmount(leaf.line);
    const qty = (amount.qty ?? 0) * leaf.scale * share;
    if (!(qty > 0)) continue;
    const factor = measureFactor(leaf.line, qty, amount.unit);
    if (Math.abs(factor - 1) < 0.02) continue;
    seen.add(key);
    tweaks.push({ name: leaf.name, factor });
  }
  return tweaks;
}

function measureFactor(line: Line, qty: number, unit: string | null): number {
  const paired = pairLine(line);
  if (!paired?.name) return 1;
  const name = chosenBeef(paired.name);
  const item = getIngredient(name);
  if (!item) return 1;
  const base = libraryServings(qty, unit, item, lineText(line));
  if (base == null || !(base > 0)) return 1;
  const next = smoothedServings(name, base);
  if (!(next > 0)) return 1;
  return Math.round((next / base) * 1000) / 1000;
}

function snapKitchen(qty: number, unit: string | null): number {
  const known = (unit || "").toLowerCase().replace(/\./g, "");
  if (!(qty > 0)) return 0;
  if (/^tsp|^teaspoon/.test(known)) return snapSpiceTsp(qty);
  if (/^tbsp|^tablespoon/.test(known)) return snapStep(qty, 0.5, 0.5);
  if (/^cup/.test(known)) return snapCup(qty);
  if (/^g$|^gram/.test(known)) return snapGrams(qty);
  if (/^lb/.test(known)) return snapStep(qty, 0.05, 0.05);
  if (/^oz/.test(known)) return snapStep(qty, 0.25, 0.25);
  if (/slice/.test(known)) return snapStep(qty, 1, 1);
  if (/egg/.test(known)) return snapStep(qty, 0.5, 0.5);
  if (/medium|large|small|clove/.test(known)) return snapStep(qty, 0.5, 0.5);
  return snapStep(qty, 0.1, 0.1);
}

function snapStep(qty: number, step: number, min: number): number {
  const snapped = Math.round(qty / step) * step;
  const practical = snapped > 0 ? snapped : min;
  return Math.round(practical * 1000) / 1000;
}

function snapCup(qty: number): number {
  const marks = [1 / 8, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1];
  const whole = Math.floor(qty + 1e-8);
  const frac = qty - whole;
  if (frac < 0.02) return whole > 0 ? whole : 1 / 8;
  let best = marks[0];
  let bestDist = Infinity;
  for (const mark of marks) {
    const dist = Math.abs(frac - mark);
    if (dist < bestDist - 1e-6 || (Math.abs(dist - bestDist) <= 1e-6 && mark > best)) {
      best = mark;
      bestDist = dist;
    }
  }
  return Math.round((whole + best) * 1000) / 1000;
}

function snapGrams(qty: number): number {
  if (!(qty > 0)) return 0;
  if (qty < 20) return Math.max(1, Math.round(qty));
  return Math.max(5, Math.round(qty / 5) * 5);
}

function richestIndex(leaves: CarbLeaf[], name: string): number {
  const key = name.trim().toLowerCase();
  let index = -1;
  let best = -1;
  leaves.forEach((leaf, leafIndex) => {
    if (leaf.name.trim().toLowerCase() !== key) return;
    if (leaf.macros.calories > best) {
      best = leaf.macros.calories;
      index = leafIndex;
    }
  });
  return index;
}

export function smoothedServings(name: string, servings: number): number {
  const item = getIngredient(name);
  if (!item || !(servings > 0)) return servings;
  const bare = item.servingSize.replace(/\s*\([^)]*\)/g, "").replace(/\.$/, "").trim();
  const lead = bare.match(/^([\d./]+)\s*(.*)$/);
  if (!lead) return servings;
  const qty = parseAmount(lead[1]) ?? 1;
  if (!(qty > 0)) return servings;
  const unit = lead[2].trim();
  const amount = qty * servings;
  let snapped = amount;
  if (/^g$/i.test(unit)) snapped = spoonGrams(item.name, amount) ?? snapGrams(amount);
  else if (/egg/i.test(unit) || /egg/i.test(item.name)) snapped = snapStep(amount, 0.5, 0.5);
  else snapped = snapKitchen(amount, unit);
  if (!(snapped > 0)) return servings;
  return snapped / qty;
}

export function libraryServingLabel(name: string, servings: number): string | null {
  const item = getIngredient(name);
  if (!item || !(servings > 0)) return null;
  const shown = smoothedServings(name, servings);
  const bare = item.servingSize.replace(/\s*\([^)]*\)/g, "").replace(/\.$/, "").trim();
  const lead = bare.match(/^([\d./]+)\s*(.*)$/);
  if (!lead) return bare ? `${formatAmount(shown)} ${bare}` : null;
  const qty = parseAmount(lead[1]) ?? 1;
  const unit = lead[2].trim();
  const amount = qty * shown;
  if (/^g$/i.test(unit)) {
    const spoons = spoonLabel(item.name, amount);
    if (spoons) return spoons;
    return `${formatAmount(amount)} g`;
  }
  if (/egg/i.test(unit) || /egg/i.test(item.name)) return Math.abs(amount - 1) < 0.001 ? "1 egg" : `${formatAmount(amount)} eggs`;
  const shownUnit = prettyUnit(unit, amount);
  const text = /^tsp|^teaspoon/i.test(unit) ? formatTsp(amount) : formatAmount(amount);
  return shownUnit ? `${text} ${shownUnit}` : text;
}

function formatKitchen(qty: number, unit: string | null): string {
  if (/^tsp|^teaspoon/i.test(unit || "")) return formatTsp(qty);
  return formatAmount(qty);
}

function prettyUnit(unit: string, qty: number): string {
  const known = unit.toLowerCase().replace(/\.$/, "");
  if (/^cups?$/.test(known)) return Math.abs(qty - 1) < 0.001 ? "cup" : "cups";
  if (/^tbsp|^tablespoon/.test(known)) return "tbsp";
  if (/^tsp|^teaspoon/.test(known)) return "tsp";
  if (/^grams?$|^g$/.test(known)) return "g";
  return unit;
}

function libraryPhrase(line: Line, factor: number): string | null {
  const paired = pairLine(line);
  if (!paired?.name || paired.match === "zero" || paired.match === "none") return null;
  const name = chosenBeef(paired.name);
  const item = getIngredient(name);
  if (!item) return null;
  const amount = readAmount(line);
  const base = libraryServings(amount.qty, amount.unit, item, amount.hint);
  if (base == null || !(base > 0)) return null;
  return libraryServingLabel(name, base * factor);
}

function formatUsedLine(line: Line, factor: number): string {
  if (typeof line === "string") {
    const phrase = libraryPhrase(line, factor);
    if (phrase) return `${phrase} || ${lineLabel(line)}`;
    const parsed = amountFromText(line);
    if (!parsed?.qty) return line.trim();
    const rest = line.trim().replace(/^\s*[\d./½⅓⅔¼¾⅛⅜⅝⅞]+\s*/, "");
    return [formatKitchen(snapKitchen(parsed.qty * factor, parsed.unit), parsed.unit), parsed.unit, rest].filter(Boolean).join(" ");
  }
  const amount = readAmount(line);
  const rawName = line.item?.trim() || "";
  const paired = pairLine(line);
  const swapped = Boolean(paired?.name && chosenBeef(paired.name) !== paired.name);
  const name = swapped ? (beefPick === "73/27" ? "73/27 ground beef" : "80/20 ground beef") : rawName;
  if (amount.qty == null) return name || lineText(line);
  const phrase = libraryPhrase(line, factor);
  if (phrase) return `${phrase} || ${name}`;
  return [formatKitchen(snapKitchen(amount.qty * factor, amount.unit), amount.unit), amount.unit, name].filter(Boolean).join(" ");
}

function sideMacros(name: string | undefined, servings: number | undefined): Macros | null {
  if (!name || !servings) return null;
  return macrosForServings(name, smoothedServings(name, servings)) ?? null;
}

export function formatSide(name: string, servings: number): string {
  const amount = libraryServingLabel(name, servings);
  if (!amount) return `${formatAmount(servings)} ${name}`;
  const first = name.toLowerCase().split(" ")[0] ?? "";
  if (first && amount.toLowerCase().includes(first)) return amount;
  return `${amount} ${name}`;
}

export function sumPlanMeals(meals: PlannedMeal[], catalog: ReadonlyMap<string, Recipe>, beef?: BeefChoice): MealMath | null {
  const run = () => {
    let macros = emptyMacros();
    let partial = false;
    let any = false;
    for (const meal of meals) {
      const math = planMealMath(meal, catalog);
      if (!math) continue;
      macros = addMacros(macros, math.macros);
      partial = partial || math.partial;
      any = true;
    }
    return any ? { macros, partial } : null;
  };
  if (beef === undefined) return run();
  return useBeefChoice(beef, run);
}

export function formatMealLine(macros: Macros): string {
  const kcal = Math.round(macros.calories).toLocaleString();
  const protein = Math.round(macros.proteinG);
  const fat = Math.round(macros.fatG);
  const net = Math.round(macros.netCarbsG);
  const cost = macros.cost >= 100 ? `$${Math.round(macros.cost)}` : `$${macros.cost.toFixed(2)}`;
  return `${kcal} kcal · P ${protein}g · F ${fat}g · net ${net}g · ${cost}`;
}

export function formatGoalLine(goals: GoalTargets): string {
  const parts: string[] = [];
  if (goals.calories) parts.push(`${Math.round(goals.calories).toLocaleString()} kcal`);
  if (goals.protein) parts.push(`P ${trimGoal(goals.protein)}g`);
  if (goals.fat) parts.push(`F ${trimGoal(goals.fat)}g`);
  if (goals.carbs) parts.push(`net ${trimGoal(goals.carbs)}g`);
  return parts.join(" · ");
}

export function formatGoalPercents(macros: Macros, goals: GoalTargets): string {
  const parts: string[] = [];
  if (goals.calories) parts.push(`${percentOf(macros.calories, goals.calories)}% C`);
  if (goals.protein) parts.push(`${percentOf(macros.proteinG, goals.protein)}% P`);
  if (goals.fat) parts.push(`${percentOf(macros.fatG, goals.fat)}% F`);
  if (goals.carbs) parts.push(`${percentOf(macros.netCarbsG, goals.carbs)}% net`);
  return parts.join(" · ");
}

function percentOf(value: number, target: number): number {
  if (!target) return 0;
  return Math.round((100 * value) / target);
}

function trimGoal(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function linesOf(recipe: Recipe): Line[] {
  if (Array.isArray(recipe.ingredient_sections) && recipe.ingredient_sections.some((section) => section.items?.length)) {
    return recipe.ingredient_sections.flatMap((section) => section.items ?? []);
  }
  if (Array.isArray(recipe.ingredients) && recipe.ingredients.length) return recipe.ingredients;
  if (Array.isArray(recipe.estimated_ingredients) && recipe.estimated_ingredients.length) return recipe.estimated_ingredients;
  return [];
}

function referencedRecipe(line: Line, catalog: ReadonlyMap<string, Recipe>, selfUid: string): { recipe: Recipe; qty: number } | null {
  if (typeof line !== "string" && line.sourced_recipe) {
    const recipe = catalog.get(line.sourced_recipe);
    if (!recipe) return null;
    const amount = readAmount(line);
    return { recipe, qty: amount.qty && amount.qty > 0 ? amount.qty : 1 };
  }
  const recipe = linkedRecipe(lineText(line), catalog.values(), selfUid);
  if (!recipe) return null;
  const amount = readAmount(line);
  return { recipe, qty: amount.qty && amount.qty > 0 ? amount.qty : 1 };
}

function readAmount(line: Line): { qty: number | null; unit: string | null; hint: string } {
  if (typeof line === "string") {
    const parsed = amountFromText(line);
    return { qty: parsed?.qty ?? null, unit: parsed?.unit ?? null, hint: line };
  }
  const qty = "quantity_value" in line && typeof line.quantity_value === "number" ? line.quantity_value : parseAmount(line.quantity ?? null);
  return { qty, unit: line.unit ?? null, hint: lineText(line) };
}

function lineLabel(line: Line): string {
  if (typeof line === "string") return line.replace(/^[\d./½⅓⅔¼¾⅛⅜⅝⅞]+\s+\S+\s+/, "").trim() || line.trim();
  return line.item?.trim() || lineText(line);
}

function lineText(line: Line): string {
  if (typeof line === "string") return line;
  if ("raw" in line && line.raw?.trim()) return line.raw.trim();
  return [line.quantity, line.unit, line.item].filter(Boolean).join(" ").trim();
}
