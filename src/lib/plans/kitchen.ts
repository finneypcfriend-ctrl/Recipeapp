import { describeUse, parseServingAmount } from "@/lib/plans/grocery";
import { gramsPerTeaspoon } from "@/lib/sourced/convert";
import { getIngredient } from "@/lib/sourced";

export interface KitchenChoice {
  id: string;
  singular: string;
  label: string;
  /** How many of this unit are in one library serving. */
  perServing: number;
}

const ML: Record<string, number> = { tsp: 5, tbsp: 15, cup: 240, ml: 1, "fl oz": 30 };
const GRAM: Record<string, number> = { g: 1, oz: 28.3495, lb: 453.592 };

function canonUnit(raw: string): string {
  const text = raw.toLowerCase().replace(/\.$/, "").trim();
  if (/^tablespoons?$|^tbsp$|^tbs$/.test(text)) return "tbsp";
  if (/^teaspoons?$|^tsp$/.test(text)) return "tsp";
  if (/^cups?$/.test(text)) return "cup";
  if (/^milliliters?$|^ml$/.test(text)) return "ml";
  if (/^fl oz$|^fluid ounces?$/.test(text)) return "fl oz";
  if (/^grams?$|^g$/.test(text)) return "g";
  if (/^ounces?$|^oz$/.test(text)) return "oz";
  if (/^pounds?$|^lbs?$|^lb$/.test(text)) return "lb";
  if (/^slices?$/.test(text)) return "slice";
  return text;
}

function gramsInServing(servingSize: string, unit: string, amount: number, servingQty: number | null): number | null {
  if (GRAM[unit]) return amount * GRAM[unit];
  const noted = servingSize.match(/\(\s*~?\s*(\d+(?:\.\d+)?)\s*g/i);
  if (noted) return Number(noted[1]);
  if (servingQty && servingQty > 0 && unit === "g") return servingQty;
  return null;
}

function add(list: KitchenChoice[], id: string, singular: string, label: string, perServing: number) {
  if (perServing > 0 && Number.isFinite(perServing)) list.push({ id, singular, label, perServing });
}

export function kitchenChoices(name: string): KitchenChoice[] {
  const item = getIngredient(name);
  if (!item) return [{ id: "serving", singular: "serving", label: "servings", perServing: 1 }];
  const parsed = parseServingAmount(item.servingSize);
  const unit = canonUnit(parsed.unit);
  const ml = ML[unit] ? parsed.amount * ML[unit] : null;
  const grams = gramsInServing(item.servingSize, unit, parsed.amount, item.servingQty);
  const perTsp = gramsPerTeaspoon(name);
  const choices: KitchenChoice[] = [];
  const spoon = (baseGrams: number) => {
    add(choices, "eighth", "1/8 tsp", "1/8 tsp", baseGrams / (perTsp! / 8));
    add(choices, "quarter", "1/4 tsp", "1/4 tsp", baseGrams / (perTsp! / 4));
    add(choices, "half", "1/2 tsp", "1/2 tsp", baseGrams / (perTsp! / 2));
    add(choices, "tsp", "tsp", "tsp", baseGrams / perTsp!);
    add(choices, "tbsp", "Tbsp", "Tbsp", baseGrams / (perTsp! * 3));
  };
  if (ml != null) {
    add(choices, "eighth", "1/8 tsp", "1/8 tsp", ml / (5 / 8));
    add(choices, "quarter", "1/4 tsp", "1/4 tsp", ml / (5 / 4));
    add(choices, "half", "1/2 tsp", "1/2 tsp", ml / 2.5);
    add(choices, "tsp", "tsp", "tsp", ml / 5);
    add(choices, "tbsp", "Tbsp", "Tbsp", ml / 15);
    add(choices, "cup", "cup", "cup", ml / 240);
  } else if (grams != null && perTsp != null) {
    spoon(grams);
  }
  if (grams != null && ml == null && perTsp == null) {
    add(choices, "g", "g", "g", grams);
    if (unit === "oz" || grams >= 28) add(choices, "oz", "oz", "oz", grams / 28.3495);
    if (unit === "lb" || grams >= 200) add(choices, "lb", "lb", "lb", grams / 453.592);
  } else if (grams != null && ml == null) {
    add(choices, "g", "g", "g", grams);
  }
  if (!choices.some((choice) => choice.id === unit) && !ML[unit] && !GRAM[unit]) {
    const singular = unit || "serving";
    add(choices, singular, singular, singular === "slice" ? "slices" : `${singular}s`, parsed.amount || 1);
  }
  return choices.length ? choices : [{ id: "serving", singular: "serving", label: "servings", perServing: 1 }];
}

export function defaultKitchenUnit(name: string, servings: number): string {
  const choices = kitchenChoices(name);
  const item = getIngredient(name);
  const hint = item ? describeUse(item, servings).toLowerCase() : "";
  const ids = [
    [/tablespoon|\btbsp\b/, "tbsp"],
    [/1\/8/, "eighth"],
    [/1\/4/, "quarter"],
    [/1\/2/, "half"],
    [/teaspoon|\btsp\b/, "tsp"],
    [/\bcups?\b/, "cup"],
    [/\bpounds?\b|\blb\b/, "lb"],
    [/\bounces?\b|\boz\b/, "oz"],
    [/\bgrams?\b|\bg\b/, "g"],
    [/slice/, "slice"],
  ] as const;
  for (const [pattern, id] of ids) {
    if (pattern.test(hint) && choices.some((choice) => choice.id === id)) return id;
  }
  return choices[0]?.id ?? "serving";
}

export function formatKitchen(value: number, unitId?: string): string {
  if (!(value > 0)) return "0";
  const spoon = unitId === "eighth" || unitId === "quarter" || unitId === "half" || unitId === "tsp" || unitId === "tbsp" || unitId === "cup";
  if (spoon) {
    const quarter = Math.round(value * 4) / 4;
    if (Math.abs(quarter - value) <= Math.max(0.08, value * 0.08)) return String(quarter);
    const eighth = Math.round(value * 8) / 8;
    if (Math.abs(eighth - value) <= 0.04) return String(eighth);
  }
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export function kitchenAmount(servings: number, choice: KitchenChoice | undefined): number {
  if (!choice) return servings;
  return servings * choice.perServing;
}

export function servingsForAmount(amount: number, choice: KitchenChoice | undefined): number {
  if (!choice || !(choice.perServing > 0)) return amount;
  return amount / choice.perServing;
}
