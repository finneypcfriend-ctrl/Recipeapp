import type { FilterState, SortKey, ThemeChoice } from "./types";

export const PREFS_KEY = "recipes.prefs";

export const DEFAULT_FILTERS: FilterState = {
  search: "",
  courses: [],
  meats: [],
  sources: [],
  favorites: false,
  versionsOnly: false,
  photoOnly: false,
  fullOnly: false,
  sort: "az",
};

function safeSort(sort: unknown): SortKey {
  if (sort === "za" || sort === "newest" || sort === "az") return sort;
  return "az";
}

export interface Prefs {
  filters: FilterState;
  theme: ThemeChoice;
  chipsOpen?: boolean;
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { filters: DEFAULT_FILTERS, theme: "system" };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      filters: {
        ...DEFAULT_FILTERS,
        ...(parsed.filters ?? {}),
        sort: safeSort(parsed.filters?.sort),
        favorites: Boolean(parsed.filters?.favorites),
        versionsOnly: Boolean(parsed.filters?.versionsOnly),
      },
      theme: parsed.theme ?? "system",
      chipsOpen: parsed.chipsOpen !== false,
    };
  } catch {
    return { filters: DEFAULT_FILTERS, theme: "system" };
  }
}

export function savePrefs(prefs: Prefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function resolveDark(theme: ThemeChoice): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: ThemeChoice): void {
  const dark = resolveDark(theme);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function activeFilterCount(filters: FilterState): number {
  return (
    filters.courses.length +
    filters.meats.length +
    filters.sources.length +
    (filters.favorites ? 1 : 0) +
    (filters.versionsOnly ? 1 : 0) +
    (filters.photoOnly ? 1 : 0) +
    (filters.fullOnly ? 1 : 0)
  );
}
