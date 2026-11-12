import { readFileSync, writeFileSync } from "node:fs";
import { annotateRecipes } from "../src/lib/sourced/pair.ts";
import type { Recipe } from "../src/lib/recipes/types.ts";

const path = new URL("../public/all_recipes.json", import.meta.url);
const data = JSON.parse(readFileSync(path, "utf8")) as { recipes: Recipe[] };
const changed = annotateRecipes(data.recipes);
const counts = { exact: 0, closest: 0, none: 0, zero: 0 };
for (const recipe of data.recipes) {
  const items = [
    ...(recipe.ingredient_sections ?? []).flatMap((section) => section.items ?? []),
    ...(recipe.ingredients ?? []),
    ...(recipe.estimated_ingredients ?? []),
  ];
  for (const item of items) {
    if (typeof item === "string" || !item.sourced_match) continue;
    counts[item.sourced_match] += 1;
  }
}
writeFileSync(path, `${JSON.stringify(data, null, 1)}\n`);
console.log({ changed, counts });
