import type { EstimatedIngredient, Recipe } from "./types";

const BURGER_IDS = new Set(["1973095225003298888"]);

const BURGER_INGREDIENTS: EstimatedIngredient[] = [
  { item: "ground beef", quantity: 1, unit: "lb", estimated: true, sourced_name: "ground beef 80/20", sourced_match: "closest" },
  { item: "thick onion rings", quantity: 2, unit: "ea", estimated: true, sourced_name: "onion", sourced_match: "exact" },
  { item: "bacon", quantity: 6, unit: "slices", estimated: true, sourced_name: "bacon", sourced_match: "exact" },
  { item: "American cheese", quantity: 2, unit: "slices", estimated: true, sourced_name: "American cheese (Kraft Singles)", sourced_match: "closest" },
  { item: "sugar-free ketchup", quantity: 1, unit: "tbsp", estimated: true, sourced_name: "sf ketchup", sourced_match: "closest" },
  { item: "mustard", quantity: 1, unit: "tsp", estimated: true, sourced_name: "mustard", sourced_match: "exact" },
  { item: "dill pickle chips", quantity: 4, unit: "slices", estimated: true, sourced_name: "pickles (dill chips)", sourced_match: "closest" },
  { item: "salt", quantity: 0.5, unit: "tsp", estimated: true, sourced_name: "salt", sourced_match: "exact" },
  { item: "black pepper", quantity: 0.25, unit: "tsp", estimated: true, sourced_name: "black pepper", sourced_match: "exact" },
];

const BURGER_STEPS = [
  "Divide 1 lb ground beef into 2 patties. Season the beef with salt and black pepper. Freeze the patties until they are firm so they hold their shape.",
  "Cut 2 thick onion rings, wide enough for a patty to sit inside each ring.",
  "Set one beef patty in each onion ring. Wrap each one with bacon, about 3 slices per patty (6 slices total).",
  "Air fry at 375°F until the bacon is crisp, the beef is cooked through, and the onion is mostly soft, about 15 to 20 minutes. Turn once.",
  "For the last 2 minutes, lay 1 slice of American cheese on each patty so it melts.",
  "Serve with sugar-free ketchup, mustard, and dill pickle chips.",
];

export function reviseRecipe(recipe: Recipe): Recipe {
  if (isBaconOnionBurger(recipe)) {
    const version = recipe.variant === "version" || recipe.uid.includes("::v");
    const next: Recipe = version || !burgerNeedsFix(recipe)
      ? recipe
      : {
          ...recipe,
          estimated_ingredients: BURGER_INGREDIENTS,
          ingredients: [],
          ingredient_sections: null,
          serving_basis: "1 person, 1 meal",
          estimate_note: "One meal for one person. 1 lb ground beef is two patties. Bacon is 6 slices, about 3 per patty. Cheese, ketchup, mustard, and pickles are included.",
          instructions: BURGER_STEPS,
        };
    if (!hasWrittenSteps(next)) return { ...next, instructions: BURGER_STEPS };
    return next;
  }
  if (hasWrittenSteps(recipe)) return recipe;
  return { ...recipe, instructions: guessCookSteps(recipe) };
}

function burgerNeedsFix(recipe: Recipe): boolean {
  const items = recipe.estimated_ingredients ?? [];
  const bacon = items.find((item) => /bacon/i.test(item.item || ""));
  const cheese = items.some((item) => /cheese/i.test(item.item || ""));
  const ketchup = items.some((item) => /ketchup/i.test(item.item || ""));
  const pickles = items.some((item) => /pickle/i.test(item.item || ""));
  const baconQty = Number(bacon?.quantity ?? 0);
  const steps = JSON.stringify(recipe.instructions ?? []);
  return !cheese || !ketchup || !pickles || baconQty !== 6 || /1 slice of bacon/i.test(steps);
}

function isBaconOnionBurger(recipe: Recipe): boolean {
  if (BURGER_IDS.has(recipe.id ?? "")) return true;
  const title = (recipe.title || "").toLowerCase();
  return title.includes("bacon") && title.includes("onion") && title.includes("burger");
}

function hasWrittenSteps(recipe: Recipe): boolean {
  if (Array.isArray(recipe.instruction_sections)) {
    for (const section of recipe.instruction_sections) {
      if (section?.steps?.some((step) => step?.trim())) return true;
    }
  }
  if (Array.isArray(recipe.instructions)) {
    for (const step of recipe.instructions) {
      if (typeof step === "string" && step.trim()) return true;
      if (step && typeof step === "object" && step.text?.trim()) return true;
    }
  }
  return false;
}

export function guessCookSteps(recipe: Recipe): string[] {
  const title = recipe.title?.trim() || "the food";
  const labels = ingredientLabels(recipe);
  const listed = labels.slice(0, 8).join(", ");
  const method = cookMethod(`${recipe.title || ""} ${recipe.full_text || ""} ${recipe.description || ""}`);
  const steps = [listed ? `Set out ${listed}.` : `Set out what you need for ${title}.`];
  if (method === "air fryer") {
    steps.push(`Heat the air fryer to 375°F.`);
    steps.push(`Cook ${title} until browned and done in the center, about 12 to 18 minutes. Turn once.`);
  } else if (method === "oven") {
    steps.push(`Heat the oven to 400°F.`);
    steps.push(`Bake ${title} until browned and cooked through, about 20 to 35 minutes.`);
  } else if (method === "grill") {
    steps.push(`Heat the grill to medium.`);
    steps.push(`Grill ${title} until cooked through, turning as needed.`);
  } else if (method === "slow") {
    steps.push(`Put everything in the slow cooker.`);
    steps.push(`Cook ${title} on low for 6 to 8 hours, until tender.`);
  } else if (method === "pressure") {
    steps.push(`Put everything in the pressure cooker.`);
    steps.push(`Cook ${title} under pressure for about 20 to 30 minutes, then release the steam.`);
  } else {
    steps.push(`Heat a pan over medium heat.`);
    steps.push(`Cook ${title} until done, stirring so it browns instead of steaming.`);
  }
  steps.push("These steps are a best guess. The original recipe did not include instructions.");
  return steps;
}

function cookMethod(text: string): "air fryer" | "oven" | "grill" | "slow" | "pressure" | "pan" {
  const value = text.toLowerCase();
  if (/air fry/.test(value)) return "air fryer";
  if (/instant pot|pressure cook/.test(value)) return "pressure";
  if (/slow cook|crock/.test(value)) return "slow";
  if (/grill|smok/.test(value)) return "grill";
  if (/oven|bake|roast|broil/.test(value)) return "oven";
  return "pan";
}

function ingredientLabels(recipe: Recipe): string[] {
  const labels: string[] = [];
  const push = (value?: string | null) => {
    const text = value?.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    if (text && !labels.includes(text)) labels.push(text);
  };
  for (const entry of recipe.estimated_ingredients ?? []) push(entry.item);
  for (const entry of recipe.ingredients ?? []) {
    if (typeof entry === "string") push(entry);
    else push(entry.item || entry.raw);
  }
  for (const section of recipe.ingredient_sections ?? []) {
    for (const entry of section.items ?? []) push(entry.item || entry.raw);
  }
  return labels;
}
