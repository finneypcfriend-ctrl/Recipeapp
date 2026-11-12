import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Plus, Star, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccountBar, useHouseholdEmail, useHouseholdName } from "@/components/plans/account";
import { CookBoard, CookingPage, PrepPage } from "@/components/plans/cook";
import { PlatePage } from "@/components/plans/plate";
import { loadToppings, restorePlate, servingsFromRaw } from "@/lib/plans/toppings";
import { FindMacros } from "@/components/plans/find";
import { AddPersonButton, PersonSelect, useSavedPeople } from "@/components/plans/people";
import { CLOUD_EVENT, archiveHistory, renameHousehold, saveHistory, watchHistory } from "@/lib/cloud/sync";
import { snapshotPlan, type HistoryEntry, type HistoryMeal } from "@/lib/plans/history";
import { type MacroLog, addLoggedMacros, logWeeks, parseLoggedMacros, scaleTargets } from "@/lib/plans/logs";
import { readMacroGoals, readMacroLogs, readSavedMacroGoals, writeMacroLogs, writeSavedMacroGoal, writeSavedMacroGoals, writeSavedPeople } from "@/lib/recipes/idb";
import { describeUse } from "@/lib/plans/grocery";
import { GroceryDetail, GroceryIndex, ShopCheckout } from "@/components/plans/grocery";
import { RecipeArt } from "@/components/recipes/art";
import { CatalogFilterChips } from "@/components/recipes/filter-chips";
import {
  EMPTY_GOALS,
  SLOT_LABEL,
  SLOT_ORDER,
  caloriesFromGrams,
  defaultMacroName,
  eachDay,
  formatDay,
  formatRange,
  gramsFromSplit,
  goalForPlanPerson,
  goalTargets,
  mealsFor,
  macroDayOn,
  parseKey,
  planHash,
  planStatus,
  todayKey,
  twoPeople,
  shiftDay,
  type BeefChoice,
  type DaySplit,
  type GoalTargets,
  type MacroGoals,
  type MacroMode,
  type MealPlan,
  type MealSlot,
  type PlanPerson,
  type PlanRoute,
  type PlannedMeal,
  type SavedMacroGoal,
  type SnackDraw,
} from "@/lib/plans/model";
import { MEAT_ORDER, meatLabel } from "@/lib/recipes/classify";
import { countFacets, filterCatalog } from "@/lib/recipes/filter";
import { formatCount } from "@/lib/recipes/format";
import { DEFAULT_FILTERS, activeFilterCount } from "@/lib/recipes/prefs";
import { loadSupplements, saveSupplements, type SupplementItem } from "@/lib/plans/supplements";
import { getIngredient, searchIngredients } from "@/lib/sourced";
import { formatGoalLine, formatGoalPercents, formatMealLine, formatSide, mealScale, planMealMath, recipeFromLines, sumPlanMeals, usedIngredientLines, usedLibraryServings } from "@/lib/sourced/meal";
import type { Recipe, FilterState, SlimRecipe, SortKey } from "@/lib/recipes/types";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function Planner({
  route,
  plans,
  recipes,
  recipeByUid,
  versionsByBase,
  onOpen,
  onCreate,
  onRange,
  onSave,
  onRemovePlan,
  onRemoveMeal,
  onCopyPersonDays,
  onNotify,
  onPick,
  onTailorDays,
  onFitPrefs,
  onBeefChoice,
  onSavePlate,
  onPeople,
  onMacroDay,
  onLogDays,
  onMarkCook,
}: {
  route: PlanRoute;
  plans: MealPlan[];
  recipes: SlimRecipe[];
  recipeByUid: ReadonlyMap<string, Recipe>;
  versionsByBase: Map<string, SlimRecipe[]>;
  onOpen: (route: PlanRoute) => void;
  onCreate: () => void;
  onRange: (planId: string, start: string, end: string) => void;
  onSave: (planId: string) => void;
  onRemovePlan: (planId: string) => void;
  onRemoveMeal: (planId: string, date: string, mealId: string) => void;
  onCopyPersonDays: (planId: string, dates: string[], fromId: string, toId: string, mealIds: string[]) => void;
  onNotify: (message: string) => void;
  onPick: (recipe: SlimRecipe) => void;
  onTailorDays: (dates: string[]) => Promise<string>;
  onFitPrefs: (planId: string, split: DaySplit, snackFrom: SnackDraw) => void;
  onBeefChoice: (planId: string, choice: BeefChoice) => void;
  onSavePlate: (meal: { title: string; lines: Array<{ name: string; servings: number }>; draft: NonNullable<MealPlan["days"][string][number]["plate"]> }) => Promise<void>;
  onPeople: (planId: string, people: PlanPerson[] | null) => void;
  onMacroDay: (planId: string, personId: string, date: string, on: boolean) => void;
  onLogDays: (dates: string[]) => Promise<string>;
  onMarkCook: (planId: string, mealIds: string[], status: "prepped" | "cooked") => void;
}) {
  const email = useHouseholdEmail();
  const targets = useGoalTargets(route.kind);
  if (email === undefined) {
    return (
      <Shell title="Sign in" onBack={() => { window.location.hash = ""; }}>
        <p className="text-sm text-muted">Checking the household sign-in…</p>
      </Shell>
    );
  }
  if (!email) {
    return (
      <Shell title="Sign in" onBack={() => { window.location.hash = ""; }}>
        <AccountBar />
      </Shell>
    );
  }
  if (route.kind === "list") {
    return <PlanList plans={plans} recipeByUid={recipeByUid} onOpen={onOpen} onCreate={onCreate} onRemovePlan={onRemovePlan} onNotify={onNotify} />;
  }
  if (route.kind === "history" || route.kind === "historyItem" || route.kind === "historyDay" || route.kind === "historyMeal") {
    return <HistoryPage route={route} onOpen={onOpen} />;
  }
  if (route.kind === "logs" || route.kind === "logsPerson" || route.kind === "logsEntry") {
    return <LogsPage route={route} onOpen={onOpen} onCreate={onCreate} />;
  }
  if (route.kind === "goals") {
    return <GoalsHome onOpen={onOpen} onNotify={onNotify} />;
  }
  if (route.kind === "find") {
    return <FindMacros onOpen={onOpen} onNotify={onNotify} />;
  }
  if (route.kind === "groceries") {
    return (
      <Shell title="Grocery lists" onBack={() => onOpen({ kind: "list" })}>
        <GroceryIndex onOpen={onOpen} />
      </Shell>
    );
  }
  if (route.kind === "shop") {
    return (
      <Shell title="Grocery list" onBack={() => onOpen({ kind: "list" })}>
        <ShopCheckout plans={plans} planIds={route.planIds} catalog={recipeByUid} onOpen={onOpen} onNotify={onNotify} />
      </Shell>
    );
  }
  if (route.kind === "grocery" || route.kind === "groceryEdit") {
    const editing = route.kind === "groceryEdit";
    return (
      <Shell title={editing ? "Review grocery list" : "Grocery list"} onBack={() => onOpen(editing ? { kind: "grocery", listId: route.listId } : { kind: "groceries" })}>
        <GroceryDetail listId={route.listId} editing={editing} plans={plans} catalog={recipeByUid} onOpen={onOpen} onNotify={onNotify} />
      </Shell>
    );
  }
  const plan = plans.find((item) => item.id === route.planId);
  if (!plan) {
    return (
      <Shell title="Plan" onBack={() => onOpen({ kind: "list" })}>
        <p className="text-sm text-muted">That plan is no longer saved.</p>
      </Shell>
    );
  }
  if (route.kind === "cook") {
    return (
      <Shell title="Cook" onBack={() => onOpen({ kind: "list" })}>
        <CookBoard plan={plan} onOpen={onOpen} />
      </Shell>
    );
  }
  if (route.kind === "prep") {
    return (
      <Shell title="Prep to cook" onBack={() => onOpen({ kind: "cook", planId: plan.id })}>
        <PrepPage
          plan={plan}
          mealIds={route.mealIds}
          catalog={recipeByUid}
          onCook={() => onOpen({ kind: "cooking", planId: plan.id, mealIds: route.mealIds })}
          onPrepped={() => {
            onMarkCook(plan.id, route.mealIds, "prepped");
            onNotify("Marked those meals prepped.");
            onOpen({ kind: "cook", planId: plan.id });
          }}
        />
      </Shell>
    );
  }
  if (route.kind === "cooking") {
    return (
      <Shell title="Cook" onBack={() => onOpen({ kind: "cook", planId: plan.id })}>
        <CookingPage
          plan={plan}
          mealIds={route.mealIds}
          catalog={recipeByUid}
          onMark={(ids) => {
            onMarkCook(plan.id, ids, "cooked");
            onNotify("Marked those meals cooked.");
            onOpen({ kind: "cook", planId: plan.id });
          }}
        />
      </Shell>
    );
  }
  if (route.kind === "edit") {
    return <RangePage plan={plan} recipes={recipes} recipeByUid={recipeByUid} targets={targets} onOpen={onOpen} onRange={onRange} onSave={onSave} onNotify={onNotify} onTailorDays={onTailorDays} onFitPrefs={onFitPrefs} onBeefChoice={onBeefChoice} onPeople={onPeople} onMacroDay={onMacroDay} onCopyPersonDays={onCopyPersonDays} onLogDays={onLogDays} />;
  }
  if (route.kind === "day") {
    return <DayPage plan={plan} date={route.date} recipeByUid={recipeByUid} targets={targets} onOpen={onOpen} onRemoveMeal={onRemoveMeal} onNotify={onNotify} onMacroDay={onMacroDay} onCopyPersonDays={onCopyPersonDays} onLogDays={onLogDays} />;
  }
  if (route.kind === "add" || route.kind === "recipe") {
    return <AddPage plan={plan} date={route.date} slot={route.slot} personId={route.personId} recipes={recipes} versionsByBase={versionsByBase} onOpen={onOpen} onPick={onPick} />;
  }
  if (route.kind === "plate") {
    const meal = route.mealId ? (plan.days[route.date] ?? []).find((item) => item.id === route.mealId) : undefined;
    const recipe = meal ? recipeByUid.get(meal.recipeUid) : undefined;
    const initial = meal?.plate ?? (recipe ? draftFromRecipe(recipe) : undefined);
    return <PlatePage plan={plan} date={route.date} slot={route.slot} initial={initial} initialTitle={meal?.title} onOpen={onOpen} onSave={onSavePlate} />;
  }
  return null;
}

function useGoalTargets(routeKind: string): GoalTargets | null | undefined {
  const [targets, setTargets] = useState<GoalTargets | null | undefined>(undefined);
  useEffect(() => {
    let cancel = false;
    readMacroGoals()
      .then((saved) => {
        if (!cancel) setTargets(goalTargets(saved));
      })
      .catch(() => {
        if (!cancel) setTargets(null);
      });
    return () => {
      cancel = true;
    };
  }, [routeKind]);
  return targets;
}

function Shell({ title, onBack, children, footer, onRename, action }: { title: string; onBack: () => void; children: ReactNode; footer?: ReactNode; onRename?: (name: string) => void; action?: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  useEffect(() => setDraft(title), [title]);
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/90 px-2 py-2 backdrop-blur">
          <button type="button" onClick={onBack} className="inline-flex h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold">
            <ArrowLeft className="size-4" />
            Back
          </button>
          {onRename && editing ? (
            <input
              autoFocus
              aria-label="Household name"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                setEditing(false);
                const next = draft.trim() || "Household";
                if (next !== title) onRename(next);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className="min-w-0 flex-1 truncate bg-transparent font-display text-xl font-semibold outline-none"
            />
          ) : onRename ? (
            <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 truncate text-left font-display text-xl font-semibold">
              {title}
            </button>
          ) : (
            <h2 className="min-w-0 flex-1 truncate font-display text-xl font-semibold">{title}</h2>
          )}
          {action}
          <button type="button" onClick={() => { window.location.hash = ""; }} className="inline-flex h-11 shrink-0 items-center rounded-full border border-line px-3 text-sm font-semibold">
            Home
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 px-4 py-4">{children}</div>
        {footer ? <div className="sticky bottom-0 border-t border-line bg-bg/90 p-3 backdrop-blur">{footer}</div> : null}
      </div>
    </div>
  );
}

function PlanList({
  plans,
  recipeByUid,
  onOpen,
  onCreate,
  onRemovePlan,
  onNotify,
}: {
  plans: MealPlan[];
  recipeByUid: ReadonlyMap<string, Recipe>;
  onOpen: (route: PlanRoute) => void;
  onCreate: () => void;
  onRemovePlan: (planId: string) => void;
  onNotify: (message: string) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [archiving, setArchiving] = useState(false);
  const ordered = [...plans].sort((a, b) => {
    const rank = statusRank(planStatus(a)) - statusRank(planStatus(b));
    if (rank) return rank;
    return (b.start || "").localeCompare(a.start || "");
  });
  const householdName = useHouseholdName();
  const toggle = (id: string) => {
    setChosen((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };
  const archiveChosen = async () => {
    const selected = plans.filter((plan) => chosen.includes(plan.id) && plan.start && plan.end);
    if (!selected.length) {
      onNotify("Choose a date range that has days.");
      return;
    }
    setArchiving(true);
    try {
      await archiveHistory(selected.map((plan) => snapshotPlan(plan, recipeByUid)));
      for (const plan of selected) onRemovePlan(plan.id);
      setChosen([]);
      onNotify(selected.length === 1 ? "Archived that date range." : `Archived ${selected.length} date ranges.`);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not archive those days.");
    } finally {
      setArchiving(false);
    }
  };
  return (
    <Shell
      title={householdName}
      onRename={(name) => void renameHousehold(name)}
      onBack={() => {
        window.location.hash = "";
      }}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onCreate} className="inline-flex h-11 items-center gap-2 rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink">
            <Plus className="size-4" />
            New plan
          </button>
        </div>
        <div className="border-t border-line" />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onOpen({ kind: "goals" })} className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold">
            Saved macros
          </button>
          <button type="button" onClick={() => onOpen({ kind: "find" })} className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold">
            Find my Macros
          </button>
        </div>
        <div className="border-t border-line" />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={chosen.length === 0}
            onClick={() => onOpen({ kind: "shop", planIds: chosen })}
            className={`inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold ${chosen.length ? "border-line bg-surface text-ink" : "border-line bg-bg text-muted opacity-45"}`}
          >
            Make grocery list
          </button>
          <button type="button" onClick={() => onOpen({ kind: "groceries" })} className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold">
            Saved grocery lists
          </button>
        </div>
        <div className="border-t border-line" />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onOpen({ kind: "history" })} className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold">
            Archived plans
          </button>
          <button
            type="button"
            disabled={!chosen.length || archiving}
            onClick={() => void archiveChosen()}
            className={`inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold ${chosen.length ? "border-line bg-surface text-ink" : "border-line bg-bg text-muted opacity-45"}`}
          >
            {archiving ? "Archiving…" : "Archive"}
          </button>
        </div>
      </div>
      {ordered.length === 0 ? (
        <p className="text-sm text-muted">No plans yet. Pick a date range and add meals to the days.</p>
      ) : (
        <>
          <div className="border-t border-line" />
          <ul className="flex flex-col">
            {ordered.map((plan, index) => {
              const status = planStatus(plan);
              const dates = plan.start && plan.end ? formatRange(plan.start, plan.end) : "Dates not chosen";
              const label = plan.start && plan.end ? `${dates} Plan` : dates;
              const selected = chosen.includes(plan.id);
              return (
                <li key={plan.id} className={`flex items-center gap-1 rounded-card border px-2 py-1 ${index ? "mt-2" : ""} ${selected ? "border-tomato bg-surface" : "border-line"}`}>
                  <button type="button" aria-pressed={selected} onClick={() => toggle(plan.id)} className="min-w-0 flex-1 px-2 py-2 text-left">
                    <span className="block font-semibold">{label}</span>
                    <span className="text-sm text-muted">{status}</span>
                  </button>
                  <button type="button" disabled={!plan.start} onClick={() => onOpen({ kind: "cook", planId: plan.id })} className="inline-flex h-11 shrink-0 items-center rounded-full border border-line px-3 text-sm font-semibold disabled:opacity-40">
                    Prep & Cook
                  </button>
                  <button type="button" onClick={() => onOpen({ kind: "edit", planId: plan.id })} className="inline-flex h-11 shrink-0 items-center rounded-full border border-line px-3 text-sm font-semibold">
                    Edit
                  </button>
                  <button type="button" aria-label={`Remove ${label}`} onClick={() => onRemovePlan(plan.id)} className="inline-flex size-11 items-center justify-center rounded-full">
                    <X className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Shell>
  );
}

function LogsPage({ route, onOpen, onCreate }: { route: Extract<PlanRoute, { kind: "logs" | "logsPerson" | "logsEntry" }>; onOpen: (route: PlanRoute) => void; onCreate: () => void }) {
  const saved = useSavedPeople();
  const [logs, setLogs] = useState<MacroLog[] | null>(null);
  const [goals, setGoals] = useState<SavedMacroGoal[]>([]);
  const [pickedMeal, setPickedMeal] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const routeKey = route.kind === "logsEntry" ? route.logId : route.kind;
  useEffect(() => {
    const load = () => {
      readMacroLogs().then(setLogs).catch(() => setLogs([]));
      readSavedMacroGoals().then(setGoals).catch(() => setGoals([]));
    };
    load();
    window.addEventListener(CLOUD_EVENT, load);
    return () => window.removeEventListener(CLOUD_EVENT, load);
  }, []);
  useEffect(() => {
    setPickedMeal(null);
    setEditing(false);
  }, [routeKey]);
  if (logs === null) return <Shell title="Logs" onBack={() => onOpen({ kind: "list" })}><p className="text-sm text-muted">Loading logs…</p></Shell>;
  const logFood = (
    <button type="button" onClick={onCreate} className="inline-flex h-11 shrink-0 items-center rounded-full border border-line px-3 text-sm font-semibold">
      Log food
    </button>
  );
  const saveEntry = async (nextEntry: MacroLog) => {
    const next = logs.map((item) => (item.id === nextEntry.id && item.personId === nextEntry.personId ? nextEntry : item));
    await writeMacroLogs(next);
    setLogs(next);
  };
  if (route.kind === "logsEntry") {
    const entry = logs.find((item) => item.id === route.logId && item.personId === route.personId);
    const meal = entry && pickedMeal != null ? entry.meals[pickedMeal] : null;
    return (
      <Shell title={entry ? formatDay(entry.date) : "Logged day"} onBack={() => onOpen({ kind: "logsPerson", personId: route.personId })} action={logFood}>
        {entry ? (
          <>
            {entry.percentLine ? <p className="text-sm font-semibold tabular-nums">{entry.percentLine}</p> : null}
            {entry.gramLine ? <p className="text-sm tabular-nums text-muted">{entry.gramLine}</p> : null}
            <p className="text-xs text-muted">Tap a meal to highlight it, then Edit if that log was off.</p>
            <ul className="flex flex-col gap-2">
              {entry.meals.map((item, index) => {
                const on = pickedMeal === index;
                return (
                  <li key={`${entry.id}-${index}`}>
                    <button type="button" aria-pressed={on} onClick={() => { setPickedMeal(on ? null : index); setEditing(false); }} className={`w-full rounded-card border bg-surface px-3 py-3 text-left ${on ? "border-tomato" : "border-line"}`}>
                      <p className="text-sm font-semibold">{SLOT_LABEL[item.slot]} · {item.title}</p>
                      {item.summary ? <p className="mt-0.5 text-xs tabular-nums text-muted">{item.summary}</p> : null}
                      {item.ingredients.length ? (
                        <ul className="mt-2 flex flex-col gap-0.5">
                          {item.ingredients.map((line, lineIndex) => (
                            <li key={lineIndex} className="text-xs leading-snug text-muted">{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-muted">No ingredient list was saved with this meal.</p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {meal && !editing ? (
              <button type="button" onClick={() => setEditing(true)} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink">
                Edit
              </button>
            ) : null}
            {meal && editing ? (
              <LogMealEditor
                meal={meal}
                onCancel={() => setEditing(false)}
                onSave={(updated) => {
                  const meals = entry.meals.map((item, index) => (index === pickedMeal ? updated : item));
                  const summed = addLoggedMacros(meals.flatMap((item) => {
                    const parsed = parseLoggedMacros(item.summary);
                    return parsed ? [parsed] : [];
                  }));
                  const savedGoal = goalForPlanPerson(goals, { id: entry.personId, name: entry.personName, goalName: entry.goalName });
                  const targets = goalTargets(savedGoal?.goals);
                  void saveEntry({
                    ...entry,
                    meals,
                    gramLine: formatMealLine(summed),
                    percentLine: targets ? formatGoalPercents(summed, targets) : entry.percentLine,
                  }).then(() => setEditing(false));
                }}
              />
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted">That log is no longer saved.</p>
        )}
      </Shell>
    );
  }
  if (route.kind === "logsPerson") {
    const personId = route.personId;
    const mine = logs.filter((entry) => entry.personId === personId);
    const name = mine[0]?.personName || saved.find((person) => person.id === personId)?.name || "Logs";
    const weeks = logWeeks(mine);
    const personGoal = goalForPlanPerson(goals, { id: personId, name, goalName: mine[0]?.goalName });
    const weekTargets = goalTargets(personGoal?.goals);
    const weekly = weekTargets ? scaleTargets(weekTargets, 7) : null;
    return (
      <Shell title={name} onBack={() => onOpen({ kind: "logs" })} action={logFood}>
        <p className="text-sm text-muted">Weeks start on the oldest logged day. Each box is 7 days, and the percents are against 7 times the daily goal.</p>
        {weeks.length ? (
          <ul className="flex flex-col gap-3">
            {weeks.map((week) => {
              const summed = addLoggedMacros(week.days.flatMap((day) => {
                const parsed = day.entry ? parseLoggedMacros(day.entry.gramLine) : null;
                return parsed ? [parsed] : [];
              }));
              const loggedCount = week.days.filter((day) => day.entry).length;
              return (
                <li key={week.start} className="rounded-card border border-line bg-surface px-3 py-3">
                  <p className="font-display text-lg font-semibold">Week {week.index}</p>
                  <p className="text-xs text-muted">{formatRange(week.start, week.end)}</p>
                  {weekly ? <p className="mt-1 text-sm font-semibold tabular-nums">{formatGoalPercents(summed, weekly)}</p> : null}
                  {loggedCount ? <p className="mt-0.5 text-sm tabular-nums text-muted">{formatMealLine(summed)}</p> : <p className="mt-1 text-sm text-muted">Nothing logged this week.</p>}
                  <ul className="mt-2 flex flex-col gap-1">
                    {week.days.map((day) => day.entry ? (
                      <li key={day.date}>
                        <button type="button" onClick={() => onOpen({ kind: "logsEntry", personId: day.entry!.personId, logId: day.entry!.id })} className="w-full rounded-2xl border border-line px-3 py-2 text-left">
                          <span className="text-sm font-semibold">{formatDay(day.date)}</span>
                          {day.entry.percentLine ? <span className="mt-0.5 block text-xs tabular-nums text-muted">{day.entry.percentLine}</span> : null}
                          <span className="mt-0.5 block truncate text-xs text-muted">{day.entry.meals.map((meal) => `${SLOT_LABEL[meal.slot]} ${meal.title}`).join(" · ")}</span>
                        </button>
                      </li>
                    ) : (
                      <li key={day.date} className="px-3 py-1 text-xs text-muted">{formatDay(day.date)} · No log</li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing logged for {name} yet. Check a day on a plan and hit Log days, or open a day and hit Log day.</p>
        )}
      </Shell>
    );
  }
  const known = new Map(saved.map((person) => [person.id, person.name]));
  for (const entry of logs) {
    if (!known.has(entry.personId)) known.set(entry.personId, entry.personName);
  }
  const people = [...known.entries()];
  return (
    <Shell title="Logs" onBack={() => { window.location.hash = ""; }}>
      <p className="text-sm text-muted">Pick a person. Weeks are counted from their oldest logged day.</p>
      {people.length ? (
        <ul className="flex flex-col gap-2">
          {people.map(([id, name]) => {
            const count = logs.filter((entry) => entry.personId === id).length;
            return (
              <li key={id}>
                <button type="button" onClick={() => onOpen({ kind: "logsPerson", personId: id })} className="flex h-14 w-full items-center justify-between rounded-card border border-line bg-surface px-4 text-left">
                  <span className="font-display text-lg font-semibold">{name}</span>
                  <span className="text-sm tabular-nums text-muted">{count ? `${count} logged` : "None yet"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">Save a person first, then log a day from a plan.</p>
      )}
    </Shell>
  );
}

function LogMealEditor({ meal, onCancel, onSave }: { meal: MacroLog["meals"][number]; onCancel: () => void; onSave: (meal: MacroLog["meals"][number]) => void }) {
  const parsed = parseLoggedMacros(meal.summary);
  const [title, setTitle] = useState(meal.title);
  const [ingredients, setIngredients] = useState(meal.ingredients.join("\n"));
  const [calories, setCalories] = useState(parsed ? String(Math.round(parsed.calories)) : "");
  const [protein, setProtein] = useState(parsed ? String(Math.round(parsed.proteinG)) : "");
  const [fat, setFat] = useState(parsed ? String(Math.round(parsed.fatG)) : "");
  const [net, setNet] = useState(parsed ? String(Math.round(parsed.netCarbsG)) : "");
  const number = (value: string) => {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0;
  };
  return (
    <form
      className="flex flex-col gap-2 rounded-card border border-tomato bg-surface px-3 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        const macros = {
          calories: number(calories),
          proteinG: number(protein),
          fatG: number(fat),
          netCarbsG: number(net),
          carbsG: number(net),
          fiberG: 0,
          sugarsG: 0,
          cost: parsed?.cost ?? 0,
        };
        onSave({
          ...meal,
          title: title.trim() || meal.title,
          ingredients: ingredients.split("\n").map((line) => line.trim()).filter(Boolean),
          summary: formatMealLine(macros),
        });
      }}
    >
      <p className="text-sm font-semibold">Edit {SLOT_LABEL[meal.slot]}</p>
      <input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Meal name" className="h-11 rounded-2xl border border-line bg-bg px-3 text-sm outline-none focus:border-tomato" />
      <textarea value={ingredients} onChange={(event) => setIngredients(event.target.value)} aria-label="Ingredients" rows={5} className="rounded-2xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-tomato" />
      <div className="grid grid-cols-2 gap-2">
        <LogNumber label="Calories" value={calories} onChange={setCalories} />
        <LogNumber label="Protein g" value={protein} onChange={setProtein} />
        <LogNumber label="Fat g" value={fat} onChange={setFat} />
        <LogNumber label="Net carbs g" value={net} onChange={setNet} />
      </div>
      <button type="submit" className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink">Save edit</button>
      <button type="button" onClick={onCancel} className="h-11 rounded-full border border-line text-sm font-semibold">Cancel</button>
    </form>
  );
}

function LogNumber({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-2xl border border-line bg-bg px-3 text-sm text-ink outline-none focus:border-tomato" />
    </label>
  );
}

function HistoryPage({ route, onOpen }: { route: Extract<PlanRoute, { kind: "history" | "historyItem" | "historyDay" | "historyMeal" }>; onOpen: (route: PlanRoute) => void }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [warn, setWarn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => watchHistory(setEntries), []);
  const archiveId = route.kind === "history" ? "" : route.archiveId;
  const entry = archiveId ? entries.find((item) => item.id === archiveId) : null;
  if (route.kind === "historyMeal") {
    const day = entry?.days.find((item) => item.date === route.date);
    const meal = day?.meals[route.mealIndex];
    return (
      <Shell title={meal?.title ?? "Meal"} onBack={() => onOpen({ kind: "historyDay", archiveId: route.archiveId, date: route.date })}>
        {meal ? (
          <div className="rounded-card border border-line bg-surface px-3 py-3">
            <p className="text-sm font-semibold">
              {meal.person ? `${meal.person} · ` : ""}{SLOT_LABEL[meal.slot]} · {meal.title}
              {meal.versionLabel ? ` · ${meal.versionLabel}` : ""}
            </p>
            {meal.summary ? <p className="mt-1 text-sm text-muted">{meal.summary}</p> : null}
            {meal.ingredients.length ? (
              <ul className="mt-2 flex flex-col gap-0.5">
                {meal.ingredients.map((line, index) => (
                  <li key={index} className="text-xs leading-snug text-muted">{line}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted">No ingredients were saved with this meal.</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">That meal is not in the archive.</p>
        )}
      </Shell>
    );
  }
  if (route.kind === "historyDay") {
    const day = entry?.days.find((item) => item.date === route.date);
    return (
      <Shell title={formatDay(route.date)} onBack={() => onOpen({ kind: "historyItem", archiveId: route.archiveId })}>
        {day?.meals.length ? (
          <ul className="flex flex-col gap-2">
            {day.meals.map((meal, index) => (
              <li key={`${meal.slot}-${index}`}>
                <button type="button" onClick={() => onOpen({ kind: "historyMeal", archiveId: route.archiveId, date: route.date, mealIndex: index })} className="w-full rounded-card border border-line bg-surface px-3 py-3 text-left">
                  <p className="text-sm font-semibold">
                    {meal.person ? `${meal.person} · ` : ""}{SLOT_LABEL[meal.slot]} · {meal.title}
                    {meal.versionLabel ? ` · ${meal.versionLabel}` : ""}
                  </p>
                  {meal.summary ? <p className="mt-1 text-xs text-muted">{meal.summary}</p> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No meals were saved for this day.</p>
        )}
      </Shell>
    );
  }
  if (route.kind === "historyItem") {
    return (
      <Shell title={entry?.label ?? "Archived plan"} onBack={() => onOpen({ kind: "history" })}>
        {entry ? (
          <ul className="flex flex-col gap-2">
            {entry.days.map((day) => {
              const when = parseKey(day.date);
              const names = (slot: HistoryEntry["days"][number]["meals"][number]["slot"]) => day.meals.filter((meal) => meal.slot === slot);
              const snacks = names("snack");
              return (
                <li key={day.date} className={`rounded-card border bg-surface p-2 ${day.custom ? "border-gold" : "border-line"}`}>
                  <button type="button" onClick={() => onOpen({ kind: "historyDay", archiveId: entry.id, date: day.date })} className="flex w-full items-center gap-2 text-left">
                    <span className="w-12 shrink-0">
                      <span className="block text-xs text-muted">{when.toLocaleDateString(undefined, { weekday: "short" })}</span>
                      <span className="font-display text-lg font-semibold">{when.getDate()}</span>
                      {day.custom ? <span className="block text-[10px] font-semibold tracking-wide text-gold uppercase">MRB</span> : null}
                    </span>
                    <span className="grid min-w-0 flex-1 grid-cols-3 gap-1">
                      <ArchiveBubble meals={names("breakfast")} empty="Breakfast" />
                      <ArchiveBubble meals={names("lunch")} empty="Lunch" />
                      <ArchiveBubble meals={names("supper")} empty="Supper" />
                    </span>
                  </button>
                  {snacks.length ? <p className="mt-1 truncate pl-14 text-xs text-muted">Snack: {snacks.map((meal) => (meal.person ? `${meal.person}: ${meal.title}` : meal.title)).join(", ")}</p> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">That archived plan is not loaded yet.</p>
        )}
      </Shell>
    );
  }
  return (
    <Shell title="Archived plans" onBack={() => onOpen({ kind: "list" })}>
      {entries.length ? (
        <div className="flex flex-col gap-3">
          {warn ? (
            <div className="rounded-card border border-line bg-surface px-3 py-3">
              <p className="text-sm">Delete {chosen.length === 1 ? "this archived plan" : `${chosen.length} archived plans`}? This cannot be undone.</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void saveHistory(entries.filter((item) => !chosen.includes(item.id)))
                      .then(() => {
                        setChosen([]);
                        setWarn(false);
                      })
                      .finally(() => setBusy(false));
                  }}
                  className="inline-flex h-11 items-center rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink disabled:opacity-50"
                >
                  {busy ? "Deleting…" : "Delete"}
                </button>
                <button type="button" onClick={() => setWarn(false)} className="inline-flex h-11 items-center rounded-full border border-line px-4 text-sm font-semibold">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={!chosen.length}
              onClick={() => setWarn(true)}
              className={`inline-flex h-11 w-fit items-center rounded-full border px-4 text-sm font-semibold ${chosen.length ? "border-line bg-surface text-ink" : "border-line bg-bg text-muted opacity-45"}`}
            >
              Delete
            </button>
          )}
          <ul className="flex flex-col">
            {entries.map((item, index) => {
              const selected = chosen.includes(item.id);
              return (
                <li key={item.id} className={`flex items-center gap-2 py-3 ${index ? "border-t border-line" : ""}`}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={`Select ${item.label}`}
                    onClick={() => setChosen((current) => (current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]))}
                    className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full border ${selected ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}
                  >
                    {selected ? <Check className="size-4" /> : null}
                  </button>
                  <button type="button" onClick={() => onOpen({ kind: "historyItem", archiveId: item.id })} className="min-w-0 flex-1 px-2 py-1 text-left">
                    <span className="block font-semibold">{item.label}</span>
                    <span className="text-sm text-muted">Archived {new Date(item.archivedAt).toLocaleDateString()} · {item.days.length} {item.days.length === 1 ? "day" : "days"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted">Nothing is archived yet. Open a meal plan and tap Archive.</p>
      )}
    </Shell>
  );
}

function ArchiveBubble({ meals, empty }: { meals: HistoryMeal[]; empty: string }) {
  const first = meals[0];
  return (
    <span className={`block truncate rounded-full px-2 py-1 text-xs ${first ? "bg-gold-bg font-semibold text-ink" : "bg-chip text-muted"}`}>
      {first ? `${first.person ? `${first.person}: ` : ""}${first.title}` : empty}
      {meals.length > 1 ? ` +${meals.length - 1}` : ""}
    </span>
  );
}

const GRAM_FIELDS: Array<{ key: "protein" | "carbs" | "fat"; label: string }> = [
  { key: "protein", label: "Protein" },
  { key: "carbs", label: "Carbs" },
  { key: "fat", label: "Fat" },
];

const PCT_FIELDS: Array<{ key: "proteinPct" | "carbsPct" | "fatPct"; label: string }> = [
  { key: "proteinPct", label: "Protein" },
  { key: "carbsPct", label: "Carbs" },
  { key: "fatPct", label: "Fat" },
];

function GoalsHome({ onOpen, onNotify }: { onOpen: (route: PlanRoute) => void; onNotify: (message: string) => void }) {
  const [goals, setGoals] = useState<SavedMacroGoal[] | undefined>(undefined);
  const [draft, setDraft] = useState<SavedMacroGoal | null | undefined>(undefined);
  const savedPeople = useSavedPeople();

  const load = () => {
    readSavedMacroGoals()
      .then((records) => setGoals(records))
      .catch(() => setGoals([]));
  };

  useEffect(() => {
    load();
    window.addEventListener(CLOUD_EVENT, load);
    return () => window.removeEventListener(CLOUD_EVENT, load);
  }, []);

  if (goals === undefined) {
    return (
      <Shell title="Daily macros" onBack={() => onOpen({ kind: "list" })}>
        <p className="text-sm text-muted">Loading the saved goals.</p>
      </Shell>
    );
  }
  if (draft !== undefined || goals.length === 0) {
    return (
      <GoalsPage
        saved={draft ?? null}
        onBack={() => (goals.length ? setDraft(undefined) : onOpen({ kind: "list" }))}
        onSaved={() => {
          void readSavedMacroGoals().then((records) => {
            setGoals(records);
            setDraft(undefined);
          });
        }}
        onNotify={onNotify}
      />
    );
  }
  const remove = async (name: string) => {
    const next = goals.filter((item) => item.name !== name);
    await writeSavedMacroGoals(next);
    setGoals(next);
    onNotify(next.length ? "Goal removed." : "No saved goals.");
  };
  return (
    <Shell title="Daily macros" onBack={() => onOpen({ kind: "list" })}>
      <p className="text-sm text-muted">Save a person here, then choose them on a goal. A goal with no person is what a one-person plan uses. Tailor uses the newest goal for the person you pick on a plan.</p>
      <section className="flex flex-col gap-2">
        <h3 className="font-display text-lg font-semibold">People</h3>
        {savedPeople.length ? (
          <ul className="flex flex-col gap-2">
            {savedPeople.map((person) => (
              <li key={person.id} className="flex items-center gap-2 rounded-card border border-line bg-surface px-3">
                <span className="min-w-0 flex-1 truncate py-3 font-semibold">{person.name}</span>
                <button type="button" aria-label={`Remove ${person.name}`} onClick={() => void writeSavedPeople(savedPeople.filter((item) => item.id !== person.id)).then(() => onNotify("Person removed."))} className="inline-flex size-11 items-center justify-center rounded-full">
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No people saved yet.</p>
        )}
        <AddPersonButton people={savedPeople} onNotify={onNotify} />
      </section>
      <ul className="flex flex-col gap-2">
        {goals.map((saved) => {
          const targets = goalTargets(saved.goals);
          const home = goals.find((goal) => !goal.forName?.trim() && !goal.forPersonId);
          const who = saved.forName || savedPeople.find((person) => person.id === saved.forPersonId)?.name;
          return (
            <li key={saved.name} className="flex items-center gap-2 rounded-card border border-line bg-surface p-2">
              <div className="min-w-0 flex-1 px-2 py-1">
                <span className="block font-semibold">{saved.name}</span>
                <span className="block text-sm text-muted">{targets ? formatGoalLine(targets) : "No numbers yet"}</span>
                {who ? <span className="block text-xs text-muted">For {who}</span> : home?.name === saved.name ? <span className="block text-xs text-muted">Used by a one-person plan</span> : null}
              </div>
              <button type="button" onClick={() => setDraft(saved)} className="h-11 shrink-0 rounded-full border border-line px-4 text-sm font-semibold">
                Update
              </button>
              <button type="button" aria-label={`Remove ${saved.name}`} onClick={() => void remove(saved.name)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full">
                <X className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => setDraft(null)} className="h-11 self-start rounded-full border border-line bg-surface px-4 text-sm font-semibold">
        Add a goal
      </button>
    </Shell>
  );
}

function GoalsPage({
  saved,
  onBack,
  onSaved,
  onNotify,
}: {
  saved: SavedMacroGoal | null;
  onBack: () => void;
  onSaved: () => void;
  onNotify: (message: string) => void;
}) {
  const [name, setName] = useState(saved?.name ?? defaultMacroName(todayKey()));
  const [forPersonId, setForPersonId] = useState(saved?.forPersonId ?? "");
  const savedPeople = useSavedPeople();
  const [goals, setGoals] = useState<MacroGoals>(saved ? { ...EMPTY_GOALS, ...saved.goals, mode: saved.goals.mode === "split" ? "split" : "grams" } : EMPTY_GOALS);
  const [error, setError] = useState("");

  const grams = {
    protein: numberOrZero(goals.protein),
    carbs: numberOrZero(goals.carbs),
    fat: numberOrZero(goals.fat),
  };
  const split = {
    calories: numberOrZero(goals.calories),
    proteinPct: numberOrZero(goals.proteinPct),
    carbsPct: numberOrZero(goals.carbsPct),
    fatPct: numberOrZero(goals.fatPct),
  };
  const percentTotal = split.proteinPct + split.carbsPct + split.fatPct;
  const fromGrams = caloriesFromGrams(grams.protein, grams.carbs, grams.fat);
  const fromSplit = gramsFromSplit(split.calories, split.proteinPct, split.carbsPct, split.fatPct);

  const save = async () => {
    let next: MacroGoals;
    if (goals.mode === "grams") {
      for (const field of GRAM_FIELDS) {
        if (goals[field.key].trim() && !isAmount(goals[field.key])) {
          setError(`${field.label} needs a number.`);
          return;
        }
      }
      next = {
        ...goals,
        protein: goals.protein.trim(),
        carbs: goals.carbs.trim(),
        fat: goals.fat.trim(),
        calories: fromGrams ? String(Math.round(fromGrams)) : "",
      };
    } else {
      if (goals.calories.trim() && !isAmount(goals.calories)) {
        setError("Calories needs a number.");
        return;
      }
      for (const field of PCT_FIELDS) {
        if (goals[field.key].trim() && !isAmount(goals[field.key])) {
          setError(`${field.label} percent needs a number.`);
          return;
        }
      }
      if (percentTotal > 0 && Math.abs(percentTotal - 100) > 0.1) {
        setError("Protein, carbs, and fat percents need to add up to 100.");
        return;
      }
      next = {
        ...goals,
        calories: goals.calories.trim(),
        proteinPct: goals.proteinPct.trim(),
        carbsPct: goals.carbsPct.trim(),
        fatPct: goals.fatPct.trim(),
        protein: fromSplit.protein ? trimAmount(fromSplit.protein) : "",
        carbs: fromSplit.carbs ? trimAmount(fromSplit.carbs) : "",
        fat: fromSplit.fat ? trimAmount(fromSplit.fat) : "",
      };
    }
    const previous = saved?.name ?? "";
    const savedOn = saved?.savedOn || todayKey();
    const chosen = savedPeople.find((person) => person.id === forPersonId);
    const record: SavedMacroGoal = {
      name: name.trim() || defaultMacroName(savedOn),
      savedOn,
      goals: next,
    };
    if (chosen) {
      record.forPersonId = chosen.id;
      record.forName = chosen.name;
    }
    setError("");
    await writeSavedMacroGoal(record);
    if (previous && previous !== record.name) {
      const current = await readSavedMacroGoals();
      await writeSavedMacroGoals(current.filter((item) => item.name !== previous));
    }
    onNotify("Daily macros saved.");
    onSaved();
  };

  return (
    <Shell
      title="Daily macros"
      onBack={onBack}
      footer={
        <button type="button" onClick={() => void save()} className="h-11 w-full rounded-full bg-tomato text-sm font-semibold text-tomato-ink">
          Save goals
        </button>
      }
    >
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={defaultMacroName(todayKey())}
          className="h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm outline-none focus:border-tomato"
        />
      </label>
      <PersonSelect people={savedPeople} value={forPersonId} label="Person" emptyLabel="One-person plan" onChange={setForPersonId} />
      <AddPersonButton people={savedPeople} onNotify={onNotify} />
      <p className="text-xs text-muted">Leave the person on one-person plan to keep the household goal. Tailor uses the newest goal saved for the person you choose.</p>
      <div className="flex gap-2">
        <ModeChip label="From grams" selected={goals.mode === "grams"} onClick={() => setMode("grams")} />
        <ModeChip label="From calories" selected={goals.mode === "split"} onClick={() => setMode("split")} />
      </div>
      {goals.mode === "grams" ? (
        <>
          <p className="text-sm text-muted">Enter the grams. Calories are 4 per gram of protein or carbs, and 9 per gram of fat.</p>
          {GRAM_FIELDS.map((field) => (
            <GoalField key={field.key} label={field.label} unit="g" value={goals[field.key]} onChange={(value) => setGoals((current) => ({ ...current, [field.key]: value }))} />
          ))}
          <p className="font-semibold">Calories: {fromGrams ? Math.round(fromGrams).toLocaleString() : "0"}</p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">Enter calories and the percent split. Grams are filled in from that.</p>
          <GoalField label="Calories" unit="kcal" value={goals.calories} onChange={(value) => setGoals((current) => ({ ...current, calories: value }))} />
          {PCT_FIELDS.map((field) => (
            <GoalField key={field.key} label={field.label} unit="%" value={goals[field.key]} onChange={(value) => setGoals((current) => ({ ...current, [field.key]: value }))} />
          ))}
          <p className={`text-sm ${Math.abs(percentTotal - 100) > 0.1 && percentTotal > 0 ? "text-tomato" : "text-muted"}`}>Percents add up to {trimAmount(percentTotal)}.</p>
          <p className="text-sm text-muted">
            Protein {trimAmount(fromSplit.protein)} g · Carbs {trimAmount(fromSplit.carbs)} g · Fat {trimAmount(fromSplit.fat)} g
          </p>
        </>
      )}
      {error ? <p className="text-sm text-tomato">{error}</p> : null}
    </Shell>
  );

  function setMode(mode: MacroMode) {
    setError("");
    setGoals((current) => ({ ...current, mode }));
  }
}

function ModeChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={`h-11 rounded-full px-4 text-sm font-semibold ${selected ? "bg-tomato text-tomato-ink" : "border border-line bg-surface"}`}>
      {label}
    </button>
  );
}

function GoalField({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold">
        {label} <span className="font-normal text-muted">({unit})</span>
      </span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0"
        className="h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm outline-none focus:border-tomato"
      />
    </label>
  );
}

function isAmount(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value.trim());
}

function numberOrZero(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function trimAmount(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(rounded);
}

function RangePage({
  plan,
  recipes,
  recipeByUid,
  targets,
  onOpen,
  onRange,
  onSave,
  onNotify,
  onTailorDays,
  onFitPrefs,
  onBeefChoice,
  onPeople,
  onMacroDay,
  onCopyPersonDays,
  onLogDays,
}: {
  plan: MealPlan;
  recipes: SlimRecipe[];
  recipeByUid: ReadonlyMap<string, Recipe>;
  targets: GoalTargets | null | undefined;
  onOpen: (route: PlanRoute) => void;
  onRange: (planId: string, start: string, end: string) => void;
  onSave: (planId: string) => void;
  onNotify: (message: string) => void;
  onTailorDays: (dates: string[]) => Promise<string>;
  onFitPrefs: (planId: string, split: DaySplit, snackFrom: SnackDraw) => void;
  onBeefChoice: (planId: string, choice: BeefChoice) => void;
  onPeople: (planId: string, people: PlanPerson[] | null) => void;
  onMacroDay: (planId: string, personId: string, date: string, on: boolean) => void;
  onCopyPersonDays: (planId: string, dates: string[], fromId: string, toId: string, mealIds: string[]) => void;
  onLogDays: (dates: string[]) => Promise<string>;
}) {
  const ready = Boolean(plan.start && plan.end);
  const [open, setOpen] = useState(!ready);
  const [picked, setPicked] = useState<string[]>([]);
  const [tailoring, setTailoring] = useState(false);
  const [logging, setLogging] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const days = eachDay(plan.start, plan.end);
  const toggleDay = (date: string) => setPicked((current) => (current.includes(date) ? current.filter((item) => item !== date) : [...current, date]));
  const runTailor = async () => {
    setTailoring(true);
    try {
      onNotify(await onTailorDays(picked));
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not tailor those days.");
    } finally {
      setTailoring(false);
    }
  };
  const runLog = async () => {
    if (!picked.length || logging) return;
    setLogging(true);
    try {
      onNotify(await onLogDays(picked));
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not log those days.");
    } finally {
      setLogging(false);
    }
  };
  return (
    <Shell
      title={ready ? `${formatRange(plan.start, plan.end)} Meal Plan` : "New plan"}
      onBack={() => onOpen({ kind: "list" })}
      footer={
        ready ? (
          <button
            type="button"
            onClick={() => {
              onSave(plan.id);
              onNotify("Plan saved.");
              onOpen({ kind: "list" });
            }}
            className="h-11 w-full rounded-full bg-tomato text-sm font-semibold text-tomato-ink"
          >
            Save plan
          </button>
        ) : null
      }
    >
      {ready ? (
        <>
          {days.length === 90 ? <p className="text-sm text-muted">Showing the first 90 days of this range.</p> : null}
          <section className="flex flex-col gap-3 border-t border-line pt-4">
            <button type="button" aria-expanded={prefsOpen} onClick={() => setPrefsOpen((value) => !value)} className="flex items-center gap-2 text-left">
              <ChevronDown className={`size-4 shrink-0 motion-safe:transition-transform ${prefsOpen ? "" : "-rotate-90"}`} />
              <h3 className="font-display text-lg font-semibold">Preference Settings</h3>
            </button>
            {prefsOpen ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">Two meals</span>
                  <SplitChip label="50 / 50" selected={plan.daySplit !== "25-75"} onClick={() => onFitPrefs(plan.id, "50-50", plan.snackDraw === "supper" ? "supper" : "lunch")} />
                  <SplitChip label="25 / 75" selected={plan.daySplit === "25-75"} onClick={() => onFitPrefs(plan.id, "25-75", plan.snackDraw === "supper" ? "supper" : "lunch")} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">Snack comes out of</span>
                  <SplitChip label="Lunch" selected={plan.snackDraw !== "supper"} onClick={() => onFitPrefs(plan.id, plan.daySplit === "25-75" ? "25-75" : "50-50", "lunch")} />
                  <SplitChip label="Supper" selected={plan.snackDraw === "supper"} onClick={() => onFitPrefs(plan.id, plan.daySplit === "25-75" ? "25-75" : "50-50", "supper")} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">Ground beef</span>
                  <SplitChip label="80/20" selected={plan.beefChoice === "80/20"} onClick={() => onBeefChoice(plan.id, "80/20")} />
                  <SplitChip label="73/27" selected={plan.beefChoice === "73/27"} onClick={() => onBeefChoice(plan.id, "73/27")} />
                  <SplitChip label="Either" selected={plan.beefChoice !== "80/20" && plan.beefChoice !== "73/27"} onClick={() => onBeefChoice(plan.id, "either")} />
                </div>
                <p className="text-xs text-muted">Either keeps whatever beef the recipe already uses. 80/20 or 73/27 is what Fit and Hone count for ground beef.</p>
                <SupplementsPanel recipes={recipes} />
              </>
            ) : null}
          </section>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void runTailor()} disabled={!picked.length || tailoring} className={`inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold ${picked.length ? "border-line bg-surface text-ink" : "border-line bg-bg text-muted opacity-45"}`}>
              {tailoring ? "Tailoring…" : "Tailor to Macros"}
            </button>
            <button type="button" onClick={() => void runLog()} disabled={!picked.length || logging} className={`inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold ${picked.length ? "border-line bg-surface text-ink" : "border-line bg-bg text-muted opacity-45"}`}>
              {logging ? "Logging…" : "Log days"}
            </button>
            <button type="button" aria-expanded={helpOpen} aria-label="What Tailor to Macros does" onClick={() => setHelpOpen((value) => !value)} className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface text-ink">
              <CircleHelp className="size-4" />
            </button>
          </div>
          {helpOpen ? (
            <div className="rounded-card border border-line bg-surface px-3 py-3 text-sm leading-snug text-muted">
              <p>Tailor to Macros runs Fit, then Hone. Hone trims meat and eggs if protein is high, including a roast or an egg snack. If net carbs are still over, it reduces the highest-carb ingredient. A half egg can cover a protein gap. Tallow is added in small amounts for the remaining fat. It stops around 2% and does not cut vegetables further.</p>
              <p className="mt-2">A gold outline and <span className="font-semibold text-gold">MRB</span> means that day was set by hand with Rebalance/edit. Leave it unchecked. It is not meant for Fit or Hone.</p>
              <p className="mt-2">With two people, check the day, then tap that person's name. A red name is included when you hit Tailor. It uses the newest saved macro for that name. <span className="font-semibold">macros ✓</span> means that day was already tailored. Percents stay separate. The grocery list adds both people's food and cost together.</p>
            </div>
          ) : null}
          {open ? <MonthCalendar start={plan.start} end={plan.end} onRange={(start, end) => onRange(plan.id, start, end)} /> : null}
          <PeopleBar plan={plan} onPeople={onPeople} onOpen={onOpen} onNotify={onNotify} />
          <div className="flex items-center justify-between">
            <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="text-xs font-semibold text-muted">
              {open ? "Hide dates" : "Dates"}
            </button>
            <span className="flex items-center gap-1">
              <button type="button" aria-label="Remove a day" disabled={plan.start === plan.end} onClick={() => onRange(plan.id, plan.start, shiftDay(plan.end, -1))} className="inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface text-sm disabled:opacity-40">
                −
              </button>
              <button type="button" aria-label="Add a day" onClick={() => onRange(plan.id, plan.start, shiftDay(plan.end, 1))} className="inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface text-sm">
                +
              </button>
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {days.map((date) => (
              <DayRow key={date} plan={plan} date={date} recipeByUid={recipeByUid} targets={targets} onOpen={onOpen} picked={picked.includes(date)} onToggle={() => toggleDay(date)} onMacroDay={onMacroDay} onCopyPersonDays={onCopyPersonDays} />
            ))}
          </ul>
        </>
      ) : (
        <>
          <MonthCalendar start={plan.start} end={plan.end} onRange={(start, end) => onRange(plan.id, start, end)} />
          <p className="text-sm text-muted">Tap a start day, then an end day. The days in between show up below.</p>
        </>
      )}
    </Shell>
  );
}

function SupplementsPanel({ recipes }: { recipes: SlimRecipe[] }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [items, setItems] = useState<SupplementItem[]>(() => loadSupplements());
  const [query, setQuery] = useState("");
  useEffect(() => {
    const refresh = () => setItems(loadSupplements());
    window.addEventListener(CLOUD_EVENT, refresh);
    return () => window.removeEventListener(CLOUD_EVENT, refresh);
  }, []);
  const needle = query.trim().toLowerCase();
  const ingredientHits = needle ? searchIngredients(needle).slice(0, 8) : [];
  const sideHits = needle
    ? recipes.filter((recipe) => !recipe.isVersion && recipe.course === "Side" && recipe.title.toLowerCase().includes(needle)).slice(0, 4)
    : [];
  const shown = [...items.filter((item) => item.starred), ...items.filter((item) => !item.starred)];
  const has = (item: SupplementItem) => items.some((saved) => saved.kind === item.kind && saved.name === item.name && saved.uid === item.uid);
  const write = (next: SupplementItem[]) => {
    setItems(next);
    saveSupplements(next);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center self-start rounded-full border border-line bg-surface px-3 text-sm font-semibold">
        Source List for Hone
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Source List for Hone">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-card border border-line bg-bg p-4">
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 font-display text-lg font-semibold">Source List for Hone</h3>
              <button type="button" aria-pressed={adding} aria-label="Search ingredients to add" onClick={() => setAdding((value) => !value)} className="inline-flex size-11 items-center justify-center rounded-full border border-line">
                <Plus className="size-4" />
              </button>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="inline-flex size-11 items-center justify-center rounded-full border border-line">
                <X className="size-4" />
              </button>
            </div>
            <p className="text-xs text-muted">Star the extra Hone should try first. Tallow is the preferred fat.</p>
            {adding ? (
              <>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search the ingredient library"
                  className="h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm outline-none focus:border-tomato"
                />
                {needle ? (
                  <ul className="flex flex-col gap-1">
                    {ingredientHits.map((item) => {
                      const entry = { kind: "ingredient" as const, name: item.name };
                      return (
                        <li key={`ingredient-${item.name}`}>
                          <button type="button" disabled={has(entry)} onClick={() => write([...items, entry])} className="flex h-11 w-full items-center justify-between rounded-2xl border border-line bg-surface px-3 text-left text-sm disabled:opacity-50">
                            <span className="min-w-0 truncate">{item.name}</span>
                            <span className="shrink-0 text-xs text-muted">{has(entry) ? "Added" : "Add"}</span>
                          </button>
                        </li>
                      );
                    })}
                    {sideHits.map((recipe) => {
                      const entry = { kind: "side" as const, name: recipe.title, uid: recipe.uid };
                      return (
                        <li key={recipe.uid}>
                          <button type="button" disabled={has(entry)} onClick={() => write([...items, entry])} className="flex h-11 w-full items-center justify-between rounded-2xl border border-line bg-surface px-3 text-left text-sm disabled:opacity-50">
                            <span className="min-w-0 truncate">{recipe.title}</span>
                            <span className="shrink-0 text-xs text-muted">{has(entry) ? "Added" : "Side"}</span>
                          </button>
                        </li>
                      );
                    })}
                    {!ingredientHits.length && !sideHits.length ? <li className="text-sm text-muted">Nothing matches.</li> : null}
                  </ul>
                ) : (
                  <p className="text-xs text-muted">Type a name from the ingredient library.</p>
                )}
              </>
            ) : null}
            <ul className="flex flex-col gap-1">
              {shown.length ? shown.map((item) => (
                <li key={`${item.kind}-${item.uid ?? item.name}`} className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-3">
                  <span className="min-w-0 flex-1 truncate py-2 text-sm">{item.name}</span>
                  <button type="button" aria-pressed={Boolean(item.starred)} aria-label={item.starred ? `Unstar ${item.name}` : `Star ${item.name}`} onClick={() => write(prefer(items, item))} className={`inline-flex size-11 items-center justify-center ${item.starred ? "text-gold" : "text-muted"}`}>
                    <Star className={`size-4 ${item.starred ? "fill-current" : ""}`} />
                  </button>
                  <button type="button" aria-label={`Remove ${item.name}`} onClick={() => write(items.filter((saved) => saved !== item))} className="inline-flex size-11 items-center justify-center">
                    <X className="size-4" />
                  </button>
                </li>
              )) : <li className="text-sm text-muted">Nothing on the list yet.</li>}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}

function prefer(items: SupplementItem[], item: SupplementItem): SupplementItem[] {
  const others = items.filter((saved) => saved !== item);
  const updated = { ...item, starred: !item.starred };
  if (updated.starred) return [updated, ...others];
  const starred = others.filter((saved) => saved.starred);
  const plain = others.filter((saved) => !saved.starred);
  return [...starred, updated, ...plain];
}

function PeopleBar({ plan, onPeople, onOpen, onNotify }: { plan: MealPlan; onPeople: (planId: string, people: PlanPerson[] | null) => void; onOpen: (route: PlanRoute) => void; onNotify: (message: string) => void }) {
  const [goals, setGoals] = useState<SavedMacroGoal[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const load = () => {
      readSavedMacroGoals().then(setGoals).catch(() => setGoals([]));
    };
    load();
    window.addEventListener(CLOUD_EVENT, load);
    return () => window.removeEventListener(CLOUD_EVENT, load);
  }, []);
  const saved = useSavedPeople();
  const people = plan.people ?? [];
  const paired = twoPeople(plan);
  const addToPlan = () => {
    if (paired || !saved[0]) return;
    const first = saved[0];
    const second = saved[1];
    onPeople(plan.id, [
      { id: first.id, name: first.name, goalName: "" },
      { id: second?.id ?? `open-${crypto.randomUUID()}`, name: second?.name ?? "", goalName: "" },
    ]);
  };
  const choose = (index: number, id: string) => {
    const chosen = saved.find((person) => person.id === id);
    if (!chosen || people.some((person, slot) => slot !== index && person.id === chosen.id)) return;
    onPeople(plan.id, people.map((person, slot) => (slot === index ? { ...person, id: chosen.id, name: chosen.name } : person)));
  };
  if (!paired) {
    return (
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted">One person. Meals use the saved macro goal.</p>
          <button type="button" onClick={() => onOpen({ kind: "goals" })} className="h-9 shrink-0 rounded-full px-2 text-sm font-semibold text-muted">
            Saved goals
          </button>
        </div>
        {saved.length ? (
          <button type="button" onClick={addToPlan} className="h-11 self-start rounded-full border border-line bg-surface px-4 text-sm font-semibold">
            Add person to plan
          </button>
        ) : (
          <p className="text-sm text-muted">Save a person before adding one to this plan.</p>
        )}
        <AddPersonButton people={saved} onNotify={onNotify} />
      </div>
    );
  }
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="flex items-center gap-2">
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex min-w-0 items-center gap-2 text-left">
          <ChevronDown className={`size-4 shrink-0 motion-safe:transition-transform ${open ? "" : "-rotate-90"}`} />
          <h3 className="font-display text-lg font-semibold">People</h3>
        </button>
      </div>
      {open ? (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onOpen({ kind: "goals" })} className="h-11 rounded-full border border-line bg-surface px-4 text-sm font-semibold">
              Saved goals
            </button>
            <button type="button" onClick={() => onPeople(plan.id, null)} className="h-11 rounded-full border border-line bg-surface px-4 text-sm font-semibold">
              Use one person
            </button>
          </div>
          {people.map((person, index) => {
            const matched = goalForPlanPerson(goals, person);
            const other = people[index === 0 ? 1 : 0]?.id;
            return (
              <div key={`${person.id}-${index}`} className="flex flex-col gap-1">
                <PersonSelect people={saved} value={person.id} excludeId={other} label={index === 0 ? "First person" : "Second person"} emptyLabel="Choose a person" onChange={(id) => choose(index, id)} />
                <p className="text-xs text-muted">{matched ? `Tailor uses ${matched.name}` : "No saved macro for this person."}</p>
              </div>
            );
          })}
          <AddPersonButton people={saved} onNotify={onNotify} />
          <p className="text-xs text-muted">Check a day, then tap a person's name so Tailor includes them. macros ✓ means that day was already tailored. Percents stay per person. Grocery cost adds both.</p>
        </>
      ) : null}
    </section>
  );
}

function CopySelection({
  plan,
  dates,
  fromId,
  toId,
  size,
  lit,
  onCopy,
}: {
  plan: MealPlan;
  dates: string[];
  fromId: string;
  toId: string;
  size: "compact" | "day";
  lit?: boolean;
  onCopy: (planId: string, dates: string[], fromId: string, toId: string, mealIds: string[]) => void;
}) {
  const other = plan.people?.find((person) => person.id === toId);
  const toName = other?.name || "other";
  const rows = dates.flatMap((date) => {
    const theirs = new Set(mealsFor(plan, date, undefined, toId).filter((meal) => meal.recipeUid).map((meal) => `${meal.slot}\0${meal.recipeUid}`));
    return mealsFor(plan, date, undefined, fromId)
      .filter((meal) => meal.recipeUid)
      .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
      .map((meal) => ({ date, meal, fresh: !theirs.has(`${meal.slot}\0${meal.recipeUid}`) }));
  });
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  if (!rows.length) return null;
  const live = rows.some((row) => row.fresh);
  const hot = lit || live;
  const className = size === "compact"
    ? `mt-1 inline-flex h-7 items-center self-start rounded-full border bg-surface px-2 text-[11px] font-semibold ${hot ? "border-tomato text-tomato" : "border-line text-muted"}`
    : `h-11 rounded-full border bg-surface px-4 text-sm font-semibold ${hot ? "border-tomato text-tomato" : "border-line text-muted"}`;
  const openList = () => {
    setChecked(rows.filter((row) => row.fresh).map((row) => row.meal.id));
    setOpen(true);
  };
  const toggle = (id: string) => setChecked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const severalDays = new Set(rows.map((row) => row.date)).size > 1;
  return (
    <>
      <button type="button" onClick={openList} className={className}>
        Copy selection(s) to {toName}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label={`Copy selection(s) to ${toName}`}>
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 rounded-card border border-line bg-bg p-4">
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 font-display text-lg font-semibold">Copy selection(s) to {toName}</h3>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="inline-flex size-11 items-center justify-center rounded-full border border-line">
                <X className="size-4" />
              </button>
            </div>
            <p className="text-xs text-muted">Check the meals and snacks to put on {toName}'s same day. Amounts stay unset until Tailor.</p>
            <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {rows.map((row) => {
                const on = checked.includes(row.meal.id);
                const label = `${SLOT_LABEL[row.meal.slot]} · ${row.meal.title}`;
                return (
                  <li key={row.meal.id}>
                    <button type="button" aria-pressed={on} onClick={() => toggle(row.meal.id)} className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2 text-left">
                      <span className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-tomato bg-tomato text-tomato-ink" : "border-line"}`}>
                        {on ? <Check className="size-3" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        {severalDays ? <span className="block truncate text-xs text-muted">{formatDay(row.date)}</span> : null}
                        <span className="block truncate text-sm">{label}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              disabled={!checked.length}
              onClick={() => {
                onCopy(plan.id, dates, fromId, toId, checked);
                setOpen(false);
              }}
              className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-50"
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DayRow({ plan, date, recipeByUid, targets, onOpen, picked, onToggle, onMacroDay, onCopyPersonDays }: { plan: MealPlan; date: string; recipeByUid: ReadonlyMap<string, Recipe>; targets: GoalTargets | null | undefined; onOpen: (route: PlanRoute) => void; picked: boolean; onToggle: () => void; onMacroDay: (planId: string, personId: string, date: string, on: boolean) => void; onCopyPersonDays: (planId: string, dates: string[], fromId: string, toId: string, mealIds: string[]) => void }) {
  const when = parseKey(date);
  const all = mealsFor(plan, date);
  const custom = all.some((meal) => meal.lines?.length);
  if (twoPeople(plan)) {
    const both = all.length && recipeByUid.size ? sumPlanMeals(all, recipeByUid, plan.beefChoice) : null;
    return (
      <li className={`rounded-card border bg-surface p-2 ${custom ? "border-gold" : "border-line"}`} title={custom ? "MRB: set by hand with Rebalance/edit. Leave it unchecked for Fit and Hone." : undefined}>
        <div className="flex items-start gap-2">
          <button type="button" aria-pressed={picked} aria-label={`Select ${formatDay(date)}`} onClick={onToggle} className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full border ${picked ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}>
            {picked ? <Check className="size-4" /> : null}
          </button>
          <button type="button" onClick={() => onOpen({ kind: "day", planId: plan.id, date })} className="w-12 shrink-0 text-left">
            <span className="block text-xs text-muted">{when.toLocaleDateString(undefined, { weekday: "short" })}</span>
            <span className="font-display text-lg font-semibold">{when.getDate()}</span>
            {custom ? <span className="block text-[10px] font-semibold tracking-wide text-gold uppercase">MRB</span> : null}
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {(plan.people ?? []).map((person) => (
              <PersonTrack key={person.id} plan={plan} date={date} person={person} recipeByUid={recipeByUid} picked={picked} onOpen={onOpen} onMacroDay={onMacroDay} onCopyPersonDays={onCopyPersonDays} />
            ))}
            {both ? <p className="text-xs text-muted">Shopping, both people · {money(both.macros.cost)}</p> : null}
          </div>
        </div>
      </li>
    );
  }
  const breakfast = mealsFor(plan, date, "breakfast");
  const lunch = mealsFor(plan, date, "lunch");
  const supper = mealsFor(plan, date, "supper");
  const snacks = mealsFor(plan, date, "snack");
  const math = all.length && recipeByUid.size ? sumPlanMeals(all, recipeByUid, plan.beefChoice) : null;
  const weights = dayWeights(all, recipeByUid, plan.beefChoice);
  return (
    <li className={`rounded-card border bg-surface p-2 ${custom ? "border-gold" : "border-line"}`} title={custom ? "MRB: set by hand with Rebalance/edit. Leave it unchecked for Fit and Hone." : undefined}>
      <div className="flex items-center gap-2">
        <button type="button" aria-pressed={picked} aria-label={`Select ${formatDay(date)}`} onClick={onToggle} className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full border ${picked ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}>
          {picked ? <Check className="size-4" /> : null}
        </button>
        <button type="button" onClick={() => onOpen({ kind: "day", planId: plan.id, date })} className="w-12 shrink-0 text-left">
          <span className="block text-xs text-muted">{when.toLocaleDateString(undefined, { weekday: "short" })}</span>
          <span className="font-display text-lg font-semibold">{when.getDate()}</span>
          {custom ? <span className="block text-[10px] font-semibold tracking-wide text-gold uppercase">MRB</span> : null}
        </button>
        <button type="button" onClick={() => onOpen({ kind: "day", planId: plan.id, date })} className="grid min-w-0 flex-1 grid-cols-3 gap-1 text-left">
          <Bubble meals={breakfast} empty="Breakfast" />
          <Bubble meals={lunch} empty="Lunch" />
          <Bubble meals={supper} empty="Supper" />
        </button>
        <button
          type="button"
          aria-label={`Add to ${formatDay(date)}`}
          onClick={() => onOpen({ kind: "add", planId: plan.id, date, slot: "breakfast" })}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line"
        >
          <Plus className="size-4" />
        </button>
      </div>
      {math && targets !== undefined ? targets ? <GoalPercentLine math={math} targets={targets} /> : <MacroLine math={math} /> : null}
      {weights ? <p className="mt-0.5 pl-28 text-xs text-muted">{weights}</p> : null}
      {snacks.length ? <p className="mt-1 truncate pl-28 text-xs text-muted">Snack: {snacks.map((meal) => shortName(meal)).join(", ")}</p> : null}
    </li>
  );
}

function PersonTrack({
  plan,
  date,
  person,
  recipeByUid,
  picked,
  onOpen,
  onMacroDay,
  onCopyPersonDays,
}: {
  plan: MealPlan;
  date: string;
  person: PlanPerson;
  recipeByUid: ReadonlyMap<string, Recipe>;
  picked: boolean;
  onOpen: (route: PlanRoute) => void;
  onMacroDay: (planId: string, personId: string, date: string, on: boolean) => void;
  onCopyPersonDays: (planId: string, dates: string[], fromId: string, toId: string, mealIds: string[]) => void;
}) {
  const [goals, setGoals] = useState<SavedMacroGoal[]>([]);
  useEffect(() => {
    const load = () => {
      readSavedMacroGoals().then(setGoals).catch(() => setGoals([]));
    };
    load();
    window.addEventListener(CLOUD_EVENT, load);
    return () => window.removeEventListener(CLOUD_EVENT, load);
  }, []);
  const meals = mealsFor(plan, date, undefined, person.id);
  const snacks = mealsFor(plan, date, "snack", person.id);
  const math = meals.length && recipeByUid.size ? sumPlanMeals(meals, recipeByUid, plan.beefChoice) : null;
  const goal = goalTargets(goalForPlanPerson(goals, person)?.goals);
  const macro = macroDayOn(plan, person.id, date);
  const other = (plan.people ?? []).find((item) => item.id !== person.id);
  const tailored = meals.some((meal) => meal.fitScale != null || meal.meatTrim != null || Boolean(meal.sideName) || Boolean(meal.carbItem) || Boolean(meal.tweaks?.length));
  const canCopy = Boolean(picked && macro && other && meals.some((meal) => meal.recipeUid));
  return (
    <div className="rounded-2xl border border-line px-2 py-2">
      <div className="mb-1 flex items-center gap-2">
        <button
          type="button"
          aria-pressed={macro}
          onClick={() => onMacroDay(plan.id, person.id, date, !macro)}
          className={`h-7 max-w-[9rem] truncate rounded-full px-2 text-[11px] font-semibold ${macro ? "bg-tomato text-tomato-ink" : "border border-line text-muted"}`}
        >
          {person.name || "Choose a person"}
        </button>
        {tailored ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-muted">
            macros <Check className="size-3" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1" />
        <button type="button" aria-label={`Add a meal for ${person.name || "person"}`} onClick={() => onOpen({ kind: "add", planId: plan.id, date, slot: "breakfast", personId: person.id })} className="inline-flex size-7 items-center justify-center rounded-full border border-line">
          <Plus className="size-3" />
        </button>
      </div>
      <button type="button" onClick={() => onOpen({ kind: "day", planId: plan.id, date })} className="grid w-full grid-cols-3 gap-1 text-left">
        <Bubble meals={mealsFor(plan, date, "breakfast", person.id)} empty="Breakfast" />
        <Bubble meals={mealsFor(plan, date, "lunch", person.id)} empty="Lunch" />
        <Bubble meals={mealsFor(plan, date, "supper", person.id)} empty="Supper" />
      </button>
      {math ? goal ? <p className="mt-1 text-xs tabular-nums text-muted">{formatGoalPercents(math.macros, goal)}{math.partial ? " · partial" : ""}</p> : <MacroLine math={math} flush /> : <p className="mt-1 text-xs text-muted">No meals</p>}
      {canCopy && other ? (
        <CopySelection plan={plan} dates={[date]} fromId={person.id} toId={other.id} size="compact" lit onCopy={onCopyPersonDays} />
      ) : null}
      {snacks.length ? <p className="mt-1 truncate text-xs text-muted">Snack: {snacks.map((meal) => shortName(meal)).join(", ")}</p> : null}
    </div>
  );
}

function money(amount: number): string {
  return amount >= 100 ? `$${Math.round(amount)}` : `$${amount.toFixed(2)}`;
}

function Bubble({ meals, empty }: { meals: PlannedMeal[]; empty: string }) {
  const first = meals[0];
  return (
    <span className={`block truncate rounded-full px-2 py-1 text-xs ${first ? "bg-gold-bg font-semibold text-ink" : "bg-chip text-muted"}`}>
      {first ? shortName(first) : empty}
      {meals.length > 1 ? ` +${meals.length - 1}` : ""}
    </span>
  );
}

function GoalPercentLine({ math, targets }: { math: { macros: Parameters<typeof formatMealLine>[0]; partial: boolean }; targets: GoalTargets }) {
  return (
    <p className="mt-1 pl-28 text-xs leading-snug tabular-nums text-muted" title={math.partial ? "A paired ingredient had an amount the library could not scale, so this percent is short." : "Percent of the daily macro goal. C is calories."}>
      {formatGoalPercents(math.macros, targets)}
      {math.partial ? " · partial" : ""}
    </p>
  );
}

function MacroLine({ math, flush }: { math: { macros: Parameters<typeof formatMealLine>[0]; partial: boolean }; flush?: boolean }) {
  return (
    <p className={`${flush ? "mt-0.5 text-ink/70" : "mt-1 pl-28 text-muted"} text-xs leading-snug tabular-nums`} title={math.partial ? "A paired ingredient had an amount the library could not scale, so this total is short." : undefined}>
      {formatMealLine(math.macros)}
      {math.partial ? " · partial" : ""}
    </p>
  );
}

function draftFromRecipe(recipe: Recipe): NonNullable<PlannedMeal["plate"]> {
  const lines: Array<{ name: string; servings: number }> = [];
  for (const entry of recipe.ingredients ?? []) {
    if (!entry || typeof entry === "string") continue;
    const name = entry.item?.trim();
    const servings = servingsFromRaw(entry.raw);
    if (!name || servings == null) continue;
    lines.push({ name, servings });
  }
  return restorePlate(lines, loadToppings());
}

function DayPage({
  plan,
  date,
  recipeByUid,
  targets,
  onOpen,
  onRemoveMeal,
  onNotify,
  onMacroDay,
  onCopyPersonDays,
  onLogDays,
}: {
  plan: MealPlan;
  date: string;
  recipeByUid: ReadonlyMap<string, Recipe>;
  targets: GoalTargets | null | undefined;
  onOpen: (route: PlanRoute) => void;
  onRemoveMeal: (planId: string, date: string, mealId: string) => void;
  onNotify: (message: string) => void;
  onMacroDay: (planId: string, personId: string, date: string, on: boolean) => void;
  onCopyPersonDays: (planId: string, dates: string[], fromId: string, toId: string, mealIds: string[]) => void;
  onLogDays: (dates: string[]) => Promise<string>;
}) {
  const paired = twoPeople(plan);
  const meals = mealsFor(plan, date);
  const math = !paired && meals.length && recipeByUid.size ? sumPlanMeals(meals, recipeByUid, plan.beefChoice) : null;
  const weights = paired ? "" : dayWeights(meals, recipeByUid, plan.beefChoice);
  const [goals, setGoals] = useState<SavedMacroGoal[]>([]);
  useEffect(() => {
    if (!paired) return;
    const load = () => {
      readSavedMacroGoals().then(setGoals).catch(() => setGoals([]));
    };
    load();
    window.addEventListener(CLOUD_EVENT, load);
    return () => window.removeEventListener(CLOUD_EVENT, load);
  }, [paired]);
  const shop = paired ? dayShop(plan, date, recipeByUid) : null;
  const [logging, setLogging] = useState(false);
  const runLog = async () => {
    if (logging) return;
    setLogging(true);
    try {
      onNotify(await onLogDays([date]));
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not log this day.");
    } finally {
      setLogging(false);
    }
  };
  return (
    <Shell
      title={formatDay(date)}
      onBack={() => onOpen({ kind: "edit", planId: plan.id })}
      footer={
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => void runLog()} disabled={logging} className="h-11 w-full rounded-full border border-line bg-surface text-sm font-semibold disabled:opacity-50">
            {logging ? "Logging…" : "Log day"}
          </button>
          <button
            type="button"
            onClick={() => {
              onNotify("Day saved.");
              onOpen({ kind: "edit", planId: plan.id });
            }}
            className="h-11 w-full rounded-full bg-tomato text-sm font-semibold text-tomato-ink"
          >
            Save day
          </button>
        </div>
      }
    >
      {paired ? (
        <>
          {(plan.people ?? []).map((person) => {
            const mine = mealsFor(plan, date, undefined, person.id);
            const mineMath = mine.length && recipeByUid.size ? sumPlanMeals(mine, recipeByUid, plan.beefChoice) : null;
            const goal = goalTargets(goalForPlanPerson(goals, person)?.goals);
            const macro = macroDayOn(plan, person.id, date);
            const mineWeights = dayWeights(mine, recipeByUid, plan.beefChoice);
            const plateSlot = SLOT_ORDER.find((item) => item !== "snack" && !mine.some((meal) => meal.slot === item)) ?? "supper";
            const tailored = mine.some((meal) => meal.fitScale != null || meal.meatTrim != null || Boolean(meal.sideName) || Boolean(meal.carbItem) || Boolean(meal.tweaks?.length));
            const other = (plan.people ?? []).find((item) => item.id !== person.id);
            const canCopy = Boolean(macro && other && mine.some((meal) => meal.recipeUid));
            return (
              <section key={person.id} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={macro}
                    onClick={() => onMacroDay(plan.id, person.id, date, !macro)}
                    className={`h-9 max-w-full truncate rounded-full px-3 font-display text-lg font-semibold ${macro ? "bg-tomato text-tomato-ink" : "border border-line text-muted"}`}
                  >
                    {person.name || "Choose a person"}
                  </button>
                  {tailored ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-muted">
                      macros <Check className="size-4" />
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onOpen({ kind: "add", planId: plan.id, date, slot: "breakfast", personId: person.id })} className="h-11 rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink">
                    Add meal
                  </button>
                  <button type="button" onClick={() => onOpen({ kind: "add", planId: plan.id, date, slot: "snack", personId: person.id })} className="h-11 rounded-full border border-line bg-surface px-4 text-sm font-semibold">
                    Add snack
                  </button>
                  <button type="button" onClick={() => onOpen({ kind: "plate", planId: plan.id, date, slot: plateSlot, personId: person.id })} className="h-11 rounded-full border border-line bg-surface px-4 text-sm font-semibold">
                    Build a plate
                  </button>
                  {canCopy && other ? (
                    <CopySelection plan={plan} dates={[date]} fromId={person.id} toId={other.id} size="day" lit onCopy={onCopyPersonDays} />
                  ) : null}
                </div>
                {mineMath ? (
                  <div className="rounded-card border border-line bg-surface px-3 py-3">
                    <p className="text-xs font-semibold text-muted">Day total</p>
                    <p className="mt-1 text-sm font-semibold leading-snug tabular-nums">
                      {formatMealLine(mineMath.macros)}
                      {mineMath.partial ? " · partial" : ""}
                    </p>
                    {goal ? (
                      <>
                        <p className="mt-3 text-xs font-semibold text-muted">Goal · {goalForPlanPerson(goals, person)?.name}</p>
                        <p className="mt-1 text-sm leading-snug tabular-nums">{formatGoalLine(goal)}</p>
                        <p className="mt-3 text-xs font-semibold text-muted">Of goal</p>
                        <p className="mt-1 text-sm font-semibold leading-snug tabular-nums">{formatGoalPercents(mineMath.macros, goal)}</p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-muted">No saved macro for this name.</p>
                    )}
                    {mineWeights ? <p className="mt-2 text-sm text-muted">{mineWeights}</p> : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted">No meals</p>
                )}
                <DayMeals plan={plan} date={date} meals={mine} recipeByUid={recipeByUid} personId={person.id} onOpen={onOpen} onRemoveMeal={onRemoveMeal} />
              </section>
            );
          })}
          {shop ? (
            <div className="rounded-card border border-line bg-surface px-3 py-3">
              <p className="text-xs font-semibold text-muted">Shopping, both people</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">
                {money(shop.cost)}
                {shop.partial ? " · partial" : ""}
              </p>
              {shop.lines.length ? (
                <ul className="mt-2 flex flex-col gap-0.5">
                  {shop.lines.map((line) => (
                    <li key={line} className="text-xs leading-snug text-muted">{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onOpen({ kind: "add", planId: plan.id, date, slot: "breakfast" })} className="h-11 rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink">
              Add meal
            </button>
            <button type="button" onClick={() => onOpen({ kind: "add", planId: plan.id, date, slot: "snack" })} className="h-11 rounded-full border border-line bg-surface px-4 text-sm font-semibold">
              Add snack
            </button>
            <button
              type="button"
              onClick={() => {
                const used = new Set(meals.map((meal) => meal.slot));
                const slot = SLOT_ORDER.find((item) => !used.has(item)) ?? "supper";
                onOpen({ kind: "plate", planId: plan.id, date, slot });
              }}
              className="h-11 rounded-full border border-line bg-surface px-4 text-sm font-semibold"
            >
              Build a plate
            </button>
          </div>
          {math ? (
            <div className="rounded-card border border-line bg-surface px-3 py-3">
              <p className="text-xs font-semibold text-muted">Day total</p>
              <p className="mt-1 text-sm font-semibold leading-snug tabular-nums">
                {formatMealLine(math.macros)}
                {math.partial ? " · partial" : ""}
              </p>
              {targets ? (
                <>
                  <p className="mt-3 text-xs font-semibold text-muted">Goal</p>
                  <p className="mt-1 text-sm leading-snug tabular-nums">{formatGoalLine(targets)}</p>
                  <p className="mt-3 text-xs font-semibold text-muted">Of goal</p>
                  <p className="mt-1 text-sm font-semibold leading-snug tabular-nums">{formatGoalPercents(math.macros, targets)}</p>
                  {weights ? <p className="mt-2 text-sm text-muted">{weights}</p> : null}
                </>
              ) : null}
            </div>
          ) : null}
          <DayMeals plan={plan} date={date} meals={meals} recipeByUid={recipeByUid} onOpen={onOpen} onRemoveMeal={onRemoveMeal} />
        </>
      )}
    </Shell>
  );
}

function DayMeals({
  plan,
  date,
  meals,
  recipeByUid,
  personId,
  onOpen,
  onRemoveMeal,
}: {
  plan: MealPlan;
  date: string;
  meals: PlannedMeal[];
  recipeByUid: ReadonlyMap<string, Recipe>;
  personId?: string;
  onOpen: (route: PlanRoute) => void;
  onRemoveMeal: (planId: string, date: string, mealId: string) => void;
}) {
  if (!meals.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {[...meals].sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot)).map((meal) => {
        const recipe = recipeByUid.get(meal.recipeUid) ?? null;
        const shown = planMealMath(meal, recipeByUid, plan.beefChoice);
        const edited = recipe && meal.lines?.length ? recipeFromLines(recipe, meal.lines) : null;
        const ingredients = recipe ? usedIngredientLines(edited ?? recipe, recipeByUid, mealScale(meal), meal.meatTrim ?? 1, meal.carbItem, meal.carbScale, meal.tweaks, plan.beefChoice) : [];
        if (meal.sideName && meal.sideServings) ingredients.push(formatSide(meal.sideName, meal.sideServings));
        const who = personId ? { personId } : {};
        return (
          <li key={meal.id} className="relative rounded-card border border-line bg-surface px-3 py-3">
            {meal.plate || meal.recipeUid.startsWith("custom-") ? (
              <button
                type="button"
                aria-label={`Edit ${meal.title}`}
                onClick={() => onOpen({ kind: "plate", planId: plan.id, date, slot: meal.slot, mealId: meal.id, ...who })}
                className="absolute inset-0 z-0 rounded-card"
              />
            ) : meal.recipeUid ? (
              <button
                type="button"
                aria-label={`Edit ${meal.title}`}
                onClick={() => onOpen({ kind: "recipe", planId: plan.id, date, slot: meal.slot, uid: meal.recipeUid, mealId: meal.id, ...who })}
                className="absolute inset-0 z-0 rounded-card"
              />
            ) : null}
            <div className="pointer-events-none relative flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {SLOT_LABEL[meal.slot]} · {meal.title}
                  {meal.versionLabel ? ` · ${meal.versionLabel}` : ""}
                </p>
                {shown ? <MacroLine math={shown} flush /> : recipeByUid.size ? <p className="mt-0.5 text-xs text-muted">No macros for this meal.</p> : null}
              </div>
              <button type="button" aria-label={`Remove ${meal.title}`} onClick={() => onRemoveMeal(plan.id, date, meal.id)} className="pointer-events-auto relative z-10 inline-flex size-9 shrink-0 items-center justify-center rounded-full">
                <X className="size-4" />
              </button>
            </div>
            {ingredients.length ? (
              <ul className="pointer-events-none relative mt-2 flex flex-col gap-0.5">
                {ingredients.map((line, index) => (
                  <li key={`${meal.id}-${index}`} className="text-xs leading-snug text-muted">{line}</li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function AddPage({
  plan,
  date,
  slot,
  personId,
  recipes,
  versionsByBase,
  onOpen,
  onPick,
}: {
  plan: MealPlan;
  date: string;
  slot: MealSlot;
  personId?: string;
  recipes: SlimRecipe[];
  versionsByBase: Map<string, SlimRecipe[]>;
  onOpen: (route: PlanRoute) => void;
  onPick: (recipe: SlimRecipe) => void;
}) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [chipsOpen, setChipsOpen] = useState(true);
  const [visible, setVisible] = useState(60);
  const sentinel = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => filterCatalog(recipes, versionsByBase, filters, filters.search), [recipes, versionsByBase, filters]);
  const counts = useMemo(() => countFacets(recipes, filters, filters.search), [recipes, filters]);
  const meats = recipes.length ? MEAT_ORDER.filter((meat) => recipes.some((recipe) => recipe.proteins.includes(meat)) || filters.meats.includes(meat)) : MEAT_ORDER.filter((meat) => meat !== "Turkey");
  const total = useMemo(() => {
    const titles = new Set<string>();
    for (const recipe of recipes) {
      const title = recipe.title.trim().toLowerCase();
      if (title) titles.add(title);
    }
    return titles.size;
  }, [recipes]);
  const searching = Boolean(filters.search.trim()) || activeFilterCount(filters) > 0;
  const shown = filtered.slice(0, visible);

  const person = personId && twoPeople(plan) ? plan.people?.find((item) => item.id === personId) : undefined;
  const who = personId ? { personId } : {};

  useEffect(() => setVisible(60), [filters]);
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible((count) => count + 60);
    }, { rootMargin: "600px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [filtered.length]);

  return (
    <Shell title={person ? `${person.name || "Person"} · ${formatDay(date)}` : `Add to ${formatDay(date)}`} onBack={() => onOpen({ kind: "edit", planId: plan.id })}>
      <div className="flex gap-2 overflow-x-auto">
        {SLOT_ORDER.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={slot === item}
            onClick={() => onOpen({ kind: "add", planId: plan.id, date, slot: item, ...who })}
            className={`h-11 shrink-0 rounded-full px-3 text-sm font-semibold ${slot === item ? "bg-tomato text-tomato-ink" : "border border-line bg-surface"}`}
          >
            {SLOT_LABEL[item]}
          </button>
        ))}
      </div>
      <label className="relative block">
        <span className="sr-only">Search recipes or ingredients</span>
        <input
          value={filters.search}
          onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          placeholder="Search recipes or ingredients"
          className="h-11 w-full rounded-full border border-line bg-surface px-4 text-sm outline-none focus:border-tomato"
        />
      </label>
      <button type="button" aria-expanded={chipsOpen} onClick={() => setChipsOpen((open) => !open)} className="flex h-11 items-center gap-2 self-start text-sm font-semibold">
        <ChevronDown className={`size-4 motion-safe:transition-transform ${chipsOpen ? "rotate-180" : ""}`} />
        {chipsOpen ? "Hide course, meat, and source" : "Course, meat, and source"}
      </button>
      {chipsOpen ? (
        <div className="flex flex-col gap-2">
          <CatalogFilterChips filters={filters} counts={counts} meats={meats} loaded={recipes.length > 0} onChange={setFilters} />
        </div>
      ) : null}
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
            <button type="button" onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })} className="text-sm font-semibold text-tomato">
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
        <p className="text-sm text-muted">No recipes match.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {shown.map((recipe) => {
            const versionCount = versionsByBase.get(recipe.uid)?.length ?? 0;
            return (
              <li key={recipe.uid}>
                <button type="button" onClick={() => onPick(recipe)} className="flex h-full w-full flex-col overflow-hidden rounded-card bg-surface text-left shadow-md">
                  <div className="aspect-square">
                    <RecipeArt title={recipe.title} course={recipe.course} thumb={recipe.thumb} videoThumb={recipe.videoThumb} custom={recipe.custom} />
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <h3 className="line-clamp-3 font-display text-base leading-snug font-semibold">{recipe.title}</h3>
                    <div className="mt-auto flex flex-wrap items-center gap-1">
                      <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-ink">{recipe.course}</span>
                      {recipe.proteins.map((protein) => (
                        <span key={protein} className="rounded-full bg-bg px-2 py-0.5 text-xs text-ink">{meatLabel(protein)}</span>
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
    </Shell>
  );
}

function MonthCalendar({ start, end, onRange }: { start: string; end: string; onRange: (start: string, end: string) => void }) {
  const initial = start ? parseKey(start) : new Date();
  const [cursor, setCursor] = useState({ year: initial.getFullYear(), month: initial.getMonth() });
  const [anchor, setAnchor] = useState<string | null>(start && !end ? start : null);
  const first = new Date(cursor.year, cursor.month, 1);
  const lead = first.getDay();
  const count = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const cells: Array<string | null> = [...Array(lead).fill(null)];
  for (let day = 1; day <= count; day += 1) cells.push(todayKey(new Date(cursor.year, cursor.month, day)));
  const from = start && end ? (start <= end ? start : end) : "";
  const to = start && end ? (start <= end ? end : start) : "";
  const today = todayKey();

  const pick = (key: string) => {
    if (!anchor) {
      setAnchor(key);
      onRange(key, key);
      return;
    }
    onRange(anchor <= key ? anchor : key, anchor <= key ? key : anchor);
    setAnchor(null);
  };

  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => setCursor((current) => shiftMonth(current, -1))} className="inline-flex size-11 items-center justify-center rounded-full">
          <ChevronLeft className="size-5" />
        </button>
        <p className="font-display text-lg font-semibold">{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
        <button type="button" aria-label="Next month" onClick={() => setCursor((current) => shiftMonth(current, 1))} className="inline-flex size-11 items-center justify-center rounded-full">
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
        {WEEKDAYS.map((day) => (
          <span key={day} className="py-1">{day}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((key, index) => {
          if (!key) return <span key={`empty-${index}`} />;
          const selected = key === from || key === to || (anchor === key && !end);
          const inside = Boolean(from && to && key > from && key < to);
          return (
            <button
              key={key}
              type="button"
              onClick={() => pick(key)}
              className={`inline-flex h-11 items-center justify-center rounded-full text-sm font-medium ${selected ? "bg-tomato text-tomato-ink" : inside ? "bg-gold-bg text-ink" : "bg-bg"} ${key === today && !selected ? "ring-1 ring-tomato" : ""}`}
            >
              {Number(key.slice(-2))}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-muted">{anchor && start === end ? "Now tap the last day." : "Tap the first day, then the last day."}</p>
    </div>
  );
}

function SplitChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={`h-10 rounded-full px-3 text-sm font-semibold ${selected ? "bg-tomato text-tomato-ink" : "border border-line bg-surface"}`}>
      {label}
    </button>
  );
}

function dayShop(plan: MealPlan, date: string, catalog: ReadonlyMap<string, Recipe>): { cost: number; partial: boolean; lines: string[] } | null {
  const meals = mealsFor(plan, date);
  if (!meals.length || !catalog.size) return null;
  const totals = new Map<string, number>();
  const add = (name: string, servings: number) => {
    if (!name || servings <= 0) return;
    totals.set(name, (totals.get(name) ?? 0) + servings);
  };
  for (const meal of meals) {
    const recipe = meal.recipeUid ? catalog.get(meal.recipeUid) : undefined;
    if (recipe) {
      const basis = meal.lines?.length ? recipeFromLines(recipe, meal.lines) : recipe;
      for (const row of usedLibraryServings(basis, catalog, mealScale(meal), meal.meatTrim ?? 1, meal.carbItem, meal.carbScale, meal.tweaks, plan.beefChoice)) {
        add(row.name, row.servings);
      }
    }
    if (meal.sideName && meal.sideServings) add(meal.sideName, meal.sideServings);
  }
  const math = sumPlanMeals(meals, catalog, plan.beefChoice);
  const lines = [...totals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, servings]) => {
      const item = getIngredient(name);
      return item ? `${name} · ${describeUse(item, servings)}` : name;
    });
  return { cost: math?.macros.cost ?? 0, partial: Boolean(math?.partial), lines };
}

function dayWeights(meals: PlannedMeal[], catalog: ReadonlyMap<string, Recipe>, beef?: BeefChoice): string {
  if (meals.length < 2 || !meals.some((meal) => meal.portion != null && Math.abs((meal.portion ?? 1) - 1) > 0.001)) return "";
  const grouped = new Map<string, number>();
  for (const meal of meals) {
    const math = planMealMath(meal, catalog, beef);
    const calories = math ? math.macros.calories : 0;
    const label = SLOT_LABEL[meal.slot];
    grouped.set(label, (grouped.get(label) ?? 0) + calories);
  }
  const rows = [...grouped.entries()];
  const total = rows.reduce((sum, [, calories]) => sum + calories, 0);
  if (total <= 0) return "";
  const percents = rows.map(([, calories]) => Math.round((100 * calories) / total));
  const drift = 100 - percents.reduce((sum, value) => sum + value, 0);
  if (percents.length) percents[percents.length - 1] = (percents[percents.length - 1] ?? 0) + drift;
  return rows.map(([label], index) => `${label} ${percents[index]}`).join(" · ");
}

function shortName(meal: PlannedMeal): string {
  const name = meal.versionLabel ? `${meal.title} ${meal.versionLabel}` : meal.title;
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
}

function shiftMonth(current: { year: number; month: number }, delta: number): { year: number; month: number } {
  const date = new Date(current.year, current.month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function statusRank(status: ReturnType<typeof planStatus>): number {
  if (status === "In progress") return 0;
  if (status === "Upcoming") return 1;
  if (status === "Draft") return 2;
  return 3;
}

export function describeAdd(date: string, slot: MealSlot): string {
  return `Add to ${formatDay(date)} · ${SLOT_LABEL[slot]}`;
}

export { planHash };
