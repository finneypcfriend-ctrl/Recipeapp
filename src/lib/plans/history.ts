import { formatRange, mealPerson, planDates, twoPeople, type MealPlan, type MealSlot } from "@/lib/plans/model";
import type { Recipe } from "@/lib/recipes/types";
import { formatMealLine, mealScale, planMealMath, recipeFromLines, usedIngredientLines } from "@/lib/sourced/meal";

export interface HistoryMeal {
  slot: MealSlot;
  title: string;
  versionLabel: string;
  /** Set only when the plan had two people. */
  person?: string;
  summary: string;
  ingredients: string[];
}

export interface HistoryDay {
  date: string;
  custom?: boolean;
  meals: HistoryMeal[];
}

export interface HistoryEntry {
  id: string;
  planId: string;
  label: string;
  start: string;
  end: string;
  archivedAt: number;
  days: HistoryDay[];
  /** Full plan, so an archived range can be copied later. Missing on older archives. */
  source?: MealPlan;
}

export function snapshotPlan(plan: MealPlan, catalog: ReadonlyMap<string, Recipe>): HistoryEntry {
  const days = planDates(plan).map((date) => ({
    date,
    custom: (plan.days[date] ?? []).some((meal) => Boolean(meal.lines?.length)),
    meals: (plan.days[date] ?? []).map((meal) => {
      const recipe = meal.recipeUid ? catalog.get(meal.recipeUid) : undefined;
      const edited = recipe && meal.lines?.length ? recipeFromLines(recipe, meal.lines) : null;
      const math = planMealMath(meal, catalog, plan.beefChoice);
      const ingredients = recipe
        ? usedIngredientLines(edited ?? recipe, catalog, mealScale(meal), meal.meatTrim ?? 1, meal.carbItem, meal.carbScale, meal.tweaks, plan.beefChoice)
        : [];
      const who = twoPeople(plan) ? plan.people?.find((person) => person.id === mealPerson(meal, plan))?.name : "";
      return {
        slot: meal.slot,
        title: meal.title,
        versionLabel: meal.versionLabel,
        person: who || undefined,
        summary: math ? formatMealLine(math.macros) : "",
        ingredients,
      };
    }),
  }));
  const dates = plan.start && plan.end ? formatRange(plan.start, plan.end) : "Dates not chosen";
  return {
    id: crypto.randomUUID(),
    planId: plan.id,
    label: `${dates} Plan`,
    start: plan.start,
    end: plan.end,
    archivedAt: Date.now(),
    days,
    source: JSON.parse(JSON.stringify(plan)) as MealPlan,
  };
}
