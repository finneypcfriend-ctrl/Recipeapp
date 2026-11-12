import { formatDay, goalForPlanPerson, goalTargets, mealPerson, parseKey, shiftDay, twoPeople, type GoalTargets, type MealPlan, type MealSlot, type SavedMacroGoal } from "@/lib/plans/model";
import type { Macros } from "@/lib/sourced";
import type { Recipe } from "@/lib/recipes/types";
import { formatGoalPercents, formatMealLine, formatSide, mealScale, planMealMath, recipeFromLines, sumPlanMeals, usedIngredientLines } from "@/lib/sourced/meal";

export interface MacroLogMeal {
  slot: MealSlot;
  title: string;
  summary: string;
  ingredients: string[];
}

export interface MacroLog {
  id: string;
  loggedAt: number;
  date: string;
  personId: string;
  personName: string;
  goalName: string;
  percentLine: string;
  gramLine: string;
  meals: MacroLogMeal[];
}

export function buildDayLogs(plan: MealPlan, dates: string[], catalog: ReadonlyMap<string, Recipe>, goals: SavedMacroGoal[], household: SavedMacroGoal | null): MacroLog[] {
  const paired = twoPeople(plan);
  const loggedAt = Date.now();
  const entries: MacroLog[] = [];
  for (const date of dates) {
    const marked = paired ? (plan.people ?? []).filter((person) => (plan.macroDays?.[person.id] ?? []).includes(date)) : [];
    const people = paired ? (marked.length ? marked : (plan.people ?? [])) : [null];
    for (const person of people) {
      const meals = (plan.days[date] ?? []).filter((meal) => !person || mealPerson(meal, plan) === person.id);
      if (!meals.some((meal) => meal.recipeUid || meal.title)) continue;
      const math = catalog.size ? sumPlanMeals(meals, catalog, plan.beefChoice) : null;
      const saved = person ? goalForPlanPerson(goals, person) : household;
      const targets = goalTargets(saved?.goals);
      entries.push({
        id: `log-${loggedAt.toString(36)}-${entries.length}-${Math.random().toString(36).slice(2, 6)}`,
        loggedAt,
        date,
        personId: person?.id || "household",
        personName: person?.name || "One person",
        goalName: saved?.name || "",
        percentLine: math && targets ? formatGoalPercents(math.macros, targets) : "",
        gramLine: math ? formatMealLine(math.macros) : "",
        meals: meals.map((meal) => {
          const recipe = meal.recipeUid ? catalog.get(meal.recipeUid) : undefined;
          const basis = recipe && meal.lines?.length ? recipeFromLines(recipe, meal.lines) : recipe;
          const mealMath = planMealMath(meal, catalog, plan.beefChoice);
          const ingredients = basis
            ? usedIngredientLines(basis, catalog, mealScale(meal), meal.meatTrim ?? 1, meal.carbItem, meal.carbScale, meal.tweaks, plan.beefChoice)
            : [];
          if (meal.sideName && meal.sideServings) ingredients.push(formatSide(meal.sideName, meal.sideServings));
          return {
            slot: meal.slot,
            title: meal.title,
            summary: mealMath ? formatMealLine(mealMath.macros) : "",
            ingredients,
          };
        }),
      });
    }
  }
  return entries;
}

export function logNote(entries: MacroLog[]): string {
  if (!entries.length) return "Those days have no meals to log.";
  const days = new Set(entries.map((entry) => entry.date));
  const names = [...new Set(entries.map((entry) => entry.personName))];
  const dayText = days.size === 1 ? formatDay([...days][0]) : `${days.size} days`;
  return `Logged ${names.join(" and ")} for ${dayText}.`;
}

export function parseLoggedMacros(line: string): Macros | null {
  const kcal = line.match(/([\d,]+)\s*kcal/i);
  if (!kcal) return null;
  const amount = (pattern: RegExp) => {
    const match = line.match(pattern);
    return match ? Number(match[1]) : 0;
  };
  const cost = line.match(/\$([\d,]+(?:\.\d+)?)/);
  const net = amount(/net\s*([\d.]+)g/i);
  return {
    calories: Number(kcal[1].replace(/,/g, "")),
    proteinG: amount(/P\s*([\d.]+)g/i),
    fatG: amount(/F\s*([\d.]+)g/i),
    netCarbsG: net,
    carbsG: net,
    fiberG: 0,
    sugarsG: 0,
    cost: cost ? Number(cost[1].replace(/,/g, "")) : 0,
  };
}

export function addLoggedMacros(items: readonly Macros[]): Macros {
  return items.reduce(
    (sum, item) => ({
      calories: sum.calories + item.calories,
      fatG: sum.fatG + item.fatG,
      carbsG: sum.carbsG + item.carbsG,
      fiberG: sum.fiberG + item.fiberG,
      netCarbsG: sum.netCarbsG + item.netCarbsG,
      sugarsG: sum.sugarsG + item.sugarsG,
      proteinG: sum.proteinG + item.proteinG,
      cost: sum.cost + item.cost,
    }),
    { calories: 0, fatG: 0, carbsG: 0, fiberG: 0, netCarbsG: 0, sugarsG: 0, proteinG: 0, cost: 0 },
  );
}

export function scaleTargets(targets: GoalTargets, factor: number): GoalTargets {
  const scale = (value: number | null) => (value == null ? null : value * factor);
  return { calories: scale(targets.calories), protein: scale(targets.protein), carbs: scale(targets.carbs), fat: scale(targets.fat) };
}

export interface LogWeek {
  index: number;
  start: string;
  end: string;
  days: Array<{ date: string; entry: MacroLog | null }>;
}

/** Weeks of 7, counted from the oldest logged day. Newest week is first. */
export function logWeeks(entries: readonly MacroLog[]): LogWeek[] {
  if (!entries.length) return [];
  const byDate = new Map<string, MacroLog>();
  for (const entry of [...entries].sort((a, b) => a.loggedAt - b.loggedAt)) byDate.set(entry.date, entry);
  const dates = [...byDate.keys()].sort();
  const origin = dates[0];
  const span = Math.round((parseKey(dates[dates.length - 1]).getTime() - parseKey(origin).getTime()) / 86400000);
  const count = Math.floor(span / 7) + 1;
  const weeks: LogWeek[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const start = shiftDay(origin, index * 7);
    weeks.push({
      index: index + 1,
      start,
      end: shiftDay(start, 6),
      days: Array.from({ length: 7 }, (_, day) => {
        const date = shiftDay(start, day);
        return { date, entry: byDate.get(date) ?? null };
      }),
    });
  }
  return weeks;
}
