import type { SourcedIngredient } from "./index";

const PRICE_KEY = "recipes.ingredient-prices";
const EDIT_KEY = "recipes.ingredient-edits";
const KEY = "recipes.custom-ingredients";
let priceCache: Record<string, number> | null = null;
let editCache: Record<string, IngredientEdit> | null = null;

export interface IngredientEdit {
  fullName: string;
  brand: string;
  size: string;
  price: number | null;
  servingSize: string;
  servingQty: number | null;
  servingsPerPackage: number | null;
  shopUrl: string;
  notes: string;
  macroSource: string;
  labelIngredients: string;
  basis: string;
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  fiberG: number;
  sugarsG: number;
  netCarbsG: number;
}

export function saveIngredientEdit(name: string, edit: IngredientEdit) {
  const next = { ...loadEdits(), [name]: edit };
  if (typeof localStorage !== "undefined") localStorage.setItem(EDIT_KEY, JSON.stringify(next));
  editCache = next;
  if (edit.price != null) setIngredientPrice(name, edit.price);
}

export function setIngredientPrice(name: string, price: number) {
  const next = { ...loadPriceOverrides(), [name]: price };
  if (typeof localStorage !== "undefined") localStorage.setItem(PRICE_KEY, JSON.stringify(next));
  priceCache = next;
}

export function priceIngredient(item: SourcedIngredient): SourcedIngredient {
  const edit = loadEdits()[item.name];
  const legacy = loadPriceOverrides()[item.name];
  if (!edit && legacy == null) return item;
  const price = edit?.price ?? legacy ?? item.price;
  const servingQty = edit?.servingQty ?? item.servingQty;
  const servingsPerPackage = edit?.servingsPerPackage ?? item.servingsPerPackage;
  const packageQty = servingQty != null && servingsPerPackage != null && servingQty > 0 && servingsPerPackage > 0 ? servingQty * servingsPerPackage : item.packageQty;
  const servings = servingsPerPackage != null && servingsPerPackage > 0 ? servingsPerPackage : 1;
  const costPerServing = price != null && Number.isFinite(price) ? price / servings : item.costPerServing;
  const costPerLb = poundCost(item, price, packageQty);
  const per = item.perServing;
  return {
    ...item,
    fullName: edit?.fullName ?? item.fullName,
    brand: edit?.brand ?? item.brand,
    size: edit?.size ?? item.size,
    price,
    servingSize: edit?.servingSize ?? item.servingSize,
    servingQty,
    servingsPerPackage,
    packageQty,
    costPerServing,
    costPerLb,
    shopUrl: edit ? edit.shopUrl : item.shopUrl,
    notes: edit?.notes ?? item.notes,
    macroSource: edit?.macroSource ?? item.macroSource,
    labelIngredients: edit?.labelIngredients ?? item.labelIngredients,
    basis: edit?.basis ?? item.basis,
    perServing: {
      calories: edit?.calories ?? per.calories,
      proteinG: edit?.proteinG ?? per.proteinG,
      fatG: edit?.fatG ?? per.fatG,
      carbsG: edit?.carbsG ?? per.carbsG,
      fiberG: edit?.fiberG ?? per.fiberG,
      sugarsG: edit?.sugarsG ?? per.sugarsG,
      netCarbsG: edit?.netCarbsG ?? per.netCarbsG,
      cost: costPerServing ?? per.cost,
    },
  };
}

function loadEdits(): Record<string, IngredientEdit> {
  if (editCache) return editCache;
  if (typeof localStorage === "undefined") return (editCache = {});
  try {
    const parsed = JSON.parse(localStorage.getItem(EDIT_KEY) || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return (editCache = {});
    const next: Record<string, IngredientEdit> = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (value && typeof value === "object") next[name] = value as IngredientEdit;
    }
    return (editCache = next);
  } catch {
    return (editCache = {});
  }
}

function poundCost(item: SourcedIngredient, price: number | null, packageQty: number | null): number | null {
  if (price == null || !Number.isFinite(price)) return item.costPerLb;
  if (item.price != null && item.price > 0 && item.costPerLb != null && packageQty === item.packageQty) return (item.costPerLb * price) / item.price;
  if (packageQty != null && packageQty > 0 && /g\b|gram/i.test(item.servingSize)) return (price * 453.6) / packageQty;
  const pounds = item.size.match(/([\d.]+)\s*lb/i);
  if (pounds) {
    const count = Number(pounds[1]);
    if (count > 0) return price / count;
  }
  return item.costPerLb;
}

function loadPriceOverrides(): Record<string, number> {
  if (priceCache) return priceCache;
  if (typeof localStorage === "undefined") return (priceCache = {});
  try {
    const parsed = JSON.parse(localStorage.getItem(PRICE_KEY) || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return (priceCache = {});
    const next: Record<string, number> = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) next[name] = value;
    }
    return (priceCache = next);
  } catch {
    return (priceCache = {});
  }
}

export interface NewIngredientInput {
  name: string;
  amount: number;
  unit: string;
  calories: number;
  fatG: number;
  proteinG: number;
  netCarbsG: number;
  price: number;
  source: string;
}

export function loadCustomIngredients(): SourcedIngredient[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isIngredient);
  } catch {
    return [];
  }
}

export function saveCustomIngredient(input: NewIngredientInput): string | null {
  const name = input.name.trim();
  const unit = input.unit.trim();
  const source = input.source.trim();
  if (!name) return "Enter a name.";
  if (!Number.isFinite(input.amount) || input.amount <= 0 || !unit) return "Enter the serving amount and unit.";
  if (![input.calories, input.fatG, input.proteinG, input.netCarbsG, input.price].every((value) => Number.isFinite(value) && value >= 0)) {
    return "Enter calories, fat, protein, net carbs, and price.";
  }
  if (!source) return "Enter a source name or a link.";
  const item = toIngredient({ ...input, name, unit, source });
  const next = loadCustomIngredients().filter((row) => row.name.toLowerCase() !== name.toLowerCase());
  next.push(item);
  localStorage.setItem(KEY, JSON.stringify(next));
  return null;
}

function toIngredient(input: NewIngredientInput): SourcedIngredient {
  const servingSize = `${trimNumber(input.amount)} ${input.unit}`;
  const link = /^https?:\/\//i.test(input.source);
  const macros = {
    calories: input.calories,
    fatG: input.fatG,
    carbsG: input.netCarbsG,
    fiberG: 0,
    netCarbsG: input.netCarbsG,
    sugarsG: 0,
    proteinG: input.proteinG,
    cost: input.price,
  };
  macros.calories = input.calories > 0 ? input.calories : input.proteinG * 4 + input.netCarbsG * 4 + input.fatG * 9;
  return {
    name: input.name,
    fullName: input.name,
    brand: "",
    size: servingSize,
    price: input.price,
    basis: `per ${servingSize}`,
    servingSize,
    servingQty: input.amount,
    servingsPerPackage: 1,
    packageQty: input.amount,
    costPerServing: input.price,
    costPerLb: null,
    perServing: macros,
    labelIngredients: "",
    macroSource: link ? input.source : `Entered by hand. Source: ${input.source}`,
    notes: link ? "" : input.source,
    shopUrl: link ? input.source : undefined,
  };
}

function isIngredient(value: unknown): value is SourcedIngredient {
  if (!value || typeof value !== "object") return false;
  const item = value as SourcedIngredient;
  return typeof item.name === "string" && item.name.trim().length > 0 && typeof item.servingSize === "string" && Boolean(item.perServing);
}

function trimNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}
