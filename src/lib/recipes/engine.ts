import { previewPathPrefix } from "@/lib/preview-path-prefix";
import { indexRecipes } from "./index-recipe";
import type { Recipe, RecipeFile, RecipeMeta, SlimRecipe } from "./types";

export function publicAsset(path: string): string {
  const clean = path.replace(/^\//, "");
  if (typeof window === "undefined") return `/${clean}`;
  const prefix = previewPathPrefix(window.location.hostname, window.location.pathname) ?? "";
  return `${prefix}/${clean}`;
}

export function peekRecipeCount(json: string): number | null {
  const match = json.slice(0, 1200).match(/"recipe_count"\s*:\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

interface LoadedMessage {
  id: number;
  type: "loaded";
  index: SlimRecipe[];
  metadata: RecipeMeta;
}

interface RecipeMessage {
  id: number;
  type: "recipe";
  recipe: Recipe | null;
}

interface ErrorMessage {
  id: number;
  type: "error";
  message: string;
}

type WorkerResponse = LoadedMessage | RecipeMessage | ErrorMessage;

export interface RecipeEngine {
  load: (json: string) => Promise<{ index: SlimRecipe[]; metadata: RecipeMeta }>;
  get: (uid: string) => Promise<Recipe | null>;
}

export function createRecipeEngine(): RecipeEngine {
  let worker: Worker | null = null;
  let seq = 1;
  let fallback: Map<string, Recipe> | null = null;
  const waiters = new Map<number, { resolve: (value: WorkerResponse) => void; reject: (error: Error) => void }>();

  function post(message: { type: "load"; json: string } | { type: "get"; uid: string }): Promise<WorkerResponse> {
    const id = seq++;
    return new Promise((resolve, reject) => {
      waiters.set(id, { resolve, reject });
      worker?.postMessage({ ...message, id });
    });
  }

  function bind(next: Worker) {
    next.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const waiter = waiters.get(event.data.id);
      if (!waiter) return;
      waiters.delete(event.data.id);
      if (event.data.type === "error") waiter.reject(new Error(event.data.message));
      else waiter.resolve(event.data);
    };
    next.onerror = () => {
      worker = null;
    };
  }

  return {
    async load(json: string) {
      fallback = null;
      try {
        if (!worker) {
          worker = new Worker(new URL("../../workers/recipe.worker.ts", import.meta.url), { type: "module" });
          bind(worker);
        }
        const result = await post({ type: "load", json });
        if (result.type !== "loaded") throw new Error("Recipe index did not load.");
        return { index: result.index, metadata: result.metadata };
      } catch (error) {
        worker?.terminate();
        worker = null;
        let file: RecipeFile;
        try {
          file = JSON.parse(json) as RecipeFile;
        } catch {
          throw error instanceof Error ? error : new Error("Could not parse recipe file.");
        }
        if (!Array.isArray(file.recipes)) throw new Error("That file doesn't look like all_recipes.json.");
        const built = indexRecipes(file);
        fallback = built.recipes;
        return { index: built.index, metadata: built.metadata };
      }
    },
    async get(uid: string) {
      if (fallback) return fallback.get(uid) ?? null;
      try {
        const result = await post({ type: "get", uid });
        if (result.type !== "recipe") return null;
        return result.recipe;
      } catch {
        return null;
      }
    },
  };
}
