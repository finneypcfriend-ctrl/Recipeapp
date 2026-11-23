import type { GoalTargets, MealPlan, MealSlot, PlannedMeal } from "@/lib/plans/model";
import { SLOT_ORDER, planDates } from "@/lib/plans/model";
import { formatAmount, parseAmount } from "@/lib/recipes/amount";
import { linesFromRecipe, type EditableLine } from "@/lib/recipes/lines";
import type { IngredientObj, Recipe } from "@/lib/recipes/types";
import { addMacros, emptyMacros, scaleMacros, type Macros } from "./index";
import { mealMacros, scaledMealMacros } from "./meal";

/**
 * Fit aims one recipe at the saved daily goal.
 *
 * It uses the recipe it was given. A version is scaled from that version's
 * amounts, not from the original.
 *
 * One ratio multiplies every ingredient. Nothing leaves the ratio, so the
 * flavor stays the mix you already set. There is no half-batch floor and no
 * category band. The ratio can be as small or as large as the goal needs.
 *
 * The ratio is the one that lands closest on calories, protein, and fat
 * together. Those three are pulled from both sides. The carb goal is a net
 * carb goal, the same number the day row labels “net.” Net carbs have no
 * floor: landing under is fine, and only being over counts. Total carbs are
 * not scored, so fiber does not hold the ratio down while net still has room.
 * A blank goal field is ignored. One ratio cannot hit protein and fat
 * separately, so a mix that is heavy on one of them will stay heavy.
 * The saved version is always that full-day fit. A day with more than one
 * meal does not save a partial recipe. The plan stores a portion of each
 * full fit (`portionForDay`). A snack stays as itself and is taken out of
 * the meal the plan says to draw from.
 */

const TOLERANCE = 0.1;

type Field = { key: "calories" | "proteinG" | "fatG" | "netCarbsG"; label: string; target: number };
type Piece = { id: string; macros: Macros; lambda: number };
type Share = { key: string; macros: Macros };

export function fitRecipe(
  recipe: Recipe,
  catalog: ReadonlyMap<string, Recipe>,
  targets: GoalTargets | null | undefined,
): { lines: EditableLine[]; note: string } | { error: string } {
  const fields = goalFields(targets);
  if (!fields) return { error: "No macro goal on file." };
  const rows = linesFromRecipe(recipe);
  const shares = sharesFor(recipe, catalog);
  if (!shares.length) return { error: "This recipe has no amounts Fit can scale." };
  const ratio = bestRatio(shares, fields);
  const lines = rows.map((row) => applyScale(row, ratio));
  const predicted = scaledTotal(shares, ratio);
  return { lines, note: fitNote(ratio, goalReport(predicted, fields)) };
}

/** The one ratio Fit would apply. The plan stores it. The recipe list is not changed. */
export function fitScaleOf(
  recipe: Recipe,
  catalog: ReadonlyMap<string, Recipe>,
  targets: GoalTargets | null | undefined,
): { scale: number } | { error: string } {
  const fields = goalFields(targets);
  if (!fields) return { error: "No macro goal on file." };
  const shares = sharesFor(recipe, catalog);
  if (!shares.length) return { error: "This recipe has no amounts Fit can scale." };
  return { scale: bestRatio(shares, fields) };
}

/** Portions for one planned day. Each non-snack meal is already a full-day fit. Two meals use the plan split. A snack stays whole and is subtracted from the meal named by `snackFrom`. */
export function portionForDay(
  meals: Array<{ id: string; slot: MealSlot; calories: number }>,
  split: "50-50" | "25-75",
  snackFrom: "lunch" | "supper",
): Record<string, number> {
  const portions: Record<string, number> = {};
  const mains = meals.filter((meal) => meal.slot !== "snack").sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  for (const meal of meals) if (meal.slot === "snack") portions[meal.id] = 1;
  if (!mains.length) return portions;
  const shares = splitShares(mains.length, split);
  mains.forEach((meal, index) => {
    portions[meal.id] = shares[index] ?? 1;
  });
  const snackCalories = meals.filter((meal) => meal.slot === "snack").reduce((sum, meal) => sum + Math.max(0, meal.calories), 0);
  if (snackCalories <= 0) return portions;
  const draw = mains.find((meal) => meal.slot === snackFrom) ?? mains[0];
  if (!draw || draw.calories <= 0) return portions;
  const next = (portions[draw.id] ?? 1) - snackCalories / draw.calories;
  portions[draw.id] = Math.max(0, Math.round(next * 1000) / 1000);
  return portions;
}

function splitShares(count: number, split: "50-50" | "25-75"): number[] {
  if (count <= 1) return [1];
  if (count === 2) return split === "25-75" ? [0.25, 0.75] : [0.5, 0.5];
  const share = 1 / count;
  return Array.from({ length: count }, () => share);
}

export function fitPlanDays(
  plan: MealPlan,
  catalog: ReadonlyMap<string, Recipe>,
  targets: GoalTargets | null | undefined,
): { updates: Array<{ date: string; mealId: string; portion: number }>; note: string } | { error: string } {
  const fields = goalFields(targets);
  if (!fields) return { error: "No macro goal on file." };
  const updates: Array<{ date: string; mealId: string; portion: number }> = [];
  let fitted = 0;
  let outside = 0;
  let fed = 0;
  for (const date of planDates(plan)) {
    const meals = plan.days[date] ?? [];
    if (!meals.length) continue;
    fed += 1;
    const pieces: Piece[] = [];
    for (const meal of meals) {
      const recipe = catalog.get(meal.recipeUid);
      if (!recipe) continue;
      const math = mealMacros(recipe, catalog);
      if (math.macros.calories <= 0 && math.macros.proteinG <= 0 && math.macros.fatG <= 0) continue;
      pieces.push({ id: meal.id, macros: math.macros, lambda: meal.slot === "snack" ? 0.02 : 0.2 });
    }
    if (!pieces.length) {
      outside += 1;
      continue;
    }
    const scales = solveScales(pieces, fields);
    const predicted = predict(emptyMacros(), pieces, scales);
    if (goalReport(predicted, fields).ok) fitted += 1;
    else outside += 1;
    for (const piece of pieces) {
      const portion = scales[piece.id] ?? 1;
      const current = meals.find((meal) => meal.id === piece.id)?.portion ?? 1;
      if (Math.abs(portion - current) >= 0.01) updates.push({ date, mealId: piece.id, portion });
    }
  }
  if (!fed) return { updates: [], note: "No meals on these days to fit." };
  const note =
    outside === 0
      ? `Fit ${fitted} ${fitted === 1 ? "day" : "days"} inside 10% of the goal.`
      : `Fit ${fitted} ${fitted === 1 ? "day" : "days"} inside 10%. ${outside} still outside.`;
  return { updates, note };
}

function goalFields(targets: GoalTargets | null | undefined): Field[] | null {
  if (!targets) return null;
  const fields: Field[] = [];
  if (targets.calories) fields.push({ key: "calories", label: "calories", target: targets.calories });
  if (targets.protein) fields.push({ key: "proteinG", label: "protein", target: targets.protein });
  if (targets.fat) fields.push({ key: "fatG", label: "fat", target: targets.fat });
  if (targets.carbs) fields.push({ key: "netCarbsG", label: "net carbs", target: targets.carbs });
  return fields.length ? fields : null;
}

function sharesFor(recipe: Recipe, catalog: ReadonlyMap<string, Recipe>): Share[] {
  const lines: Array<{ key: string; line: IngredientObj | string }> = [];
  if (Array.isArray(recipe.ingredient_sections) && recipe.ingredient_sections.some((section) => section.items?.length)) {
    recipe.ingredient_sections.forEach((section, sectionIndex) => {
      (section.items ?? []).forEach((item, itemIndex) => lines.push({ key: `s-${sectionIndex}-${itemIndex}`, line: item }));
    });
  } else if (Array.isArray(recipe.ingredients) && recipe.ingredients.length) {
    recipe.ingredients.forEach((entry, index) => lines.push({ key: `i-${index}`, line: entry }));
  } else if (Array.isArray(recipe.estimated_ingredients) && recipe.estimated_ingredients.length) {
    recipe.estimated_ingredients.forEach((entry, index) => lines.push({ key: `e-${index}`, line: entry }));
  }
  const shares: Share[] = [];
  for (const row of lines) {
    const lone: Recipe = {
      ...recipe,
      uid: `${recipe.uid}::fit-line`,
      ingredient_sections: null,
      estimated_ingredients: null,
      ingredients: [row.line as IngredientObj],
    };
    const math = scaledMealMacros(lone, catalog, 1);
    if (math.partial) continue;
    const macros = math.macros;
    if (macros.calories <= 0 && macros.proteinG <= 0 && macros.fatG <= 0 && macros.carbsG <= 0) continue;
    shares.push({ key: row.key, macros });
  }
  return shares;
}

function bestRatio(shares: Share[], fields: Field[]): number {
  let best = 1;
  let bestError = Infinity;
  for (let step = 0; step <= 800; step += 1) {
    const ratio = 0.05 + (4 - 0.05) * (step / 800);
    const error = macroError(shares, fields, ratio);
    if (error < bestError) {
      bestError = error;
      best = ratio;
    }
  }
  return Math.round(best * 1000) / 1000;
}

function macroError(shares: Share[], fields: Field[], ratio: number): number {
  let error = 0;
  for (const field of fields) {
    let value = 0;
    for (const share of shares) value += share.macros[field.key] * ratio;
    const diff = fieldGap(field.key, value, field.target);
    error += diff * diff;
  }
  return error;
}

function scaledTotal(shares: Share[], ratio: number): Macros {
  let total = emptyMacros();
  for (const share of shares) addInto(total, scaleMacros(share.macros, ratio));
  return total;
}

function fitNote(ratio: number, report: { ok: boolean; text: string }): string {
  const percent = Math.round(ratio * 100);
  const head = `Scaled this version to ${percent}% of its current amounts. Every ingredient kept the same ratio.`;
  if (report.ok) return `${head} Inside 10% of the daily goal (${report.text}). Save as a version to keep it.`;
  return `${head} Not every macro is inside 10% (${report.text}). One ratio cannot fix protein and fat separately. You can still save it and edit the amounts.`;
}

function solveScales(pieces: Piece[], fields: Field[]): Record<string, number> {
  const scales: Record<string, number> = {};
  for (const piece of pieces) scales[piece.id] = 1;
  for (let pass = 0; pass < 8; pass += 1) {
    for (const piece of pieces) {
      const others = emptyMacros();
      for (const other of pieces) {
        if (other.id === piece.id) continue;
        addInto(others, scaleMacros(other.macros, scales[other.id] ?? 1));
      }
      scales[piece.id] = bestScale(piece.macros, others, fields, piece.lambda);
    }
  }
  return scales;
}

function bestScale(mine: Macros, others: Macros, fields: Field[], lambda: number): number {
  let num = lambda;
  let den = lambda;
  for (const field of fields) {
    const mineValue = mine[field.key];
    const otherValue = others[field.key];
    const weight = 1 / (field.target * field.target);
    num += weight * (field.target - otherValue) * mineValue;
    den += weight * mineValue * mineValue;
  }
  if (den === 0) return 1;
  return clamp(num / den);
}

function predict(base: Macros, pieces: Piece[], scales: Record<string, number>): Macros {
  let total = { ...base };
  for (const piece of pieces) addInto(total, scaleMacros(piece.macros, scales[piece.id] ?? 1));
  return total;
}

function addInto(target: Macros, extra: Macros) {
  const next = addMacros(target, extra);
  target.calories = next.calories;
  target.fatG = next.fatG;
  target.carbsG = next.carbsG;
  target.fiberG = next.fiberG;
  target.netCarbsG = next.netCarbsG;
  target.sugarsG = next.sugarsG;
  target.proteinG = next.proteinG;
  target.cost = next.cost;
}

function clamp(value: number): number {
  const bounded = Math.min(4, Math.max(0.25, value));
  return Math.round(bounded * 100) / 100;
}

function applyScale(row: EditableLine, scale: number): EditableLine {
  if (Math.abs(scale - 1) < 0.01) return row;
  const amount = parseAmount(row.quantity);
  if (amount == null) return row;
  return { ...row, quantity: formatAmount(amount * scale) };
}

function fieldGap(key: Field["key"], value: number, target: number): number {
  if (key === "netCarbsG" && value <= target) return 0;
  return (value - target) / target;
}

function goalReport(macros: Macros, fields: Field[]): { ok: boolean; text: string } {
  const parts: string[] = [];
  let ok = true;
  for (const field of fields) {
    const value = macros[field.key];
    const signed = (value - field.target) / field.target;
    const pct = Math.round(Math.abs(signed) * 100);
    if (field.key === "netCarbsG" && signed <= 0) {
      parts.push(pct === 0 ? "carbs on goal" : `carbs ${pct}% under`);
      continue;
    }
    parts.push(`${field.label} ${pct}% off`);
    if (Math.abs(signed) > TOLERANCE) ok = false;
  }
  return { ok, text: parts.join(", ") };
}

export function portionLabel(portion: number | undefined): string {
  if (portion == null || Math.abs(portion - 1) < 0.05) return "";
  const rounded = Math.round(portion * 10) / 10;
  return `${rounded}×`;
}

export type { MealSlot, PlannedMeal };
