import { eachDay, formatRange, type MealPlan } from "@/lib/plans/model";
import { formatAmount, formatTsp, parseAmount } from "@/lib/recipes/amount";
import type { Recipe } from "@/lib/recipes/types";
import { getIngredient, listIngredients, type SourcedIngredient } from "@/lib/sourced";
import { spoonLabel } from "@/lib/sourced/convert";
import { mealScale, recipeFromLines, smoothedServings, usedLibraryServings } from "@/lib/sourced/meal";

export interface GroceryLine {
  name: string;
  servings: number;
  have: boolean;
  packages: number;
}

export interface GroceryList {
  id: string;
  savedAt: number;
  planIds: string[];
  label: string;
  lines: GroceryLine[];
  bought?: boolean;
  boughtAt?: string | null;
}

export interface GroceryRow {
  name: string;
  servings: number;
  category: string;
  sub: string;
  usedLabel: string;
  consumedCost: number;
  product: string;
  packageSize: string;
  packagePrice: number;
  packages: number;
}

const CATEGORY_ORDER = ["Meat", "Dairy", "Fats", "Produce", "Pantry", "Other"];

const RULES: Array<{ category: string; sub: string; test: RegExp }> = [
  { category: "Fats", sub: "Tallow and cracklings", test: /tallow|crackling|lard|suet|dripping/ },
  { category: "Fats", sub: "Oils", test: /\boil\b|\bmct\b/ },
  { category: "Fats", sub: "Mayonnaise", test: /mayo/ },
  { category: "Dairy", sub: "Eggs", test: /\begg/ },
  { category: "Dairy", sub: "Cheese", test: /cheese|parmesan|mozzarella|cheddar|gruyere|mascarpone|ricotta|provolone|feta|brie|havarti|halloumi|gouda|colby|cottage|queso|mexican blend/ },
  { category: "Dairy", sub: "Cream and butter", test: /cream|butter|ghee|half and half|\bmilk\b|yogurt|kefir/ },
  { category: "Pantry", sub: "Aromatics", test: /garlic powder|onion powder|minced garlic|garlic minced|garlic salt/ },
  { category: "Pantry", sub: "Spices", test: /powder|salt|cumin|paprika|cinnamon|seasoning|chili|spice|extract|vanilla|cocoa|peppercorn|black pepper|white pepper|cayenne|nutmeg|clove|turmeric|bay leaf/ },
  { category: "Produce", sub: "Herbs", test: /cilantro|parsley|basil|rosemary|thyme|dill|\bmint\b|sage|chive|oregano/ },
  { category: "Produce", sub: "Vegetables", test: /bell pepper|jalapeno|poblano|onion|mushroom|lettuce|spinach|broccoli|cauliflower|zucchini|cabbage|celery|tomato|avocado|cucumber|asparagus|radish|kale|scallion|shallot|garlic|ginger|squash|\bolive\b/ },
  { category: "Produce", sub: "Fruit", test: /lemon|lime|berry|strawberry|raspberry|blueberry|apple|orange/ },
  { category: "Meat", sub: "Beef", test: /beef|brisket|chuck|ribeye|steak|oxtail|picanha|short rib|hamburger|sirloin|tenderloin/ },
  { category: "Meat", sub: "Pork", test: /pork|bacon|\bham\b|sausage|kielbasa|andouille|pepperoni|salami|prosciutto|hot dog|chorizo|rind/ },
  { category: "Meat", sub: "Poultry", test: /chicken|turkey|duck|cornish|\bwing|\bthigh|drumstick/ },
  { category: "Meat", sub: "Seafood", test: /fish|salmon|tuna|shrimp|tilapia|scallop|crab|sardine|anchovy|lobster|\bcod\b/ },
  { category: "Meat", sub: "Lamb", test: /lamb|goat/ },
  { category: "Pantry", sub: "Sauces and broth", test: /sauce|tamari|vinegar|mustard|dressing|broth|stock|\bbase\b|bouillon|paste/ },
  { category: "Pantry", sub: "Baking", test: /almond|pecan|walnut|flour|coconut|psyllium|gelatin|erythritol|allulose|monk|sweetener|chocolate/ },
];

export function libraryMeats(): Array<{ category: string; names: string[] }> {
  const groups = new Map<string, string[]>();
  for (const item of listIngredients()) {
    const place = aisle(item.name);
    if (place.category !== "Meat") continue;
    const names = groups.get(place.sub) ?? [];
    names.push(item.name);
    groups.set(place.sub, names);
  }
  return ["Beef", "Pork", "Poultry", "Seafood", "Lamb"].flatMap((category) => {
    const names = groups.get(category);
    return names?.length ? [{ category, names: names.sort((a, b) => a.localeCompare(b)) }] : [];
  });
}

export function aisle(name: string): { category: string; sub: string } {
  const text = name.toLowerCase();
  for (const rule of RULES) {
    if (rule.test.test(text)) return { category: rule.category, sub: rule.sub };
  }
  return { category: "Other", sub: "Other" };
}

export function packagesFor(servings: number, perPackage: number | null): number {
  const size = perPackage && perPackage > 0 ? perPackage : 1;
  if (servings <= 0) return 0;
  return Math.max(1, Math.ceil(servings / size - 1e-6));
}

export function packLabel(row: Pick<GroceryRow, "name" | "product" | "packageSize" | "sub">, count: number): string {
  const size = row.packageSize.replace(/\s*\(.*$/, "").replace(/\s+/g, " ").trim();
  const text = `${row.product} ${row.name}`.toLowerCase();
  const spice = row.sub === "Spices" || row.sub === "Aromatics";
  let noun = "";
  if (/block|chunk/.test(text)) noun = "block";
  else if (/\bjar\b/.test(text) || (spice && /\boz\b/i.test(size))) noun = "jar";
  else if (/\bbottle\b/.test(text) || /\bfl oz\b/i.test(size)) noun = "bottle";
  else if (/\bbag\b/.test(text)) noun = "bag";
  else if (/\beach\b/.test(text)) noun = "each";
  if (noun === "each") return count === 1 ? "Buy 1 each" : `Buy ${count} each`;
  if (noun) return `Buy ${count} ${count === 1 ? noun : `${noun}s`} (${size})`;
  return size ? `Buy ${count} × ${size}` : `Buy ${count}`;
}

export function money(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  return `$${value.toFixed(2)}`;
}

export function describeUse(item: SourcedIngredient, servings: number): string {
  const bare = item.servingSize.replace(/\s*\([^)]*\)/g, "").replace(/\.$/, "").trim();
  const lead = bare.match(/^([\d./]+)\s*(.*)$/);
  if (!lead) return `${formatAmount(servings)} × ${item.servingSize}`;
  const qty = parseAmount(lead[1]) ?? 1;
  const unit = lead[2].trim();
  const amount = qty * servings;
  if (/^g$/i.test(unit)) {
    const spoons = spoonLabel(item.name, amount);
    if (spoons) return spoons;
  }
  if (/^tsp|^teaspoon/i.test(unit)) return `${formatTsp(amount)} tsp`;
  return unit ? `${formatAmount(amount)} ${unit}` : formatAmount(amount);
}

export function packagePrice(item: SourcedIngredient): number {
  if (item.price != null && item.price > 0) return item.price;
  const each = item.costPerServing ?? item.perServing.cost ?? 0;
  const count = item.servingsPerPackage && item.servingsPerPackage > 0 ? item.servingsPerPackage : 1;
  return each * count;
}

export function rowFor(name: string, servings: number, packages?: number): GroceryRow | null {
  const item = getIngredient(name);
  if (!item || servings <= 0) return null;
  const place = aisle(name);
  const count = packages ?? packagesFor(servings, item.servingsPerPackage);
  const each = item.costPerServing ?? item.perServing.cost ?? 0;
  return {
    name,
    servings,
    category: place.category,
    sub: place.sub,
    usedLabel: describeUse(item, servings),
    consumedCost: each * servings,
    product: item.fullName || item.name,
    packageSize: item.size || item.servingSize,
    packagePrice: packagePrice(item),
    packages: count,
  };
}

export function collectUsage(plans: MealPlan[], planIds: string[], catalog: ReadonlyMap<string, Recipe>): Map<string, number> {
  const wanted = new Set(planIds);
  const totals = new Map<string, number>();
  const add = (name: string, servings: number) => {
    if (!name || servings <= 0) return;
    totals.set(name, (totals.get(name) ?? 0) + servings);
  };
  for (const plan of plans) {
    if (!wanted.has(plan.id)) continue;
    for (const date of eachDay(plan.start, plan.end)) {
      for (const meal of plan.days[date] ?? []) {
        const recipe = meal.recipeUid ? catalog.get(meal.recipeUid) : undefined;
        if (recipe) {
          const basis = meal.lines?.length ? recipeFromLines(recipe, meal.lines) : recipe;
          for (const row of usedLibraryServings(basis, catalog, mealScale(meal), meal.meatTrim ?? 1, meal.carbItem, meal.carbScale, meal.tweaks, plan.beefChoice)) {
            add(row.name, row.servings);
          }
        }
        if (meal.sideName && meal.sideServings) add(meal.sideName, smoothedServings(meal.sideName, meal.sideServings));
      }
    }
  }
  return totals;
}

export function rowsFromUsage(totals: Map<string, number>, saved?: GroceryLine[]): GroceryRow[] {
  const packages = new Map((saved ?? []).map((line) => [line.name, line.packages]));
  const rows: GroceryRow[] = [];
  for (const [name, servings] of totals) {
    const row = rowFor(name, smoothedServings(name, servings), packages.get(name));
    if (row) rows.push(row);
  }
  return rows.sort((a, b) => compareRows(a, b));
}

export function groupRows(rows: GroceryRow[]): Array<{ category: string; subs: Array<{ sub: string; rows: GroceryRow[] }> }> {
  const grouped: Array<{ category: string; subs: Array<{ sub: string; rows: GroceryRow[] }> }> = [];
  for (const row of rows) {
    let category = grouped.find((group) => group.category === row.category);
    if (!category) {
      category = { category: row.category, subs: [] };
      grouped.push(category);
    }
    let sub = category.subs.find((group) => group.sub === row.sub);
    if (!sub) {
      sub = { sub: row.sub, rows: [] };
      category.subs.push(sub);
    }
    sub.rows.push(row);
  }
  return grouped;
}

function compareRows(a: GroceryRow, b: GroceryRow): number {
  const category = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  if (category) return category;
  const sub = a.sub.localeCompare(b.sub);
  if (sub) return sub;
  return a.name.localeCompare(b.name);
}

export function groceryLabel(plans: MealPlan[], planIds: string[]): string {
  const labels = plans.filter((plan) => planIds.includes(plan.id)).map((plan) => (plan.start && plan.end ? formatRange(plan.start, plan.end) : "Dates not chosen"));
  return labels.length ? labels.join(", ") : "Grocery list";
}

export function purchaseCost(rows: GroceryRow[], buying: ReadonlySet<string>, packages: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const row of rows) {
    if (!buying.has(row.name)) continue;
    const count = packages.get(row.name) ?? row.packages;
    total += Math.max(0, count) * row.packagePrice;
  }
  return total;
}
