import { formatAmount, parseAmount, scaleRatio } from "./amount";
import type { IngredientObj, Recipe } from "./types";

export interface EditableLine {
  id: string;
  quantity: string;
  unit: string;
  name: string;
}

const UNIT_WORDS = new Set([
  "tbsp",
  "tablespoon",
  "tablespoons",
  "tsp",
  "teaspoon",
  "teaspoons",
  "cup",
  "cups",
  "oz",
  "ounce",
  "ounces",
  "lb",
  "lbs",
  "pound",
  "pounds",
  "g",
  "gram",
  "grams",
  "kg",
  "ml",
  "l",
  "clove",
  "cloves",
  "slice",
  "slices",
  "can",
  "cans",
  "pinch",
  "pinches",
  "bunch",
  "bunches",
  "head",
  "heads",
  "stalk",
  "stalks",
  "package",
  "packages",
  "ea",
  "each",
  "inch",
  "inches",
]);

function isUnit(token: string): boolean {
  if (token === "T" || token === "t" || token === "C" || token === "c") return true;
  return UNIT_WORDS.has(token.toLowerCase());
}

function quantityText(value: string | number | null | undefined): string {
  if (typeof value === "number") return formatAmount(value);
  if (value == null) return "";
  const text = String(value).trim();
  const parsed = parseAmount(text);
  return parsed == null ? text : formatAmount(parsed);
}

export function splitRaw(raw: string): Pick<EditableLine, "quantity" | "unit" | "name"> {
  const text = raw.trim();
  if (!text || /[+]/.test(text)) return { quantity: "", unit: "", name: text };
  const match = text.match(/^((?:\d+\s+)?\d+\s*\/\s*\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])\s+(.+)$/);
  if (!match) return { quantity: "", unit: "", name: text };
  const rest = match[2].trim();
  const parts = rest.split(/\s+/);
  const unit = parts[0] && isUnit(parts[0]) ? parts[0] : "";
  const name = unit ? parts.slice(1).join(" ") : rest;
  return { quantity: quantityText(match[1]), unit, name };
}

function line(id: string, quantity: string, unit: string, name: string): EditableLine {
  return { id, quantity, unit, name };
}

function fromObject(entry: IngredientObj, id: string): EditableLine {
  const raw = entry.raw?.trim() || "";
  const item = entry.item?.trim() || "";
  if (raw && (/[+]/.test(raw) || item.startsWith("+"))) return line(id, "", "", raw);
  const quantity = quantityText(entry.quantity ?? entry.quantity_value);
  const unit = entry.unit?.trim() || "";
  if (quantity || unit || item) return line(id, quantity, unit, item || raw);
  return { id, ...splitRaw(raw) };
}

export function linesFromRecipe(recipe: Recipe): EditableLine[] {
  const lines: EditableLine[] = [];
  if (Array.isArray(recipe.ingredient_sections) && recipe.ingredient_sections.some((section) => section.items?.length)) {
    recipe.ingredient_sections.forEach((section, sectionIndex) => {
      (section.items ?? []).forEach((item, itemIndex) => {
        lines.push(fromObject(item, `s-${sectionIndex}-${itemIndex}`));
      });
    });
  } else if (Array.isArray(recipe.ingredients) && recipe.ingredients.length) {
    recipe.ingredients.forEach((entry, index) => {
      if (typeof entry === "string") lines.push({ id: `i-${index}`, ...splitRaw(entry) });
      else lines.push(fromObject(entry, `i-${index}`));
    });
  } else if (Array.isArray(recipe.estimated_ingredients) && recipe.estimated_ingredients.length) {
    recipe.estimated_ingredients.forEach((entry, index) => {
      lines.push(fromObject(entry, `e-${index}`));
    });
  }
  return lines.filter((entry) => entry.quantity || entry.unit || entry.name);
}

export function scaleLines(snapshot: EditableLine[], baseId: string, nextQuantity: string): EditableLine[] {
  const base = snapshot.find((entry) => entry.id === baseId);
  const ratio = base ? scaleRatio(base.quantity, nextQuantity) : null;
  return snapshot.map((entry) => {
    if (entry.id === baseId) return { ...entry, quantity: nextQuantity };
    if (ratio == null) return { ...entry };
    const amount = parseAmount(entry.quantity);
    if (amount == null) return { ...entry };
    return { ...entry, quantity: formatAmount(amount * ratio) };
  });
}

export function blankLine(): EditableLine {
  return { id: `new-${crypto.randomUUID()}`, quantity: "", unit: "", name: "" };
}

export function lineRaw(entry: EditableLine): string {
  return [entry.quantity.trim(), entry.unit.trim(), entry.name.trim()].filter(Boolean).join(" ");
}

export interface VersionLink {
  uid: string;
  label: string;
  number: number;
}

export function versionOfUid(uid: string): number | null {
  const numbered = uid.match(/::v(\d+)$/);
  if (numbered) return Number(numbered[1]);
  if (uid.endsWith("::mod")) return 1;
  return null;
}

export function stripVersion(uid: string): string {
  return uid.replace(/::v\d+$/, "").replace(/::mod$/, "");
}

export function baseOf(recipeOrUid: Recipe | string): string {
  if (typeof recipeOrUid === "string") return stripVersion(recipeOrUid);
  if (recipeOrUid.mod_of) return stripVersion(recipeOrUid.mod_of);
  return stripVersion(recipeOrUid.uid);
}

export function versionId(base: string, number: number): string {
  return `${stripVersion(base)}::v${number}`;
}

export function isVersionRecipe(recipe: Recipe): boolean {
  return recipe.variant === "version" || recipe.variant === "mod" || versionOfUid(recipe.uid) != null;
}

export function versionNumber(recipe: Recipe): number | null {
  return recipe.version ?? versionOfUid(recipe.uid);
}

export function versionLabelOf(recipe: Recipe): string {
  const number = versionNumber(recipe);
  const label = recipe.version_label?.trim();
  if (label && label !== "MOD") return label;
  return number ? `V${number}` : "V1";
}

export function nextVersionNumber(recipes: Recipe[], base: string): number {
  const parent = stripVersion(base);
  let max = 0;
  for (const recipe of recipes) {
    if (baseOf(recipe) !== parent || !isVersionRecipe(recipe)) continue;
    const number = versionNumber(recipe) ?? 0;
    if (number > max) max = number;
  }
  return max + 1;
}

export function buildVersionRecipe(
  source: Recipe,
  rows: EditableLine[],
  options: { number: number; label: string; notes: string; favorite: boolean },
): Recipe {
  const base = baseOf(source);
  const ingredients = rows
    .map((entry) => {
      const quantity = entry.quantity.trim();
      const unit = entry.unit.trim();
      const item = entry.name.trim();
      const raw = [quantity, unit, item].filter(Boolean).join(" ");
      if (!raw) return null;
      return {
        raw,
        quantity: quantity || null,
        unit: unit || null,
        item: item || raw,
        estimated: false,
      };
    })
    .filter((entry) => entry != null);
  const label = options.label.trim() || `V${options.number}`;
  return {
    ...source,
    uid: versionId(base, options.number),
    mod_of: base,
    variant: "version",
    version: options.number,
    version_label: label,
    label,
    favorite: options.favorite,
    custom_notes: options.notes,
    ingredients,
    ingredient_sections: null,
    estimated_ingredients: null,
    estimate_note: null,
  };
}

export function migrateLegacyMods(recipes: Recipe[]): boolean {
  let changed = false;
  for (const recipe of recipes) {
    const legacy = recipe.uid.endsWith("::mod") || recipe.variant === "mod";
    if (!legacy && recipe.variant !== "version") continue;
    const base = baseOf(recipe);
    const number = versionNumber(recipe) ?? 1;
    const nextUid = versionId(base, number);
    if (recipe.uid !== nextUid && !recipes.some((item) => item !== recipe && item.uid === nextUid)) {
      recipe.uid = nextUid;
      changed = true;
    }
    if (recipe.mod_of !== base) {
      recipe.mod_of = base;
      changed = true;
    }
    if (recipe.variant !== "version") {
      recipe.variant = "version";
      changed = true;
    }
    if (recipe.version !== number) {
      recipe.version = number;
      changed = true;
    }
    const label = recipe.version_label?.trim();
    if (!label || label === "MOD") {
      recipe.version_label = `V${number}`;
      recipe.label = recipe.version_label;
      changed = true;
    }
  }
  return changed;
}

const OREO_WINGS_UID = "cary_kelly:1491842167823912964";

function isCannedSauceLine(text: string): boolean {
  return /favorite canned sauce/i.test(text);
}

function dropCannedSauce(recipe: Recipe): boolean {
  let changed = false;
  if (Array.isArray(recipe.ingredients)) {
    const next = recipe.ingredients.filter((item) => !isCannedSauceLine(typeof item === "string" ? item : item.raw || item.item || ""));
    if (next.length !== recipe.ingredients.length) {
      recipe.ingredients = next;
      changed = true;
    }
  }
  if (Array.isArray(recipe.ingredient_sections)) {
    for (const section of recipe.ingredient_sections) {
      if (!section.items) continue;
      const next = section.items.filter((item) => !isCannedSauceLine(item.raw || item.item || ""));
      if (next.length !== section.items.length) {
        section.items = next;
        changed = true;
      }
    }
  }
  return changed;
}

/** Owner decisions that are not pairings. Drop the deleted Oreo wings joke recipe, and drop the canned-sauce alternate from the chicken enchiladas ingredient list. Do not re-add either. */
export function pruneRecipes(recipes: Recipe[]): boolean {
  let changed = false;
  for (let index = recipes.length - 1; index >= 0; index -= 1) {
    const recipe = recipes[index];
    if (recipe.uid === OREO_WINGS_UID || recipe.title === "Oreo-Breaded Wings") {
      recipes.splice(index, 1);
      changed = true;
      continue;
    }
    if (recipe.uid === "diabetic_chef:low-carb-chicken-enchiladas" && dropCannedSauce(recipe)) changed = true;
  }
  return changed;
}

/** Remove every saved version. Manual edits can make new ones. Fit and Hone do not. */
export function dropVersionRecipes(recipes: Recipe[]): Map<string, string> | null {
  const parents = new Map<string, string>();
  for (let index = recipes.length - 1; index >= 0; index -= 1) {
    const recipe = recipes[index];
    if (!recipe || !isVersionRecipe(recipe)) continue;
    parents.set(recipe.uid, baseOf(recipe));
    recipes.splice(index, 1);
  }
  return parents.size ? parents : null;
}
