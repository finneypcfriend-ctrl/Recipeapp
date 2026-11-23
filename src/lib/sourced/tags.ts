/** Built-in food tags, plus any tag saved on an ingredient. */
const TAGS: Record<string, string> = {
  "BBQ sauce (G Hughes sugar free)": "Condiment",
  "BBQ sauce (G Hughes tex mex)": "Condiment",
  "sweet chili sauce (G Hughes)": "Condiment",
  "chili garlic sauce": "Condiment",
  "hot sauce": "Condiment",
  "hot sauce (Cholula green)": "Condiment",
  "sf ketchup": "Condiment",
  mustard: "Condiment",
  "mustard (stone ground)": "Condiment",
  salsa: "Condiment",
  "sf relish": "Condiment",
  "dill relish": "Condiment",
  "cranberry orange relish": "Condiment",
  "pickles (dill chips)": "Ferments/Pickled",
  "pickled jalapeno": "Ferments/Pickled",
  "banana peppers (pickled)": "Ferments/Pickled",
  "fermented black beans": "Ferments/Pickled",
  acv: "Ferments/Pickled",
  "apple cider vinegar (White House)": "Ferments/Pickled",
  "tortilla (Mission zero net carb)": "Pantry",
};

const FOOD_KEY = "recipes.ingredient-food-tags";
const RESTOCK_KEY = "recipes.restock-tags";

export function libraryTag(name: string): string | undefined {
  return TAGS[name];
}

export function savedFoodTag(name: string): string | undefined {
  const saved = loadFood()[name];
  return saved?.trim() || undefined;
}

export function setFoodTag(name: string, category: string) {
  const next = loadFood();
  const value = category.trim();
  if (!value) delete next[name];
  else next[name] = value;
  saveFood(next);
}

export function customFoodTags(): string[] {
  return [...new Set(Object.values(loadFood()).map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

const SUPPLEMENT_KEY = "recipes.supplement-tags";

export const FOOD_TAGS = ["Meat", "Dairy", "Fats", "Produce", "Condiment", "Ferments/Pickled", "Pantry", "Other"];
export const USE_TAGS = ["BAP", "Restock", "Supplement"];

export function foodChoices(): string[] {
  const next = [...FOOD_TAGS];
  for (const tag of customFoodTags()) {
    if (!next.includes(tag)) next.push(tag);
  }
  return next;
}

/** First visit copies the current plate list so Restock does not start empty. */
export function seedRestock(names: string[]) {
  if (typeof localStorage === "undefined" || localStorage.getItem(RESTOCK_KEY) != null) return;
  const unique = [...new Set(names.filter(Boolean))];
  localStorage.setItem(RESTOCK_KEY, JSON.stringify(unique));
}

export function restockNames(): string[] {
  return readNames(RESTOCK_KEY);
}

export function isRestock(name: string): boolean {
  return restockNames().includes(name);
}

export function setRestock(name: string, on: boolean) {
  const next = restockNames().filter((item) => item !== name);
  if (on) next.push(name);
  localStorage.setItem(RESTOCK_KEY, JSON.stringify(next));
}

export function seedSupplements(names: string[]) {
  if (typeof localStorage === "undefined" || localStorage.getItem(SUPPLEMENT_KEY) != null) return;
  localStorage.setItem(SUPPLEMENT_KEY, JSON.stringify([...new Set(names.filter(Boolean))]));
}

export function supplementNames(): string[] {
  return readNames(SUPPLEMENT_KEY);
}

export function isSupplement(name: string): boolean {
  return supplementNames().includes(name);
}

export function setSupplement(name: string, on: boolean) {
  const next = supplementNames().filter((item) => item !== name);
  if (on) next.push(name);
  localStorage.setItem(SUPPLEMENT_KEY, JSON.stringify(next));
}

export function replaceSupplementTags(names: string[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SUPPLEMENT_KEY, JSON.stringify([...new Set(names.filter(Boolean))]));
}

function readNames(key: string): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === "string" && Boolean(name)) : [];
  } catch {
    return [];
  }
}

function loadFood(): Record<string, string> {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(FOOD_KEY) || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const next: Record<string, string> = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) next[name] = value.trim();
    }
    return next;
  } catch {
    return {};
  }
}

function saveFood(tags: Record<string, string>) {
  localStorage.setItem(FOOD_KEY, JSON.stringify(tags));
}
