import { courseOf, ingredientBlob, proteinsOf, sourceLabelOf } from "./classify";
import { baseOf, isVersionRecipe, versionLabelOf, versionNumber } from "./lines";
import type { Recipe, RecipeFile, RecipeMeta, SlimRecipe } from "./types";

export function hasSteps(recipe: Recipe): boolean {
  if (Array.isArray(recipe.instruction_sections)) {
    for (const section of recipe.instruction_sections) {
      if (Array.isArray(section?.steps) && section.steps.some((step) => step && step.trim())) return true;
    }
  }
  if (Array.isArray(recipe.instructions)) {
    for (const step of recipe.instructions) {
      if (typeof step === "string" && step.trim()) return true;
      if (step && typeof step === "object" && step.text && step.text.trim()) return true;
    }
  }
  return false;
}

export function hasIngredients(recipe: Recipe): boolean {
  if (Array.isArray(recipe.ingredient_sections)) {
    for (const section of recipe.ingredient_sections) {
      if (Array.isArray(section?.items) && section.items.length > 0) return true;
    }
  }
  if (Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) return true;
  if (Array.isArray(recipe.estimated_ingredients) && recipe.estimated_ingredients.length > 0) return true;
  return false;
}

export function toSlim(recipe: Recipe): SlimRecipe {
  const image = recipe.image_url?.trim() || "";
  const videoThumb = recipe.video_thumbnail_url?.trim() || "";
  const thumb = image || videoThumb || null;
  const date = recipe.date_published || null;
  const parsed = date ? Date.parse(date) : NaN;
  const searchText = `${recipe.title || ""}\n${recipe.version_label || ""}\n${recipe.custom_notes || ""}\n${ingredientBlob(recipe)}`.toLowerCase();
  const isVersion = isVersionRecipe(recipe);
  const version = isVersion ? versionNumber(recipe) : null;
  return {
    uid: recipe.uid,
    title: recipe.title || "Untitled recipe",
    thumb,
    videoThumb: !image && Boolean(videoThumb),
    course: courseOf(recipe),
    proteins: proteinsOf(recipe),
    collection: recipe.collection || "unknown",
    sourceLabel: sourceLabelOf(recipe),
    date,
    dateMs: Number.isFinite(parsed) ? parsed : null,
    hasFull: hasIngredients(recipe) && hasSteps(recipe),
    hasPhoto: Boolean(thumb),
    searchText,
    custom: Boolean(recipe.custom_recipe) || recipe.collection === "custom",
    isVersion,
    version,
    versionLabel: isVersion ? versionLabelOf(recipe) : "",
    favorite: Boolean(recipe.favorite),
    baseUid: isVersion ? baseOf(recipe) : recipe.uid,
  };
}

export function indexRecipes(file: RecipeFile): { metadata: RecipeMeta; index: SlimRecipe[]; recipes: Map<string, Recipe> } {
  const recipes = new Map<string, Recipe>();
  const index: SlimRecipe[] = [];
  for (const recipe of file.recipes ?? []) {
    if (!recipe || !recipe.uid) continue;
    recipes.set(recipe.uid, recipe);
    index.push(toSlim(recipe));
  }
  return {
    metadata: file.metadata ?? { recipe_count: index.length },
    index,
    recipes,
  };
}
