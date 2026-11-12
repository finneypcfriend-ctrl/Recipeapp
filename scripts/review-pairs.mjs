import { readFileSync } from "node:fs";
import { pairIngredient } from "../src/lib/sourced/pair.ts";

const data = JSON.parse(readFileSync(new URL("../public/all_recipes.json", import.meta.url)));
const counts = { exact: 0, closest: 0, none: 0 };
const none = [];
const closest = [];
function take(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") return entry.item || entry.raw || "";
  return "";
}
for (const recipe of data.recipes) {
  if (recipe.variant === "version" || recipe.variant === "mod") continue;
  const lines = [];
  const sections = recipe.ingredient_sections;
  if (Array.isArray(sections) && sections.some((section) => section && section.items && section.items.length)) {
    for (const section of sections) for (const item of section?.items || []) lines.push(take(item));
  } else if (Array.isArray(recipe.ingredients) && recipe.ingredients.length) {
    for (const item of recipe.ingredients) lines.push(take(item));
  } else if (Array.isArray(recipe.estimated_ingredients)) {
    for (const item of recipe.estimated_ingredients) lines.push(take(item));
  }
  for (const text of lines) {
    const pair = pairIngredient(text);
    counts[pair.match] += 1;
    if (pair.match === "none" && none.length < 60) none.push(text);
    if (pair.match === "closest" && closest.length < 25) closest.push(`${text} => ${pair.name}`);
    if (pair.match === "closest" && /clove|butter \(|water|sugar|wine|brandy/i.test(text) && closest.length < 80) {
      closest.push(`* ${text} => ${pair.name}`);
    }
  }
}
console.log(counts);
console.log("--- none");
for (const line of none) console.log(line);
console.log("--- closest sample");
for (const line of closest) console.log(line);
