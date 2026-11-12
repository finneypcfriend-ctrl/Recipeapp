import { MEAT_ORDER, SOURCE_ORDER } from "./classify";
import type { FilterState, SlimRecipe, SortKey } from "./types";

type Skip = "course" | "meat" | "source";

export function recipeMatches(recipe: SlimRecipe, filters: FilterState, search: string, skip?: Skip): boolean {
  if (search && !recipe.searchText.includes(search)) return false;
  if (skip !== "course" && filters.courses.length && !filters.courses.includes(recipe.course)) return false;
  if (skip !== "meat" && filters.meats.length && !filters.meats.some((meat) => recipe.proteins.includes(meat))) return false;
  if (skip !== "source" && (filters.sources.length > 0 || filters.favorites)) {
    const inSource = filters.sources.includes(recipe.collection);
    const isFavorite = filters.favorites && recipe.favorite;
    if (!inSource && !isFavorite) return false;
  }
  if (filters.photoOnly && !recipe.hasPhoto) return false;
  if (filters.fullOnly && !recipe.hasFull) return false;
  return true;
}

const SOURCE_RANK = new Map<string, number>(SOURCE_ORDER.map((id, index) => [id, index]));

export function sortRecipes(recipes: SlimRecipe[], sort: SortKey): SlimRecipe[] {
  const next = recipes.slice();
  next.sort((a, b) => {
    if (sort === "za") return b.title.localeCompare(a.title, undefined, { sensitivity: "base", numeric: true });
    if (sort === "newest") {
      if (a.dateMs == null && b.dateMs == null) return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      if (a.dateMs == null) return 1;
      if (b.dateMs == null) return -1;
      if (a.dateMs !== b.dateMs) return b.dateMs - a.dateMs;
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    }
    if (sort === "source") {
      const rank = (SOURCE_RANK.get(a.collection) ?? 99) - (SOURCE_RANK.get(b.collection) ?? 99);
      if (rank) return rank;
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
    }
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
  });
  return next;
}

export function filterRecipes(index: SlimRecipe[], filters: FilterState, search: string): SlimRecipe[] {
  const query = search.trim().toLowerCase();
  const matched = index.filter((recipe) => recipeMatches(recipe, filters, query));
  return sortRecipes(matched, filters.sort);
}

export function filterCatalog(
  originals: SlimRecipe[],
  versionsByBase: Map<string, SlimRecipe[]>,
  filters: FilterState,
  search: string,
): SlimRecipe[] {
  const query = search.trim().toLowerCase();
  if (filters.versionsOnly) {
    const versions = [...versionsByBase.values()].flat();
    return sortRecipes(versions.filter((version) => recipeMatches(version, filters, query)), filters.sort);
  }
  const matched = originals.filter((recipe) => {
    if (recipeMatches(recipe, filters, query)) return true;
    const versions = versionsByBase.get(recipe.uid) ?? [];
    return versions.some((version) => recipeMatches(version, filters, query));
  });
  return sortRecipes(matched, filters.sort);
}

export function countFacets(index: SlimRecipe[], filters: FilterState, search: string) {
  const query = search.trim().toLowerCase();
  const courses: Record<string, number> = {};
  const meats: Record<string, number> = {};
  const sources: Record<string, number> = {};
  for (const recipe of index) {
    if (recipeMatches(recipe, filters, query, "course")) {
      courses[recipe.course] = (courses[recipe.course] ?? 0) + 1;
    }
    if (recipeMatches(recipe, filters, query, "meat")) {
      for (const meat of recipe.proteins) meats[meat] = (meats[meat] ?? 0) + 1;
    }
    if (recipeMatches(recipe, filters, query, "source")) {
      sources[recipe.collection] = (sources[recipe.collection] ?? 0) + 1;
    }
  }
  for (const meat of MEAT_ORDER) meats[meat] ??= 0;
  return { courses, meats, sources };
}
