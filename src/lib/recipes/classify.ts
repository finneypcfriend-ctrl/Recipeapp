import type { Recipe } from "./types";

export const COURSE_ORDER = [
  "Main",
  "Side",
  "Appetizer & Snack",
  "Soup",
  "Salad",
  "Dessert",
  "Sauce & Condiment",
  "Breakfast",
  "Bread & Baking",
  "How-to & Other",
] as const;

export type CourseName = (typeof COURSE_ORDER)[number];

export const MEAT_ORDER = [
  "Beef",
  "Pork",
  "Chicken",
  "Turkey",
  "Lamb",
  "Fish",
  "Shellfish",
  "Eggs",
  "Cheese & Dairy",
  "No meat",
] as const;

export type MeatName = (typeof MEAT_ORDER)[number];

export const SOURCE_ORDER = ["diabetic_chef", "cary_kelly", "ketocarnivore9", "custom"] as const;

export const SOURCE_SHORT: Record<string, string> = {
  diabetic_chef: "Diabetic Chef",
  cary_kelly: "Cary Kelly",
  ketocarnivore9: "Keto Carnivore 9",
  custom: "Custom",
};

export function meatLabel(meat: string): string {
  if (meat === "Shellfish") return "Shrimp & crab";
  return meat;
}

export const COURSE_EMOJI: Record<string, string> = {
  Main: "🍖",
  Side: "🥦",
  Dessert: "🍰",
  Soup: "🍲",
  Salad: "🥗",
  "Sauce & Condiment": "🫙",
  "Appetizer & Snack": "🧀",
  Breakfast: "🍳",
  "Bread & Baking": "🍞",
  "How-to & Other": "📖",
};

const CK_TYPE: Record<string, CourseName> = {
  meal: "Main",
  side: "Side",
  dessert: "Dessert",
  snack: "Appetizer & Snack",
  condiment: "Sauce & Condiment",
  other: "How-to & Other",
};

const DC_PRIORITY: Array<[string, CourseName]> = [
  ["Entrées", "Main"],
  ["Desserts", "Dessert"],
  ["Soups", "Soup"],
  ["Salads", "Salad"],
  ["Sauces", "Sauce & Condiment"],
  ["Appetizers", "Appetizer & Snack"],
  ["Crêpes", "Breakfast"],
  ["All Things Carbalose", "Bread & Baking"],
  ["Vegetables", "Side"],
  ["Radishes aka Potatoes", "Side"],
];

const TITLE_GROUPS: Array<[CourseName, string[]]> = [
  ["Dessert", ["cake", "cheesecake", "cookie", "brownie", "pie", "fudge", "candy", "ice cream", "mousse", "pudding", "fat bomb", "fatbomb", "dessert", "tart", "custard", "truffle", "cobbler", "blondie"]],
  ["Sauce & Condiment", ["sauce", "gravy", "dressing", "dip", "mayo", "mayonnaise", "aioli", "butter", "seasoning", "rub", "marinade", "salsa", "vinaigrette", "ketchup", "pesto", "chimichurri", "glaze"]],
  ["Soup", ["soup", "stew", "chowder", "bisque", "chili", "broth"]],
  ["Salad", ["salad", "slaw"]],
  ["Bread & Baking", ["bread", "bun", "roll", "biscuit", "muffin", "crust", "tortilla", "cracker", "waffle", "pancake", "bagel", "flour"]],
  ["Breakfast", ["breakfast", "omelet", "omelette", "frittata", "quiche", "crepe", "crêpe"]],
  ["Appetizer & Snack", ["chips", "snack", "bites", "jerky", "appetizer", "deviled", "poppers", "wings"]],
];

const PROTEIN_KEYWORDS: Array<[MeatName, string[]]> = [
  ["Beef", ["beef", "steak", "brisket", "chuck", "ribeye", "sirloin", "short rib", "oxtail", "meatloaf", "burger", "cheeseburger", "hamburger", "pot roast", "roast beef", "corned beef", "pastrami", "veal", "bison", "salisbury", "sloppy joe", "meatball", "prime rib", "tri-tip", "tri tip", "flank", "skirt", "filet mignon", "new york strip", "ny strip", "liver", "beef heart"]],
  ["Pork", ["pork", "bacon", "ham", "sausage", "chorizo", "prosciutto", "pancetta", "pepperoni", "salami", "carnitas", "chicharron", "pork belly", "pork chop", "tenderloin", "kielbasa", "bratwurst", "andouille"]],
  ["Chicken", ["chicken", "hen", "wings", "drumstick", "thigh"]],
  ["Turkey", ["turkey"]],
  ["Lamb", ["lamb", "mutton", "gyro"]],
  ["Fish", ["fish", "salmon", "tuna", "cod", "halibut", "tilapia", "trout", "mahi", "swordfish", "sardine", "anchov", "catfish", "snapper", "grouper", "flounder", "haddock", "bass"]],
  ["Shellfish", ["shrimp", "crab", "lobster", "scallop", "clam", "mussel", "oyster", "crawfish", "prawn", "calamari", "squid"]],
  ["Eggs", ["egg", "frittata", "quiche", "omelet", "omelette", "deviled"]],
  ["Cheese & Dairy", ["cheese", "cheesecake", "mozzarella", "cheddar", "parmesan", "cream cheese", "ricotta", "boursin", "brie", "feta", "gouda", "yogurt"]],
];

const STRIP_PHRASES = [
  "pork rinds",
  "pork rind",
  "pork panko",
  "fish sauce",
  "bacon grease",
  "bacon fat",
  "chicken broth",
  "beef broth",
  "bone broth",
  "chicken stock",
  "beef stock",
  "egg wash",
  "tallow",
].sort((a, b) => b.length - a.length);

const MEAT_OR_SEAFOOD = new Set<MeatName>(["Beef", "Pork", "Chicken", "Turkey", "Lamb", "Fish", "Shellfish"]);

const keywordRes = new Map<string, RegExp>();

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[-/]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordRe(keyword: string): RegExp {
  const cached = keywordRes.get(keyword);
  if (cached) return cached;
  const parts = normalizeText(keyword).split(" ").filter(Boolean);
  const last = parts.pop() ?? "";
  const body = parts.length ? `${parts.map(escapeRe).join("\\s+")}\\s+` : "";
  const re = new RegExp(`\\b${body}${escapeRe(last)}(?:es|s)?\\b`, "i");
  keywordRes.set(keyword, re);
  return re;
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textHits(text: string, groups: Array<[string, string[]]>): string[] {
  const hits: string[] = [];
  for (const [name, keywords] of groups) {
    if (keywords.some((keyword) => keywordRe(keyword).test(text))) hits.push(name);
  }
  return hits;
}

function titleCourse(title: string): CourseName | null {
  const text = normalizeText(title);
  for (const [name, keywords] of TITLE_GROUPS) {
    if (keywords.some((keyword) => keywordRe(keyword).test(text))) return name;
  }
  return null;
}

export function courseOf(recipe: Recipe): CourseName {
  if (recipe.collection === "cary_kelly" && recipe.recipe_type && CK_TYPE[recipe.recipe_type]) {
    return CK_TYPE[recipe.recipe_type];
  }
  if (recipe.collection === "diabetic_chef") {
    const cats = new Set(recipe.categories ?? []);
    for (const [category, course] of DC_PRIORITY) {
      if (cats.has(category)) return course;
    }
  }
  if (recipe.collection === "ketocarnivore9" && recipe.recipe_kind === "technique") {
    return "How-to & Other";
  }
  return titleCourse(recipe.title || "") ?? "Main";
}

export function ingredientBlob(recipe: Recipe): string {
  const parts: string[] = [];
  if (Array.isArray(recipe.ingredients)) {
    for (const entry of recipe.ingredients) {
      if (typeof entry === "string") parts.push(entry);
      else if (entry && typeof entry === "object") {
        if (entry.raw) parts.push(entry.raw);
        if (entry.item) parts.push(entry.item);
      }
    }
  }
  if (Array.isArray(recipe.estimated_ingredients)) {
    for (const entry of recipe.estimated_ingredients) {
      if (entry?.item) parts.push(entry.item);
    }
  }
  return parts.join(" \n ");
}

function stripPhrases(text: string): string {
  let next = normalizeText(text);
  for (const phrase of STRIP_PHRASES) {
    const normalized = normalizeText(phrase).replace(/\s+/g, "\\s+");
    next = next.replace(new RegExp(`\\b${normalized}\\b`, "g"), " ");
  }
  return next.replace(/\s+/g, " ").trim();
}

export function proteinsOf(recipe: Recipe): MeatName[] {
  const titleHits = textHits(normalizeText(recipe.title || ""), PROTEIN_KEYWORDS) as MeatName[];
  if (titleHits.length) return titleHits;
  let hits = textHits(stripPhrases(ingredientBlob(recipe)), PROTEIN_KEYWORDS) as MeatName[];
  if (hits.some((hit) => MEAT_OR_SEAFOOD.has(hit))) {
    hits = hits.filter((hit) => MEAT_OR_SEAFOOD.has(hit));
  }
  if (!hits.length) return ["No meat"];
  return hits;
}

export function sourceLabelOf(recipe: Recipe): string {
  if (recipe.collection && SOURCE_SHORT[recipe.collection]) return SOURCE_SHORT[recipe.collection];
  if (recipe.collection_name) return recipe.collection_name;
  return "Recipe";
}
