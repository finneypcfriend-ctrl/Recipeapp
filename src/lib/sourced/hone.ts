import type { GoalTargets, MealSlot } from "@/lib/plans/model";
import type { Recipe } from "@/lib/recipes/types";
import { addMacros, emptyMacros, getIngredient, scaleMacros, type Macros } from "./index";
import { eggSnapTweaks, practicalTweaks, scaledMealMacros, smoothedServings, topCarbLine } from "./meal";

/**
 * Hone runs after Fit. It does not save a recipe.
 *
 * If protein is high, meat and eggs on every meal are reduced by the same
 * percent until protein is on the goal. A chuck roast counts. So does an
 * egg snack. If net carbs are still more than about 2% over, the
 * single highest-carb ingredient is scaled down until net carbs land on the
 * goal. It does not cut vegetables or cheese any further. Flavor ratios stay.
 *
 * Conversion to a cookable amount happens first. Fit then Hone run on those
 * amounts. Hone still trims meat, cuts the one high-carb line, and adds eggs
 * or fat. A change is kept only when it still lands on a real spoon, cup,
 * gram, or egg after that conversion. Landing within about 2% is the stop.
 * Net carbs under the goal are ignored.
 */

const TOLERANCE = 0.02;

export interface HoneMeal {
  id: string;
  slot: MealSlot;
  recipe: Recipe | null;
  portion: number;
}

export interface HoneSide {
  name: string;
  servings: number;
}

export interface HoneCarbCut {
  mealId: string;
  name: string;
  factor: number;
}

export interface HoneTweak {
  mealId: string;
  name: string;
  factor: number;
}

export interface HoneResult {
  trims: Record<string, number>;
  sides: Record<string, HoneSide>;
  carbCut: HoneCarbCut | null;
  tweaks: HoneTweak[];
  extraEggs: number;
  extraName: string;
  note: string;
}

export function honeDay(
  meals: HoneMeal[],
  catalog: ReadonlyMap<string, Recipe>,
  targets: GoalTargets | null | undefined,
  approved: readonly string[] = ["beef tallow", "eggs (large)"],
): HoneResult | { error: string } {
  if (!targets || (targets.calories == null && targets.protein == null && targets.fat == null && targets.carbs == null)) return { error: "No macro goal on file." };
  const real = meals.filter((meal) => meal.recipe);
  if (!real.length) return { error: "That day has no meals to hone." };
  const trims: Record<string, number> = {};
  for (const meal of real) trims[meal.id] = 1;
  const converted: HoneTweak[] = [];
  for (const meal of real) {
    if (!meal.recipe || meal.slot === "snack") continue;
    for (const tweak of eggSnapTweaks(meal.recipe, catalog, meal.portion, 1)) {
      converted.push({ mealId: meal.id, name: tweak.name, factor: tweak.factor });
    }
    const taken = new Set(converted.filter((tweak) => tweak.mealId === meal.id).map((tweak) => tweak.name.trim().toLowerCase()));
    for (const tweak of practicalTweaks(meal.recipe, catalog, meal.portion, 1)) {
      if (taken.has(tweak.name.trim().toLowerCase())) continue;
      converted.push({ mealId: meal.id, name: tweak.name, factor: tweak.factor });
    }
  }
  const base = total(real, catalog, trims, {}, null, "", 0, converted);
  if (targets.protein != null && base.proteinG > targets.protein * (1 + TOLERANCE)) {
    let bestFactor = 1;
    let bestError = relative(base.proteinG, targets.protein);
    for (let step = 1; step <= 60; step += 1) {
      const factor = Math.round((1 - step * 0.01) * 1000) / 1000;
      for (const meal of real) trims[meal.id] = factor;
      const macros = total(real, catalog, trims, {}, null, "", 0, converted);
      const error = relative(macros.proteinG, targets.protein);
      if (error + 1e-9 < bestError) {
        bestError = error;
        bestFactor = factor;
      }
    }
    for (const meal of real) trims[meal.id] = bestFactor;
  }
  const trimmed = total(real, catalog, trims, {}, null, "", 0, converted);
  const carbCut = cutCarbs(real, catalog, trims, trimmed, targets, converted);
  const cut = total(real, catalog, trims, {}, carbCut, "", 0, converted);
  let extraEggs = 0;
  let extraName = "";
  const protein = pickProtein(approved, cut, targets);
  if (protein && short(cut.proteinG, targets.protein)) {
    extraEggs = fillProtein(cut, protein, targets);
    extraName = extraEggs > 0 ? protein.name : "";
  }
  const withProtein = total(real, catalog, trims, {}, carbCut, extraName, extraEggs, converted);
  const fat = pickFat(approved);
  const sides: Record<string, HoneSide> = {};
  let fatServings = 0;
  let fatName = "";
  if (fat && (short(withProtein.fatG, targets.fat) || short(withProtein.calories, targets.calories))) {
    fatServings = bestServings(withProtein, fat.name, fat.perServing, targets, 12, servingStep(fat));
    fatName = fat.name;
    spread(real, sides, fat.name, fatServings);
  }
  return {
    trims,
    sides,
    carbCut,
    tweaks: converted,
    extraEggs,
    extraName,
    note: honeNote(trims, carbCut, fatName, fatServings, extraName, extraEggs, real.length),
  };
}

function cutCarbs(
  meals: HoneMeal[],
  catalog: ReadonlyMap<string, Recipe>,
  trims: Record<string, number>,
  trimmed: Macros,
  targets: GoalTargets,
  tweaks: HoneTweak[],
): HoneCarbCut | null {
  if (targets.carbs == null || trimmed.netCarbsG <= targets.carbs * (1 + TOLERANCE)) return null;
  let bestLine: { mealId: string; name: string; net: number } | null = null;
  for (const meal of meals) {
    if (!meal.recipe) continue;
    const top = topCarbLine(meal.recipe, catalog, meal.portion, trims[meal.id] ?? 1);
    if (!top) continue;
    if (!bestLine || top.netCarbs > bestLine.net) bestLine = { mealId: meal.id, name: top.name, net: top.netCarbs };
  }
  if (!bestLine || bestLine.net <= 0) return null;
  const target = targets.carbs;
  let bestFactor = 1;
  let bestOver = Math.max(0, trimmed.netCarbsG - target) / target;
  for (let step = 1; step <= 50; step += 1) {
    const factor = Math.round((1 - step * 0.02) * 1000) / 1000;
    const trial: HoneCarbCut = { mealId: bestLine.mealId, name: bestLine.name, factor };
    const macros = total(meals, catalog, trims, {}, trial, "", 0, tweaks);
    const over = Math.max(0, macros.netCarbsG - target) / target;
    if (over + 1e-9 < bestOver) {
      bestOver = over;
      bestFactor = factor;
    }
    if (over <= TOLERANCE) break;
  }
  if (bestFactor >= 0.999) return null;
  return { mealId: bestLine.mealId, name: bestLine.name, factor: bestFactor };
}

function total(
  meals: HoneMeal[],
  catalog: ReadonlyMap<string, Recipe>,
  trims: Record<string, number>,
  sides: Record<string, HoneSide>,
  carbCut: HoneCarbCut | null,
  extraName: string,
  extraServings: number,
  tweaks: HoneTweak[],
): Macros {
  let macros = emptyMacros();
  for (const meal of meals) {
    if (!meal.recipe) continue;
    const mine = tweaks.filter((tweak) => tweak.mealId === meal.id).map((tweak) => ({ name: tweak.name, factor: tweak.factor }));
    const math = scaledMealMacros(
      meal.recipe,
      catalog,
      meal.portion,
      trims[meal.id] ?? 1,
      carbCut?.mealId === meal.id ? carbCut.name : undefined,
      carbCut?.mealId === meal.id ? carbCut.factor : undefined,
      mine,
    );
    macros = addMacros(macros, math.macros);
    const side = sides[meal.id];
    const item = side ? getIngredient(side.name) : undefined;
    if (item && side) macros = addMacros(macros, scaleMacros(item.perServing, smoothedServings(side.name, side.servings)));
  }
  const extra = extraServings > 0 ? getIngredient(extraName) : undefined;
  if (extra) macros = addMacros(macros, scaleMacros(extra.perServing, smoothedServings(extraName, extraServings)));
  return macros;
}

function pickFat(approved: readonly string[]) {
  for (const name of approved) {
    const item = getIngredient(name);
    if (!item) continue;
    const per = item.perServing;
    if (per.fatG >= 8 && per.proteinG < 2 && per.netCarbsG < 2) return item;
  }
  return undefined;
}

function pickProtein(approved: readonly string[], base: Macros, targets: GoalTargets) {
  const fatFull = targets.fat != null && base.fatG >= targets.fat * (1 - TOLERANCE);
  const caloriesFull = targets.calories != null && base.calories >= targets.calories * (1 - TOLERANCE);
  for (const name of approved) {
    const item = getIngredient(name);
    if (!item || item.perServing.proteinG < 4) continue;
    const fatEach = item.perServing.fatG / item.perServing.proteinG;
    if ((fatFull || caloriesFull) && fatEach >= 0.75) continue;
    return item;
  }
  return undefined;
}

function fillProtein(base: Macros, item: { name: string; perServing: Macros; servingSize: string; servingQty: number | null }, targets: GoalTargets): number {
  let best = 0;
  let bestError = gapError(base, targets);
  const step = servingStep(item);
  const steps = Math.round(6 / step);
  for (let index = 1; index <= steps; index += 1) {
    const servings = Math.round(index * step * 1000) / 1000;
    const shown = smoothedServings(item.name, servings);
    const next = addMacros(base, scaleMacros(item.perServing, shown));
    if (targets.calories && next.calories > targets.calories * (1 + TOLERANCE)) continue;
    const error = gapError(next, targets);
    if (error + 1e-9 < bestError) {
      bestError = error;
      best = servings;
    }
  }
  return best;
}

function servingStep(item: { name: string; servingSize: string; servingQty: number | null }): number {
  if (/egg/i.test(item.name) || /egg/i.test(item.servingSize)) return 1 / 2;
  if (item.name === "beef cracklings" || item.name === "pork rinds") return 1 / (item.servingQty || 1);
  return 1 / 12;
}

function bestServings(base: Macros, name: string, per: Macros, targets: GoalTargets, max: number, step: number): number {
  let best = 0;
  let bestError = gapError(base, targets);
  const steps = Math.round(max / step);
  for (let index = 1; index <= steps; index += 1) {
    const servings = Math.round(index * step * 1000) / 1000;
    const shown = smoothedServings(name, servings);
    const error = gapError(addMacros(base, scaleMacros(per, shown)), targets);
    if (error + 1e-9 < bestError) {
      bestError = error;
      best = servings;
    }
  }
  return best;
}

function gapError(macros: Macros, targets: GoalTargets): number {
  let error = 0;
  if (targets.calories) error += relative(macros.calories, targets.calories);
  if (targets.protein) error += relative(macros.proteinG, targets.protein);
  if (targets.fat) error += relative(macros.fatG, targets.fat);
  if (targets.carbs && macros.netCarbsG > targets.carbs) error += relative(macros.netCarbsG, targets.carbs);
  return error;
}

function relative(value: number, target: number): number {
  const diff = (value - target) / target;
  return diff * diff;
}

function short(value: number, target: number | null): boolean {
  return target != null && target > 0 && value < target * (1 - TOLERANCE);
}

function spread(meals: HoneMeal[], sides: Record<string, HoneSide>, name: string, servings: number) {
  if (servings <= 0 || !meals.length) return;
  const each = Math.round((servings / meals.length) * 1000) / 1000;
  let used = 0;
  meals.forEach((meal, index) => {
    const share = index === meals.length - 1 ? Math.round((servings - used) * 1000) / 1000 : each;
    used += share;
    if (share > 0) sides[meal.id] = { name, servings: share };
  });
}

function honeNote(trims: Record<string, number>, carbCut: HoneCarbCut | null, fatName: string, fatServings: number, proteinName: string, proteinServings: number, meals: number): string {
  const factors = Object.values(trims).filter((factor) => factor < 0.999);
  const parts: string[] = [];
  if (factors.length) parts.push(`Meat trimmed to ${Math.round(factors[0] * 100)}% on each meal`);
  if (carbCut) parts.push(`${carbCut.name} cut to ${Math.round(carbCut.factor * 100)}% for net carbs`);
  if (proteinServings > 0) parts.push(`${formatShare(proteinServings)} ${proteinName} added as a snack`);
  if (fatServings > 0) parts.push(`${formatShare(fatServings)} ${fatName} split across ${meals} ${meals === 1 ? "item" : "items"}`);
  if (!parts.length) return "Already within a couple of points. Nothing added.";
  return `${parts.join(". ")}.`;
}

function formatShare(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}
