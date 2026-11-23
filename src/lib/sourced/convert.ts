import { formatAmount, formatTsp, parseAmount } from "../recipes/amount.ts";
import type { SourcedIngredient } from "./index.ts";

/**
 * Turns one recipe amount into a count of ingredient-library servings.
 *
 * `macrosForServings(name, this number)` is the macros and cost for that line.
 * The homemade sheet (`homemade.json`) is the calculator those library rows
 * were built from, so the rules below are the ones that reproduce it:
 *
 * - Volume amount + a volume serving (tsp, Tbsp, cup, mL) divides the volumes.
 *   Do not redo that in grams. A label can say "1 Tbsp (18g)" and still store
 *   15 for the mL, and the sheet counted tablespoons.
 * - Weight amount (oz, lb, g) is grams ÷ grams in one serving. Ounces are
 *   28.35 g, pounds are 453.6 g, matching the homemade notes.
 * - Volume amount + a gram-only serving (USDA "100 g", nut butters) uses the
 *   density table. Those spice numbers are the USDA figures already written
 *   in the homemade notes (paprika 2.3 g/tsp, garlic powder 3.1 g/tsp).
 * - No amount, or pinch / dash / drop / to-taste, is 0. It is not a failure.
 * - A counted cut with no unit (4 steaks, 12 drumsticks, 1 tenderloin) is that
 *   many library servings when the row is already per pound. A written weight
 *   ("about 1¼ lb", "6-8 oz each") wins. A bacon slice is 24 g, the fraction
 *   of the 16 oz package one slice is.
 * - "1 each" uses a piece weight when we have one. A parenthetical weight on
 *   the line, "(~24 oz)", replaces the piece weight. "1 small" is 0.7 of the
 *   medium piece, "1 large" is 1.35. Jalapeño's 14 g is the small, so the
 *   medium piece is 20 g.
 * - One clove of garlic (not powder) is 1 tsp of the minced-garlic row.
 *   One head is 10 cloves.
 * - One stick of butter or cream cheese is 8 Tbsp.
 * - Homemade batch rows (hoisin, ranch, the other sauces) store the whole
 *   batch as one serving and leave `servingQty` null. Scale them only when
 *   the serving text gives a yield ("makes 8 x 2 T"). Otherwise leave the
 *   line unmatched. Do not drop the whole batch into the meal.
 *
 * Returns null when a real amount cannot be scaled. The meal total still
 * adds the lines that worked.
 *
 * Label spoon sizes are the nutrition-label ones (1 tsp = 5 mL, 1 Tbsp = 15 mL,
 * 1 cup = 240 mL), not the 4.93 mL survey teaspoon. The homemade sheet uses
 * 15 mL per tablespoon.
 */

const TSP = 5;
const TBSP = 15;
const CUP = 240;

const ML: Record<string, number> = {
  tsp: TSP,
  tbsp: TBSP,
  cup: CUP,
  ml: 1,
  "fl oz": 30,
  l: 1000,
  pint: 480,
  quart: 960,
  gallon: 3840,
};

const NEGLIGIBLE = new Set(["pinch", "dash", "sprinkle", "drop", "to", "as", "few", "handful", "taste"]);

const GLYPH: Record<string, string> = {
  "½": "1/2",
  "⅓": "1/3",
  "⅔": "2/3",
  "¼": "1/4",
  "¾": "3/4",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};

/** Grams in one teaspoon. USDA weights the homemade notes already use, plus the same source for the other spices. */
const GRAMS_PER_TSP: Record<string, number> = {
  "garlic powder": 3.1,
  "onion powder": 2.4,
  paprika: 2.3,
  "smoked paprika": 2.3,
  oregano: 1.8,
  cumin: 2.1,
  cayenne: 1.8,
  "ancho powder": 2.7,
  "black pepper": 2.32,
  "white pepper": 2.4,
  "hot sauce": 4.7,
  anchovy: 5,
  cinnamon: 2.6,
  nutmeg: 2.2,
  "ground ginger": 1.8,
  cloves: 2.1,
  allspice: 1.9,
  turmeric: 2.2,
  "mustard powder": 2,
  coriander: 1.8,
  cardamom: 2,
  "fennel seed": 2,
  "celery seed": 2,
  "poppy seed": 2.8,
  "cream of tartar": 3,
  anise: 2.1,
  "dill dried": 1,
  "rosemary dried": 1.2,
  "thyme dried": 1.4,
  "basil dried": 0.7,
  marjoram: 0.6,
  sage: 0.7,
  tarragon: 0.6,
  "red pepper flakes": 1.5,
  peppercorns: 2.3,
  "redmond salt": 6,
  vanilla: 4.2,
  "instant espresso": 0.7,
  stevia: 2,
  "rosemary fresh": 1.1,
};

/** Grams in one tablespoon, when a teaspoon figure would be the wrong shape. */
const GRAMS_PER_TBSP: Record<string, number> = {
  "peanut butter": 16,
  "almond butter": 16,
  tahini: 15,
  "buttermilk powder": 7,
  "parsley dried": 1.6,
  gelatin: 7,
  gochujang: 18,
  coffee: 5,
  yeast: 9,
  chives: 3,
  bacon: 14,
};

/** Grams in one cup of the chopped (or spooned) food. USDA cup weights. */
const GRAMS_PER_CUP: Record<string, number> = {
  onion: 160,
  "red onion": 160,
  shallot: 160,
  "green onion": 100,
  tomato: 180,
  "roma tomato": 180,
  "cherry tomato": 149,
  "grape tomato": 151,
  "bell pepper": 149,
  "red bell pepper": 149,
  "mini peppers": 149,
  mushroom: 70,
  portobello: 86,
  cilantro: 16,
  jalapeno: 90,
  "pickled jalapeno": 90,
  cauliflower: 107,
  cucumber: 133,
  cabbage: 89,
  "red cabbage": 89,
  "napa cabbage": 70,
  avocado: 150,
  zucchini: 124,
  "yellow squash": 124,
  carrot: 128,
  lettuce: 47,
  eggplant: 82,
  broccoli: 91,
  celery: 101,
  "basil fresh": 24,
  "parsley fresh": 60,
  "mint fresh": 25,
  radish: 116,
  brussels: 88,
  "green beans": 110,
  "bok choy": 70,
  leek: 89,
  sauerkraut: 142,
  "spaghetti squash": 155,
  jicama: 130,
  blueberries: 148,
  raspberries: 123,
  "cranberries (fresh)": 100,
  "apple (Granny Smith)": 125,
  fruit: 140,
  turnip: 130,
  "pumpkin puree": 245,
  "coconut milk": 240,
  "vital wheat gluten": 120,
  "peanut flour": 60,
  "pork rinds": 56,
  almonds: 112,
};

/** Grams for one medium piece. "small" × 0.7, "large" × 1.35. Eggs are not in here; the library serving is already one large egg. */
const PIECE_G: Record<string, number> = {
  onion: 110,
  "red onion": 110,
  shallot: 30,
  "green onion": 15,
  tomato: 123,
  "roma tomato": 62,
  "cherry tomato": 17,
  "grape tomato": 8,
  jalapeno: 20,
  "pickled jalapeno": 20,
  eggplant: 458,
  carrot: 61,
  cabbage: 908,
  "napa cabbage": 500,
  "red cabbage": 908,
  cauliflower: 575,
  celery: 64,
  avocado: 136,
  cucumber: 201,
  zucchini: 196,
  "yellow squash": 196,
  "chicken thigh": 116,
  "chicken breast": 174,
  "chicken wings": 40,
  drumsticks: 113,
  "pork chop": 170,
  "whole chicken": 1814,
  "cornish hen": 560,
  shrimp: 20,
  bacon: 24,
  lemon: 84,
  lime: 67,
  "bell pepper": 119,
  "red bell pepper": 119,
  leek: 89,
  turnip: 122,
  "apple (Granny Smith)": 182,
  babybel: 20,
  "hot dogs (beef franks)": 45,
  "pork sausage (breakfast)": 28,
  mushroom: 18,
  portobello: 84,
  "strip steak": 227,
  "shaved steak": 170,
  duck: 2200,
  "bay leaf": 0.6,
};

const OIL = new Set(["lard", "ghee", "cocoa butter"]);
const WATER_LIKE = new Set(["lemon", "lime", "red wine vinegar", "white wine vinegar"]);

interface ParsedServing {
  ml: number | null;
  grams: number | null;
  count: number | null;
  countUnit: string | null;
}

export function libraryServings(qty: number | null, unit: string | null, item: SourcedIngredient, hint = ""): number | null {
  let known = normUnit(unit);
  if (isBatch(item)) {
    if (known && NEGLIGIBLE.has(known)) return 0;
    const jar = mentionedWeight(hint);
    if (jar) {
      const cups = jar.grams / 240;
      const made = batchYieldCups(item.servingSize) ?? 4;
      return cups / made;
    }
    if (qty == null) return 1 / (batchYieldCups(item.servingSize) ?? 4);
    if (!known) return null;
    return batchFraction(qty, known, item.servingSize);
  }

  const parsed = parseServing(item);
  if (!parsed) return null;

  const hinted = mentionedWeight(hint);
  if (hinted != null && parsed.grams) {
    const grams = hinted.each && qty != null && qty > 0 ? hinted.grams * qty : hinted.grams;
    return weightServings(grams, parsed, item.name);
  }

  if (known && NEGLIGIBLE.has(known)) return 0;
  if (qty == null || qty === 0) return 0;
  if (qty < 0) return null;
  if (!known) {
    const slash = hint.match(/(\d+)\s*⁄\s*(\d+)/);
    if (slash) qty = Number(slash[1]) / Number(slash[2]);
    const recovered = hintUnit(hint);
    if (recovered) known = recovered;
    else if (/\bdrops?\b/i.test(hint)) return 0;
    else if (/\beggs?\b/.test(item.name)) known = "egg";
    else if (/\bslices?\b/i.test(hint)) known = "slice";
    else if (/\bstems?\b|\bsprigs?\b/i.test(hint)) known = "sprig";
    else if (boughtEach(item)) return qty * (item.packageQty! / item.servingQty!);
    else if (PIECE_G[item.name] != null) known = "ea";
    else if (countableCut(item.name, parsed.grams)) return qty;
    else if (parsed.grams != null && parsed.grams <= 30) return qty;
    else if (kitchenUnit(item.servingSize)) known = kitchenUnit(item.servingSize)!;
    else if (spiceTsp(item.name, parsed.grams, qty)) known = "tsp";
  }

  if (known && ML[known]) {
    const prepared = preparedBaseServings(qty, known, parsed, item.name);
    if (prepared != null) return prepared;
    return volumeServings(qty, known, parsed, item.name);
  }
  const weighed = known ? toGrams(qty, known) : null;
  if (weighed != null) return weightServings(weighed, parsed, item.name);

  if (parsed.countUnit === "egg" && (known === "egg" || known === "ea" || known === "large" || known === "medium" || known === "small")) {
    return (qty / parsed.count!) * eggScale(known, hint);
  }
  if (known === "clove" && /garlic/.test(item.name) && !/powder/.test(item.name)) {
    return volumeServings(qty, "tsp", parsed, item.name) ?? (parsed.grams ? (qty * 5) / parsed.grams : null);
  }
  if (known === "head" && /garlic/.test(item.name) && !/powder/.test(item.name)) {
    return volumeServings(qty * 10, "tsp", parsed, item.name);
  }
  if (known === "stick" && /butter|cream cheese/.test(item.name)) {
    return volumeServings(qty * 8, "tbsp", parsed, item.name) ?? weightServings(qty * 113.4, parsed, item.name);
  }
  if (known === "slice") {
    const slice = item.name === "bacon" ? 24 : item.name === "pepperoni" ? 2 : /cheese|mozzarella|cheddar|swiss|provolone/.test(item.name) ? 28.35 : item.name === "pork rinds" ? 14 : (PIECE_G[item.name] ?? 28);
    if (slice != null) return weightServings(qty * slice, parsed, item.name);
    return null;
  }
  if ((known === "can" || known === "jar" || known === "package") && parsed.countUnit !== known) {
    const size = sizeGrams(item.size);
    if (size != null) return weightServings(qty * size, parsed, item.name);
  }
  if (parsed.count && parsed.countUnit && known === parsed.countUnit) return qty / parsed.count;
  if (known === "sprig") return weightServings(qty, parsed, item.name);
  if (known === "packet" || known === "stick") {
    if (/stick|packet/.test(item.servingSize)) return qty / (parsed.count || 1);
    if (item.packageQty && item.servingQty) return qty * (item.packageQty / item.servingQty);
  }
  if (known === "recipe") {
    if (boughtEach(item)) return (item.packageQty! / item.servingQty!);
    return volumeServings(1.5, "cup", parsed, item.name);
  }
  if (known === "olive" && /oil/.test(item.name)) return volumeServings(qty, "cup", parsed, item.name);
  if (known === "ea" || known === "piece" || known === "medium" || known === "large" || known === "small" || known === "head" || known === "stalk" || known === "handful" || known === "leaf") {
    if (boughtEach(item)) return qty * (item.packageQty! / item.servingQty!);
    if (/\bhandfuls?\b/i.test(hint)) return weightServings(qty * handfulGrams(item.name), parsed, item.name);
    if (known === "handful") return weightServings(qty * handfulGrams(item.name), parsed, item.name);
    if (known === "leaf") return weightServings(qty * 0.5, parsed, item.name);
    const piece = PIECE_G[item.name] ?? produceGrams(item.name);
    if (piece != null) return weightServings(qty * piece * sizeScale(known, hint), parsed, item.name);
    if (countableCut(item.name, parsed.grams)) return qty;
    if (parsed.grams) return weightServings(qty * 100 * sizeScale(known, hint), parsed, item.name);
  }
  if ((known === "can" || known === "jar" || known === "bottle" || known === "package") && parsed.grams) {
    const grams = known === "bottle" && /oil/.test(item.name) ? 3.25 * 240 * 0.91 : packageGrams(item, hint);
    if (grams != null) return weightServings(qty * grams, parsed, item.name);
  }
  if (!known && qty != null) {
    if (/cookie/i.test(hint) && /ginger/.test(item.name)) return volumeServings(qty, "tsp", parsed, item.name);
    const piece = produceGrams(item.name) ?? PIECE_G[item.name];
    if (piece != null && parsed.grams) return weightServings(qty * piece * sizeScale("ea", hint), parsed, item.name);
  }
  return null;
}

export function amountFromText(text: string): { qty: number; unit: string | null } | null {
  const measure = parseMeasure(expandGlyphs(text).trim());
  if (!measure) return null;
  const next = unitFromRest(measure.rest);
  return { qty: measure.qty, unit: next.unit };
}

function batchYieldCups(servingSize: string): number | null {
  const multi = servingSize.match(/makes\s+(\d+(?:\.\d+)?)\s*x\s*(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)/i);
  if (multi) return Number(multi[1]) * (parseAmount(multi[2]) || 1);
  const bare = servingSize.match(/makes\s+(\d+(?:\.\d+)?)\b/i);
  return bare ? Number(bare[1]) : null;
}

function boughtEach(item: SourcedIngredient): boolean {
  if (!item.packageQty || !item.servingQty || item.servingQty <= 0) return false;
  const blob = `${item.fullName} ${item.size}`.toLowerCase();
  if (/\bbag\b|\bpack\b|\blb\b|\boz\b/.test(blob) && !/\beach\b/.test(blob)) return false;
  return /\beach\b|\bhead\b|\b1 ct\b/.test(blob) || item.size.trim() === "";
}

function isBatch(item: SourcedIngredient): boolean {
  return item.servingQty == null && /batch/i.test(item.servingSize || "");
}

function batchFraction(qty: number, unit: string, servingSize: string): number | null {
  const multi = servingSize.match(/makes\s+(\d+(?:\.\d+)?)\s*x\s*(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?|[½⅓⅔¼¾⅛⅜⅝⅞])\s*([A-Za-z]+)/i);
  if (multi && ML[unit]) {
    const copies = Number(multi[1]);
    const each = parseAmount(expandGlyphs(multi[2].trim()));
    const eachUnit = normUnit(multi[3]);
    if (each && eachUnit && ML[eachUnit]) return (qty * ML[unit]) / (copies * each * ML[eachUnit]);
  }
  if (unit === "batch" || unit === "recipe") return qty;
  const bare = servingSize.match(/makes\s+(\d+(?:\.\d+)?)\b/i);
  if (bare && ML[unit]) return (qty * ML[unit]) / (Number(bare[1]) * (ML.cup || 240));
  if (ML[unit]) return (qty * ML[unit]) / (4 * 240);
  return null;
}

/**
 * Bouillon base is a paste. One teaspoon makes one cup of broth.
 * A recipe that says "6 cups beef stock" and pairs to beef base is
 * 6 teaspoons, not 6 cups of paste.
 */
function preparedBaseServings(qty: number, unit: string, serving: ParsedServing, name: string): number | null {
  if (!/\b(base|bouillon)\b/.test(name)) return null;
  if (!serving.ml || serving.ml > TSP) return null;
  const cups = preparedCups(qty, unit);
  if (cups == null) return null;
  return cups * (TSP / serving.ml);
}

function preparedCups(qty: number, unit: string): number | null {
  if (unit === "cup" || unit === "pint" || unit === "quart" || unit === "gallon" || unit === "l" || unit === "fl oz") {
    return (qty * ML[unit]) / CUP;
  }
  if (unit === "ml" && qty >= 60) return qty / CUP;
  return null;
}

function volumeServings(qty: number, unit: string, serving: ParsedServing, name: string): number | null {
  const ml = ML[unit];
  if (!ml) return null;
  if (serving.ml) return (qty * ml) / serving.ml;
  if (serving.grams) {
    const density = gramsPerMl(name) ?? fallbackGramsPerMl(name);
    if (!density) return null;
    return (qty * ml * density) / serving.grams;
  }
  return null;
}

function weightServings(grams: number, serving: ParsedServing, name: string): number | null {
  if (!Number.isFinite(grams)) return null;
  if (serving.grams) return grams / serving.grams;
  if (serving.ml) {
    const density = gramsPerMl(name) ?? 1;
    return grams / (serving.ml * density);
  }
  return null;
}

export function gramsPerTeaspoon(name: string): number | null {
  return GRAMS_PER_TSP[name] ?? null;
}

/** Teaspoons or tablespoons for a gram weight, when this spice has a known spoon weight. */
export function spoonLabel(name: string, grams: number): string | null {
  const gramsUsed = spoonGrams(name, grams);
  if (gramsUsed == null) return null;
  const perTsp = GRAMS_PER_TSP[name];
  if (perTsp == null) return null;
  const tsp = gramsUsed / perTsp;
  if (tsp >= 3 - 1e-6) return `${formatAmount(tsp / 3)} Tbsp`;
  return `${formatTsp(tsp)} tsp`;
}

/** Gram weight of the spoon `spoonLabel` would show. Eighths that are not a real spoon (⅜, ⅝, ⅞) are not used. */
export function spoonGrams(name: string, grams: number): number | null {
  const perTsp = GRAMS_PER_TSP[name];
  if (perTsp == null || !(grams > 0)) return null;
  let tsp = snapSpiceTsp(grams / perTsp);
  if (tsp >= 3) tsp = snapHalf(tsp / 3) * 3;
  return tsp * perTsp;
}

export function snapSpiceTsp(raw: number): number {
  if (!(raw > 0)) return 0;
  if (raw <= 1 / 8) return 1 / 8;
  const whole = Math.floor(raw + 1e-8);
  const frac = raw - whole;
  const marks = [0, 1 / 8, 1 / 4, 1 / 2, 3 / 4, 1];
  let best = 0;
  let bestDist = Infinity;
  for (const mark of marks) {
    const dist = Math.abs(frac - mark);
    if (dist < bestDist - 1e-9 || (Math.abs(dist - bestDist) <= 1e-9 && mark > best)) {
      best = mark;
      bestDist = dist;
    }
  }
  return Math.round((whole + best) * 1000) / 1000;
}

function snapHalf(qty: number): number {
  if (!(qty > 0)) return 0;
  const snapped = Math.round(qty * 2) / 2;
  return snapped > 0 ? snapped : 0.5;
}

function gramsPerMl(name: string): number | null {
  if (GRAMS_PER_TSP[name] != null) return GRAMS_PER_TSP[name] / TSP;
  if (GRAMS_PER_TBSP[name] != null) return GRAMS_PER_TBSP[name] / TBSP;
  if (GRAMS_PER_CUP[name] != null) return GRAMS_PER_CUP[name] / CUP;
  if (OIL.has(name)) return 0.91;
  if (WATER_LIKE.has(name)) return 1;
  if (/powder|sauce|dressing/.test(name)) return null;
  if (/cream cheese|mascarpone|cottage|ricotta/.test(name)) return 232 / CUP;
  if (/cheese|gruyere|mozzarella|cheddar|swiss|gouda|colby|muenster|fontina|manchego|havarti|brie|halloumi|provolone|parmesan/.test(name)) return 113 / CUP;
  if (/pickle/.test(name)) return 1;
  return null;
}

function parseServing(item: SourcedIngredient): ParsedServing | null {
  const text = (item.servingSize || "").trim();
  if (!text) return null;
  const measure = parseMeasure(expandGlyphs(text).replace(/^about\s+/i, ""));
  if (!measure) return null;
  const next = unitFromRest(measure.rest);
  const unit = next.unit;
  const mlParen = text.match(/\(\s*(\d+(?:\.\d+)?)\s*ml\b/i);
  const gramParen = text.match(/\(\s*(\d+(?:\.\d+)?)\s*g\b/i);
  let ml: number | null = null;
  if (mlParen) ml = Number(mlParen[1]);
  else if (unit && ML[unit]) ml = measure.qty * ML[unit];

  let grams: number | null = null;
  if (gramParen) grams = Number(gramParen[1]);
  else if (unit === "g") grams = measure.qty;
  else if (unit === "kg") grams = measure.qty * 1000;
  else if (unit === "oz") grams = measure.qty * 28.35;
  else if (unit === "lb") grams = measure.qty * 453.6;
  else if (ml && item.servingQty && !/\bml\b/i.test(text)) grams = item.servingQty;

  if (ml == null) ml = embeddedVolumeMl(text);

  if (grams == null) {
    const anyGram = text.match(/(\d+(?:\.\d+)?)\s*g\b/i);
    if (anyGram) grams = Number(anyGram[1]);
  }

  const countUnit = unit === "egg" || unit === "piece" || unit === "olive" || unit === "can" || unit === "packet" || unit === "scoop" || unit === "stick" || unit === "clove" || unit === "slice" ? unit : null;
  if (!ml && !grams && !countUnit) return null;
  return { ml, grams, count: countUnit ? measure.qty : null, countUnit };
}

function parseMeasure(text: string): { qty: number; rest: string } | null {
  const source = text.trim();
  const mixed = source.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)\b\s*(.*)$/);
  if (mixed) {
    const den = Number(mixed[3]);
    if (!den) return null;
    return { qty: Number(mixed[1]) + Number(mixed[2]) / den, rest: mixed[4] ?? "" };
  }
  const frac = source.match(/^(\d+)\s*\/\s*(\d+)\b\s*(.*)$/);
  if (frac) {
    const den = Number(frac[2]);
    if (!den) return null;
    return { qty: Number(frac[1]) / den, rest: frac[3] ?? "" };
  }
  const num = source.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (num) return { qty: Number(num[1]), rest: num[2] ?? "" };
  return null;
}

function unitFromRest(rest: string): { unit: string | null; rest: string } {
  const fl = rest.match(/^fl\.?\s*oz\b\.?\s*/i);
  if (fl) return { unit: "fl oz", rest: rest.slice(fl[0].length) };
  const token = rest.match(/^([A-Za-z]+)\.?\s*/);
  if (!token) return { unit: null, rest };
  return { unit: normUnit(token[1] ?? ""), rest: rest.slice(token[0].length) };
}

function embeddedVolumeMl(text: string): number | null {
  const match = text.match(/(?:about\s+)?([½⅓⅔¼¾⅛⅜⅝⅞]|\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*(cups?|tbsp\.?|tablespoons?|tsp\.?|teaspoons?)\b/i);
  if (!match) return null;
  const qty = parseAmount(expandGlyphs(match[1] ?? ""));
  const unit = normUnit((match[2] ?? "").replace(/\.$/, ""));
  if (!qty || !unit || !ML[unit]) return null;
  return qty * ML[unit];
}

function hintedGrams(hint: string): number | null {
  const found = mentionedWeight(hint);
  return found?.grams ?? null;
}

/** A weight written on the line. "6-8 oz each" is per piece. "about 1-1¼ lb" is the whole line. */
function mentionedWeight(hint: string): { grams: number; each: boolean } | null {
  const text = expandGlyphs(hint).replace(/\d+\s*\/\s*\d+/g, " ");
  const match = text.match(/(?:~|about\s+|approx(?:imately)?\.?\s+|around\s+)?(\d+(?:\.\d+)?)\s*(?:[-–]\s*\d+(?:\.\d+)?)?\s*(oz|ounces?|lb|lbs|pounds?|g|grams?)\b/i);
  if (!match) return null;
  const grams = toGrams(Number(match[1]), normUnit(match[2] ?? "") ?? "");
  if (grams == null) return null;
  const after = text.slice((match.index ?? 0) + match[0].length);
  return { grams, each: /^\s*each\b/i.test(after) };
}

function countableCut(name: string, grams: number | null): boolean {
  if (grams == null || grams < 200) return false;
  return /beef|pork|chicken|lamb|turkey|duck|steak|rib|roast|loin|tenderloin|drumstick|thigh|breast|chop|butt|brisket|shank|\bwing|fish|salmon|tuna|shrimp|scallop|bacon|sausage|\bham\b|jerky/.test(name);
}

function hintUnit(hint: string): string | null {
  if (/\bhandfuls?\b/i.test(hint)) return "handful";
  if (/\bcloves?\b/i.test(hint)) return "clove";
  if (/\bheads?\b/i.test(hint)) return "head";
  if (/\bleaves?\b/i.test(hint)) return "leaf";
  if (/\bquarts?\b|\bqt\.?\b/i.test(hint)) return "quart";
  if (/\bpints?\b/i.test(hint)) return "pint";
  if (/\bcans?\b|\bcn\b/i.test(hint)) return "can";
  if (/\bjars?\b/i.test(hint)) return "jar";
  if (/\bbottles?\b/i.test(hint)) return "bottle";
  if (/\bpackages?\b|\bpkgs?\.?\b/i.test(hint)) return "package";
  if (/\b(cups?)\b/i.test(hint) || /\bC\./.test(hint) || /(?:^|\s)C(?:\s|$)/.test(hint)) return "cup";
  if (/\b(tablespoons?|tbsp)\b/i.test(hint) || /(?:^|\s)T(?:\b|\.)/.test(hint)) return "tbsp";
  if (/\b(teaspoons?|tsp)\b/i.test(hint)) return "tsp";
  return null;
}

function kitchenUnit(servingSize: string): string | null {
  const unit = normUnit(unitFromRest(expandGlyphs(servingSize).replace(/^[\d./\s]+/, "")).unit);
  if (unit === "tsp" || unit === "tbsp" || unit === "cup" || unit === "piece" || unit === "slice" || unit === "oz") return unit;
  return null;
}

function spiceTsp(name: string, grams: number | null, qty: number): boolean {
  if (qty > 3) return false;
  if (/pepper|paprika|cumin|salt|nutmeg|allulose|vanilla|cinnamon|chipotle|powder|flakes|oregano|thyme|ginger|dill|rosemary/.test(name)) return true;
  return grams != null && grams <= 20 && qty <= 2;
}

function handfulGrams(name: string): number {
  if (/arugula|lettuce|spring|spinach|herb|cilantro|parsley|basil|mix/.test(name)) return 20;
  return 28;
}

function produceGrams(name: string): number | null {
  const table: Record<string, number> = {
    lettuce: 400,
    radish: 20,
    "mini peppers": 8,
    fruit: 12,
    brussels: 19,
    "spaghetti squash": 1100,
    "bok choy": 80,
    jicama: 250,
    shellfish: 15,
    "olives (pimento-stuffed)": 4,
    "black olives": 4,
    "pickles (dill chips)": 35,
    prosciutto: 15,
    asparagus: 16,
    artichoke: 40,
    peppercorns: 0.3,
  };
  return table[name] ?? null;
}

function packageGrams(item: SourcedIngredient, hint: string): number | null {
  const fromSize = sizeGrams(item.size);
  if (fromSize != null) return fromSize;
  if (/coconut milk/.test(item.name)) return 400;
  if (/tomato paste/.test(item.name)) return 170;
  if (/tomato/.test(item.name)) return 411;
  if (/yogurt/.test(item.name)) return 15;
  if (/queso|cheese/.test(item.name)) return 454;
  if (/jar|16/.test(hint) && /queso/.test(item.name)) return 454;
  return 400;
}

function fallbackGramsPerMl(name: string): number | null {
  if (/chicken|beef|pork|lamb|shrimp|crab|fish|salmon|brisket|ham|sausage|andouille|kielbasa|shellfish|rotisserie|bacon/.test(name)) return 140 / 240;
  if (/kimchi|olive|artichoke|sauerkraut|pickle/.test(name)) return 150 / 240;
  if (/egg/.test(name)) return 1;
  if (/collagen|whey|protein powder/.test(name)) return 80 / 240;
  if (/sauce|dressing|relish|hoisin|tomato|salsa/.test(name)) return 1;
  if (/chocolate/.test(name)) return 170 / 240;
  if (/cheese|feta|jack|mozzarella|cheddar|parmesan/.test(name)) return 113 / 240;
  if (/hazelnut|almond|nut/.test(name)) return 135 / 240;
  if (/oil|tallow|lard|butter|cream|milk/.test(name)) return 0.91;
  if (/water|broth|stock|vinegar/.test(name)) return 1;
  if (/powder|pepper|salt|spice|cumin|paprika|ginger|cinnamon/.test(name)) return 2.4 / 5;
  return 100 / 240;
}

function sizeGrams(size: string): number | null {
  const match = size.trim().match(/^(\d+(?:\.\d+)?)\s*(oz|ounces?|lb|lbs|pounds?|g|grams?)\b/i);
  if (!match) return null;
  return toGrams(Number(match[1]), normUnit(match[2] ?? "") ?? "");
}

function toGrams(qty: number, unit: string): number | null {
  if (unit === "g") return qty;
  if (unit === "kg") return qty * 1000;
  if (unit === "oz") return qty * 28.35;
  if (unit === "lb") return qty * 453.6;
  return null;
}

function sizeScale(unit: string, hint: string): number {
  const blob = `${unit} ${hint}`.toLowerCase();
  if (/\bsmall\b/.test(blob)) return 0.7;
  if (/\blarge\b/.test(blob)) return 1.35;
  return 1;
}

function eggScale(unit: string, hint: string): number {
  const blob = `${unit} ${hint}`.toLowerCase();
  if (/extra[- ]?large|\bxl\b/.test(blob)) return 56 / 50;
  if (/\bsmall\b/.test(blob)) return 38 / 50;
  if (/\bmedium\b/.test(blob)) return 44 / 50;
  return 1;
}

function expandGlyphs(text: string): string {
  return text
    .replace(/(\d)\s*([½⅓⅔¼¾⅛⅜⅝⅞])/g, (_, whole, glyph) => `${whole} ${GLYPH[glyph] ?? glyph}`)
    .replace(/[½⅓⅔¼¾⅛⅜⅝⅞]/g, (glyph) => GLYPH[glyph] ?? glyph);
}

function normUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\.+$/, "");
  if (!trimmed) return null;
  if (trimmed === "T" || trimmed === "Tbsp" || trimmed === "TBSP" || trimmed === "Tbs" || trimmed === "TBS") return "tbsp";
  if (trimmed === "t") return "tsp";
  if (trimmed === "C" || trimmed === "c") return "cup";
  const table: Record<string, string> = {
    tsp: "tsp",
    teaspoon: "tsp",
    teaspoons: "tsp",
    tbsp: "tbsp",
    tablespoon: "tbsp",
    tablespoons: "tbsp",
    tbs: "tbsp",
    cup: "cup",
    cups: "cup",
    ml: "ml",
    milliliter: "ml",
    milliliters: "ml",
    l: "l",
    liter: "l",
    liters: "l",
    "fl oz": "fl oz",
    floz: "fl oz",
    oz: "oz",
    ounce: "oz",
    ounces: "oz",
    lb: "lb",
    lbs: "lb",
    pound: "lb",
    pounds: "lb",
    g: "g",
    gram: "g",
    grams: "g",
    kg: "kg",
    gallon: "gallon",
    gallons: "gallon",
    quart: "quart",
    quarts: "quart",
    pint: "pint",
    pints: "pint",
    ea: "ea",
    each: "ea",
    egg: "egg",
    eggs: "egg",
    clove: "clove",
    cloves: "clove",
    slice: "slice",
    slices: "slice",
    medium: "medium",
    large: "large",
    small: "small",
    pinch: "pinch",
    dash: "dash",
    sprinkle: "sprinkle",
    drop: "drop",
    drops: "drop",
    to: "to",
    as: "as",
    few: "few",
    handful: "handful",
    taste: "taste",
    can: "can",
    cans: "can",
    jar: "jar",
    jars: "jar",
    package: "package",
    packages: "package",
    packet: "packet",
    packets: "packet",
    stick: "stick",
    sticks: "stick",
    head: "head",
    heads: "head",
    piece: "piece",
    pieces: "piece",
    olive: "olive",
    olives: "olive",
    scoop: "scoop",
    scoops: "scoop",
    stalk: "stalk",
    stalks: "stalk",
    batch: "batch",
    recipe: "recipe",
    sprig: "sprig",
    sprigs: "sprig",
  };
  return table[trimmed.toLowerCase()] ?? null;
}
