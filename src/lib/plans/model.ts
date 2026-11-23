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
  /** Set when this meal belongs to a group row, not one person. */
  groupId?: string;
  /** This meal is a serving taken from a plan batch. The grocery list counts the batch once. */
  batchId?: string;
  /** Whole servings taken from that batch for this slot. */
  batchServings?: number;
  /** How many of those servings the batch makes. One meal serving is 1 / this of the pot. */
  batchYield?: number;
}

/** How two meals share a day, in meal order. 25/75 gives the earlier meal the smaller share. */
export type DaySplit = "50-50" | "25-75";

/** Which meal gives up calories when a snack is on the same day. */
export type SnackDraw = "lunch" | "supper";

/** Which ground beef Fit and Hone count. Either leaves the recipe's own beef. */
export type BeefChoice = "80/20" | "73/27" | "either";

/** One cook shared across the plan. Days take whole servings from it. */
export interface PlanBatch {
  id: string;
  recipeUid: string;
  title: string;
  /** Set when the batch is a saved version, such as V1. */
  versionLabel?: string;
  servings: number;
  /** Pounds of meat that count as one serving. Used only when servingOverride is empty. */
  meatLbPerServing?: number | null;
  /** Manual serving count. This wins over meatLbPerServing while it has a number. */
  servingOverride?: number | null;
}

export interface BatchDraw {
  date: string;
  slot: MealSlot;
  servings: number;
  personId?: string;
}
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
  /** Who is on each date. Missing means every plan person is on every day. */
  dayPeople?: Record<string, string[]>;
  /** Groups added as one row, by date. */
  dayGroups?: Record<string, Array<{ id: string; name: string }>>;
  /** Meal ids marked from the cook page. Cooked replaces prepped. */
  cook?: Record<string, "prepped" | "cooked">;
  /** One-cook meals. Servings are drawn onto days instead of cooking the recipe again. */
  batches?: PlanBatch[];
  /** Days inside start–end that are not part of the plan. */
  omitDates?: string[];
}

export type PlanRoute =
  | { kind: "list" }
  | { kind: "goals" }
  | { kind: "find" }
  | { kind: "edit"; planId: string; menu?: { date: string; seat: string; slot: MealSlot } }
  | { kind: "day"; planId: string; date: string }
  | { kind: "add"; planId: string; date: string; slot: MealSlot; personId?: string; menuSlot?: MealSlot }
  | { kind: "plate"; planId: string; date: string; slot: MealSlot; mealId?: string; personId?: string; back?: "plan"; savedId?: string; plateMode?: "edit" | "version" }
  | { kind: "recipe"; planId: string; date: string; slot: MealSlot; uid: string; mealId?: string; personId?: string; menuSlot?: MealSlot }
  | { kind: "shop"; planIds: string[] }
  | { kind: "restock" }
  | { kind: "groceries" }
  | { kind: "grocery"; listId: string }
  | { kind: "groceryEdit"; listId: string }
  | { kind: "history" }
  | { kind: "historyItem"; archiveId: string }
  | { kind: "historyDay"; archiveId: string; date: string }
  | { kind: "historyMeal"; archiveId: string; date: string; mealIndex: number }
  | { kind: "templates"; saveId?: string }
  | { kind: "logs" }
  | { kind: "logsPerson"; personId: string }
  | { kind: "logsEntry"; personId: string; logId: string }
  | { kind: "cook"; planId: string }
  | { kind: "batch"; planId: string; uid?: string; batchId?: string }
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

/** A person saved for the household. A plan picks from this list. */
export interface SavedPerson {
  id: string;
  name: string;
  /** How two meals share a day for this person. */
  daySplit?: DaySplit;
  /** Which meal gives up calories when a snack is on their day. */
  snackDraw?: SnackDraw;
  /** Which ground beef Fit and Hone count for this person. */
  beefChoice?: BeefChoice;
  /** Meat a new plate starts with for this person. */
  plateMeat?: string;
  /** Servings of that meat. */
  plateMeatServings?: number;
}

/** A named subset of saved people. */
export interface PersonGroup {
  id: string;
  name: string;
  personIds: string[];
}

/** Who a new plan starts with once its dates are chosen. */
export interface PlanDefaults {
  peopleOn: boolean;
  personIds: string[];
  groupIds: string[];
  /** People Tailor runs for when a day is checked and no name is tapped. Empty means everyone on that day. */
  tailorPersonIds?: string[];
  tailorGroupIds?: string[];
  /** When off, a checked day with no name still tailors everyone on that day. */
  tailorOn?: boolean;
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

/** Keep a custom name, and add the month/day it was made when the name has no date yet. */
export function datedName(name: string, key: string): string {
  const date = parseKey(key);
  const stamp = `${date.getMonth() + 1}/${date.getDate()}`;
  const trimmed = name.trim();
  if (!trimmed) return stamp;
  if (/\b\d{1,2}\/\d{1,2}\b/.test(trimmed)) return trimmed;
  return `${trimmed} ${stamp}`;
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
  if (rest === "restock") return { kind: "restock" };
  if (rest === "history") return { kind: "history" };
  if (rest === "templates") return { kind: "templates" };
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
  if (planId === "templates" && parts[1] === "save" && parts[2]) return { kind: "templates", saveId: parts.slice(2).join("/") };
  if (planId === "templates") return { kind: "templates" };
  if (!planId) return { kind: "list" };
  if (parts[1] === "cook") return { kind: "cook", planId };
  if (parts[1] === "batch" && parts[2] === "recipe" && parts[3]) return { kind: "batch", planId, uid: parts.slice(3).join("/") };
  if (parts[1] === "batch" && parts[2] === "saved" && parts[3]) return { kind: "batch", planId, batchId: parts[3] };
  if (parts[1] === "batch") return { kind: "batch", planId };
  if (parts[1] === "prep") return { kind: "prep", planId, mealIds: (parts[2] ?? "").split(",").filter(Boolean) };
  if (parts[1] === "cooking") return { kind: "cooking", planId, mealIds: (parts[2] ?? "").split(",").filter(Boolean) };
  if (parts[1] === "pick" && parts[2] && parts[3] && isMealSlot(parts[4])) return { kind: "edit", planId, menu: { date: parts[2], seat: decodeURIComponent(parts[3]), slot: parts[4] } };
  let personId: string | undefined;
  let back: "plan" | undefined;
  if (parts.length >= 2 && parts[parts.length - 1] === "plan" && parts[parts.length - 2] === "back") {
    back = "plan";
    parts = parts.slice(0, -2);
  }
  if (parts.length >= 3 && parts[parts.length - 2] === "for" && parts[parts.length - 1]) {
    personId = parts[parts.length - 1];
    parts = parts.slice(0, -2);
  }
  const date = parts[1];
  if (!date) return { kind: "edit", planId };
  if (parts[2] !== "add" || !parts[3] || !isMealSlot(parts[3])) return { kind: "day", planId, date };
  const slot = parts[3];
  if (parts[4] === "plate" && parts[5] === "saved" && parts[6]) {
    const plateMode = parts[7] === "edit" ? "edit" : parts[7] === "version" ? "version" : undefined;
    return { kind: "plate", planId, date, slot, savedId: parts[6], ...(plateMode ? { plateMode } : {}), personId, ...(back ? { back } : {}) };
  }
  if (parts[4] === "plate") return { kind: "plate", planId, date, slot, mealId: parts[5], personId, ...(back ? { back } : {}) };
  if (parts[4] === "menu" && isMealSlot(parts[5])) return { kind: "add", planId, date, slot, personId, menuSlot: parts[5] };
  if (parts[4] === "recipe" && parts[5]) {
    let menuSlot: MealSlot | undefined;
    let rest = parts;
    if (rest.length >= 2 && rest[rest.length - 2] === "menu" && isMealSlot(rest[rest.length - 1])) {
      const picked = rest[rest.length - 1];
      if (isMealSlot(picked)) menuSlot = picked;
      rest = rest.slice(0, -2);
    }
    if (rest[6] === "meal" && rest[7]) return { kind: "recipe", planId, date, slot, uid: rest[5], mealId: rest[7], personId, ...(menuSlot ? { menuSlot } : {}) };
    return { kind: "recipe", planId, date, slot, uid: rest.slice(5).join("/"), personId, ...(menuSlot ? { menuSlot } : {}) };
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
  if (route.kind === "restock") return "#/plan/restock";
  if (route.kind === "history") return "#/plan/history";
  if (route.kind === "templates") return route.saveId ? `#/plan/templates/save/${encodeURIComponent(route.saveId)}` : "#/plan/templates";
  if (route.kind === "logs") return "#/plan/logs";
  if (route.kind === "logsPerson") return `#/plan/logs/${encodeURIComponent(route.personId)}`;
  if (route.kind === "logsEntry") return `#/plan/logs/${encodeURIComponent(route.personId)}/${encodeURIComponent(route.logId)}`;
  if (route.kind === "cook") return `#/plan/${encodeURIComponent(route.planId)}/cook`;
  if (route.kind === "batch" && route.uid) return `#/plan/${encodeURIComponent(route.planId)}/batch/recipe/${encodeURIComponent(route.uid)}`;
  if (route.kind === "batch" && route.batchId) return `#/plan/${encodeURIComponent(route.planId)}/batch/saved/${encodeURIComponent(route.batchId)}`;
  if (route.kind === "batch") return `#/plan/${encodeURIComponent(route.planId)}/batch`;
  if (route.kind === "prep") return `#/plan/${encodeURIComponent(route.planId)}/prep/${route.mealIds.map((id) => encodeURIComponent(id)).join(",")}`;
  if (route.kind === "cooking") return `#/plan/${encodeURIComponent(route.planId)}/cooking/${route.mealIds.map((id) => encodeURIComponent(id)).join(",")}`;
  if (route.kind === "historyItem") return `#/plan/history/${encodeURIComponent(route.archiveId)}`;
  if (route.kind === "historyDay") return `#/plan/history/${encodeURIComponent(route.archiveId)}/${route.date}`;
  if (route.kind === "historyMeal") return `#/plan/history/${encodeURIComponent(route.archiveId)}/${route.date}/${route.mealIndex}`;
  if (route.kind === "edit") return route.menu ? `#/plan/${encodeURIComponent(route.planId)}/pick/${route.menu.date}/${encodeURIComponent(route.menu.seat)}/${route.menu.slot}` : `#/plan/${encodeURIComponent(route.planId)}`;
  if (route.kind === "day") return `#/plan/${encodeURIComponent(route.planId)}/${route.date}`;
  const person = route.personId ? `/for/${encodeURIComponent(route.personId)}` : "";
  if (route.kind === "add") return `#/plan/${encodeURIComponent(route.planId)}/${route.date}/add/${route.slot}${route.menuSlot ? `/menu/${route.menuSlot}` : ""}${person}`;
  if (route.kind === "plate") {
    const saved = route.savedId ? `/saved/${encodeURIComponent(route.savedId)}${route.plateMode ? `/${route.plateMode}` : ""}` : "";
    const meal = !route.savedId && route.mealId ? `/${encodeURIComponent(route.mealId)}` : "";
    return `#/plan/${encodeURIComponent(route.planId)}/${route.date}/add/${route.slot}/plate${saved || meal}${person}${route.back === "plan" ? "/back/plan" : ""}`;
  }
  const meal = route.mealId ? `/meal/${encodeURIComponent(route.mealId)}` : "";
  const menuBit = route.menuSlot ? `/menu/${route.menuSlot}` : "";
  return `#/plan/${encodeURIComponent(route.planId)}/${route.date}/add/${route.slot}/recipe/${encodeURIComponent(route.uid)}${meal}${menuBit}${person}`;
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

/** Days actually on the plan. A hole in the range stays in `omitDates` and is skipped. */
export function planDates(plan: { start: string; end: string; omitDates?: string[] }): string[] {
  const skip = new Set(plan.omitDates ?? []);
  return eachDay(plan.start, plan.end).filter((date) => !skip.has(date));
}

export function setPlanDates(plans: MealPlan[], planId: string, dates: string[]): MealPlan[] {
  const unique = [...new Set(dates)].filter(isDayKey).sort();
  return plans.map((plan) => {
    if (plan.id !== planId) return plan;
    const keep = new Set(unique);
    const days = { ...plan.days };
    const dropped = new Set<string>();
    for (const date of Object.keys(days)) {
      if (keep.has(date)) continue;
      for (const meal of days[date] ?? []) dropped.add(meal.id);
      delete days[date];
    }
    const cook = plan.cook ? Object.fromEntries(Object.entries(plan.cook).filter(([id]) => !dropped.has(id))) : plan.cook;
    const dayPeople = plan.dayPeople ? Object.fromEntries(Object.entries(plan.dayPeople).filter(([date]) => keep.has(date))) : plan.dayPeople;
    const dayGroups = plan.dayGroups ? Object.fromEntries(Object.entries(plan.dayGroups).filter(([date]) => keep.has(date))) : plan.dayGroups;
    const macroDays = plan.macroDays
      ? Object.fromEntries(Object.entries(plan.macroDays).map(([id, marked]) => [id, marked.filter((date) => keep.has(date))]))
      : plan.macroDays;
    if (!unique.length) {
      return { ...plan, start: "", end: "", omitDates: undefined, days, cook, ...(dayPeople ? { dayPeople } : {}), ...(dayGroups ? { dayGroups } : {}), ...(macroDays ? { macroDays } : {}), updatedAt: Date.now() };
    }
    const start = unique[0] ?? "";
    const end = unique[unique.length - 1] ?? "";
    const omitDates = eachDay(start, end).filter((date) => !keep.has(date));
    return { ...plan, start, end, omitDates: omitDates.length ? omitDates : undefined, days, cook, ...(dayPeople ? { dayPeople } : {}), ...(dayGroups ? { dayGroups } : {}), ...(macroDays ? { macroDays } : {}), updatedAt: Date.now() };
  });
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
  const meals = newestPlates(plan?.days[date] ?? []);
  const slotted = slot ? meals.filter((meal) => meal.slot === slot) : meals;
  if (!personId || !plan) return slotted;
  const own = slotted.filter((meal) => !meal.groupId);
  if (!twoPeople(plan)) return own;
  return own.filter((meal) => mealPerson(meal, plan) === personId);
}

/** A newer plate with the same name in the same slot replaces the older one. */
function newestPlates(meals: PlannedMeal[]): PlannedMeal[] {
  const seen = new Set<string>();
  const kept: PlannedMeal[] = [];
  for (let index = meals.length - 1; index >= 0; index -= 1) {
    const meal = meals[index];
    if (!meal?.plate) {
      kept.push(meal);
      continue;
    }
    const key = `${meal.slot}|${meal.personId ?? ""}|${meal.groupId ?? ""}|${meal.title.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(meal);
  }
  return kept.reverse();
}

export function mealsForGroup(plan: MealPlan | undefined, date: string, groupId: string, slot?: MealSlot): PlannedMeal[] {
  const meals = plan?.days[date] ?? [];
  return meals.filter((meal) => meal.groupId === groupId && (!slot || meal.slot === slot));
}

/** True only when a second person has been added. One person keeps the original plan. */
export function peopleForDay(plan: MealPlan, date: string): PlanPerson[] {
  const roster = plan.people ?? [];
  if (!plan.dayPeople) return roster;
  const ids = new Set(plan.dayPeople[date] ?? []);
  return roster.filter((person) => ids.has(person.id));
}

export function addPeopleOnDays(plan: MealPlan, dates: string[], additions: PlanPerson[], onlyMissing = false): MealPlan {
  if (!dates.length || !additions.length) return plan;
  const people = [...(plan.people ?? [])];
  for (const person of additions) {
    const index = people.findIndex((item) => item.id === person.id);
    if (index === -1) people.push(person);
    else people[index] = { ...people[index], name: person.name, goalName: person.goalName || people[index]?.goalName || "" };
  }
  const range = eachDay(plan.start, plan.end);
  const dayPeople: Record<string, string[]> = plan.dayPeople ? { ...plan.dayPeople } : Object.fromEntries(range.map((date) => [date, (plan.people ?? []).map((person) => person.id)]));
  for (const date of dates) {
    if (!range.includes(date)) continue;
    const have = new Set(dayPeople[date] ?? []);
    const incoming = onlyMissing ? additions.filter((person) => !have.has(person.id)) : additions;
    if (!incoming.length) continue;
    dayPeople[date] = [...have, ...incoming.map((person) => person.id)];
  }
  const macroDays = { ...(plan.macroDays ?? {}) };
  for (const person of additions) {
    const marked = dates.filter((date) => (dayPeople[date] ?? []).includes(person.id));
    macroDays[person.id] = [...new Set([...(macroDays[person.id] ?? []), ...marked])];
  }
  return { ...plan, people, dayPeople, macroDays, updatedAt: Date.now() };
}

export function dropDaySeat(plan: MealPlan, date: string, seat: { kind: "person" | "group"; id: string }): MealPlan {
  const meals = (plan.days[date] ?? []).filter((meal) => (seat.kind === "group" ? meal.groupId !== seat.id : meal.personId !== seat.id));
  const dayPeople = plan.dayPeople
    ? { ...plan.dayPeople, [date]: (plan.dayPeople[date] ?? []).filter((id) => seat.kind !== "person" || id !== seat.id) }
    : plan.dayPeople;
  const dayGroups = plan.dayGroups
    ? { ...plan.dayGroups, [date]: (plan.dayGroups[date] ?? []).filter((group) => seat.kind !== "group" || group.id !== seat.id) }
    : plan.dayGroups;
  const macroDays = seat.kind === "person" && plan.macroDays?.[seat.id]
    ? { ...plan.macroDays, [seat.id]: plan.macroDays[seat.id].filter((item) => item !== date) }
    : plan.macroDays;
  return { ...plan, days: { ...plan.days, [date]: meals }, ...(dayPeople ? { dayPeople } : {}), ...(dayGroups ? { dayGroups } : {}), ...(macroDays ? { macroDays } : {}), updatedAt: Date.now() };
}

export function addGroupsOnDays(plan: MealPlan, dates: string[], groups: Array<{ id: string; name: string }>, onlyMissing = false): MealPlan {
  if (!dates.length || !groups.length) return plan;
  const range = eachDay(plan.start, plan.end);
  const dayGroups: Record<string, Array<{ id: string; name: string }>> = { ...(plan.dayGroups ?? {}) };
  for (const date of dates) {
    if (!range.includes(date)) continue;
    const have = dayGroups[date] ?? [];
    const incoming = onlyMissing ? groups.filter((group) => !have.some((item) => item.id === group.id)) : groups;
    if (!incoming.length) continue;
    const next = [...have];
    for (const group of incoming) {
      const index = next.findIndex((item) => item.id === group.id);
      if (index === -1) next.push(group);
      else next[index] = group;
    }
    dayGroups[date] = next;
  }
  return { ...plan, dayGroups, updatedAt: Date.now() };
}

export function applyPlanDefaults(plan: MealPlan, defaults: PlanDefaults, people: PlanPerson[], groups: Array<{ id: string; name: string }>, dates = planDates(plan)): MealPlan {
  if (!defaults.peopleOn || !dates.length) return plan;
  const wanted = new Set(defaults.personIds);
  const additions = people.filter((person) => wanted.has(person.id));
  const grouped = new Set(defaults.groupIds);
  const seats = groups.filter((group) => grouped.has(group.id));
  const withPeople = additions.length ? addPeopleOnDays(plan, dates, additions, true) : plan;
  return seats.length ? addGroupsOnDays(withPeople, dates, seats, true) : withPeople;
}

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

export interface ChipTarget {
  date: string;
  slot: MealSlot;
  personId?: string;
  groupId?: string;
}

export interface DayCopyTarget {
  date: string;
  planId: string;
}

/** Other saved plans that already include this calendar day. */
export function plansOnDate(plans: MealPlan[], date: string, exceptId?: string): MealPlan[] {
  return plans.filter((plan) => plan.id !== exceptId && plan.saved && plan.start && planDates(plan).includes(date));
}

function dishCopy(meal: PlannedMeal, slot: MealSlot, seat: { personId?: string; groupId?: string }): PlannedMeal {
  return {
    ...meal,
    id: crypto.randomUUID(),
    slot,
    personId: seat.groupId ? undefined : seat.personId,
    groupId: seat.groupId,
    portion: meal.batchId ? meal.portion : undefined,
    fitScale: undefined,
    meatTrim: undefined,
    sideName: undefined,
    sideServings: undefined,
    carbItem: undefined,
    carbScale: undefined,
    tweaks: undefined,
  };
}

/** Put one meal onto other chips in the same plan. Tailor amounts are left off so that day can be tailored on its own. */
export function copyMealToChips(plans: MealPlan[], planId: string, mealId: string, targets: ChipTarget[]): { plans: MealPlan[]; added: number } {
  let added = 0;
  const next = plans.map((plan) => {
    if (plan.id !== planId || !targets.length) return plan;
    let source: PlannedMeal | undefined;
    for (const meals of Object.values(plan.days)) {
      source = meals.find((meal) => meal.id === mealId);
      if (source) break;
    }
    if (!source) return plan;
    const days = { ...plan.days };
    for (const target of targets) {
      if (!isDayKey(target.date)) continue;
      const seat = { personId: target.personId, groupId: target.groupId };
      days[target.date] = [...(days[target.date] ?? []), dishCopy(source, target.slot, seat)];
      added += 1;
    }
    return added ? { ...plan, days, updatedAt: Date.now() } : plan;
  });
  return { plans: next, added };
}

function seatIds(plan: MealPlan, date: string): string[] {
  if (plan.dayPeople) return plan.dayPeople[date] ?? [];
  return (plan.people ?? []).map((person) => person.id);
}

/** Copy whole days onto the paired dates. A date missing from the destination plan is added. Meals already on that day are replaced. */
export function copyDaysOnto(plans: MealPlan[], fromPlanId: string, pairs: Array<{ from: string; to: DayCopyTarget }>): { plans: MealPlan[]; copied: number } {
  const source = plans.find((plan) => plan.id === fromPlanId);
  if (!source || !pairs.length) return { plans, copied: 0 };
  const grouped = new Map<string, Array<{ from: string; date: string }>>();
  for (const pair of pairs) {
    if (!isDayKey(pair.to.date)) continue;
    const list = grouped.get(pair.to.planId) ?? [];
    list.push({ from: pair.from, date: pair.to.date });
    grouped.set(pair.to.planId, list);
  }
  let next = plans;
  let copied = 0;
  for (const [planId, list] of grouped) {
    const plan = next.find((item) => item.id === planId);
    if (!plan?.start) continue;
    const have = new Set(planDates(plan));
    const extra = list.map((item) => item.date).filter((date) => !have.has(date));
    if (extra.length) next = setPlanDates(next, planId, [...have, ...extra]);
    next = next.map((item) => {
      if (item.id !== planId) return item;
      const days = { ...item.days };
      const dayPeople = item.dayPeople ? { ...item.dayPeople } : undefined;
      const dayGroups = item.dayGroups ? { ...item.dayGroups } : undefined;
      const cook = { ...(item.cook ?? {}) };
      const incomingPeople: PlanPerson[] = [];
      for (const pair of list) {
        for (const meal of days[pair.date] ?? []) delete cook[meal.id];
        days[pair.date] = (source.days[pair.from] ?? []).map((meal) => ({ ...meal, id: crypto.randomUUID() }));
        for (const id of seatIds(source, pair.from)) {
          const person = (source.people ?? []).find((row) => row.id === id);
          if (person && !incomingPeople.some((row) => row.id === person.id)) incomingPeople.push(person);
        }
        if (dayPeople) dayPeople[pair.date] = [...seatIds(source, pair.from)];
        if (dayGroups) dayGroups[pair.date] = [...(source.dayGroups?.[pair.from] ?? [])];
        copied += 1;
      }
      let current: MealPlan = { ...item, days, cook, ...(dayPeople ? { dayPeople } : {}), ...(dayGroups ? { dayGroups } : {}), updatedAt: Date.now() };
      const missing = incomingPeople.filter((person) => !(current.people ?? []).some((row) => row.id === person.id));
      if (item.dayPeople && missing.length) current = addPeopleOnDays(current, list.map((pair) => pair.date), missing);
      else if (item.dayPeople && incomingPeople.length) {
        const seats = { ...(current.dayPeople ?? {}) };
        for (const pair of list) seats[pair.date] = [...new Set([...(seats[pair.date] ?? []), ...seatIds(source, pair.from)])];
        current = { ...current, dayPeople: seats };
      }
      return current;
    });
  }
  return { plans: next, copied };
}

export function setPlanRange(plans: MealPlan[], planId: string, start: string, end: string): MealPlan[] {
  return plans.map((plan) => (plan.id === planId ? { ...plan, start, end, updatedAt: Date.now() } : plan));
}

export function newPlanId(): string {
  return `plan-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 4)}`;
}

/** A new plan. Source days land on the paired dates. Other days in `rangeDates` stay empty. */
export function planFromCopy(plan: MealPlan, rangeDates: string[], pairs: Array<{ from: string; to: string }>): MealPlan {
  const unique = [...new Set(rangeDates)].filter(isDayKey).sort();
  const batchIds = new Map<string, string>();
  const batches = (plan.batches ?? []).map((batch) => {
    const id = crypto.randomUUID();
    batchIds.set(batch.id, id);
    return { ...batch, id };
  });
  const mealIds = new Map<string, string>();
  const days: MealPlan["days"] = {};
  for (const date of unique) days[date] = [];
  const copyMeals = (meals: PlannedMeal[]) =>
    meals.map((meal) => {
      const id = crypto.randomUUID();
      mealIds.set(meal.id, id);
      return { ...meal, id, batchId: meal.batchId ? (batchIds.get(meal.batchId) ?? meal.batchId) : meal.batchId };
    });
  for (const pair of pairs) {
    if (!days[pair.to]) continue;
    days[pair.to] = copyMeals(plan.days[pair.from] ?? []);
  }
  const everyone = (plan.people ?? []).map((person) => person.id);
  const dayPeople = plan.dayPeople ? Object.fromEntries(unique.map((date) => [date, [...everyone]])) : undefined;
  const dayGroups = plan.dayGroups ? Object.fromEntries(unique.map((date) => [date, [] as Array<{ id: string; name: string }>])) : undefined;
  if (dayPeople) {
    for (const pair of pairs) dayPeople[pair.to] = [...(plan.dayPeople?.[pair.from] ?? everyone)];
  }
  if (dayGroups) {
    for (const pair of pairs) dayGroups[pair.to] = [...(plan.dayGroups?.[pair.from] ?? [])];
  }
  const macroDays = plan.macroDays
    ? Object.fromEntries(
        Object.entries(plan.macroDays).map(([id, dates]) => [id, pairs.filter((pair) => dates.includes(pair.from)).map((pair) => pair.to)]),
      )
    : undefined;
  const cook: NonNullable<MealPlan["cook"]> = {};
  for (const [id, status] of Object.entries(plan.cook ?? {})) {
    const next = mealIds.get(id);
    if (next) cook[next] = status;
  }
  const start = unique[0] ?? "";
  const end = unique[unique.length - 1] ?? "";
  const keep = new Set(unique);
  const omitDates = start && end ? eachDay(start, end).filter((date) => !keep.has(date)) : [];
  return {
    ...plan,
    id: newPlanId(),
    saved: true,
    updatedAt: Date.now(),
    start,
    end,
    omitDates: omitDates.length ? omitDates : undefined,
    days,
    batches: batches.length ? batches : undefined,
    ...(dayPeople ? { dayPeople } : {}),
    ...(dayGroups ? { dayGroups } : {}),
    ...(macroDays ? { macroDays } : {}),
    cook: Object.keys(cook).length ? cook : undefined,
  };
}

/** A named copy of a plan, kept off the active list. */
export interface PlanTemplate {
  id: string;
  name: string;
  savedAt: number;
  plan: MealPlan;
}

/** Drop the archived plan's meals onto days that already exist. Those days are replaced. */
export function copyIntoPlan(plans: MealPlan[], targetId: string, source: MealPlan, pairs: Array<{ from: string; to: string }>): MealPlan[] {
  return plans.map((plan) => {
    if (plan.id !== targetId) return plan;
    const allowed = new Set(planDates(plan));
    const used = new Set<string>();
    for (const pair of pairs) {
      if (!allowed.has(pair.to)) continue;
      for (const meal of source.days[pair.from] ?? []) if (meal.batchId) used.add(meal.batchId);
    }
    const batchIds = new Map<string, string>();
    const batches = [...(plan.batches ?? [])];
    for (const batch of source.batches ?? []) {
      if (!used.has(batch.id)) continue;
      const id = crypto.randomUUID();
      batchIds.set(batch.id, id);
      batches.push({ ...batch, id });
    }
    const days = { ...plan.days };
    const cook = { ...(plan.cook ?? {}) };
    const mealIds = new Map<string, string>();
    const landed: string[] = [];
    for (const pair of pairs) {
      if (!allowed.has(pair.to)) continue;
      for (const meal of days[pair.to] ?? []) delete cook[meal.id];
      days[pair.to] = (source.days[pair.from] ?? []).map((meal) => {
        const id = crypto.randomUUID();
        mealIds.set(meal.id, id);
        return { ...meal, id, batchId: meal.batchId ? (batchIds.get(meal.batchId) ?? meal.batchId) : meal.batchId };
      });
      landed.push(pair.to);
    }
    for (const [id, status] of Object.entries(source.cook ?? {})) {
      const next = mealIds.get(id);
      if (next) cook[next] = status;
    }
    let current: MealPlan = { ...plan, days, batches: batches.length ? batches : plan.batches, cook, updatedAt: Date.now() };
    const incoming: PlanPerson[] = [];
    for (const pair of pairs) {
      if (!allowed.has(pair.to)) continue;
      const ids = source.dayPeople?.[pair.from] ?? (source.people ?? []).map((person) => person.id);
      for (const id of ids) {
        const person = (source.people ?? []).find((item) => item.id === id);
        if (person && !incoming.some((item) => item.id === person.id)) incoming.push(person);
      }
    }
    if (incoming.length && landed.length) current = addPeopleOnDays(current, landed, incoming);
    if (source.dayGroups && landed.length) {
      const dayGroups = { ...(current.dayGroups ?? {}) };
      for (const pair of pairs) {
        if (!allowed.has(pair.to)) continue;
        const groups = source.dayGroups[pair.from] ?? [];
        if (!groups.length) continue;
        const next = [...(dayGroups[pair.to] ?? [])];
        for (const group of groups) {
          if (!next.some((item) => item.id === group.id)) next.push(group);
        }
        dayGroups[pair.to] = next;
      }
      current = { ...current, dayGroups };
    }
    return current;
  });
}
export function swapPlanDays(plans: MealPlan[], planId: string, a: string, b: string): MealPlan[] {
  if (!a || !b || a === b) return plans;
  return plans.map((plan) => {
    if (plan.id !== planId) return plan;
    const days = { ...plan.days };
    const left = days[a] ?? [];
    days[a] = days[b] ?? [];
    days[b] = left;
    const swapAt = <T,>(record: Record<string, T> | undefined): Record<string, T> | undefined => {
      if (!record) return record;
      const next = { ...record };
      const hold = next[a];
      if (next[b] === undefined) delete next[a];
      else next[a] = next[b];
      if (hold === undefined) delete next[b];
      else next[b] = hold;
      return next;
    };
    const macroDays = plan.macroDays
      ? Object.fromEntries(
          Object.entries(plan.macroDays).map(([id, dates]) => {
            const hasA = dates.includes(a);
            const hasB = dates.includes(b);
            if (hasA === hasB) return [id, dates];
            return [id, dates.map((date) => (date === a ? b : date === b ? a : date))];
          }),
        )
      : plan.macroDays;
    return { ...plan, days, dayPeople: swapAt(plan.dayPeople), dayGroups: swapAt(plan.dayGroups), ...(macroDays ? { macroDays } : {}), updatedAt: Date.now() };
  });
}
