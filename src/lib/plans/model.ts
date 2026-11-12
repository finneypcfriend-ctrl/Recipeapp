export type MealSlot = "breakfast" | "lunch" | "snack" | "supper";

export interface PlannedMeal {
  id: string;
  slot: MealSlot;
  recipeUid: string;
  title: string;
  versionLabel: string;
  /** Share of the fitted recipe on this day. Missing means the whole recipe. A multi-meal day stores the split here. The recipe itself stays the full-day fit. */
  portion?: number;
  /** Multiplier on meat lines only. Hone writes this. Missing means the meat stays as fitted. */
  meatTrim?: number;
  /** Library side added on top of the recipe, such as beef tallow or eggs. Servings match that row (1 tbsp, or 1 egg). */
  sideName?: string;
  sideServings?: number;
  /** One ingredient Hone scaled down to land net carbs. Missing means the fitted amount. */
  carbItem?: string;
  carbScale?: number;
  /** Other ingredients Hone scaled down so calories, protein, and fat can land together. */
  tweaks?: Array<{ name: string; factor: number }>;
  /** Fit's one ratio for this meal. The recipe list is not changed. Missing means the recipe amounts. */
  fitScale?: number;
  /** Ingredient list for this day only. Set by Rebalance/edit. The recipe page is not changed. */
  lines?: Array<{ id?: string; quantity: string; unit: string; name: string }>;
  /** Build-a-plate layout, so the day can open this meal for another edit. */
  plate?: {
    beefName: string;
    beef: number;
    extras: Array<{ name: string; servings: number }>;
    rows: Array<{ title: string; sourceId: string | null; baseId: string | null; lines: Array<{ name: string; servings: number }> }>;
  };
  /** Which person this meal belongs to. Missing meals stay with the first person. */
  personId?: string;
}

/** How two meals share a day, in meal order. 25/75 gives the earlier meal the smaller share. */
export type DaySplit = "50-50" | "25-75";

/** Which meal gives up calories when a snack is on the same day. */
export type SnackDraw = "lunch" | "supper";

/** Which ground beef Fit and Hone count. Either leaves the recipe's own beef. */
export type BeefChoice = "80/20" | "73/27" | "either";

/** One person on a plan. Two is the maximum. A plan with no people is still one person, using the household goal. */
export interface PlanPerson {
  id: string;
  name: string;
  /** Saved macro name. Blank means this person is not comparing to a goal. */
  goalName: string;
}

export interface MealPlan {
  id: string;
  start: string;
  end: string;
  saved: boolean;
  updatedAt: number;
  days: Record<string, PlannedMeal[]>;
  daySplit?: DaySplit;
  snackDraw?: SnackDraw;
  beefChoice?: BeefChoice;
  /** Set only when a second person is added. One person leaves this empty. */
  people?: PlanPerson[];
  /** Dates Tailor should run for that person. Ignored until there are two people. */
  macroDays?: Record<string, string[]>;
  /** Meal ids marked from the cook page. Cooked replaces prepped. */
  cook?: Record<string, "prepped" | "cooked">;
}

export type PlanRoute =
  | { kind: "list" }
  | { kind: "goals" }
  | { kind: "find" }
  | { kind: "edit"; planId: string }
  | { kind: "day"; planId: string; date: string }
  | { kind: "add"; planId: string; date: string; slot: MealSlot; personId?: string }
  | { kind: "plate"; planId: string; date: string; slot: MealSlot; mealId?: string; personId?: string }
  | { kind: "recipe"; planId: string; date: string; slot: MealSlot; uid: string; mealId?: string; personId?: string }
  | { kind: "shop"; planIds: string[] }
  | { kind: "groceries" }
  | { kind: "grocery"; listId: string }
  | { kind: "groceryEdit"; listId: string }
  | { kind: "history" }
  | { kind: "historyItem"; archiveId: string }
  | { kind: "historyDay"; archiveId: string; date: string }
  | { kind: "historyMeal"; archiveId: string; date: string; mealIndex: number }
  | { kind: "logs" }
  | { kind: "logsPerson"; personId: string }
  | { kind: "logsEntry"; personId: string; logId: string }
  | { kind: "cook"; planId: string }
  | { kind: "prep"; planId: string; mealIds: string[] }
  | { kind: "cooking"; planId: string; mealIds: string[] };

export type MacroMode = "grams" | "split";

export interface MacroGoals {
  mode: MacroMode;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  proteinPct: string;
  carbsPct: string;
  fatPct: string;
}

export const EMPTY_GOALS: MacroGoals = {
  mode: "grams",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
  proteinPct: "",
  carbsPct: "",
  fatPct: "",
};

/** One saved daily goal. The planner compares meals against `goals`. The name is the list label. A blank person stays the one-person goal. */
export interface SavedMacroGoal {
  name: string;
  savedOn: string;
  goals: MacroGoals;
  /** Saved person id. Tailor uses the newest goal for that person. */
  forPersonId?: string;
  /** Copy of the saved person's name, so the goal list can show who it is for. */
  forName?: string;
}

/** A person saved for the household. A plan picks from this list. Two is the maximum. */
export interface SavedPerson {
  id: string;
  name: string;
}

/** Newest goal with no person. That is what a one-person plan uses. */
export function householdGoal(goals: readonly SavedMacroGoal[]): SavedMacroGoal | null {
  return goals.find((goal) => !goal.forName?.trim() && !goal.forPersonId) ?? null;
}

/** Newest saved goal identified with this person. The list is newest first. The goal name counts only when no person was set. */
export function goalForPerson(goals: readonly SavedMacroGoal[], personName: string): SavedMacroGoal | null {
  const needle = personName.trim().toLowerCase();
  if (!needle) return null;
  return (
    goals.find((goal) => (goal.forName ?? "").trim().toLowerCase() === needle) ??
    goals.find((goal) => !(goal.forName ?? "").trim() && !goal.forPersonId && goal.name.trim().toLowerCase() === needle) ??
    null
  );
}

/** Saved-person match first. A goal picked earlier still applies when nothing is saved for that person. */
export function goalForPlanPerson(goals: readonly SavedMacroGoal[], person: { id?: string; name: string; goalName?: string }): SavedMacroGoal | null {
  if (person.id) {
    const byId = goals.find((goal) => goal.forPersonId === person.id);
    if (byId) return byId;
  }
  const named = goalForPerson(goals, person.name);
  if (named) return named;
  const picked = person.goalName?.trim();
  if (!picked) return null;
  return goals.find((goal) => goal.name === picked) ?? null;
}

/** "Macro 11/2" from the day it was first saved. No leading zero on the day. */
export function defaultMacroName(key: string): string {
  const date = parseKey(key);
  return `Macro ${date.getMonth() + 1}/${date.getDate()}`;
}

export function caloriesFromGrams(protein: number, carbs: number, fat: number): number {
  return protein * 4 + carbs * 4 + fat * 9;
}

export function gramsFromSplit(calories: number, proteinPct: number, carbsPct: number, fatPct: number): { protein: number; carbs: number; fat: number } {
  return {
    protein: (calories * (proteinPct / 100)) / 4,
    carbs: (calories * (carbsPct / 100)) / 4,
    fat: (calories * (fatPct / 100)) / 9,
  };
}

/** The daily goal actually saved. Blank or zero fields are left out. Null when nothing was listed. */
export interface GoalTargets {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export function goalTargets(goals: MacroGoals | null | undefined): GoalTargets | null {
  if (!goals) return null;
  const calories = positiveAmount(goals.calories);
  const protein = positiveAmount(goals.protein);
  const carbs = positiveAmount(goals.carbs);
  const fat = positiveAmount(goals.fat);
  if (calories == null && protein == null && carbs == null && fat == null) return null;
  return { calories, protein, carbs, fat };
}

function positiveAmount(value: string): number | null {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export const SLOT_ORDER: MealSlot[] = ["breakfast", "lunch", "snack", "supper"];

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snack",
  supper: "Supper",
};

export const SLOT_HOUR: Record<MealSlot, number> = {
  breakfast: 8,
  lunch: 12,
  snack: 15,
  supper: 17,
};

const SLOT_SET = new Set<string>(SLOT_ORDER);

export function isMealSlot(value: string): value is MealSlot {
  return SLOT_SET.has(value);
}

export function parsePlanHash(hash: string): PlanRoute | null {
  if (!hash.startsWith("#/plan")) return null;
  const rest = hash.slice("#/plan".length).replace(/^\//, "");
  if (!rest) return { kind: "list" };
  if (rest === "goals") return { kind: "goals" };
  if (rest === "find") return { kind: "find" };
  if (rest === "groceries") return { kind: "groceries" };
  if (rest === "history") return { kind: "history" };
  if (rest === "logs") return { kind: "logs" };
  let parts = rest.split("/").map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  const planId = parts[0];
  if (planId === "logs" && parts[1] && parts[2]) return { kind: "logsEntry", personId: parts[1], logId: parts.slice(2).join("/") };
  if (planId === "logs" && parts[1]) return { kind: "logsPerson", personId: parts.slice(1).join("/") };
  if (planId === "groceries" && parts[1] && parts[2] === "edit") return { kind: "groceryEdit", listId: parts[1] };
  if (planId === "groceries" && parts[1]) return { kind: "grocery", listId: parts.slice(1).join("/") };
  if (planId === "shop") return { kind: "shop", planIds: (parts[1] ?? "").split(",").filter(Boolean) };
  if (planId === "history" && parts[1]) {
    const archiveId = parts[1];
    const date = parts[2];
    if (date && parts[3]) return { kind: "historyMeal", archiveId, date, mealIndex: Number(parts[3]) || 0 };
    if (date) return { kind: "historyDay", archiveId, date };
    return { kind: "historyItem", archiveId };
  }
  if (!planId) return { kind: "list" };
  if (parts[1] === "cook") return { kind: "cook", planId };
  if (parts[1] === "prep") return { kind: "prep", planId, mealIds: (parts[2] ?? "").split(",").filter(Boolean) };
  if (parts[1] === "cooking") return { kind: "cooking", planId, mealIds: (parts[2] ?? "").split(",").filter(Boolean) };
  let personId: string | undefined;
  if (parts.length >= 3 && parts[parts.length - 2] === "for" && parts[parts.length - 1]) {
    personId = parts[parts.length - 1];
    parts = parts.slice(0, -2);
  }
  const date = parts[1];
  if (!date) return { kind: "edit", planId };
  if (parts[2] !== "add" || !parts[3] || !isMealSlot(parts[3])) return { kind: "day", planId, date };
  const slot = parts[3];
  if (parts[4] === "plate") return { kind: "plate", planId, date, slot, mealId: parts[5], personId };
  if (parts[4] === "recipe" && parts[5]) {
    if (parts[6] === "meal" && parts[7]) return { kind: "recipe", planId, date, slot, uid: parts[5], mealId: parts[7], personId };
    return { kind: "recipe", planId, date, slot, uid: parts.slice(5).join("/"), personId };
  }
  return { kind: "add", planId, date, slot, personId };
}

export function planHash(route: PlanRoute): string {
  if (route.kind === "list") return "#/plan";
  if (route.kind === "goals") return "#/plan/goals";
  if (route.kind === "find") return "#/plan/find";
  if (route.kind === "groceries") return "#/plan/groceries";
  if (route.kind === "grocery") return `#/plan/groceries/${encodeURIComponent(route.listId)}`;
  if (route.kind === "groceryEdit") return `#/plan/groceries/${encodeURIComponent(route.listId)}/edit`;
  if (route.kind === "shop") return `#/plan/shop/${route.planIds.map((id) => encodeURIComponent(id)).join(",")}`;
  if (route.kind === "history") return "#/plan/history";
  if (route.kind === "logs") return "#/plan/logs";
  if (route.kind === "logsPerson") return `#/plan/logs/${encodeURIComponent(route.personId)}`;
  if (route.kind === "logsEntry") return `#/plan/logs/${encodeURIComponent(route.personId)}/${encodeURIComponent(route.logId)}`;
  if (route.kind === "cook") return `#/plan/${encodeURIComponent(route.planId)}/cook`;
  if (route.kind === "prep") return `#/plan/${encodeURIComponent(route.planId)}/prep/${route.mealIds.map((id) => encodeURIComponent(id)).join(",")}`;
  if (route.kind === "cooking") return `#/plan/${encodeURIComponent(route.planId)}/cooking/${route.mealIds.map((id) => encodeURIComponent(id)).join(",")}`;
  if (route.kind === "historyItem") return `#/plan/history/${encodeURIComponent(route.archiveId)}`;
  if (route.kind === "historyDay") return `#/plan/history/${encodeURIComponent(route.archiveId)}/${route.date}`;
  if (route.kind === "historyMeal") return `#/plan/history/${encodeURIComponent(route.archiveId)}/${route.date}/${route.mealIndex}`;
  if (route.kind === "edit") return `#/plan/${encodeURIComponent(route.planId)}`;
  if (route.kind === "day") return `#/plan/${encodeURIComponent(route.planId)}/${route.date}`;
  const person = route.personId ? `/for/${encodeURIComponent(route.personId)}` : "";
  if (route.kind === "add") return `#/plan/${encodeURIComponent(route.planId)}/${route.date}/add/${route.slot}${person}`;
  if (route.kind === "plate") return `#/plan/${encodeURIComponent(route.planId)}/${route.date}/add/${route.slot}/plate${route.mealId ? `/${encodeURIComponent(route.mealId)}` : ""}${person}`;
  const meal = route.mealId ? `/meal/${encodeURIComponent(route.mealId)}` : "";
  return `#/plan/${encodeURIComponent(route.planId)}/${route.date}/add/${route.slot}/recipe/${encodeURIComponent(route.uid)}${meal}${person}`;
}

export function todayKey(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function shiftDay(key: string, days: number): string {
  const date = parseKey(key);
  date.setDate(date.getDate() + days);
  return todayKey(date);
}

export function parseKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

export function isDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseKey(value).getTime());
}

export function eachDay(start: string, end: string): string[] {
  if (!start || !end) return [];
  const from = parseKey(start <= end ? start : end);
  const to = parseKey(start <= end ? end : start);
  const days: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to && days.length < 90) {
    days.push(todayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function formatDay(key: string): string {
  return parseKey(key).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function formatRange(start: string, end: string): string {
  if (!start || !end) return "Choose dates";
  const from = parseKey(start <= end ? start : end);
  const to = parseKey(start <= end ? end : start);
  const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
  const left = from.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const right = to.toLocaleDateString(undefined, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
  if (start === end) return left;
  return `${left}–${right}`;
}

export function planStatus(plan: MealPlan, today = todayKey()): "Draft" | "Upcoming" | "In progress" | "Past" {
  if (!plan.saved || !plan.start || !plan.end) return "Draft";
  const start = plan.start <= plan.end ? plan.start : plan.end;
  const end = plan.start <= plan.end ? plan.end : plan.start;
  if (end < today) return "Past";
  if (start > today) return "Upcoming";
  return "In progress";
}

export function mealsFor(plan: MealPlan | undefined, date: string, slot?: MealSlot, personId?: string): PlannedMeal[] {
  const meals = plan?.days[date] ?? [];
  const slotted = slot ? meals.filter((meal) => meal.slot === slot) : meals;
  if (!personId || !plan || !twoPeople(plan)) return slotted;
  return slotted.filter((meal) => mealPerson(meal, plan) === personId);
}

/** True only when a second person has been added. One person keeps the original plan. */
export function twoPeople(plan: MealPlan): boolean {
  return (plan.people?.length ?? 0) > 1;
}

export function mealPerson(meal: PlannedMeal, plan: MealPlan): string {
  const people = plan.people ?? [];
  if (meal.personId && people.some((person) => person.id === meal.personId)) return meal.personId;
  return people[0]?.id ?? "";
}

export function macroDayOn(plan: MealPlan, personId: string, date: string): boolean {
  return (plan.macroDays?.[personId] ?? []).includes(date);
}

export function addMeal(plans: MealPlan[], planId: string, date: string, meal: Omit<PlannedMeal, "id">): MealPlan[] {
  return plans.map((plan) => {
    if (plan.id !== planId) return plan;
    const day = plan.days[date] ?? [];
    return {
      ...plan,
      updatedAt: Date.now(),
      days: { ...plan.days, [date]: [...day, { ...meal, id: crypto.randomUUID() }] },
    };
  });
}

/** Copy chosen recipes onto the other person for the same dates. Skips a slot they already share. Fit and Hone amounts are not copied. */
export function copyPersonDays(plans: MealPlan[], planId: string, dates: string[], fromId: string, toId: string, mealIds?: readonly string[]): { plans: MealPlan[]; added: number; found: number } {
  let added = 0;
  let found = 0;
  const wanted = mealIds ? new Set(mealIds) : null;
  const next = plans.map((plan) => {
    if (plan.id !== planId || !fromId || !toId || fromId === toId) return plan;
    const days = { ...plan.days };
    let dirty = false;
    for (const date of dates) {
      const day = days[date] ?? [];
      const source = day.filter((meal) => meal.recipeUid && mealPerson(meal, plan) === fromId && (!wanted || wanted.has(meal.id)));
      found += source.length;
      const have = new Set(day.filter((meal) => meal.recipeUid && mealPerson(meal, plan) === toId).map((meal) => `${meal.slot}\0${meal.recipeUid}`));
      const additions: PlannedMeal[] = [];
      for (const meal of source) {
        const key = `${meal.slot}\0${meal.recipeUid}`;
        if (have.has(key)) continue;
        have.add(key);
        additions.push({
          ...meal,
          id: crypto.randomUUID(),
          personId: toId,
          portion: undefined,
          fitScale: undefined,
          meatTrim: undefined,
          sideName: undefined,
          sideServings: undefined,
          carbItem: undefined,
          carbScale: undefined,
          tweaks: undefined,
        });
      }
      if (!additions.length) continue;
      days[date] = [...day, ...additions];
      added += additions.length;
      dirty = true;
    }
    return dirty ? { ...plan, days, updatedAt: Date.now() } : plan;
  });
  return { plans: next, added, found };
}

export function removeMeal(plans: MealPlan[], planId: string, date: string, mealId: string): MealPlan[] {
  return plans.map((plan) => {
    if (plan.id !== planId) return plan;
    const day = (plan.days[date] ?? []).filter((meal) => meal.id !== mealId);
    return { ...plan, updatedAt: Date.now(), days: { ...plan.days, [date]: day } };
  });
}

export function setPlanRange(plans: MealPlan[], planId: string, start: string, end: string): MealPlan[] {
  const days = new Set(eachDay(start, end));
  return plans.map((plan) => {
    if (plan.id !== planId) return plan;
    const nextDays: Record<string, PlannedMeal[]> = {};
    for (const [date, meals] of Object.entries(plan.days)) {
      if (days.has(date)) nextDays[date] = meals;
    }
    const macroDays = plan.macroDays
      ? Object.fromEntries(Object.entries(plan.macroDays).map(([id, marked]) => [id, marked.filter((date) => days.has(date))]))
      : undefined;
    return { ...plan, start, end, updatedAt: Date.now(), days: nextDays, ...(plan.macroDays ? { macroDays } : {}) };
  });
}

export function newPlanId(): string {
  return `plan-${Date.now().toString(36)}`;
}
