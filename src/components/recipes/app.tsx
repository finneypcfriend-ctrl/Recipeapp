import { ArrowUp, ChevronDown, LogIn, Search, Settings, SlidersHorizontal, User, X } from "lucide-react";
import { UserProfiles } from "@/components/plans/profiles";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useHouseholdEmail } from "@/components/plans/account";
import { Planner, describeAdd } from "@/components/plans/planner";
import { noteFavoritesReady, notePlateIngredientsReady, noteVersionsReady, publishFavorites, publishRecipeVersions, setLocalFavoriteSource, setLocalPlateIngredientSource, setLocalVersionSource, signOutHousehold, startHouseholdSync, watchFavorites, watchPlans, watchPlateIngredients, watchRecipeVersions } from "@/lib/cloud/sync";
import { RecipeArt } from "@/components/recipes/art";
import { RecipeDetail } from "@/components/recipes/detail";
import { FiltersBody } from "@/components/recipes/filters";
import { CatalogFilterChips } from "@/components/recipes/filter-chips";
import { IngredientLibrary, RecipeLibrary } from "@/components/recipes/library";
import { applyAccountPlateIngredients, plateIngredientNames } from "@/components/plans/plate";
import { Sheet } from "@/components/recipes/sheet";
import { addGroupsOnDays, addMeal, addPeopleOnDays, applyPlanDefaults, copyDaysOnto, copyIntoPlan, copyMealToChips, copyPersonDays, dropDaySeat, formatDay, goalForPlanPerson, goalTargets, mealPerson, newPlanId, parsePlanHash, planFromCopy, planHash, removeMeal, setPlanDates, setPlanRange, swapPlanDays, twoPeople, type BeefChoice, type ChipTarget, type DayCopyTarget, type DaySplit, type GoalTargets, type MealPlan, type PlanBatch, type PlanPerson, type PlanRoute, type PlannedMeal, type SnackDraw } from "@/lib/plans/model";
import { definedBatchServings } from "@/lib/plans/batch-yield";
import { buildDayLogs, logNote } from "@/lib/plans/logs";
import { ingredientFromServings } from "@/lib/plans/toppings";
import { loadSupplements } from "@/lib/plans/supplements";
import { MEAT_ORDER, SOURCE_SHORT, meatLabel } from "@/lib/recipes/classify";
import { createRecipeEngine, peekRecipeCount, publicAsset } from "@/lib/recipes/engine";
import { countFacets, filterCatalog } from "@/lib/recipes/filter";
import { formatBuildDate, formatCount } from "@/lib/recipes/format";
import { formatAmount, parseAmount } from "@/lib/recipes/amount";
import { readMacroGoals, readMacroLogs, readPersonGroups, readPlanDefaults, readPlans, readSavedMacroGoal, readSavedMacroGoals, readSavedPeople, readStoredFile, writeMacroLogs, writePlans, writeStoredFile } from "@/lib/recipes/idb";
import { baseOf, buildVersionRecipe, isRetiredRecipe, isVersionRecipe, linesFromRecipe, migrateLegacyMods, nextVersionNumber, pruneRecipes, versionLabelOf, type EditableLine } from "@/lib/recipes/lines";
import { DEFAULT_FILTERS, PREFS_KEY, activeFilterCount, applyTheme, loadPrefs, savePrefs } from "@/lib/recipes/prefs";
import { makesLabel } from "@/lib/recipes/present";
import type { FilterState, Recipe, RecipeFile, RecipeMeta, SlimRecipe, SortKey, ThemeChoice } from "@/lib/recipes/types";
import { annotateRecipes } from "@/lib/sourced/pair";
import { fitRecipe, fitScaleOf, portionForDay } from "@/lib/sourced/fit";
import { honeDay } from "@/lib/sourced/hone";
import { mealScale, recipeFromLines, scaledMealMacros, useBeefChoice } from "@/lib/sourced/meal";

const PAGE = 60;

function placeVersion(file: RecipeFile, version: Recipe) {
  const recipes = file.recipes ?? [];
  const existing = recipes.findIndex((recipe) => recipe.uid === version.uid);
  if (existing >= 0) {
    recipes[existing] = version;
    return;
  }
  let at = -1;
  for (let index = 0; index < recipes.length; index += 1) if (baseOf(recipes[index]) === version.mod_of) at = index;
  recipes.splice(at >= 0 ? at + 1 : recipes.length, 0, version);
}

function uidFromHash(hash: string): string | null {
  const match = hash.match(/^#\/recipe\/(.+)$/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function scaledDayLines(lines: NonNullable<PlannedMeal["lines"]>, ratio: number): NonNullable<PlannedMeal["lines"]> {
  if (Math.abs(ratio - 1) < 0.01) return lines;
  return lines.map((line) => {
    const amount = parseAmount(line.quantity);
    if (amount == null) return line;
    return { ...line, quantity: formatAmount(amount * ratio) };
  });
}

function clearHone(meal: PlannedMeal): PlannedMeal {
  return { ...meal, meatTrim: undefined, sideName: undefined, sideServings: undefined, carbItem: undefined, carbScale: undefined, tweaks: undefined };
}

function dayRecipe(meal: PlannedMeal, catalog: ReadonlyMap<string, Recipe>): Recipe | null {
  const stored = catalog.get(meal.recipeUid);
  if (!stored) return null;
  return meal.lines?.length ? recipeFromLines(stored, meal.lines) : stored;
}

function dropBatch(plan: MealPlan, batchId: string): MealPlan {
  const days: MealPlan["days"] = {};
  for (const [date, meals] of Object.entries(plan.days)) {
    const next = meals.filter((meal) => meal.batchId !== batchId);
    if (next.length) days[date] = next;
  }
  return { ...plan, batches: (plan.batches ?? []).filter((batch) => batch.id !== batchId), days, updatedAt: Date.now() };
}

function writeBatch(plan: MealPlan, batch: PlanBatch, draws: Array<{ date: string; slot: PlannedMeal["slot"]; servings: number; personId?: string }>, catalog: ReadonlyMap<string, Recipe>): MealPlan {
  const cleared = dropBatch(plan, batch.id);
  const defined = definedBatchServings(batch, catalog.get(batch.recipeUid), catalog);
  const days = { ...cleared.days };
  for (const draw of draws) {
    if (draw.servings <= 0) continue;
    const meal: PlannedMeal = {
      id: crypto.randomUUID(),
      slot: draw.slot,
      recipeUid: batch.recipeUid,
      title: batch.title,
      versionLabel: batch.versionLabel ?? "",
      personId: draw.personId,
      batchId: batch.id,
      batchServings: draw.servings,
      batchYield: defined,
      portion: draw.servings / defined,
    };
    days[draw.date] = [...(days[draw.date] ?? []), meal];
  }
  return { ...cleared, batches: [...(cleared.batches ?? []), batch], days, updatedAt: Date.now() };
}

function seatOf(personId?: string): { personId?: string; groupId?: string } {
  if (personId?.startsWith("group:")) return { groupId: personId.slice("group:".length) };
  return personId ? { personId } : {};
}

async function fitInto(plan: MealPlan, dates: string[], recipes: Recipe[]): Promise<{ plan: MealPlan; note: string }> {
  const paired = twoPeople(plan);
  const goals = paired ? await readSavedMacroGoals() : null;
  const household = paired ? null : await readSavedMacroGoal();
  const catalog = new Map(recipes.map((recipe) => [recipe.uid, recipe]));
  const split = plan.daySplit === "25-75" ? "25-75" : "50-50";
  const snackFrom = plan.snackDraw === "supper" ? "supper" : "lunch";
  const swaps: Array<{ date: string; mealId: string; scale?: number; portion: number; bake?: number }> = [];
  const problems: string[] = [];
  let fitted = 0;
  const people = paired ? (plan.people ?? []) : [null];
  for (const date of dates) {
    for (const person of people) {
      if (person && !(plan.macroDays?.[person.id] ?? []).includes(date)) continue;
      const targets = person ? goalTargets(goalForPlanPerson(goals ?? [], person)?.goals) : goalTargets(household?.goals);
      const meals = (plan.days[date] ?? []).filter((meal) => !person || mealPerson(meal, plan) === person.id);
      if (!targets) {
        problems.push(person ? `${person.name || "That person"} has no saved macro` : "No macro goal on file.");
        continue;
      }
      if (!meals.length) {
        problems.push(person ? `${formatDay(date)} has no meals for ${person.name}` : `${formatDay(date)} has no meals`);
        continue;
      }
      const resolved: Array<{ id: string; slot: PlannedMeal["slot"]; calories: number; scale?: number; bake?: number }> = [];
      for (const meal of meals) {
        const source = dayRecipe(meal, catalog);
        if (!source) continue;
        if (meal.slot === "snack") {
          const calories = useBeefChoice(plan.beefChoice, () => scaledMealMacros(source, catalog, 1).macros.calories);
          resolved.push({ id: meal.id, slot: meal.slot, calories, scale: meal.fitScale });
          continue;
        }
        const scaled = useBeefChoice(plan.beefChoice, () => fitScaleOf(source, catalog, targets));
        if ("error" in scaled) {
          problems.push(person ? `${person.name}: ${scaled.error}` : scaled.error);
          continue;
        }
        const calories = useBeefChoice(plan.beefChoice, () => scaledMealMacros(source, catalog, scaled.scale).macros.calories);
        resolved.push({ id: meal.id, slot: meal.slot, calories, scale: scaled.scale, bake: meal.lines?.length ? scaled.scale : undefined });
        fitted += 1;
      }
      const portions = portionForDay(resolved, split, snackFrom);
      for (const meal of resolved) swaps.push({ date, mealId: meal.id, scale: meal.scale, portion: portions[meal.id] ?? 1, bake: meal.bake });
    }
  }
  if (!swaps.length) return { plan, note: problems[0] || (paired ? "Check the day, then tap the person's name." : "Nothing was fitted.") };
  const days = { ...plan.days };
  const touched = new Set(swaps.map((swap) => swap.date));
  if (!paired) {
    for (const date of touched) days[date] = (days[date] ?? []).filter((meal) => meal.recipeUid || !meal.sideName);
  }
  for (const swap of swaps) {
    days[swap.date] = (days[swap.date] ?? []).map((meal) => {
      if (meal.id !== swap.mealId) return meal;
      const cleared = clearHone(meal);
      if (swap.bake != null && meal.lines?.length) {
        return { ...cleared, lines: scaledDayLines(meal.lines, swap.bake), fitScale: undefined, portion: swap.portion };
      }
      return { ...cleared, fitScale: swap.scale, portion: swap.portion };
    });
  }
  const extra = problems.length ? ` ${problems.join(". ")}.` : "";
  const note = `Fitted ${fitted} ${fitted === 1 ? "meal" : "meals"}${paired ? " for the marked people" : ""}.${extra}`;
  return { plan: { ...plan, days, updatedAt: Date.now() }, note };
}

async function honeInto(plan: MealPlan, dates: string[], recipes: Recipe[]): Promise<{ plan: MealPlan; note: string }> {
  const paired = twoPeople(plan);
  const goals = paired ? await readSavedMacroGoals() : null;
  const household = paired ? null : await readSavedMacroGoal();
  const catalog = new Map(recipes.map((recipe) => [recipe.uid, recipe]));
  const notes: string[] = [];
  const days = { ...plan.days };
  let any = false;
  const people = paired ? (plan.people ?? []) : [null];
  for (const date of dates) {
    let next = days[date] ?? [];
    let touched = false;
    for (const person of people) {
      if (person && !(plan.macroDays?.[person.id] ?? []).includes(date)) continue;
      const targets = person ? goalTargets(goalForPlanPerson(goals ?? [], person)?.goals) : goalTargets(household?.goals);
      if (!targets) {
        notes.push(person ? `${person.name || "That person"} has no saved macro` : "No macro goal on file.");
        continue;
      }
      const meals = next.filter((meal) => meal.recipeUid && (!person || mealPerson(meal, plan) === person.id));
      if (!meals.length) {
        notes.push(person ? `${formatDay(date)} has no meals for ${person.name}` : `${formatDay(date)} has no meals`);
        continue;
      }
      const loaded = meals.map((meal) => ({
        id: meal.id,
        slot: meal.slot,
        recipe: dayRecipe(meal, catalog),
        portion: mealScale(meal),
      }));
      const items = loadSupplements().filter((item) => item.kind === "ingredient");
      const approved = [...items.filter((item) => item.starred), ...items.filter((item) => !item.starred)].map((item) => item.name);
      const result = useBeefChoice(plan.beefChoice, () => honeDay(loaded, catalog, targets, approved));
      if ("error" in result) {
        notes.push(person ? `${person.name}: ${result.error}` : result.error);
        continue;
      }
      const honed = meals.map((meal) => {
        const side = result.sides[meal.id];
        return {
          ...meal,
          meatTrim: result.trims[meal.id] ?? 1,
          sideName: side?.name,
          sideServings: side?.servings,
          carbItem: result.carbCut?.mealId === meal.id ? result.carbCut.name : undefined,
          carbScale: result.carbCut?.mealId === meal.id ? result.carbCut.factor : undefined,
          tweaks: result.tweaks.filter((tweak) => tweak.mealId === meal.id).map((tweak) => ({ name: tweak.name, factor: tweak.factor })),
        };
      });
      if (result.extraEggs > 0 && result.extraName) {
        honed.push({
          id: crypto.randomUUID(),
          slot: "snack",
          recipeUid: "",
          title: result.extraName,
          versionLabel: "",
          personId: person?.id,
          meatTrim: 1,
          sideName: result.extraName,
          sideServings: result.extraEggs,
          carbItem: undefined,
          carbScale: undefined,
          tweaks: [],
        });
      }
      if (person) {
        const ids = new Set(meals.map((meal) => meal.id));
        next = [...next.filter((meal) => !ids.has(meal.id) && mealPerson(meal, plan) !== person.id), ...honed];
      } else {
        next = honed;
      }
      touched = true;
      notes.push(person ? `${person.name} ${formatDay(date)}: ${result.note}` : `${formatDay(date)}: ${result.note}`);
    }
    if (touched) {
      days[date] = next;
      any = true;
    }
  }
  if (!any) return { plan, note: notes[0] || (paired ? "Mark Macro on a person for the selected days." : "Nothing was honed.") };
  return { plan: { ...plan, days, updatedAt: Date.now() }, note: notes.join(" ") };
}

export function RecipeApp() {
  const indexRef = useRef<SlimRecipe[]>([]);
  const engine = useRef(createRecipeEngine());
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [loadCount, setLoadCount] = useState<number | null>(null);
  const [metadata, setMetadata] = useState<RecipeMeta>({});
  const [index, setIndex] = useState<SlimRecipe[]>([]);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [theme, setTheme] = useState<ThemeChoice>("system");
  const [hydrated, setHydrated] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [directory, setDirectory] = useState<"recipes" | "ingredients" | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const householdEmail = useHouseholdEmail();
  const [settingsError, setSettingsError] = useState("");
  const [showTop, setShowTop] = useState(false);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [planRoute, setPlanRoute] = useState<PlanRoute | null>(null);
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const plansRef = useRef<MealPlan[]>([]);
  const planWrite = useRef(Promise.resolve());
  const plansReady = useRef(false);
  const cloudFavoritesRef = useRef<string[] | null>(null);
  const applyingFavorites = useRef(false);
  const applyCloudFavoritesRef = useRef<(uids: string[]) => Promise<void>>(async () => undefined);
  const applyCloudVersionsRef = useRef<(versions: Recipe[]) => Promise<void>>(async () => undefined);
  const applyingVersions = useRef(false);
  const droppedParents = useRef<Map<string, string> | null>(null);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [detailError, setDetailError] = useState("");
  const sentinel = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const settingsFileRef = useRef<HTMLInputElement>(null);
  const recipeFileRef = useRef<RecipeFile | null>(null);
  const [toast, setToast] = useState("");
  const [chipsOpen, setChipsOpen] = useState(true);

  const ingest = useCallback(async (json: string, persist: boolean, name?: string) => {
    if (!indexRef.current.length) {
      setStatus("loading");
      setError("");
    }
    setLoadCount(peekRecipeCount(json));
    try {
      let payload = json;
      try {
        const parsed = JSON.parse(payload) as RecipeFile;
        const migrated = parsed.recipes ? migrateLegacyMods(parsed.recipes) : false;
        const pruned = parsed.recipes ? pruneRecipes(parsed.recipes) : false;
        const annotated = parsed.recipes ? annotateRecipes(parsed.recipes) : false;
        if (parsed.recipes && (migrated || pruned || annotated)) {
          payload = JSON.stringify(parsed);
          await writeStoredFile(payload, "all_recipes.json");
        }
        recipeFileRef.current = parsed;
      } catch {
        recipeFileRef.current = null;
      }
      const loaded = await engine.current.load(payload);
      if (!loaded.index.length) throw new Error("That file doesn't contain any recipes.");
      if (persist) await writeStoredFile(payload, name);
      indexRef.current = loaded.index;
      setIndex(loaded.index);
      setMetadata(loaded.metadata);
      setStatus("ready");
      setSettingsError("");
      if (!applyingFavorites.current) {
        if (cloudFavoritesRef.current) void applyCloudFavoritesRef.current(cloudFavoritesRef.current);
        else noteFavoritesReady();
      }
      noteVersionsReady();
      notePlateIngredientsReady();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not read that file.";
      if (indexRef.current.length) {
        setSettingsError(message);
        setStatus("ready");
      } else {
        setError(message);
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    const prefs = loadPrefs();
    setFilters(prefs.filters);
    setSearchInput(prefs.filters.search);
    setTheme(prefs.theme);
    setChipsOpen(prefs.chipsOpen !== false);
    applyTheme(prefs.theme);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    savePrefs({ filters: { ...filters, search: searchInput }, theme, chipsOpen });
    applyTheme(theme);
  }, [filters, searchInput, theme, chipsOpen, hydrated]);

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => (current.search === searchInput ? current : { ...current, search: searchInput }));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await readStoredFile();
        if (cancelled) return;
        if (stored?.json) {
          await ingest(stored.json, false);
          return;
        }
        const response = await fetch(publicAsset("all_recipes.json"));
        if (!response.ok) throw new Error(`Couldn't fetch the bundled recipes (${response.status}).`);
        const json = await response.text();
        if (cancelled) return;
        await ingest(json, false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load your recipes.");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ingest]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > window.innerHeight * 2);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const openFromHash = () => {
      const hash = window.location.hash;
      const plan = parsePlanHash(hash);
      setPlanRoute(plan);
      setSelectedUid(plan?.kind === "recipe" ? plan.uid : plan?.kind === "batch" && plan.uid ? plan.uid : uidFromHash(hash));
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  const remapDroppedMeals = () => {
    const parents = droppedParents.current;
    if (!parents?.size || !plansReady.current) return;
    droppedParents.current = null;
    const next = plansRef.current.map((plan) => {
      let dirty = false;
      const days = { ...plan.days };
      for (const date of Object.keys(days)) {
        const meals = (days[date] ?? []).map((meal) => {
          const parent = parents.get(meal.recipeUid);
          if (!parent) return meal;
          dirty = true;
          return {
            ...meal,
            recipeUid: parent,
            versionLabel: "",
            fitScale: undefined,
            meatTrim: undefined,
            sideName: undefined,
            sideServings: undefined,
            carbItem: undefined,
            carbScale: undefined,
            tweaks: undefined,
          };
        });
        days[date] = meals;
      }
      return dirty ? { ...plan, days, updatedAt: Date.now() } : plan;
    });
    if (!next.some((plan, index) => plan !== plansRef.current[index])) return;
    plansRef.current = next;
    setPlans(next);
    planWrite.current = planWrite.current.then(() => writePlans(next)).catch(() => undefined);
  };

  useEffect(() => {
    setLocalFavoriteSource(() => {
      const recipes = recipeFileRef.current?.recipes;
      if (!recipes) return null;
      return recipes.filter((recipe) => recipe.favorite).map((recipe) => recipe.uid);
    });
    setLocalVersionSource(() => {
      const recipes = recipeFileRef.current?.recipes;
      if (!recipes) return null;
      return recipes.filter((recipe) => isVersionRecipe(recipe));
    });
    setLocalPlateIngredientSource(() => plateIngredientNames());
    startHouseholdSync();
    const stopPlans = watchPlans((loaded) => {
      plansRef.current = loaded;
      plansReady.current = true;
      setPlans(loaded);
      remapDroppedMeals();
    });
    const stopFavorites = watchFavorites((uids) => {
      cloudFavoritesRef.current = uids;
      if (uids) void applyCloudFavoritesRef.current(uids);
    });
    const stopVersions = watchRecipeVersions((versions) => {
      void applyCloudVersionsRef.current(versions);
    });
    const stopPlateIngredients = watchPlateIngredients((names) => {
      applyAccountPlateIngredients(names);
    });
    return () => {
      stopPlans();
      stopFavorites();
      stopVersions();
      stopPlateIngredients();
    };
  }, []);

  useEffect(() => {
    readPlans()
      .then((loaded) => {
        plansRef.current = loaded;
        plansReady.current = true;
        setPlans(loaded);
        remapDroppedMeals();
      })
      .catch(() => {
        plansReady.current = true;
        setPlans([]);
      });
  }, []);

  const originals = useMemo(() => index.filter((recipe) => !recipe.isVersion), [index]);
  const versionsByBase = useMemo(() => {
    const map = new Map<string, SlimRecipe[]>();
    for (const recipe of index) {
      if (!recipe.isVersion) continue;
      const list = map.get(recipe.baseUid) ?? [];
      list.push(recipe);
      map.set(recipe.baseUid, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.version ?? 0) - (b.version ?? 0));
    return map;
  }, [index]);
  const versionsFor = (recipe: { uid: string; title: string; isVersion?: boolean; baseUid?: string }) => {
    const own = versionsByBase.get(recipe.baseUid || recipe.uid) ?? versionsByBase.get(baseOf(recipe.uid)) ?? [];
    if (own.length || recipe.isVersion) return own;
    const taken = new Set<string>();
    for (const base of versionsByBase.keys()) {
      if (originals.some((item) => item.uid === base || item.uid === baseOf(base))) taken.add(base);
    }
    const extras: SlimRecipe[] = [];
    const seen = new Set<string>();
    for (const [base, list] of versionsByBase) {
      if (taken.has(base)) continue;
      for (const version of list) {
        if (version.title !== recipe.title || seen.has(version.uid)) continue;
        seen.add(version.uid);
        extras.push(version);
      }
    }
    return extras.sort((a, b) => (a.version ?? 0) - (b.version ?? 0));
  };
  const recipeByUid = useMemo(() => {
    const map = new Map<string, Recipe>();
    for (const recipe of recipeFileRef.current?.recipes ?? []) map.set(recipe.uid, recipe);
    return map;
  }, [index]);
  const filtered = useMemo(() => {
    const rows = filterCatalog(originals, versionsByBase, filters, filters.search);
    return rows.filter((recipe) => {
      if (!recipe.custom) return true;
      return !originals.some((item) => item.uid !== recipe.uid && !item.custom && item.title === recipe.title);
    });
  }, [originals, versionsByBase, filters]);
  const counts = useMemo(() => countFacets(originals, filters, filters.search), [originals, filters]);
  const totals = useMemo(() => {
    const meats: Record<string, number> = {};
    for (const meat of MEAT_ORDER) meats[meat] = 0;
    for (const recipe of originals) for (const meat of recipe.proteins) meats[meat] = (meats[meat] ?? 0) + 1;
    return { meats };
  }, [originals]);

  useEffect(() => setVisible(PAGE), [filters, index]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible((count) => count + PAGE);
      },
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [status, filtered.length]);

  useEffect(() => {
    if (!selectedUid || status !== "ready") {
      setSelected(null);
      return;
    }
    let cancelled = false;
    setDetailError("");
    engine.current.get(selectedUid).then((recipe) => {
      if (cancelled) return;
      if (!recipe) setDetailError("That recipe isn't in this file.");
      setSelected(recipe);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedUid, status, index]);

  const openPlan = (route: PlanRoute) => {
    const next = planHash(route);
    if (window.location.hash !== next) window.location.hash = next;
    else {
      setPlanRoute(route);
      setSelectedUid(route.kind === "recipe" ? route.uid : route.kind === "batch" && route.uid ? route.uid : null);
    }
  };

  const openRecipe = (uid: string) => {
    if (planRoute?.kind === "batch") {
      openPlan({ kind: "batch", planId: planRoute.planId, uid });
      return;
    }
    if (planRoute && planRoute.kind !== "list" && planRoute.kind !== "edit" && planRoute.kind !== "goals" && "slot" in planRoute) {
      openPlan({ kind: "recipe", planId: planRoute.planId, date: planRoute.date, slot: planRoute.slot, uid, personId: planRoute.personId });
      return;
    }
    const next = `#/recipe/${encodeURIComponent(uid)}`;
    if (window.location.hash !== next) window.location.hash = next;
    else setSelectedUid(uid);
  };

  const goHome = () => {
    if (window.location.hash) window.location.hash = "";
    setPlanRoute(null);
    setSelectedUid(null);
    setDetailError("");
  };

  const closeRecipe = () => {
    if (planRoute?.kind === "batch" && planRoute.uid) {
      openPlan({ kind: "batch", planId: planRoute.planId });
      return;
    }
    if (planRoute?.kind === "recipe") {
      if (planRoute.mealId) {
        openPlan({ kind: "day", planId: planRoute.planId, date: planRoute.date });
        return;
      }
      openPlan({ kind: "add", planId: planRoute.planId, date: planRoute.date, slot: planRoute.slot, personId: planRoute.personId });
      return;
    }
    if (!window.location.hash.startsWith("#/recipe/")) {
      setSelectedUid(null);
      return;
    }
    const before = window.location.href;
    history.back();
    window.setTimeout(() => {
      if (window.location.href === before) {
        history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        setSelectedUid(null);
      }
    }, 50);
  };

  const selectedBase = selectedUid ? baseOf(selectedUid) : null;
  const position = selectedBase ? filtered.findIndex((recipe) => recipe.uid === selectedBase) : -1;
  const slim = (selectedUid ? index.find((recipe) => recipe.uid === selectedUid) : null) ?? (position >= 0 ? filtered[position] : null);
  const go = (delta: number) => {
    const current = filtered.findIndex((recipe) => recipe.uid === selectedBase);
    const next = filtered[current + delta];
    if (next) openRecipe(next.uid);
  };

  const readPickedFile = async (file: File, persist: boolean) => {
    const json = await file.text();
    setSettingsError("");
    await ingest(json, persist, file.name);
  };

  const shown = filtered.slice(0, visible);
  const filterCount = activeFilterCount(filters);
  const searching = Boolean(filters.search.trim()) || filterCount > 0;
  const total = useMemo(() => {
    const titles = new Set<string>();
    for (const recipe of originals) {
      const title = recipe.title.trim().toLowerCase();
      if (title) titles.add(title);
    }
    return titles.size;
  }, [originals]);
  const clearAll = () => {
    setSearchInput("");
    setFilters({ ...DEFAULT_FILTERS, sort: filters.sort });
  };

  const saveVersion = async (source: Recipe, lines: EditableLine[], notes: string, label: string) => {
    const file = recipeFileRef.current;
    if (!file?.recipes) throw new Error("Recipes are not loaded yet.");
    if (!isVersionRecipe(source)) throw new Error("Open a version to save it.");
    const number = source.version ?? 1;
    const existing = file.recipes.find((recipe) => recipe.uid === source.uid);
    const version = buildVersionRecipe(source, lines, {
      number,
      label: label.trim() || `V${number}`,
      notes,
      favorite: Boolean(existing?.favorite),
    });
    placeVersion(file, version);
    await writeRecipes();
    openRecipe(version.uid);
    setToast("Saved successfully.");
  };

  const saveAsNewVersion = async (source: Recipe, lines: EditableLine[], notes: string, label: string, stay = false) => {
    const file = recipeFileRef.current;
    if (!file?.recipes) throw new Error("Recipes are not loaded yet.");
    const current = file.recipes.find((recipe) => recipe.uid === source.uid);
    if (current) {
      current.custom_notes = notes;
      if (isVersionRecipe(current)) {
        const nextLabel = label.trim() || versionLabelOf(current);
        current.version_label = nextLabel;
        current.label = nextLabel;
      }
    }
    const number = nextVersionNumber(file.recipes, baseOf(source));
    const version = buildVersionRecipe(current ?? source, lines, {
      number,
      label: `V${number}`,
      notes,
      favorite: false,
    });
    placeVersion(file, version);
    await writeRecipes();
    if (!stay) openRecipe(version.uid);
    setToast(`Saved as V${number}.`);
  };

  const writeRecipes = async () => {
    const file = recipeFileRef.current;
    if (!file?.recipes) throw new Error("Recipes are not loaded yet.");
    file.metadata = {
      ...(file.metadata ?? {}),
      version_count: file.recipes.filter((recipe) => isVersionRecipe(recipe)).length,
    };
    const payload = JSON.stringify(file);
    await writeStoredFile(payload, "all_recipes.json");
    await ingest(payload, false);
    if (!applyingVersions.current) {
      void publishRecipeVersions(file.recipes.filter((recipe) => isVersionRecipe(recipe)));
    }
  };

  applyCloudFavoritesRef.current = async (uids) => {
    const file = recipeFileRef.current;
    if (!file?.recipes || applyingFavorites.current) return;
    const wanted = new Set(uids);
    let dirty = false;
    for (const recipe of file.recipes) {
      const next = wanted.has(recipe.uid);
      if (Boolean(recipe.favorite) !== next) {
        recipe.favorite = next;
        dirty = true;
      }
    }
    if (!dirty) return;
    applyingFavorites.current = true;
    try {
      await writeRecipes();
    } finally {
      applyingFavorites.current = false;
    }
  };

  applyCloudVersionsRef.current = async (versions) => {
    const file = recipeFileRef.current;
    if (!file?.recipes || applyingVersions.current) return;
    const current = file.recipes.filter((recipe) => isVersionRecipe(recipe));
    const incoming = versions.filter((recipe) => !isRetiredRecipe(recipe));
    const droppedRetired = incoming.length !== versions.length;
    if (JSON.stringify(current) === JSON.stringify(incoming)) return;
    applyingVersions.current = true;
    try {
      file.recipes = [...file.recipes.filter((recipe) => !isVersionRecipe(recipe)), ...incoming];
      const payload = JSON.stringify(file);
      await writeStoredFile(payload, "all_recipes.json");
      await ingest(payload, false);
    } finally {
      applyingVersions.current = false;
    }
    if (droppedRetired) void publishRecipeVersions(incoming);
  };

  const renameVersion = async (source: Recipe, label: string) => {
    const current = recipeFileRef.current?.recipes?.find((recipe) => recipe.uid === source.uid);
    if (!current || !isVersionRecipe(current)) return;
    const number = current.version ?? 1;
    const next = label.trim() || `V${number}`;
    if (next === (current.version_label ?? "")) return;
    current.version_label = next;
    current.label = next;
    await writeRecipes();
  };

  const deleteVersion = async (source: Recipe) => {
    const file = recipeFileRef.current;
    if (!file?.recipes || !isVersionRecipe(source)) return;
    const label = versionLabelOf(source);
    const parent = baseOf(source);
    file.recipes = file.recipes.filter((recipe) => recipe.uid !== source.uid);
    await writeRecipes();
    await savePlanList((current) =>
      current.map((plan) => {
        let dirty = false;
        const days = { ...plan.days };
        for (const date of Object.keys(days)) {
          const meals = (days[date] ?? []).filter((meal) => meal.recipeUid !== source.uid);
          if (meals.length !== (days[date] ?? []).length) {
            days[date] = meals;
            dirty = true;
          }
        }
        return dirty ? { ...plan, days, updatedAt: Date.now() } : plan;
      }),
    );
    openRecipe(parent);
    setToast(`Deleted ${label}.`);
  };

  const saveNotes = async (source: Recipe, notes: string) => {
    const current = recipeFileRef.current?.recipes?.find((recipe) => recipe.uid === source.uid);
    if (!current || (current.custom_notes ?? "") === notes) return;
    current.custom_notes = notes;
    await writeRecipes();
  };

  const toggleFavorite = async (uid: string) => {
    const current = recipeFileRef.current?.recipes?.find((recipe) => recipe.uid === uid);
    if (!current) return;
    current.favorite = !current.favorite;
    await writeRecipes();
    const recipes = recipeFileRef.current?.recipes;
    if (recipes) void publishFavorites(recipes.filter((recipe) => recipe.favorite).map((recipe) => recipe.uid));
  };

  const savePlanList = (change: (current: MealPlan[]) => MealPlan[]) => {
    const next = change(plansRef.current);
    plansRef.current = next;
    setPlans(next);
    planWrite.current = planWrite.current.then(() => writePlans(next)).catch(() => undefined);
    return planWrite.current;
  };

  const tailorCheckedDays = async (dates: string[]) => {
    if (planRoute?.kind !== "edit") return "Open a plan first.";
    const plan = plansRef.current.find((item) => item.id === planRoute.planId);
    const recipes = recipeFileRef.current?.recipes;
    if (!plan || !recipes) return "That plan is not loaded.";
    const fitted = await fitInto(plan, dates, recipes);
    const honed = await honeInto(fitted.plan, dates, recipes);
    await savePlanList((current) => current.map((item) => (item.id === plan.id ? honed.plan : item)));
    return `${fitted.note} ${honed.note}`;
  };

  const logCheckedDays = async (dates: string[]) => {
    if (planRoute?.kind !== "edit" && planRoute?.kind !== "day") return "Open a plan first.";
    const plan = plansRef.current.find((item) => item.id === planRoute.planId);
    const recipes = recipeFileRef.current?.recipes;
    if (!plan || !recipes) return "That plan is not loaded.";
    const catalog = new Map(recipes.map((recipe) => [recipe.uid, recipe]));
    const [goals, household] = await Promise.all([readSavedMacroGoals(), readSavedMacroGoal()]);
    const entries = buildDayLogs(plan, dates, catalog, goals, household);
    if (!entries.length) return logNote(entries);
    const existing = await readMacroLogs();
    await writeMacroLogs([...entries, ...existing]);
    return logNote(entries);
  };

  const placeOnPlan = async (route: Extract<PlanRoute, { kind: "recipe" }>, meal: { recipeUid: string; title: string; versionLabel: string; lines?: Array<{ id?: string; quantity: string; unit: string; name: string }> }) => {
    await savePlanList((current) => {
      if (!route.mealId) {
        return addMeal(current, route.planId, route.date, {
          slot: route.slot,
          recipeUid: meal.recipeUid,
          title: meal.title,
          versionLabel: meal.versionLabel,
          lines: meal.lines,
          portion: 1,
          personId: route.personId,
        });
      }
      return current.map((plan) => {
        if (plan.id !== route.planId) return plan;
        const day = plan.days[route.date] ?? [];
        return {
          ...plan,
          updatedAt: Date.now(),
          days: {
            ...plan.days,
            [route.date]: day.map((item) => (item.id === route.mealId ? { ...item, title: meal.title, versionLabel: meal.versionLabel, lines: meal.lines } : item)),
          },
        };
      });
    });
    openPlan(route.mealId ? { kind: "day", planId: route.planId, date: route.date } : { kind: "edit", planId: route.planId });
  };

  const downloadBlob = (json: string, name: string) => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const meatChoices = index.length ? MEAT_ORDER.filter((meat) => (totals.meats[meat] ?? 0) > 0 || filters.meats.includes(meat)) : MEAT_ORDER.filter((meat) => meat !== "Turkey");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">Recipes</h1>
            <div className="hidden min-w-0 flex-1 sm:block">
              <SearchField value={searchInput} onChange={setSearchInput} />
            </div>
            <button type="button" onClick={() => openPlan({ kind: "list" })} className="inline-flex h-11 shrink-0 items-center rounded-full border border-line bg-surface px-3 text-sm font-semibold">
              Plan
            </button>
            <button type="button" onClick={() => openPlan({ kind: "logs" })} className="inline-flex h-11 shrink-0 items-center rounded-full border border-line bg-surface px-3 text-sm font-semibold">
              Logs
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsError("");
                setSettingsOpen(true);
              }}
              className="relative inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface"
              aria-label={filterCount ? `Settings, ${filterCount} filters on` : "Settings"}
            >
              <Settings className="size-4" />
              {filterCount ? <span className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-full bg-tomato px-1 text-[10px] font-semibold text-tomato-ink tabular-nums">{filterCount}</span> : null}
            </button>
            <span className="relative">
              <button
                type="button"
                aria-label={householdEmail ? "Account" : "Sign in"}
                aria-expanded={householdEmail ? accountOpen : undefined}
                onClick={() => {
                  if (householdEmail) setAccountOpen((open) => !open);
                  else openPlan({ kind: "list" });
                }}
                className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface"
              >
                {householdEmail ? <User className="size-4" /> : <LogIn className="size-4" />}
              </button>
              {householdEmail && accountOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setAccountOpen(false);
                    void signOutHousehold();
                  }}
                  className="absolute right-0 top-12 z-20 h-11 whitespace-nowrap rounded-full border border-line bg-surface px-4 text-sm font-semibold"
                >
                  Sign out
                </button>
              ) : null}
            </span>
          </div>
          <div className="sm:hidden">
            <SearchField value={searchInput} onChange={setSearchInput} />
          </div>
          <div className="flex flex-col gap-2">
            <button type="button" aria-expanded={chipsOpen} onClick={() => setChipsOpen((open) => !open)} className="flex h-11 items-center gap-2 self-start text-sm font-semibold">
              <ChevronDown className={`size-4 motion-safe:transition-transform ${chipsOpen ? "rotate-180" : ""}`} />
              {chipsOpen ? "Hide course, meat, and source" : "Course, meat, and source"}
            </button>
            {chipsOpen ? (
              <CatalogFilterChips filters={filters} counts={counts} meats={meatChoices} loaded={index.length > 0} onChange={setFilters} />
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">
        {status === "error" ? (
          <LoadFailed message={error} onPick={() => fileRef.current?.click()} />
        ) : status !== "ready" || !hydrated ? (
          <Loading count={loadCount ?? metadata.recipe_count ?? null} />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                {filters.versionsOnly ? (
                  <>
                    Showing <span className="font-semibold text-ink tabular-nums">{formatCount(filtered.length)}</span> saved versions
                  </>
                ) : searching ? (
                  <>
                    Showing <span className="font-semibold text-ink tabular-nums">{formatCount(filtered.length)}</span> of <span className="tabular-nums">{formatCount(total)}</span> original recipes
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-ink tabular-nums">{formatCount(total)}</span> original recipes
                  </>
                )}
              </p>
              <div className="flex items-center gap-3">
                {searching ? (
                  <button type="button" onClick={clearAll} className="text-sm font-semibold text-tomato">
                    Clear all
                  </button>
                ) : null}
                <label className="inline-flex items-center gap-2 text-sm">
                  <span className="text-muted">Sort</span>
                  <select
                    value={filters.sort}
                    onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as SortKey }))}
                    className="h-10 rounded-full border border-line bg-surface px-3"
                  >
                    <option value="az">A–Z</option>
                    <option value="za">Z–A</option>
                    <option value="newest">Newest first</option>
                  </select>
                </label>
              </div>
            </div>
            {filtered.length === 0 ? (
              <Empty filters={filters} search={filters.search} onClear={clearAll} onRemove={setFilters} onSearch={setSearchInput} />
            ) : (
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {shown.map((recipe) => {
                  const versionCount = versionsFor(recipe).length;
                  return (
                    <li key={recipe.uid}>
                      <button type="button" onClick={() => openRecipe(recipe.uid)} className="group flex h-full w-full flex-col overflow-hidden rounded-card bg-surface text-left shadow-md transition hover:-translate-y-0.5">
                        <div className="aspect-square">
                          <RecipeArt title={recipe.title} course={recipe.course} thumb={recipe.thumb} videoThumb={recipe.videoThumb} custom={recipe.custom} />
                        </div>
                        <div className="flex flex-1 flex-col gap-2 p-3">
                          <h2 className="line-clamp-3 font-display text-base leading-snug font-semibold">{recipe.title}</h2>
                          <div className="mt-auto flex flex-wrap items-center gap-1">
                            <Mini>{recipe.course}</Mini>
                            {recipe.proteins.map((protein) => (
                              <Mini key={protein}>{meatLabel(protein)}</Mini>
                            ))}
                            <span className="text-xs text-muted">{recipe.sourceLabel}</span>
                            {recipe.isVersion && recipe.versionLabel ? <span className="text-xs font-semibold text-gold">{recipe.versionLabel}</span> : null}
                            {versionCount ? <span className="text-xs font-semibold text-gold">{versionCount === 1 ? "1 version" : `${versionCount} versions`}</span> : null}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {visible < filtered.length ? <div ref={sentinel} className="h-8" /> : null}
          </>
        )}
      </main>

      {showTop && !selectedUid ? (
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="fixed right-4 bottom-5 z-30 inline-flex size-11 items-center justify-center rounded-full bg-tomato text-tomato-ink shadow-lg" aria-label="Back to top">
          <ArrowUp className="size-5" />
        </button>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void readPickedFile(file, true);
        }}
      />

      <Sheet
        open={filtersOpen}
        title="Filters"
        onClose={() => setFiltersOpen(false)}
        footer={
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={clearAll} className="h-11 px-2 text-sm font-semibold text-tomato">
              Clear all
            </button>
            <button type="button" onClick={() => setFiltersOpen(false)} className="h-11 rounded-full bg-tomato px-5 text-sm font-semibold text-tomato-ink">
              Show {formatCount(filtered.length)} recipes
            </button>
          </div>
        }
      >
        <FiltersBody filters={filters} counts={counts} totals={totals} onChange={setFilters} />
      </Sheet>

      <Sheet open={settingsOpen} title="Settings" onClose={() => setSettingsOpen(false)}>
        <div className="flex flex-col gap-5">
          <div>
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                setPeopleOpen(true);
              }}
              className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold"
            >
              People
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                setFiltersOpen(true);
              }}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold"
            >
              <SlidersHorizontal className="size-4" />
              Filters{filterCount ? ` (${filterCount})` : ""}
            </button>
            <button type="button" onClick={() => settingsFileRef.current?.click()} className="mt-3 inline-flex h-11 items-center rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink">
              Load a newer file…
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                setDirectory("recipes");
              }}
              className="mt-3 inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold"
            >
              Recipe library
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                setDirectory("ingredients");
              }}
              className="mt-3 inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold"
            >
              Ingredients library
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                openPlan({ kind: "history" });
              }}
              className="mt-3 inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold"
            >
              Archived plans
            </button>
            <input
              ref={settingsFileRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void readPickedFile(file, true);
              }}
            />
            {settingsError ? <p className="mt-2 text-sm text-tomato">{settingsError}</p> : null}
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-bg p-3 text-sm">
            <div>
              <dt className="text-muted">Build date</dt>
              <dd className="font-medium">{formatBuildDate(metadata.build_date)}</dd>
            </div>
            <div>
              <dt className="text-muted">Recipes</dt>
              <dd className="font-medium tabular-nums">{formatCount(total)}</dd>
            </div>
            <div>
              <dt className="text-muted">Versions</dt>
              <dd className="font-medium tabular-nums">{formatCount(metadata.version_count ?? index.filter((recipe) => recipe.isVersion).length)}</dd>
            </div>
          </dl>
          <div className="flex flex-col items-start gap-2">
            <button
              type="button"
              onClick={() => {
                const file = recipeFileRef.current;
                if (file) downloadBlob(JSON.stringify(file), "all_recipes.json");
              }}
              className="inline-flex h-11 items-center rounded-full border border-line px-4 text-sm font-semibold"
            >
              Download recipe file
            </button>
            <button
              type="button"
              onClick={() => {
                void fetch(publicAsset("all_recipes.json"))
                  .then((response) => response.text())
                  .then((json) => downloadBlob(json, "all_recipes.draft1.json"));
              }}
              className="inline-flex h-11 items-center rounded-full border border-line px-4 text-sm font-semibold"
            >
              Download Draft 1 backup
            </button>
            <button
              type="button"
              onClick={() => {
                void fetch(publicAsset("layng-version-3.zip"))
                  .then((response) => response.blob())
                  .then((blob) => {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = "layng-version-3.zip";
                    link.click();
                    URL.revokeObjectURL(url);
                  });
              }}
              className="inline-flex h-11 items-center rounded-full border border-line px-4 text-sm font-semibold"
            >
              Download Version 3
            </button>
            <p className="text-sm text-muted">Draft 1 is the untouched original recipe file. Version 3 is a backup of the whole app from Nov 22, 2026. Versions of a recipe are saved in your recipe file as V1, V2, and so on.</p>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">Appearance</legend>
            <div className="grid grid-cols-3 gap-2">
              {(["light", "dark", "system"] as ThemeChoice[]).map((choice) => (
                <button key={choice} type="button" aria-pressed={theme === choice} onClick={() => setTheme(choice)} className={`h-11 rounded-full border text-sm font-medium capitalize ${theme === choice ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-chip"}`}>
                  {choice}
                </button>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            onClick={() => {
              clearAll();
              localStorage.removeItem(PREFS_KEY);
            }}
            className="h-11 self-start rounded-full border border-line px-4 text-sm font-semibold"
          >
            Reset filters
          </button>
        </div>
      </Sheet>

      {directory === "recipes" ? (
        <RecipeLibrary
          recipes={originals}
          onOpen={openRecipe}
          onClose={() => setDirectory(null)}
          onRead={(uid) => recipeFileRef.current?.recipes?.find((recipe) => recipe.uid === uid) ?? null}
          onCreate={async (recipe) => {
            const file = recipeFileRef.current;
            if (!file?.recipes) throw new Error("Recipes are not loaded yet.");
            const index = file.recipes.findIndex((item) => item.uid === recipe.uid);
            if (index >= 0) file.recipes[index] = recipe;
            else file.recipes.push(recipe);
            await writeRecipes();
          }}
        />
      ) : null}
      {directory === "ingredients" ? <IngredientLibrary onClose={() => setDirectory(null)} /> : null}
      {peopleOpen ? <UserProfiles onClose={() => setPeopleOpen(false)} /> : null}

      {selected && slim ? (
        <RecipeDetail
          key={selected.uid}
          recipe={selected}
          catalog={recipeByUid}
          slim={slim}
          versions={(slim ? versionsFor(slim) : versionsByBase.get(selectedBase ?? "") ?? []).map((version) => ({
            uid: version.uid,
            label: version.versionLabel,
            number: version.version ?? 0,
          }))}
          onClose={closeRecipe}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          hasPrev={planRoute?.kind === "recipe" ? false : position > 0}
          hasNext={planRoute?.kind === "recipe" ? false : position >= 0 && position < filtered.length - 1}
          onOpen={openRecipe}
          titleFor={(uid) => recipeByUid.get(uid)?.title || "Recipe"}
          makesFor={(uid) => makesLabel(recipeByUid.get(uid))}
          onNewVersion={(notes) => saveAsNewVersion(selected, linesFromRecipe(selected), notes, "")}
          onSave={(lines, notes, label) => saveVersion(selected, lines, notes, label)}
          onSaveAsNew={(lines, notes, label, stay) => saveAsNewVersion(selected, lines, notes, label, stay)}
          onRename={(label) => renameVersion(selected, label)}
          onDelete={() => deleteVersion(selected)}
          onNotes={(notes) => saveNotes(selected, notes)}
          onFit={async () => {
            try {
              if (planRoute?.kind === "recipe" && planRoute.personId) {
                const person = plansRef.current.find((plan) => plan.id === planRoute.planId)?.people?.find((item) => item.id === planRoute.personId);
                if (!person) return { error: "That person has no macro goal." };
                const named = goalForPlanPerson(await readSavedMacroGoals(), person);
                if (!named) return { error: "That person has no macro goal." };
                return fitRecipe(selected, recipeByUid, goalTargets(named.goals));
              }
              const goals = await readMacroGoals();
              return fitRecipe(selected, recipeByUid, goalTargets(goals));
            } catch {
              return { error: "Could not read the saved macro goal." };
            }
          }}
          onToggleFavorite={() => toggleFavorite(selected.uid)}
          addAction={
            planRoute?.kind === "batch" && planRoute.uid
              ? {
                  label: "Add batch",
                  onClick: () => {
                    const batch: PlanBatch = {
                      id: crypto.randomUUID(),
                      recipeUid: selected.uid,
                      title: selected.title,
                      versionLabel: slim.isVersion ? slim.versionLabel : "",
                      servings: definedBatchServings({ id: "new", recipeUid: selected.uid, title: selected.title, servings: 0 }, selected, recipeByUid),
                    };
                    void savePlanList((current) => current.map((plan) => (plan.id === planRoute.planId ? writeBatch(plan, batch, [], recipeByUid) : plan))).then(() => {
                      setToast("Added to batches.");
                      openPlan({ kind: "edit", planId: planRoute.planId });
                    });
                  },
                }
              : planRoute?.kind === "recipe"
              ? {
                  label: [
                    planRoute.mealId ? describeAdd(planRoute.date, planRoute.slot).replace("Add to ", "Update ") : describeAdd(planRoute.date, planRoute.slot),
                    planRoute.personId ? plansRef.current.find((plan) => plan.id === planRoute.planId)?.people?.find((person) => person.id === planRoute.personId)?.name : "",
                  ].filter(Boolean).join(" · "),
                  onClick: () => {
                    void placeOnPlan(planRoute, {
                      recipeUid: selected.uid,
                      title: selected.title,
                      versionLabel: slim.isVersion ? slim.versionLabel : "",
                    }).then(() => setToast(planRoute.mealId ? "Updated the meal." : slim.isVersion ? `Added ${slim.versionLabel} to the day.` : "Added to the day."));
                  },
                  onApply: (lines) => {
                    void placeOnPlan(planRoute, {
                      recipeUid: selected.uid,
                      title: selected.title,
                      versionLabel: slim.isVersion ? slim.versionLabel : "",
                      lines: lines.map((line) => ({ id: line.id, quantity: line.quantity, unit: line.unit, name: line.name })),
                    }).then(() => setToast(planRoute.mealId ? "Updated the meal. No recipe version was saved." : "Added the changed meal. No recipe version was saved."));
                  },
                }
              : null
          }
          resumeLines={
            planRoute?.kind === "recipe" && planRoute.mealId
              ? (plansRef.current.find((plan) => plan.id === planRoute.planId)?.days[planRoute.date]?.find((item) => item.id === planRoute.mealId)?.lines ?? []).map((line, index) => {
                  const original = linesFromRecipe(selected);
                  return { id: line.id || original[index]?.id || `kept-${index}`, quantity: line.quantity, unit: line.unit, name: line.name };
                })
              : null
          }
        />
      ) : selectedUid && detailError ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg p-6">
          <div className="max-w-sm text-center">
            <p className="font-display text-2xl font-semibold">Recipe not found</p>
            <p className="mt-2 text-sm text-muted">{detailError}</p>
            <button type="button" onClick={goHome} className="mt-4 h-11 rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink">
              Home
            </button>
          </div>
        </div>
      ) : selectedUid ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg">
          <span className="size-8 animate-spin rounded-full border-2 border-line border-t-tomato" aria-label="Loading recipe" />
        </div>
      ) : null}

      {planRoute ? (
        <Planner
          route={planRoute}
          plans={plans}
          recipes={originals}
          recipeByUid={recipeByUid}
          versionsByBase={versionsByBase}
          onOpen={openPlan}
          onCreate={() => {
            const plan: MealPlan = { id: newPlanId(), start: "", end: "", saved: false, updatedAt: Date.now(), days: {} };
            void savePlanList((current) => [...current, plan]).then(() => openPlan({ kind: "edit", planId: plan.id }));
          }}
          onRange={(planId, start, end, dates) => {
            void (async () => {
              const [defaults, saved, goals, groups] = await Promise.all([readPlanDefaults(), readSavedPeople(), readSavedMacroGoals(), readPersonGroups()]);
              const people: PlanPerson[] = saved.map((person) => ({
                id: person.id,
                name: person.name,
                goalName: goals.find((goal) => goal.forPersonId === person.id)?.name ?? "",
              }));
              await savePlanList((current) => {
                const ranged = dates ? setPlanDates(current, planId, dates) : setPlanRange(current, planId, start, end);
                return ranged.map((plan) => (plan.id === planId ? applyPlanDefaults(plan, defaults, people, groups) : plan));
              });
            })();
          }}
          onSave={(planId) => {
            void savePlanList((current) => current.map((plan) => (plan.id === planId ? { ...plan, saved: true, updatedAt: Date.now() } : plan)));
          }}
          onRemovePlan={(planId) => {
            void savePlanList((current) => current.filter((plan) => plan.id !== planId));
          }}
          onCopyPlans={(planId, rangeDates, pairs) => {
            const source = plansRef.current.find((plan) => plan.id === planId);
            if (!source || !rangeDates.length || !pairs.length) return;
            void savePlanList((current) => [planFromCopy(source, rangeDates, pairs), ...current]);
            setToast("Copied that plan.");
          }}
          onCopyStored={(source, rangeDates, pairs) => {
            if (!rangeDates.length || !pairs.length) return;
            void savePlanList((current) => [planFromCopy(source, rangeDates, pairs), ...current]);
          }}
          onCopyInto={(targetId, source, pairs) => {
            if (!pairs.length) return;
            void savePlanList((current) => copyIntoPlan(current, targetId, source, pairs));
          }}
          onSwapDays={(planId, a, b) => {
            void savePlanList((current) => swapPlanDays(current, planId, a, b));
          }}
          onRemoveMeal={(planId, date, mealId) => {
            void savePlanList((current) => removeMeal(current, planId, date, mealId));
          }}
          onAssignBatch={(planId, batch, date, slot, servings, personId) => {
            void savePlanList((current) => current.map((plan) => {
              if (plan.id !== planId) return plan;
              const recipe = recipeByUid.get(batch.recipeUid);
              const defined = definedBatchServings(batch, recipe, recipeByUid);
              const count = servings > 0 ? servings : 1;
              const meal: PlannedMeal = {
                id: crypto.randomUUID(),
                slot,
                recipeUid: batch.recipeUid,
                title: batch.title,
                versionLabel: batch.versionLabel ?? "",
                ...seatOf(personId),
                batchId: batch.id,
                batchServings: count,
                batchYield: defined,
                portion: count / defined,
              };
              return { ...plan, updatedAt: Date.now(), days: { ...plan.days, [date]: [...(plan.days[date] ?? []), meal] } };
            }));
          }}
          onSaveBatch={(planId, batch, draws) => {
            void savePlanList((current) => current.map((plan) => (plan.id === planId ? writeBatch(plan, batch, draws, recipeByUid) : plan)));
          }}
          onUpdateBatch={(planId, batch) => {
            void savePlanList((current) => current.map((plan) => {
              if (plan.id !== planId) return plan;
              const defined = definedBatchServings(batch, recipeByUid.get(batch.recipeUid), recipeByUid);
              const days: MealPlan["days"] = {};
              for (const [date, meals] of Object.entries(plan.days)) {
                days[date] = meals.map((meal) => {
                  if (meal.batchId !== batch.id) return meal;
                  const count = meal.batchServings ?? 1;
                  return { ...meal, batchYield: defined, portion: count / defined };
                });
              }
              return { ...plan, batches: (plan.batches ?? []).map((item) => (item.id === batch.id ? { ...batch, servings: defined } : item)), days, updatedAt: Date.now() };
            }));
          }}
          onRemoveBatch={(planId, batchId) => {
            void savePlanList((current) => current.map((plan) => (plan.id === planId ? dropBatch(plan, batchId) : plan)));
          }}
          onAddPeople={(planId, dates, personIds, groups, onlyMissing) => {
            void (async () => {
              const [saved, goals] = await Promise.all([readSavedPeople(), readSavedMacroGoals()]);
              const additions: PlanPerson[] = personIds.flatMap((id) => {
                const person = saved.find((item) => item.id === id);
                if (!person) return [];
                const goal = goals.find((item) => item.forPersonId === id);
                return [{ id: person.id, name: person.name, goalName: goal?.name ?? "" }];
              });
              await savePlanList((current) => current.map((plan) => {
                if (plan.id !== planId) return plan;
                const withPeople = additions.length ? addPeopleOnDays(plan, dates, additions, Boolean(onlyMissing)) : plan;
                return groups.length ? addGroupsOnDays(withPeople, dates, groups, Boolean(onlyMissing)) : withPeople;
              }));
            })();
          }}
          onRemovePeople={(planId, dates, personIds, groups) => {
            void savePlanList((current) =>
              current.map((plan) => {
                if (plan.id !== planId) return plan;
                return dates.reduce((next, date) => {
                  let day = next;
                  for (const id of personIds) day = dropDaySeat(day, date, { kind: "person", id });
                  for (const group of groups) day = dropDaySeat(day, date, { kind: "group", id: group.id });
                  return day;
                }, plan);
              }),
            );
          }}
          onRemoveSeat={(planId, date, seat) => {
            void savePlanList((current) => current.map((plan) => (plan.id === planId ? dropDaySeat(plan, date, seat) : plan)));
          }}
          onCopyPersonDays={(planId, dates, fromId, toId, mealIds) => {
            const plan = plansRef.current.find((item) => item.id === planId);
            const to = plan?.people?.find((person) => person.id === toId)?.name || "the other person";
            let added = 0;
            let found = 0;
            void savePlanList((current) => {
              const result = copyPersonDays(current, planId, dates, fromId, toId, mealIds);
              added = result.added;
              found = result.found;
              return result.plans;
            });
            if (!found) setToast("Nothing was checked.");
            else if (!added) setToast(`${to} already has those meals.`);
            else setToast(`Copied ${added} ${added === 1 ? "meal" : "meals"} to ${to}.`);
          }}
          onCopyMeal={(planId, mealId, targets: ChipTarget[]) => {
            let added = 0;
            void savePlanList((current) => {
              const result = copyMealToChips(current, planId, mealId, targets);
              added = result.added;
              return result.plans;
            });
            if (!added) setToast("That meal was not copied.");
          }}
          onCopyDays={(fromPlanId, pairs: Array<{ from: string; to: DayCopyTarget }>) => {
            let copied = 0;
            void savePlanList((current) => {
              const result = copyDaysOnto(current, fromPlanId, pairs);
              copied = result.copied;
              return result.plans;
            });
            if (!copied) setToast("Nothing was copied.");
          }}
          onNotify={setToast}
          onPick={(recipe) => {
            if (planRoute.kind !== "add" && planRoute.kind !== "recipe") return;
            openPlan({ kind: "recipe", planId: planRoute.planId, date: planRoute.date, slot: planRoute.slot, uid: recipe.uid, personId: planRoute.personId });
          }}
          onSavePlate={async (meal) => {
            if (planRoute.kind !== "plate") return;
            const file = recipeFileRef.current;
            if (!file?.recipes) throw new Error("Recipes are not loaded yet.");
            const existing = planRoute.mealId ? plansRef.current.find((item) => item.id === planRoute.planId)?.days[planRoute.date]?.find((item) => item.id === planRoute.mealId) : undefined;
            let uid = existing?.recipeUid ?? "";
            const found = uid ? file.recipes.find((recipe) => recipe.uid === uid) : undefined;
            if (found) {
              found.title = meal.title;
              found.ingredients = meal.lines.map((line) => ingredientFromServings(line.name, line.servings));
            } else {
              uid = `custom-${Date.now().toString(36)}`;
              file.recipes.push({
                uid,
                title: meal.title,
                custom_recipe: true,
                collection: "custom",
                variant: "original",
                favorite: false,
                ingredients: meal.lines.map((line) => ingredientFromServings(line.name, line.servings)),
              });
            }
            await writeRecipes();
            await savePlanList((current) => {
              if (!existing) return addMeal(current, planRoute.planId, planRoute.date, { slot: planRoute.slot, recipeUid: uid, title: meal.title, versionLabel: "", plate: meal.draft, personId: planRoute.personId });
              return current.map((plan) => {
                if (plan.id !== planRoute.planId) return plan;
                const day = plan.days[planRoute.date] ?? [];
                return { ...plan, updatedAt: Date.now(), days: { ...plan.days, [planRoute.date]: day.map((item) => (item.id === existing.id ? { ...item, recipeUid: uid, title: meal.title, plate: meal.draft } : item)) } };
              });
            });
            openPlan({ kind: "day", planId: planRoute.planId, date: planRoute.date });
          }}
          onTailorDays={(dates) => tailorCheckedDays(dates)}
          onFitPrefs={(planId, daySplit, snackDraw) => {
            void savePlanList((current) => current.map((plan) => (plan.id === planId ? { ...plan, daySplit, snackDraw, updatedAt: Date.now() } : plan)));
          }}
          onBeefChoice={(planId, beefChoice) => {
            void savePlanList((current) => current.map((plan) => (plan.id === planId ? { ...plan, beefChoice, updatedAt: Date.now() } : plan)));
          }}
          onPeople={(planId, people) => {
            void savePlanList((current) =>
              current.map((plan) => {
                if (plan.id !== planId) return plan;
                if (!people || people.length < 2) {
                  const days = Object.fromEntries(Object.entries(plan.days).map(([date, meals]) => [date, meals.map((meal) => ({ ...meal, personId: undefined }))]));
                  return { ...plan, people: undefined, macroDays: undefined, days, updatedAt: Date.now() };
                }
                const first = people[0]?.id ?? "";
                const previous = plan.people ?? [];
                const moved = new Map<string, string>();
                previous.forEach((person, index) => {
                  const nextId = people[index]?.id;
                  if (person.id && nextId) moved.set(person.id, nextId);
                });
                const days = Object.fromEntries(
                  Object.entries(plan.days).map(([date, meals]) => [
                    date,
                    meals.map((meal) => ({ ...meal, personId: meal.personId && moved.has(meal.personId) ? moved.get(meal.personId) : first })),
                  ]),
                );
                const macroDays = Object.fromEntries(
                  people.map((person, index) => {
                    const oldId = previous[index]?.id;
                    return [person.id, (oldId && plan.macroDays?.[oldId]) || plan.macroDays?.[person.id] || []];
                  }),
                );
                return { ...plan, people, macroDays, days, updatedAt: Date.now() };
              }),
            );
          }}
          onMacroDay={(planId, personId, date, on) => {
            void savePlanList((current) =>
              current.map((plan) => {
                if (plan.id !== planId) return plan;
                const have = plan.macroDays?.[personId] ?? [];
                const next = on ? [...have, date] : have.filter((item) => item !== date);
                return { ...plan, macroDays: { ...plan.macroDays, [personId]: [...new Set(next)] }, updatedAt: Date.now() };
              }),
            );
          }}
          onLogDays={logCheckedDays}
          onMarkCook={(planId, mealIds, status) => {
            void savePlanList((current) =>
              current.map((plan) => {
                if (plan.id !== planId) return plan;
                const cook = { ...plan.cook };
                for (const id of mealIds) cook[id] = status;
                return { ...plan, cook, updatedAt: Date.now() };
              }),
            );
          }}
        />
      ) : null}

      {toast ? <div className="fixed bottom-5 left-1/2 z-50 max-w-xs -translate-x-1/2 rounded-full bg-ink px-4 py-3 text-center text-sm font-semibold text-bg shadow-lg">{toast}</div> : null}
    </div>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="relative block">
      <span className="sr-only">Search recipes or ingredients</span>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Search recipes or ingredients" className="h-11 w-full rounded-full border border-line bg-surface pr-10 pl-10 text-sm outline-none focus:border-tomato" />
      {value ? (
        <button type="button" onClick={() => onChange("")} className="absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full" aria-label="Clear search">
          <X className="size-4" />
        </button>
      ) : null}
    </label>
  );
}

function Mini({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-ink">{children}</span>;
}

function Loading({ count }: { count: number | null }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="size-8 animate-spin rounded-full border-2 border-line border-t-tomato" aria-hidden="true" />
        <p className="text-sm text-muted">{count ? `Loading ${formatCount(count)} recipes…` : "Loading recipes…"}</p>
      </div>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <li key={index} className="overflow-hidden rounded-card bg-surface">
            <div className="aspect-square animate-pulse bg-line" />
            <div className="space-y-2 p-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-line" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-line" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LoadFailed({ message, onPick }: { message: string; onPick: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-card border border-line bg-surface p-6 text-center shadow-md">
      <h2 className="font-display text-2xl font-semibold">Couldn't load your recipes.</h2>
      {message ? <p className="mt-2 text-sm text-muted">{message}</p> : null}
      <button type="button" onClick={onPick} className="mt-4 inline-flex h-11 items-center rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink">
        Choose all_recipes.json
      </button>
      <p className="mt-3 text-sm text-muted">Download it from Google Drive, then Chef, then all_recipes.json, and pick it here.</p>
    </div>
  );
}

function Empty({
  filters,
  search,
  onClear,
  onRemove,
  onSearch,
}: {
  filters: FilterState;
  search: string;
  onClear: () => void;
  onRemove: (next: FilterState) => void;
  onSearch: (value: string) => void;
}) {
  const chips: { label: string; clear: () => void }[] = [];
  if (search.trim()) chips.push({ label: `Search: ${search.trim()}`, clear: () => { onSearch(""); onRemove({ ...filters, search: "" }); } });
  for (const course of filters.courses) chips.push({ label: course, clear: () => onRemove({ ...filters, courses: filters.courses.filter((item) => item !== course) }) });
  for (const meat of filters.meats) chips.push({ label: meatLabel(meat), clear: () => onRemove({ ...filters, meats: filters.meats.filter((item) => item !== meat) }) });
  for (const source of filters.sources) chips.push({ label: SOURCE_SHORT[source] ?? source, clear: () => onRemove({ ...filters, sources: filters.sources.filter((item) => item !== source) }) });
  if (filters.favorites) chips.push({ label: "Favorites", clear: () => onRemove({ ...filters, favorites: false }) });
  if (filters.versionsOnly) chips.push({ label: "Saved Versions", clear: () => onRemove({ ...filters, versionsOnly: false }) });
  if (filters.photoOnly) chips.push({ label: "With photo only", clear: () => onRemove({ ...filters, photoOnly: false }) });
  if (filters.fullOnly) chips.push({ label: "Has full recipe", clear: () => onRemove({ ...filters, fullOnly: false }) });
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-10 text-center">
      <p className="font-display text-2xl font-semibold">No recipes match.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {chips.map((chip) => (
          <button key={chip.label} type="button" onClick={chip.clear} className="inline-flex h-10 items-center gap-1 rounded-full border border-line bg-chip px-3 text-sm">
            {chip.label}
            <X className="size-3.5" />
          </button>
        ))}
      </div>
      <button type="button" onClick={onClear} className="mt-4 h-11 rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink">
        Clear all
      </button>
    </div>
  );
}
