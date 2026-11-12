import homemadeRows from "./homemade.json" with { type: "json" };
import ingredientRows from "./ingredients.json" with { type: "json" };

/**
 * Standalone sourced-ingredient database (products, macros, cost).
 * Recipe screens do not import these functions. Meal planning does, via
 * `meal.ts`, when a day needs macros and cost for a planned meal.
 * `pair.ts` only stamps `sourced_name` / `sourced_match` onto original
 * ingredient lines. Call the helpers here directly when code needs macros.
 */

export interface Macros {
  calories: number;
  fatG: number;
  carbsG: number;
  fiberG: number;
  netCarbsG: number;
  sugarsG: number;
  proteinG: number;
  cost: number;
}

export interface SourcedIngredient {
  name: string;
  fullName: string;
  brand: string;
  size: string;
  price: number | null;
  basis: string;
  servingSize: string;
  servingQty: number | null;
  servingsPerPackage: number | null;
  packageQty: number | null;
  costPerServing: number | null;
  costPerLb: number | null;
  perServing: Macros;
  labelIngredients: string;
  macroSource: string;
  notes: string;
}

export interface HomemadeLine {
  written: string;
  ingredient: string;
  servings: number;
  note: string;
}

export interface HomemadeRecipe {
  name: string;
  sourceUrl: string;
  servings: number | null;
  lines: HomemadeLine[];
}

export interface MacroResult {
  macros: Macros;
  unmatched: string[];
}

const ingredients = (ingredientRows as SourcedIngredient[]).map(withoutPlantProtein);
const homemade = homemadeRows as HomemadeRecipe[];
const byName = new Map(ingredients.map((item) => [normalize(item.name), item]));

/**
 * Plant protein is not counted. It is poorly bioavailable, so a mushroom,
 * a spice, or a nut shows 0 g protein. Meat, fish, eggs, and dairy keep theirs.
 */
export function countsAsAnimalProtein(name: string): boolean {
  const text = name.toLowerCase();
  if (/peanut butter|almond butter|coconut milk|almond milk|oat milk|soy milk|eggplant|egg roll|egg noodle|cocoa butter|nut butter/.test(text)) return false;
  return /beef|pork|chicken|lamb|duck|bacon|\bham\b|sausage|pepperoni|salami|kielbasa|andouille|prosciutto|jerky|hot dog|vienna|corned|ribeye|brisket|chuck|picanha|oxtail|tenderloin|steak|short rib|drumstick|\bwings?\b|thigh|breast|liver|cornish|rotisserie|goat|shrimp|fish|tilapia|salmon|tuna|scallop|lobster|anchovy|crab|sardine|shellfish|cheese|parmesan|mozzarella|cheddar|gruyere|mascarpone|ricotta|monterey|provolone|feta|brie|havarti|halloumi|babybel|boursin|gouda|colby|cottage|queso|alfredo|mexican blend|milk|buttermilk|half and half|cream|yogurt|kefir|whey|ghee|\bbutter\b|sour cream|\begg|gelatin|collagen|broth|\bbase\b|fish sauce|pork rind|dressing|\bpesto\b/.test(text);
}

function withoutPlantProtein(item: SourcedIngredient): SourcedIngredient {
  if (countsAsAnimalProtein(item.name) || item.perServing.proteinG === 0) return item;
  return { ...item, perServing: { ...item.perServing, proteinG: 0 } };
}

export function listIngredients(): readonly SourcedIngredient[] {
  return ingredients;
}

export function getIngredient(name: string): SourcedIngredient | undefined {
  return byName.get(normalize(name));
}

export function searchIngredients(query: string): SourcedIngredient[] {
  const needle = normalize(query);
  if (!needle) return [];
  return ingredients.filter((item) =>
    [item.name, item.fullName, item.brand, item.labelIngredients].some((value) => normalize(value).includes(needle)),
  );
}

export function macrosForServings(name: string, servings: number): Macros | undefined {
  const item = getIngredient(name);
  if (!item || !Number.isFinite(servings)) return undefined;
  return scaleMacros(item.perServing, servings);
}

export function macrosForQty(name: string, qty: number): Macros | undefined {
  const item = getIngredient(name);
  if (!item || !item.servingQty || !Number.isFinite(qty)) return undefined;
  return scaleMacros(item.perServing, qty / item.servingQty);
}

export function listHomemade(): readonly HomemadeRecipe[] {
  return homemade;
}

export function getHomemade(name: string): HomemadeRecipe | undefined {
  const needle = normalize(name);
  return homemade.find((recipe) => normalize(recipe.name) === needle);
}

export function homemadeBatch(name: string): MacroResult | undefined {
  const recipe = getHomemade(name);
  if (!recipe) return undefined;
  return sumLines(recipe.lines);
}

export function homemadePerServing(name: string): MacroResult | undefined {
  const recipe = getHomemade(name);
  const batch = homemadeBatch(name);
  if (!recipe || !batch || !recipe.servings) return undefined;
  return { macros: scaleMacros(batch.macros, 1 / recipe.servings), unmatched: batch.unmatched };
}

export function caloriesFromMacros(proteinG: number, carbsG: number, fatG: number): number {
  return proteinG * 4 + carbsG * 4 + fatG * 9;
}

export function addMacros(left: Macros, right: Macros): Macros {
  return {
    calories: left.calories + right.calories,
    fatG: left.fatG + right.fatG,
    carbsG: left.carbsG + right.carbsG,
    fiberG: left.fiberG + right.fiberG,
    netCarbsG: left.netCarbsG + right.netCarbsG,
    sugarsG: left.sugarsG + right.sugarsG,
    proteinG: left.proteinG + right.proteinG,
    cost: left.cost + right.cost,
  };
}

export function scaleMacros(macros: Macros, factor: number): Macros {
  return {
    calories: macros.calories * factor,
    fatG: macros.fatG * factor,
    carbsG: macros.carbsG * factor,
    fiberG: macros.fiberG * factor,
    netCarbsG: macros.netCarbsG * factor,
    sugarsG: macros.sugarsG * factor,
    proteinG: macros.proteinG * factor,
    cost: macros.cost * factor,
  };
}

function sumLines(lines: HomemadeLine[]): MacroResult {
  const unmatched: string[] = [];
  let macros = emptyMacros();
  for (const line of lines) {
    const scaled = macrosForServings(line.ingredient, line.servings);
    if (!scaled) {
      unmatched.push(line.ingredient);
      continue;
    }
    macros = addMacros(macros, scaled);
  }
  return { macros, unmatched };
}

export function emptyMacros(): Macros {
  return { calories: 0, fatG: 0, carbsG: 0, fiberG: 0, netCarbsG: 0, sugarsG: 0, proteinG: 0, cost: 0 };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
