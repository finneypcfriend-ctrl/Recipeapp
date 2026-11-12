import { indexRecipes } from "../lib/recipes/index-recipe";
import type { Recipe, RecipeFile, RecipeMeta, SlimRecipe } from "../lib/recipes/types";

interface LoadMessage {
  id: number;
  type: "load";
  json: string;
}

interface GetMessage {
  id: number;
  type: "get";
  uid: string;
}

type InMessage = LoadMessage | GetMessage;

type OutMessage =
  | { id: number; type: "loaded"; index: SlimRecipe[]; metadata: RecipeMeta }
  | { id: number; type: "recipe"; recipe: Recipe | null }
  | { id: number; type: "error"; message: string };

const recipes = new Map<string, Recipe>();

const ctx = globalThis as unknown as {
  onmessage: ((event: MessageEvent<InMessage>) => void) | null;
  postMessage: (message: OutMessage) => void;
};

ctx.onmessage = (event) => {
  const message = event.data;
  try {
    if (message.type === "load") {
      const file = JSON.parse(message.json) as RecipeFile;
      const built = indexRecipes(file);
      recipes.clear();
      for (const [uid, recipe] of built.recipes) recipes.set(uid, recipe);
      ctx.postMessage({
        id: message.id,
        type: "loaded",
        index: built.index,
        metadata: built.metadata,
      });
      return;
    }
    ctx.postMessage({ id: message.id, type: "recipe", recipe: recipes.get(message.uid) ?? null });
  } catch (error) {
    const text = error instanceof Error ? error.message : "Could not read that recipe file.";
    ctx.postMessage({ id: message.id, type: "error", message: text });
  }
};
