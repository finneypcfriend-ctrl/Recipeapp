import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Plus, Settings, Star, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccountBar, useHouseholdEmail, useHouseholdName } from "@/components/plans/account";
import { CookBoard, CookingPage, PrepPage } from "@/components/plans/cook";
import { PlatePage } from "@/components/plans/plate";
import { loadPlateTemplates, loadToppings, restorePlate, servingsFromRaw } from "@/lib/plans/toppings";
import { FindMacros } from "@/components/plans/find";
import { AddPersonButton, PersonSelect, useSavedPeople } from "@/components/plans/people";
import { CLOUD_EVENT, addTemplates, archiveHistory, renameHousehold, saveHistory, saveTemplates, watchHistory, watchTemplates } from "@/lib/cloud/sync";
import { snapshotPlan, type HistoryEntry, type HistoryMeal } from "@/lib/plans/history";
import { type MacroLog, addLoggedMacros, logWeeks, parseLoggedMacros, scaleTargets } from "@/lib/plans/logs";
import { readMacroGoals, readMacroLogs, readPersonGroups, readPlanDefaults, readSavedMacroGoals, readSavedPeople, writeMacroLogs, writePlanDefaults, writeSavedMacroGoal, writeSavedMacroGoals, writeSavedPeople } from "@/lib/recipes/idb";
import { describeUse } from "@/lib/plans/grocery";
import { addLeftover, loadLeftovers, removeLeftover, type Leftover } from "@/lib/plans/leftovers";
import { definedBatchServings, meatPounds } from "@/lib/plans/batch-yield";
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
  mealsForGroup,
  macroDayOn,
  parseKey,
  peopleForDay,
  planDates,
  planHash,
  planStatus,
  plansOnDate,
  todayKey,
  twoPeople,
  shiftDay,
  type BeefChoice,
  type ChipTarget,
  type DayCopyTarget,
  type DaySplit,
  type GoalTargets,
  type MacroGoals,
  type MacroMode,
  type MealPlan,
  type MealSlot,
  type PlanBatch,
  type PersonGroup,
  type PlanDefaults,
  type PlanPerson,
  type PlanRoute,
  type PlanTemplate,
  type PlannedMeal,
  type SavedMacroGoal,
  type SavedPerson,
  type SnackDraw,
} from "@/lib/plans/model";
import { MEAT_ORDER, meatLabel } from "@/lib/recipes/classify";
import { countFacets, filterCatalog } from "@/lib/recipes/filter";
import { formatCount } from "@/lib/recipes/format";
import { DEFAULT_FILTERS, activeFilterCount } from "@/lib/recipes/prefs";
import { loadSupplements, saveSupplements, type SupplementItem } from "@/lib/plans/supplements";
import { getIngredient, searchIngredients } from "@/lib/sourced";
import { formatGoalLine, formatGoalPercents, formatMealLine, formatSide, isMeatName, mealScale, planMealMath, plateServings, recipeFromLines, sumPlanMeals, usedIngredientLines, usedLibraryServings } from "@/lib/sourced/meal";
import { isVersionRecipe, versionLabelOf } from "@/lib/recipes/lines";
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
  onCopyPlans,
  onCopyStored,
  onCopyInto,
  onSwapDays,
  onRemoveMeal,
  onCopyPersonDays,
  onCopyMeal,
  onCopyDays,
  onNotify,
  onPick,
  onTailorDays,
  onFitPrefs,
  onBeefChoice,
  onSavePlate,
  onPeople,
  onAddPeople,
  onRemovePeople,
  onRemoveSeat,
  onAssignBatch,
  onSaveBatch,
  onUpdateBatch,
  onRemoveBatch,
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
  onRange: (planId: string, start: string, end: string, dates?: string[]) => void;
  onSave: (planId: string) => void;
  onRemovePlan: (planId: string) => void;
  onCopyPlans: (planId: string, rangeDates: string[], pairs: Array<{ from: string; to: string }>) => void;
  onCopyStored: (source: MealPlan, rangeDates: string[], pairs: Array<{ from: string; to: string }>) => void;
  onCopyInto: (targetId: string, source: MealPlan, pairs: Array<{ from: string; to: string }>) => void;
  onSwapDays: (planId: string, a: string, b: string) => void;
  onRemoveMeal: (planId: string, date: string, mealId: string) => void;
  onCopyPersonDays: (planId: string, dates: string[], fromId: string, toId: string, mealIds: string[]) => void;
  onCopyMeal: (planId: string, mealId: string, targets: ChipTarget[]) => void;
  onCopyDays: (fromPlanId: string, pairs: Array<{ from: string; to: DayCopyTarget }>) => void;
  onNotify: (message: string) => void;
  onPick: (recipe: SlimRecipe) => void;
  onTailorDays: (dates: string[], only?: Record<string, string[] | null>) => Promise<string>;
  onFitPrefs: (planId: string, split: DaySplit, snackFrom: SnackDraw) => void;
  onBeefChoice: (planId: string, choice: BeefChoice) => void;
  onSavePlate: (meal: { title: string; lines: Array<{ name: string; servings: number }>; draft: NonNullable<MealPlan["days"][string][number]["plate"]> }) => Promise<void>;
  onPeople: (planId: string, people: PlanPerson[] | null) => void;
  onAddPeople: (planId: string, dates: string[], personIds: string[], groups: Array<{ id: string; name: string }>, onlyMissing?: boolean) => void;
  onRemovePeople: (planId: string, dates: string[], personIds: string[], groups: Array<{ id: string; name: string }>) => void;
  onRemoveSeat: (planId: string, date: string, seat: { kind: "person" | "group"; id: string }) => void;
  onAssignBatch: (planId: string, batch: PlanBatch, date: string, slot: MealSlot, servings: number, personId?: string) => void;
  onSaveBatch: (planId: string, batch: PlanBatch, draws: Array<{ date: string; slot: MealSlot; servings: number; personId?: string }>) => void;
  onUpdateBatch: (planId: string, batch: PlanBatch) => void;
  onRemoveBatch: (planId: string, batchId: string) => void;
  onMacroDay: (planId: string, personId: string, date: string, on: boolean) => void;
  onLogDays: (dates: string[], only?: Record<string, string[] | null>) => Promise<string>;
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
    return <PlanList plans={plans} recipeByUid={recipeByUid} onOpen={onOpen} onCreate={onCreate} onRemovePlan={onRemovePlan} onCopyPlans={onCopyPlans} onNotify={onNotify} />;
  }
  if (route.kind === "history" || route.kind === "historyItem" || route.kind === "historyDay" || route.kind === "historyMeal") {
    return <HistoryPage route={route} plans={plans} onOpen={onOpen} onCopyStored={onCopyStored} onCopyInto={onCopyInto} onNotify={onNotify} />;
  }
  if (route.kind === "templates") {
    return <TemplatesPage plans={plans} saveId={route.saveId} onOpen={onOpen} onCopyStored={onCopyStored} onCopyInto={onCopyInto} onNotify={onNotify} />;
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
  if (route.kind === "restock") {
    return (
      <Shell title="Restock" onBack={() => onOpen({ kind: "list" })}>
        <ShopCheckout plans={plans} planIds={[]} catalog={recipeByUid} restock onOpen={onOpen} onNotify={onNotify} />
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
  if (route.kind === "batch" && route.batchId) {
    const batch = (plan.batches ?? []).find((item) => item.id === route.batchId);
    const recipe = batch ? resolveBatchRecipe(batch, recipeByUid) : undefined;
    if (!batch) {
      return (
        <Shell title="Batch" onBack={() => onOpen({ kind: "edit", planId: plan.id })}>
          <p className="text-sm text-muted">That batch is no longer on this plan.</p>
        </Shell>
      );
    }
    if (!recipe) {
      return (
        <Shell title={batch.title} onBack={() => onOpen({ kind: "edit", planId: plan.id })}>
          <p className="text-sm text-muted">That recipe isn’t in the library anymore. The batch is still on this plan.</p>
        </Shell>
      );
    }
    return (
      <Shell title={batchChipName(batch, recipeByUid)} onBack={() => onOpen({ kind: "edit", planId: plan.id })}>
        <BatchSettings
          batch={batch}
          recipe={recipe}
          catalog={recipeByUid}
          onView={() => onOpen({ kind: "batch", planId: plan.id, uid: recipe.uid })}
          onSave={(next) => onUpdateBatch(plan.id, { ...next, recipeUid: recipe.uid })}
        />
      </Shell>
    );
  }
  if (route.kind === "batch") {
    return (
      <AddPage
        mode="batch"
        plan={plan}
        date={plan.start}
        slot="lunch"
        recipes={recipes}
        versionsByBase={versionsByBase}
        onOpen={onOpen}
        onPick={(recipe) => onOpen({ kind: "batch", planId: plan.id, uid: recipe.uid })}
      />
    );
  }
  if (route.kind === "edit") {
    return <RangePage plan={plan} plans={plans} recipes={recipes} recipeByUid={recipeByUid} targets={targets} menu={route.menu} onOpen={onOpen} onRange={onRange} onSave={onSave} onNotify={onNotify} onTailorDays={onTailorDays} onFitPrefs={onFitPrefs} onBeefChoice={onBeefChoice} onPeople={onPeople} onAddPeople={onAddPeople} onRemovePeople={onRemovePeople} onRemoveMeal={onRemoveMeal} onAssignBatch={onAssignBatch} onRemoveBatch={onRemoveBatch} onRemoveSeat={onRemoveSeat} onMacroDay={onMacroDay} onCopyPersonDays={onCopyPersonDays} onCopyMeal={onCopyMeal} onCopyDays={onCopyDays} onSwapDays={onSwapDays} onLogDays={onLogDays} />;
  }
  if (route.kind === "day") {
    return <DayPage plan={plan} date={route.date} recipeByUid={recipeByUid} targets={targets} onOpen={onOpen} onRemoveMeal={onRemoveMeal} onNotify={onNotify} onMacroDay={onMacroDay} onLogDays={onLogDays} />;
  }
  if (route.kind === "add" || route.kind === "recipe") {
    return <AddPage plan={plan} date={route.date} slot={route.slot} personId={route.personId} menuSlot={route.kind === "add" ? route.menuSlot : undefined} recipes={recipes} versionsByBase={versionsByBase} onOpen={onOpen} onPick={onPick} />;
  }
  if (route.kind === "plate") {
    const meal = route.mealId ? (plan.days[route.date] ?? []).find((item) => item.id === route.mealId) : undefined;
    const recipe = meal ? recipeByUid.get(meal.recipeUid) : undefined;
    const initial = meal?.plate ?? (recipe ? draftFromRecipe(recipe) : undefined);
    return <PlatePage plan={plan} date={route.date} slot={route.slot} personId={route.personId} initial={initial} initialTitle={meal?.title} back={route.back} savedId={route.savedId} plateMode={route.plateMode} onOpen={onOpen} onSave={onSavePlate} />;
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
  onCopyPlans,
  onNotify,
}: {
  plans: MealPlan[];
  recipeByUid: ReadonlyMap<string, Recipe>;
  onOpen: (route: PlanRoute) => void;
  onCreate: () => void;
  onRemovePlan: (planId: string) => void;
  onCopyPlans: (planId: string, rangeDates: string[], pairs: Array<{ from: string; to: string }>) => void;
  onNotify: (message: string) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [archiving, setArchiving] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [copyPlan, setCopyPlan] = useState<MealPlan | null>(null);
  const ordered = [...plans].sort((a, b) => {
    const rank = statusRank(planStatus(a)) - statusRank(planStatus(b));
    if (rank) return rank;
    return (b.start || "").localeCompare(a.start || "");
  });
  const householdName = useHouseholdName();
  const copyReady = plans.some((plan) => chosen.includes(plan.id) && plan.start && plan.end);
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
          <button type="button" onClick={() => onOpen({ kind: "restock" })} className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold">
            Restock
          </button>
          <button type="button" onClick={() => onOpen({ kind: "groceries" })} className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold">
            Saved lists
          </button>
        </div>
        <div className="border-t border-line" />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!copyReady}
            onClick={() => {
              const selected = plans.filter((plan) => chosen.includes(plan.id) && plan.start && plan.end);
              if (selected.length !== 1) {
                onNotify("Select one date range to copy.");
                return;
              }
              setCopyPlan(selected[0] ?? null);
            }}
            className={`inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold ${copyReady ? "border-line bg-surface text-ink" : "border-line bg-bg text-muted opacity-45"}`}
          >
            Copy
          </button>
          <button
            type="button"
            disabled={!copyReady || savingTemplate}
            onClick={() => {
              const selected = plans.filter((plan) => chosen.includes(plan.id) && plan.start && plan.end);
              if (!selected.length) return;
              setSavingTemplate(true);
              const next: PlanTemplate[] = selected.map((plan) => ({
                id: crypto.randomUUID(),
                name: `${formatRange(plan.start, plan.end)} Plan`,
                savedAt: Date.now(),
                plan: JSON.parse(JSON.stringify(plan)) as MealPlan,
              }));
              void addTemplates(next)
                .then(() => onNotify(selected.length === 1 ? "Saved that plan as a template." : `Saved ${selected.length} templates.`))
                .catch((error: unknown) => onNotify(error instanceof Error ? error.message : "Could not save that template."))
                .finally(() => setSavingTemplate(false));
            }}
            className={`inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold ${copyReady ? "border-line bg-surface text-ink" : "border-line bg-bg text-muted opacity-45"}`}
          >
            {savingTemplate ? "Saving…" : "Save as Template"}
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
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onOpen({ kind: "templates" })} className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold">
            Saved templates
          </button>
          <button type="button" onClick={() => onOpen({ kind: "history" })} className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold">
            Archived plans
          </button>
        </div>
      </div>
      {copyPlan ? (
        <CopyPlanSheet
          plan={copyPlan}
          onClose={() => setCopyPlan(null)}
          onCopy={(rangeDates, pairs) => {
            onCopyPlans(copyPlan.id, rangeDates, pairs);
            setCopyPlan(null);
          }}
        />
      ) : null}
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

function PlanDefaultsSheet({ onClose }: { onClose: () => void }) {
  const [defaults, setDefaults] = useState<PlanDefaults | null>(null);
  const [people, setPeople] = useState<SavedPerson[]>([]);
  const [groups, setGroups] = useState<PersonGroup[]>([]);
  const [pickedPeople, setPickedPeople] = useState<string[]>([]);
  const [pickedGroups, setPickedGroups] = useState<string[]>([]);
  const [pickedTailorPeople, setPickedTailorPeople] = useState<string[]>([]);
  const [pickedTailorGroups, setPickedTailorGroups] = useState<string[]>([]);
  const [tailorHelp, setTailorHelp] = useState(false);
  useEffect(() => {
    readPlanDefaults().then(setDefaults).catch(() => setDefaults({ peopleOn: false, personIds: [], groupIds: [], tailorPersonIds: [], tailorGroupIds: [], tailorOn: false }));
    readSavedPeople().then(setPeople).catch(() => setPeople([]));
    readPersonGroups().then(setGroups).catch(() => setGroups([]));
  }, []);
  const save = (next: PlanDefaults) => {
    setDefaults(next);
    void writePlanDefaults(next);
  };
  const togglePick = (list: string[], id: string, set: (next: string[]) => void) => set(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  const commitPeople = () => {
    if (!defaults) return;
    save({
      ...defaults,
      personIds: [...new Set([...defaults.personIds, ...pickedPeople])],
      groupIds: [...new Set([...defaults.groupIds, ...pickedGroups])],
    });
    setPickedPeople([]);
    setPickedGroups([]);
  };
  const commitTailor = () => {
    if (!defaults) return;
    save({
      ...defaults,
      tailorPersonIds: [...new Set([...(defaults.tailorPersonIds ?? []), ...pickedTailorPeople])],
      tailorGroupIds: [...new Set([...(defaults.tailorGroupIds ?? []), ...pickedTailorGroups])],
    });
    setPickedTailorPeople([]);
    setPickedTailorGroups([]);
  };
  const dropSaved = (key: "personIds" | "groupIds" | "tailorPersonIds" | "tailorGroupIds", id: string) => {
    if (!defaults) return;
    const current = defaults[key] ?? [];
    save({ ...defaults, [key]: current.filter((item) => item !== id) });
  };
  if (!defaults) return null;
  const chips = [
    ...defaults.personIds.map((id) => ({ key: `person:${id}`, name: people.find((person) => person.id === id)?.name ?? "Person", drop: () => dropSaved("personIds", id) })),
    ...defaults.groupIds.map((id) => ({ key: `group:${id}`, name: groups.find((group) => group.id === id)?.name ?? "Group", drop: () => dropSaved("groupIds", id) })),
  ];
  const tailorChips = [
    ...(defaults.tailorPersonIds ?? []).map((id) => ({ key: `person:${id}`, name: people.find((person) => person.id === id)?.name ?? "Person", drop: () => dropSaved("tailorPersonIds", id) })),
    ...(defaults.tailorGroupIds ?? []).map((id) => ({ key: `group:${id}`, name: groups.find((group) => group.id === id)?.name ?? "Group", drop: () => dropSaved("tailorGroupIds", id) })),
  ];
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Plan settings">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <button type="button" onClick={onClose} className="inline-flex h-11 items-center rounded-full px-2 text-sm font-semibold">← Back</button>
        <h2 className="min-w-0 flex-1 truncate font-display text-xl font-semibold">Plan settings</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-4">
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-card border border-line bg-surface px-3 py-2">
              <p className="min-w-0 flex-1 font-semibold">People on a new plan</p>
              <button type="button" role="switch" aria-checked={defaults.peopleOn} aria-label="People defaults" onClick={() => save({ ...defaults, peopleOn: !defaults.peopleOn })} className={`relative h-8 w-14 shrink-0 rounded-full ${defaults.peopleOn ? "bg-[#34c759]" : "bg-[#c7c7cc]"}`}>
                <span className={`absolute top-1 size-6 rounded-full bg-white ${defaults.peopleOn ? "right-1" : "left-1"}`} />
              </button>
            </div>
            <div className="rounded-card border border-line bg-surface px-3 py-3">
              <h3 className="font-display text-lg font-semibold">Saved default people</h3>
              <p className="mt-1 text-sm text-muted">These are the people and groups a new plan starts with when the switch above is on.</p>
              {chips.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {chips.map((chip) => (
                    <span key={chip.key} className="inline-flex h-9 items-center gap-1 rounded-full bg-chip pl-3 pr-1 text-sm font-semibold">
                      {chip.name}
                      <button type="button" aria-label={`Remove ${chip.name}`} onClick={chip.drop} className="inline-flex size-7 items-center justify-center rounded-full text-muted">
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : <p className="mt-3 text-sm text-muted">No one saved yet.</p>}
            </div>
            <div className="h-0.5 bg-[#e7d7c8]" />
            <div className="flex flex-col gap-3">
              <h3 className="font-display text-lg font-semibold">Pick who to add</h3>
              <p className="text-sm leading-snug text-muted">Pick from individuals or groups below to update the default list of people included on a planning session. A group is one row under its name.</p>
              <section className="flex flex-col gap-2">
                <h4 className="text-sm font-semibold tracking-wide text-muted uppercase">People</h4>
                {people.length ? people.map((person) => {
                  const on = pickedPeople.includes(person.id);
                  return (
                    <button key={person.id} type="button" aria-pressed={on} onClick={() => togglePick(pickedPeople, person.id, setPickedPeople)} className={`flex h-14 items-center justify-between rounded-card border px-4 text-left ${on ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}>
                      <span className="font-semibold">{person.name}</span>
                      {on ? <Check className="size-4" /> : null}
                    </button>
                  );
                }) : <p className="text-sm text-muted">No people saved yet.</p>}
              </section>
              <section className="flex flex-col gap-2">
                <h4 className="text-sm font-semibold tracking-wide text-muted uppercase">Groups</h4>
                {groups.length ? groups.map((group) => {
                  const on = pickedGroups.includes(group.id);
                  const names = group.personIds.map((id) => people.find((person) => person.id === id)?.name).filter((name): name is string => Boolean(name));
                  return (
                    <button key={group.id} type="button" aria-pressed={on} onClick={() => togglePick(pickedGroups, group.id, setPickedGroups)} className={`flex min-h-14 items-center justify-between gap-3 rounded-card border px-4 py-2 text-left ${on ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}>
                      <span className="min-w-0">
                        <span className="block font-semibold">{group.name}</span>
                        <span className={`block text-xs ${on ? "text-tomato-ink/80" : "text-muted"}`}>{names.length ? names.join(", ") : "No one in this group"}</span>
                      </span>
                      {on ? <Check className="size-4 shrink-0" /> : null}
                    </button>
                  );
                }) : <p className="text-sm text-muted">No groups saved yet.</p>}
              </section>
              <button type="button" onClick={commitPeople} disabled={!pickedPeople.length && !pickedGroups.length} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-50">
                Save default people
              </button>
            </div>
          </section>
          <div className="h-0.5 bg-[#e7d7c8]" />
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-card border border-line bg-surface px-3 py-2">
              <p className="min-w-0 flex-1 font-semibold">Tailor these people</p>
              <button type="button" role="switch" aria-checked={Boolean(defaults.tailorOn)} aria-label="Tailor people defaults" onClick={() => save({ ...defaults, tailorOn: !defaults.tailorOn })} className={`relative h-8 w-14 shrink-0 rounded-full ${defaults.tailorOn ? "bg-[#34c759]" : "bg-[#c7c7cc]"}`}>
                <span className={`absolute top-1 size-6 rounded-full bg-white ${defaults.tailorOn ? "right-1" : "left-1"}`} />
              </button>
            </div>
            <div className="rounded-card border border-line bg-surface px-3 py-3">
              <div className="flex items-center gap-2">
                <h3 className="min-w-0 flex-1 font-display text-lg font-semibold">Saved Tailor people</h3>
                <button type="button" aria-expanded={tailorHelp} aria-label="What saved Tailor people does" onClick={() => setTailorHelp((value) => !value)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line">
                  <CircleHelp className="size-4" />
                </button>
              </div>
              {tailorHelp ? (
                <p className="mt-2 text-sm leading-snug text-muted">These are the people and groups Tailor runs for when you check days and do not tap a name. Tap a name on the day to run it for that person instead. If the switch above is off, or this list is empty, Tailor runs for everyone on the checked days.</p>
              ) : null}
              {tailorChips.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {tailorChips.map((chip) => (
                    <span key={chip.key} className="inline-flex h-9 items-center gap-1 rounded-full bg-chip pl-3 pr-1 text-sm font-semibold">
                      {chip.name}
                      <button type="button" aria-label={`Remove ${chip.name}`} onClick={chip.drop} className="inline-flex size-7 items-center justify-center rounded-full text-muted">
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : <p className="mt-3 text-sm text-muted">No one saved yet.</p>}
            </div>
            <div className="h-0.5 bg-[#e7d7c8]" />
            <div className="flex flex-col gap-3">
              <h3 className="font-display text-lg font-semibold">Pick who to add</h3>
              <p className="text-sm leading-snug text-muted">Pick from individuals or groups below to update the default list of people Tailor runs for. A group is one row under its name. If this list is empty, Tailor runs for everyone on the checked days.</p>
              <section className="flex flex-col gap-2">
                <h4 className="text-sm font-semibold tracking-wide text-muted uppercase">People</h4>
                {people.length ? people.map((person) => {
                  const on = pickedTailorPeople.includes(person.id);
                  return (
                    <button key={person.id} type="button" aria-pressed={on} onClick={() => togglePick(pickedTailorPeople, person.id, setPickedTailorPeople)} className={`flex h-14 items-center justify-between rounded-card border px-4 text-left ${on ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}>
                      <span className="font-semibold">{person.name}</span>
                      {on ? <Check className="size-4" /> : null}
                    </button>
                  );
                }) : <p className="text-sm text-muted">No people saved yet.</p>}
              </section>
              <section className="flex flex-col gap-2">
                <h4 className="text-sm font-semibold tracking-wide text-muted uppercase">Groups</h4>
                {groups.length ? groups.map((group) => {
                  const on = pickedTailorGroups.includes(group.id);
                  const names = group.personIds.map((id) => people.find((person) => person.id === id)?.name).filter((name): name is string => Boolean(name));
                  return (
                    <button key={group.id} type="button" aria-pressed={on} onClick={() => togglePick(pickedTailorGroups, group.id, setPickedTailorGroups)} className={`flex min-h-14 items-center justify-between gap-3 rounded-card border px-4 py-2 text-left ${on ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}>
                      <span className="min-w-0">
                        <span className="block font-semibold">{group.name}</span>
                        <span className={`block text-xs ${on ? "text-tomato-ink/80" : "text-muted"}`}>{names.length ? names.join(", ") : "No one in this group"}</span>
                      </span>
                      {on ? <Check className="size-4 shrink-0" /> : null}
                    </button>
                  );
                }) : <p className="text-sm text-muted">No groups saved yet.</p>}
              </section>
              <button type="button" onClick={commitTailor} disabled={!pickedTailorPeople.length && !pickedTailorGroups.length} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-50">
                Save Tailor people
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
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

function TemplatesPage({
  plans,
  saveId,
  onOpen,
  onCopyStored,
  onCopyInto,
  onNotify,
}: {
  plans: MealPlan[];
  saveId?: string;
  onOpen: (route: PlanRoute) => void;
  onCopyStored: (source: MealPlan, rangeDates: string[], pairs: Array<{ from: string; to: string }>) => void;
  onCopyInto: (targetId: string, source: MealPlan, pairs: Array<{ from: string; to: string }>) => void;
  onNotify: (message: string) => void;
}) {
  const [entries, setEntries] = useState<PlanTemplate[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [copySource, setCopySource] = useState<MealPlan | null>(null);
  const source = plans.find((plan) => plan.id === saveId && plan.start && plan.end);
  useEffect(() => watchTemplates(setEntries), []);
  useEffect(() => {
    if (source) setName(`${formatRange(source.start, source.end)} Plan`);
  }, [source]);
  const save = () => {
    if (!source) return;
    const label = name.trim() || `${formatRange(source.start, source.end)} Plan`;
    const next: PlanTemplate = { id: crypto.randomUUID(), name: label, savedAt: Date.now(), plan: JSON.parse(JSON.stringify(source)) as MealPlan };
    setBusy(true);
    void saveTemplates([next, ...entries])
      .then(() => {
        onNotify("Saved that plan as a template.");
        onOpen({ kind: "templates" });
      })
      .catch((error: unknown) => onNotify(error instanceof Error ? error.message : "Could not save that template."))
      .finally(() => setBusy(false));
  };
  const selected = entries.find((item) => chosen.length === 1 && item.id === chosen[0]);
  return (
    <Shell title="Saved plan templates" onBack={() => onOpen({ kind: "list" })}>
      <div className="flex flex-col gap-3">
        {source ? (
          <div className="rounded-card border border-line bg-surface px-3 py-3">
            <p className="text-sm font-semibold">Save this plan as a template</p>
            <input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-11 w-full rounded-full border border-line bg-bg px-3 text-sm" />
            <button type="button" disabled={busy} onClick={save} className="mt-2 inline-flex h-11 items-center rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink disabled:opacity-50">
              {busy ? "Saving…" : "Save template"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">Select a saved plan and tap Save as Template. It will show up here.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && setCopySource(selected.plan)}
            className={`inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold ${selected ? "border-line bg-surface text-ink" : "border-line bg-bg text-muted opacity-45"}`}
          >
            Copy
          </button>
          <button
            type="button"
            disabled={!chosen.length || busy}
            onClick={() => {
              setBusy(true);
              void saveTemplates(entries.filter((item) => !chosen.includes(item.id)))
                .then(() => setChosen([]))
                .catch((error: unknown) => onNotify(error instanceof Error ? error.message : "Could not delete that template."))
                .finally(() => setBusy(false));
            }}
            className={`inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold ${chosen.length ? "border-line bg-surface text-ink" : "border-line bg-bg text-muted opacity-45"}`}
          >
            Delete
          </button>
        </div>
        {entries.length ? (
          <ul className="flex flex-col">
            {entries.map((item, index) => {
              const on = chosen.includes(item.id);
              const days = planDates(item.plan).length;
              return (
                <li key={item.id} className={`flex items-center gap-2 py-3 ${index ? "border-t border-line" : ""}`}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`Select ${item.name}`}
                    onClick={() => setChosen((current) => (current.includes(item.id) ? current.filter((id) => id !== item.id) : [item.id]))}
                    className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full border ${on ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}
                  >
                    {on ? <Check className="size-4" /> : null}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{item.name}</span>
                    <span className="text-sm text-muted">{days} {days === 1 ? "day" : "days"} · {new Date(item.savedAt).toLocaleDateString()}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">No templates yet.</p>
        )}
      </div>
      {copySource ? (
        <CopyPlanSheet
          plan={copySource}
          into={plans.filter((plan) => plan.start && plan.end)}
          onClose={() => setCopySource(null)}
          onCopy={(rangeDates, pairs) => {
            onCopyStored(copySource, rangeDates, pairs);
            setCopySource(null);
            onNotify("Copied that template.");
            onOpen({ kind: "list" });
          }}
          onInto={(planId, pairs) => {
            onCopyInto(planId, copySource, pairs);
            setCopySource(null);
            onNotify("Copied those days into the saved plan.");
            onOpen({ kind: "edit", planId });
          }}
        />
      ) : null}
    </Shell>
  );
}

function HistoryPage({
  route,
  plans,
  onOpen,
  onCopyStored,
  onCopyInto,
  onNotify,
}: {
  route: Extract<PlanRoute, { kind: "history" | "historyItem" | "historyDay" | "historyMeal" }>;
  plans: MealPlan[];
  onOpen: (route: PlanRoute) => void;
  onCopyStored: (source: MealPlan, rangeDates: string[], pairs: Array<{ from: string; to: string }>) => void;
  onCopyInto: (targetId: string, source: MealPlan, pairs: Array<{ from: string; to: string }>) => void;
  onNotify: (message: string) => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [warn, setWarn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copySource, setCopySource] = useState<MealPlan | null>(null);
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
                <li key={day.date} className="rounded-card border border-line bg-surface p-2">
                  <button type="button" onClick={() => onOpen({ kind: "historyDay", archiveId: entry.id, date: day.date })} className="flex w-full items-center gap-2 text-left">
                    <span className="w-12 shrink-0">
                      <span className="block text-xs text-muted">{when.toLocaleDateString(undefined, { weekday: "short" })}</span>
                      <span className="font-display text-lg font-semibold">{when.getDate()}</span>
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={chosen.length !== 1}
                onClick={() => {
                  const entry = entries.find((item) => item.id === chosen[0]);
                  if (!entry?.source) {
                    onNotify("That archive was saved before meal copies. Archive the plan again to copy it.");
                    return;
                  }
                  setCopySource(entry.source);
                }}
                className={`inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold ${chosen.length === 1 ? "border-line bg-surface text-ink" : "border-line bg-bg text-muted opacity-45"}`}
              >
                Copy
              </button>
              <button
                type="button"
                disabled={!chosen.length}
                onClick={() => setWarn(true)}
                className={`inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold ${chosen.length ? "border-line bg-surface text-ink" : "border-line bg-bg text-muted opacity-45"}`}
              >
                Delete
              </button>
            </div>
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
      {copySource ? (
        <CopyPlanSheet
          plan={copySource}
          into={plans.filter((plan) => plan.start && plan.end)}
          onClose={() => setCopySource(null)}
          onCopy={(rangeDates, pairs) => {
            onCopyStored(copySource, rangeDates, pairs);
            setCopySource(null);
            onNotify("Copied that archived plan.");
            onOpen({ kind: "list" });
          }}
          onInto={(planId, pairs) => {
            onCopyInto(planId, copySource, pairs);
            setCopySource(null);
            onNotify("Copied those days into the saved plan.");
            onOpen({ kind: "edit", planId });
          }}
        />
      ) : null}
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
  plans,
  recipes,
  recipeByUid,
  targets,
  menu,
  onOpen,
  onRange,
  onSave,
  onNotify,
  onTailorDays,
  onFitPrefs,
  onBeefChoice,
  onAddPeople,
  onRemovePeople,
  onMacroDay,
  onCopyPersonDays,
  onCopyMeal,
  onCopyDays,
  onSwapDays,
  onLogDays,
  onRemoveMeal,
  onAssignBatch,
  onRemoveBatch,
  onRemoveSeat,
}: {
  plan: MealPlan;
  plans: MealPlan[];
  recipes: SlimRecipe[];
  recipeByUid: ReadonlyMap<string, Recipe>;
  targets: GoalTargets | null | undefined;
  menu?: { date: string; seat: string; slot: MealSlot };
  onOpen: (route: PlanRoute) => void;
  onRange: (planId: string, start: string, end: string, dates?: string[]) => void;
  onSave: (planId: string) => void;
  onNotify: (message: string) => void;
  onTailorDays: (dates: string[], only?: Record<string, string[] | null>) => Promise<string>;
  onFitPrefs: (planId: string, split: DaySplit, snackFrom: SnackDraw) => void;
  onBeefChoice: (planId: string, choice: BeefChoice) => void;
  onPeople: (planId: string, people: PlanPerson[] | null) => void;
  onAddPeople: (planId: string, dates: string[], personIds: string[], groups: Array<{ id: string; name: string }>, onlyMissing?: boolean) => void;
  onRemovePeople: (planId: string, dates: string[], personIds: string[], groups: Array<{ id: string; name: string }>) => void;
  onMacroDay: (planId: string, personId: string, date: string, on: boolean) => void;
  onCopyPersonDays: (planId: string, dates: string[], fromId: string, toId: string, mealIds: string[]) => void;
  onCopyMeal: (planId: string, mealId: string, targets: ChipTarget[]) => void;
  onCopyDays: (fromPlanId: string, pairs: Array<{ from: string; to: DayCopyTarget }>) => void;
  onSwapDays: (planId: string, a: string, b: string) => void;
  onLogDays: (dates: string[], only?: Record<string, string[] | null>) => Promise<string>;
  onRemoveMeal: (planId: string, date: string, mealId: string) => void;
  onAssignBatch: (planId: string, batch: PlanBatch, date: string, slot: MealSlot, servings: number, personId?: string) => void;
  onRemoveBatch: (planId: string, batchId: string) => void;
  onRemoveSeat: (planId: string, date: string, seat: { kind: "person" | "group"; id: string }) => void;
}) {
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !plan.start || !plan.end || plan.dayPeople || plan.dayGroups) return;
    seeded.current = true;
    onRange(plan.id, plan.start, plan.end);
  }, [plan.id, plan.start, plan.end, plan.dayPeople, plan.dayGroups, onRange]);
  const ready = Boolean(plan.start && plan.end);
  const [picked, setPicked] = useState<string[]>([]);
  const [seats, setSeats] = useState<Array<{ date: string; id: string }>>([]);
  const [tailoring, setTailoring] = useState(false);
  const [logging, setLogging] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [copyMeal, setCopyMeal] = useState<PlannedMeal | null>(null);
  const [copyDaysOpen, setCopyDaysOpen] = useState(false);
  const [tailorIds, setTailorIds] = useState<string[]>([]);
  const [tailorOn, setTailorOn] = useState(false);
  const days = planDates(plan);
  const allDaysOn = days.length > 0 && days.every((date) => picked.includes(date));
  const toggleDay = (date: string) => setPicked((current) => (current.includes(date) ? current.filter((item) => item !== date) : [...current, date]));
  const toggleAllDays = () => setPicked(allDaysOn ? [] : [...days]);
  const seatOn = (date: string, id: string) => seats.some((seat) => seat.date === date && seat.id === id);
  const toggleSeat = (date: string, id: string) => setSeats((current) => (current.some((seat) => seat.date === date && seat.id === id) ? current.filter((seat) => seat.date !== date || seat.id !== id) : [...current, { date, id }]));
  useEffect(() => {
    const load = () => {
      Promise.all([readPlanDefaults(), readPersonGroups()]).then(([saved, groups]) => {
        const ids = new Set(saved.tailorPersonIds ?? []);
        for (const groupId of saved.tailorGroupIds ?? []) {
          const group = groups.find((item) => item.id === groupId);
          for (const personId of group?.personIds ?? []) ids.add(personId);
        }
        setTailorIds([...ids]);
        setTailorOn(Boolean(saved.tailorOn));
      }).catch(() => { setTailorIds([]); setTailorOn(false); });
    };
    load();
    window.addEventListener(CLOUD_EVENT, load);
    return () => window.removeEventListener(CLOUD_EVENT, load);
  }, []);
  const scope = () => {
    const dates = new Set(picked);
    for (const seat of seats) dates.add(seat.date);
    const only: Record<string, string[] | null> = {};
    for (const date of dates) {
      const chosen = seats.filter((seat) => seat.date === date).map((seat) => seat.id);
      only[date] = chosen.length ? chosen : tailorOn && tailorIds.length ? tailorIds : null;
    }
    return { dates: [...dates], only };
  };
  const runTailor = async () => {
    const next = scope();
    if (!next.dates.length) return;
    setTailoring(true);
    try {
      onNotify(await onTailorDays(next.dates, next.only));
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not tailor those days.");
    } finally {
      setTailoring(false);
    }
  };
  const runLog = async () => {
    const next = scope();
    if (!next.dates.length || logging) return;
    setLogging(true);
    try {
      onNotify(await onLogDays(next.dates, next.only));
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
          <div className="flex items-center gap-2 border-t border-line pt-3">
            <h3 className="min-w-0 flex-1 font-display text-lg font-semibold">People</h3>
            <button type="button" aria-label="Plan settings" onClick={() => setDefaultsOpen(true)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface">
              <Settings className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setPeopleOpen(true)}
              className="h-11 shrink-0 rounded-full border border-line bg-surface px-4 text-sm font-semibold"
            >
              +/− People
            </button>
          </div>
          <BatchBar plan={plan} recipes={recipeByUid} onOpen={onOpen} onRemove={(batchId) => onRemoveBatch(plan.id, batchId)} />
          {peopleOpen ? (
            <AddPeopleSheet
              dates={picked}
              onClose={() => setPeopleOpen(false)}
              onAdd={(personIds, groups) => {
                onAddPeople(plan.id, picked.length ? picked : days, personIds, groups, !picked.length);
                setPeopleOpen(false);
                onNotify(picked.length ? "Added to the checked days." : "Added to the days they were not on yet.");
              }}
              onRemove={(personIds, groups) => {
                onRemovePeople(plan.id, picked.length ? picked : days, personIds, groups);
                setPeopleOpen(false);
                onNotify(picked.length ? "Removed from the checked days." : "Removed from every day in this range.");
              }}
            />
          ) : null}
          {defaultsOpen ? <PlanDefaultsSheet onClose={() => { setDefaultsOpen(false); Promise.all([readPlanDefaults(), readPersonGroups()]).then(([saved, groups]) => { const ids = new Set(saved.tailorPersonIds ?? []); for (const groupId of saved.tailorGroupIds ?? []) { const group = groups.find((item) => item.id === groupId); for (const personId of group?.personIds ?? []) ids.add(personId); } setTailorIds([...ids]); setTailorOn(Boolean(saved.tailorOn)); }).catch(() => undefined); }} /> : null}
          {picked.length || seats.length ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void runTailor()} disabled={tailoring} className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold">
                  {tailoring ? "Tailoring…" : "Tailor to Macros"}
                </button>
                <button type="button" onClick={() => void runLog()} disabled={logging} className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold">
                  {logging ? "Logging…" : "Log days"}
                </button>
                {picked.length === 2 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const [a, b] = [...picked].sort();
                      if (!a || !b) return;
                      onSwapDays(plan.id, a, b);
                      setPicked([]);
                      onNotify("Swapped those two days.");
                    }}
                    className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold"
                  >
                    Swap
                  </button>
                ) : null}
                {picked.length ? (
                  <button type="button" onClick={() => setCopyDaysOpen(true)} className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold">
                    Copy days
                  </button>
                ) : null}
                <button type="button" aria-expanded={helpOpen} aria-label="What Tailor to Macros does" onClick={() => setHelpOpen((value) => !value)} className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface text-ink">
                  <CircleHelp className="size-4" />
                </button>
              </div>
              {helpOpen ? (
                <div className="rounded-card border border-line bg-surface px-3 py-3 text-sm leading-snug text-muted">
                  <p>Tailor to Macros runs Fit, then Hone. Hone trims meat and eggs if protein is high, including a roast or an egg snack. If net carbs are still over, it reduces the highest-carb ingredient. A half egg can cover a protein gap. Tallow is added in small amounts for the remaining fat. It stops around 2% and does not cut vegetables further.</p>
                  <p className="mt-2">Check a day to tailor or log everyone on it. Tap a name to limit it to that person, even if the day is not checked. A red name is the one included.</p>
                </div>
              ) : null}
            </>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button type="button" aria-pressed={allDaysOn} aria-label={allDaysOn ? "Clear all days" : "Select all days"} onClick={toggleAllDays} className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full border ${allDaysOn ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}>
                {allDaysOn ? <Check className="size-4" /> : null}
              </button>
              <span className="text-xs font-semibold text-muted">Dates</span>
            </div>
            <div className="flex flex-col items-end">
            <button type="button" onClick={() => setDatesOpen(true)} className="h-11 rounded-full px-3 text-sm font-semibold">
              Adjust dates
            </button>
            {picked.length ? (
              <button
                type="button"
                onClick={() => {
                  const next = days.filter((date) => !picked.includes(date));
                  setPicked([]);
                  setSeats((current) => current.filter((seat) => !picked.includes(seat.date)));
                  onRange(plan.id, next[0] ?? "", next[next.length - 1] ?? "", next);
                }}
                className="h-11 rounded-full px-3 text-sm font-semibold text-tomato"
              >
                Delete days
              </button>
            ) : null}
            </div>
          </div>
          {datesOpen ? (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Adjust dates">
              <div className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-card border border-line bg-bg p-4">
                <div className="flex items-center gap-2">
                  <h3 className="min-w-0 flex-1 font-display text-lg font-semibold">Adjust dates</h3>
                  <button type="button" aria-label="Close" onClick={() => setDatesOpen(false)} className="inline-flex size-11 items-center justify-center rounded-full border border-line">
                    <X className="size-4" />
                  </button>
                </div>
                <p className="text-sm text-muted">Meals already on a day stay put. A day you leave out is only hidden.</p>
                <DatePicker plan={plan} onUse={(dates) => { onRange(plan.id, dates[0] ?? "", dates[dates.length - 1] ?? "", dates); setDatesOpen(false); }} />
              </div>
            </div>
          ) : null}
          {copyMeal ? (
            <CopyMealSheet
              plan={plan}
              meal={copyMeal}
              onClose={() => setCopyMeal(null)}
              onCopy={(targets) => {
                onCopyMeal(plan.id, copyMeal.id, targets);
                setCopyMeal(null);
                onNotify(targets.length === 1 ? "Copied that meal to 1 chip." : `Copied that meal to ${targets.length} chips.`);
              }}
            />
          ) : null}
          {copyDaysOpen ? (
            <CopyDaysSheet
              plan={plan}
              plans={plans}
              sources={[...picked].sort()}
              onClose={() => setCopyDaysOpen(false)}
              onCopy={(pairs) => {
                onCopyDays(plan.id, pairs);
                setCopyDaysOpen(false);
                setPicked([]);
                onNotify(pairs.length === 1 ? "Copied 1 day." : `Copied ${pairs.length} days.`);
              }}
            />
          ) : null}
          <ul className="flex flex-col gap-2">
            {days.map((date) => (
              <DayRow key={date} plan={plan} date={date} recipeByUid={recipeByUid} targets={targets} menu={menu?.date === date ? menu : undefined} onOpen={onOpen} picked={picked.includes(date)} onToggle={() => toggleDay(date)} onSelectSeat={(id) => toggleSeat(date, id)} seatOn={(id) => seatOn(date, id)} onRemoveMeal={onRemoveMeal} onAssignBatch={onAssignBatch} onRemoveSeat={(seat) => onRemoveSeat(plan.id, date, seat)} onCopyMeal={setCopyMeal} />
            ))}
          </ul>
        </>
      ) : (
        <>
          <DatePicker plan={plan} onUse={(dates) => onRange(plan.id, dates[0] ?? "", dates[dates.length - 1] ?? "", dates)} />
        </>
      )}
    </Shell>
  );
}

function AddPeopleSheet({ dates, onClose, onAdd, onRemove }: { dates: string[]; onClose: () => void; onAdd: (personIds: string[], groups: Array<{ id: string; name: string }>) => void; onRemove: (personIds: string[], groups: Array<{ id: string; name: string }>) => void }) {
  const [people, setPeople] = useState<SavedPerson[]>([]);
  const [groups, setGroups] = useState<PersonGroup[]>([]);
  const [chosenPeople, setChosenPeople] = useState<string[]>([]);
  const [chosenGroups, setChosenGroups] = useState<string[]>([]);
  const [asking, setAsking] = useState<PersonGroup[] | null>(null);
  const [asGroup, setAsGroup] = useState<Record<string, boolean>>({});
  const [intent, setIntent] = useState<"add" | "remove">("add");
  const [pending, setPending] = useState<{ personIds: string[]; groups: Array<{ id: string; name: string }> } | null>(null);
  useEffect(() => {
    readSavedPeople().then(setPeople).catch(() => setPeople([]));
    readPersonGroups().then(setGroups).catch(() => setGroups([]));
  }, []);
  const toggle = (list: string[], id: string, set: (next: string[]) => void) => set(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  const finish = (pickedGroups: PersonGroup[], grouped: Record<string, boolean>, mode: "add" | "remove") => {
    const ids = new Set(chosenPeople);
    const seats: Array<{ id: string; name: string }> = [];
    for (const group of pickedGroups) {
      if (grouped[group.id]) seats.push({ id: group.id, name: group.name });
      else for (const id of group.personIds) ids.add(id);
    }
    if (!ids.size && !seats.length) return;
    if (!dates.length) {
      setIntent(mode);
      setPending({ personIds: [...ids], groups: seats });
      return;
    }
    if (mode === "remove") onRemove([...ids], seats);
    else onAdd([...ids], seats);
  };
  const begin = (mode: "add" | "remove") => {
    setIntent(mode);
    const pickedGroups = groups.filter((group) => chosenGroups.includes(group.id));
    if (pickedGroups.length) {
      setAsGroup({});
      setAsking(pickedGroups);
      return;
    }
    finish([], {}, mode);
  };
  const go = () => {
    if (!pending) return;
    if (intent === "remove") onRemove(pending.personIds, pending.groups);
    else onAdd(pending.personIds, pending.groups);
  };
  if (asking) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label={intent === "remove" ? "How to remove this group" : "How to add this group"}>
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <button type="button" onClick={() => setAsking(null)} className="inline-flex h-11 items-center rounded-full px-2 text-sm font-semibold">← Back</button>
          <h2 className="min-w-0 flex-1 truncate font-display text-xl font-semibold">{intent === "remove" ? "Remove this group" : "Add this group"}</h2>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
            {asking.map((group) => (
              <section key={group.id} className="flex flex-col gap-2">
                <h3 className="font-semibold">{group.name}</h3>
                <button type="button" aria-pressed={!asGroup[group.id]} onClick={() => setAsGroup((current) => ({ ...current, [group.id]: false }))} className={`h-11 rounded-full px-4 text-sm font-semibold ${asGroup[group.id] ? "border border-line bg-surface" : "bg-tomato text-tomato-ink"}`}>
                  Each person separately
                </button>
                <button type="button" aria-pressed={Boolean(asGroup[group.id])} onClick={() => setAsGroup((current) => ({ ...current, [group.id]: true }))} className={`h-11 rounded-full px-4 text-sm font-semibold ${asGroup[group.id] ? "bg-tomato text-tomato-ink" : "border border-line bg-surface"}`}>
                  As {group.name}
                </button>
              </section>
            ))}
          </div>
        </div>
        <div className="border-t border-line px-4 py-3">
          <button type="button" onClick={() => finish(asking, asGroup, intent)} className="h-11 w-full rounded-full bg-tomato text-sm font-semibold text-tomato-ink">
            {intent === "remove" ? "Remove" : "Add"}
          </button>
        </div>
        {pending ? <AddAllDaysAsk removing={intent === "remove"} onCancel={() => setPending(null)} onProceed={go} /> : null}
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Add people">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <button type="button" onClick={onClose} className="inline-flex h-11 items-center rounded-full px-2 text-sm font-semibold">← Back</button>
        <h2 className="min-w-0 flex-1 truncate font-display text-xl font-semibold">Add people</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
          <p className="text-sm text-muted">{dates.length ? `Adding to ${dates.map((date) => formatDay(date)).join(", ")}.` : "No days checked."}</p>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">People</h3>
            {people.length ? (
              <button type="button" aria-pressed={people.every((person) => chosenPeople.includes(person.id))} onClick={() => setChosenPeople(people.every((person) => chosenPeople.includes(person.id)) ? [] : people.map((person) => person.id))} className={`flex h-14 items-center justify-between rounded-card border px-4 text-left ${people.every((person) => chosenPeople.includes(person.id)) ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}>
                <span className="font-semibold">All</span>
                {people.every((person) => chosenPeople.includes(person.id)) ? <Check className="size-4" /> : null}
              </button>
            ) : null}
            {people.length ? people.map((person) => {
              const on = chosenPeople.includes(person.id);
              return (
                <button key={person.id} type="button" aria-pressed={on} onClick={() => toggle(chosenPeople, person.id, setChosenPeople)} className={`flex h-14 items-center justify-between rounded-card border px-4 text-left ${on ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}>
                  <span className="font-semibold">{person.name}</span>
                  {on ? <Check className="size-4" /> : null}
                </button>
              );
            }) : <p className="text-sm text-muted">No people saved yet. Add them in Settings.</p>}
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">Groups</h3>
            {groups.length ? groups.map((group) => {
              const on = chosenGroups.includes(group.id);
              const names = group.personIds.map((id) => people.find((person) => person.id === id)?.name).filter((name): name is string => Boolean(name));
              return (
                <button key={group.id} type="button" aria-pressed={on} onClick={() => toggle(chosenGroups, group.id, setChosenGroups)} className={`flex min-h-14 items-center justify-between gap-3 rounded-card border px-4 py-2 text-left ${on ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}>
                  <span className="min-w-0">
                    <span className="block font-semibold">{group.name}</span>
                    <span className={`block text-xs ${on ? "text-tomato-ink/80" : "text-muted"}`}>{names.length ? names.join(", ") : "No one in this group"}</span>
                  </span>
                  {on ? <Check className="size-4 shrink-0" /> : null}
                </button>
              );
            }) : <p className="text-sm text-muted">No groups saved yet.</p>}
          </section>
        </div>
      </div>
      <div className="flex gap-2 border-t border-line px-4 py-3">
        <button type="button" onClick={() => begin("remove")} disabled={!chosenPeople.length && !chosenGroups.length} className="h-11 flex-1 rounded-full border border-line bg-surface text-sm font-semibold disabled:opacity-50">
          Remove
        </button>
        <button type="button" onClick={() => begin("add")} disabled={!chosenPeople.length && !chosenGroups.length} className="h-11 flex-1 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-50">
          Add
        </button>
      </div>
      {pending ? <AddAllDaysAsk removing={intent === "remove"} onCancel={() => setPending(null)} onProceed={go} /> : null}
    </div>
  );
}

function AddAllDaysAsk({ removing, onCancel, onProceed }: { removing: boolean; onCancel: () => void; onProceed: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="No day selected">
      <div className="w-full max-w-lg rounded-card border border-line bg-bg p-4">
        <h3 className="font-display text-lg font-semibold">Are you sure?</h3>
        <p className="mt-2 text-sm text-muted">{removing ? "No day selected will remove them from all days." : "No day selected will add to all days. They are only added to days they are not on yet."}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onCancel} className="h-11 flex-1 rounded-full border border-line bg-surface text-sm font-semibold">Cancel</button>
          <button type="button" onClick={onProceed} className="h-11 flex-1 rounded-full bg-tomato text-sm font-semibold text-tomato-ink">{removing ? "Remove from all days" : "Add to all days"}</button>
        </div>
      </div>
    </div>
  );
}

function weekBlocks(days: string[]): Array<{ kind: "day"; date: string } | { kind: "week"; start: string; end: string; dates: string[] }> {
  const blocks: Array<{ kind: "day"; date: string } | { kind: "week"; start: string; end: string; dates: string[] }> = [];
  let index = 0;
  while (index < days.length) {
    const start = days[index];
    const monday = parseKey(start).getDay() === 1;
    const dates = monday ? days.slice(index, index + 7) : [];
    const full = dates.length === 7 && dates.every((date, step) => date === shiftDay(start, step)) && parseKey(dates[6]).getDay() === 0;
    if (full) {
      blocks.push({ kind: "week", start, end: dates[6], dates });
      index += 7;
    } else {
      blocks.push({ kind: "day", date: start });
      index += 1;
    }
  }
  return blocks;
}

function WeekRow({ start, end, dates, picked, onOpen, onToggle }: { start: string; end: string; dates: string[]; picked: boolean; onOpen: () => void; onToggle: () => void }) {
  return (
    <li className="flex items-center gap-2 rounded-card border border-line bg-surface p-2">
      <button type="button" aria-pressed={picked} aria-label={`Select ${formatRange(start, end)}`} onClick={onToggle} className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full border ${picked ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}>
        {picked ? <Check className="size-4" /> : null}
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 py-1 text-left">
        <span className="block text-xs text-muted">Monday–Sunday</span>
        <span className="block font-display text-lg font-semibold">{formatRange(start, end)}</span>
        <span className="block text-xs text-muted">{dates.length} days</span>
      </button>
    </li>
  );
}

function batchChipName(batch: PlanBatch, recipes: ReadonlyMap<string, Recipe>): string {
  const stored = batch.versionLabel?.trim();
  if (stored) return `${batch.title} ${stored}`;
  const recipe = resolveBatchRecipe(batch, recipes);
  if (recipe && isVersionRecipe(recipe)) return `${batch.title} ${versionLabelOf(recipe)}`;
  return batch.title;
}

function resolveBatchRecipe(batch: PlanBatch, recipes: ReadonlyMap<string, Recipe>): Recipe | undefined {
  const direct = recipes.get(batch.recipeUid);
  if (direct) return direct;
  const title = batch.title.trim();
  const wanted = batch.versionLabel?.trim();
  const titled = [...recipes.values()].filter((recipe) => recipe.title.trim() === title);
  if (wanted) {
    const version = titled.find((recipe) => isVersionRecipe(recipe) && versionLabelOf(recipe) === wanted);
    if (version) return version;
  }
  return titled.find((recipe) => !isVersionRecipe(recipe)) ?? titled[0];
}

function BatchBar({ plan, recipes, onOpen, onRemove }: { plan: MealPlan; recipes: ReadonlyMap<string, Recipe>; onOpen: (route: PlanRoute) => void; onRemove: (batchId: string) => void }) {
  const batches = plan.batches ?? [];
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 font-display text-lg font-semibold">Batches</h3>
        <button type="button" onClick={() => onOpen({ kind: "batch", planId: plan.id })} className="h-11 shrink-0 rounded-full border border-line bg-surface px-4 text-sm font-semibold">
          Add a batch
        </button>
      </div>
      {batches.length ? (
        <div className="rounded-2xl bg-chip p-2">
          <ul className="flex flex-wrap gap-2">
            {batches.map((batch) => {
              const name = batchChipName(batch, recipes);
              return (
              <li key={batch.id} className="inline-flex h-11 max-w-full items-center rounded-full bg-gold-bg pr-1 pl-3 text-sm font-semibold text-ink">
                <button type="button" onClick={() => onOpen({ kind: "batch", planId: plan.id, batchId: batch.id })} className="min-w-0 truncate">
                  {name}
                </button>
                <button type="button" aria-label={`Remove ${name}`} onClick={() => onRemove(batch.id)} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-base leading-none">
                  ×
                </button>
              </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function usedBatchServings(plan: MealPlan, batchId: string): number {
  let used = 0;
  for (const meals of Object.values(plan.days)) {
    for (const meal of meals) {
      if (meal.batchId === batchId) used += meal.batchServings ?? 0;
    }
  }
  return used;
}

function recipeServingCount(recipe: Recipe | undefined): number {
  const raw = recipe?.servings;
  const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function BatchSettings({ batch, recipe, catalog, onView, onSave }: { batch: PlanBatch; recipe: Recipe; catalog: ReadonlyMap<string, Recipe>; onView: () => void; onSave: (batch: PlanBatch) => void }) {
  const meatTotal = meatPounds(recipe, catalog);
  const [meat, setMeat] = useState(batch.meatLbPerServing != null ? String(batch.meatLbPerServing) : meatTotal > 0 ? "0.5" : "");
  const [override, setOverride] = useState(batch.servingOverride != null ? String(batch.servingOverride) : "");
  const [savedNote, setSavedNote] = useState("");
  const meatLb = optionalNumber(meat);
  const servingOverride = optionalNumber(override);
  const usingOverride = servingOverride != null;
  const count = definedBatchServings({ ...batch, meatLbPerServing: meatLb, servingOverride }, recipe, catalog);
  const commit = (nextMeat: string, nextOverride: string) => {
    const pounds = optionalNumber(nextMeat);
    const stated = optionalNumber(nextOverride);
    setSavedNote("");
    onSave({
      ...batch,
      meatLbPerServing: pounds,
      servingOverride: stated,
      servings: definedBatchServings({ ...batch, meatLbPerServing: pounds, servingOverride: stated }, recipe, catalog),
    });
  };
  useEffect(() => {
    if (batch.meatLbPerServing == null && batch.servingOverride == null && meatTotal > 0) commit("0.5", override);
    // Save the shown 0.5 lb default once, so the meal prompt uses the same count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onView} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink">
        View recipe page
      </button>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold">Serving Settings</h2>
        <label className="block text-sm font-semibold">
          Pounds of meat in 1 serving
          <input
            inputMode="decimal"
            value={meat}
            onChange={(event) => {
              const next = decimalText(event.target.value);
              setMeat(next);
              commit(next, override);
            }}
            placeholder="lb"
            className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm font-normal outline-none focus:border-tomato"
          />
        </label>
        <p className="text-sm text-muted">{meatTotal > 0 ? `This recipe has about ${trimAmount(meatTotal)} lb of meat.` : "This recipe has no meat the app can weigh, so this box cannot set the count."}</p>
        <p className="text-center text-sm font-semibold text-muted">Or</p>
        <label className="block text-sm font-semibold">
          Servings this batch makes
          <input
            inputMode="decimal"
            value={override}
            onChange={(event) => {
              const next = decimalText(event.target.value);
              setOverride(next);
              commit(meat, next);
            }}
            placeholder="Leave empty to use the box above"
            className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm font-normal outline-none focus:border-tomato"
          />
        </label>
        <p className="text-sm text-muted">{usingOverride ? `Using this serving count: ${trimAmount(count)}.` : meatTotal > 0 && meatLb != null ? `1 serving is ${trimAmount(meatLb)} lb of meat. This batch makes ${trimAmount(count)} ${count === 1 ? "serving" : "servings"}.` : `This batch makes ${trimAmount(count)} ${count === 1 ? "serving" : "servings"}.`}</p>
      </section>
      <button
        type="button"
        onClick={() => {
          addLeftover({ ...batch, meatLbPerServing: meatLb, servingOverride, servings: count });
          setSavedNote("Saved to leftovers.");
        }}
        className="h-11 rounded-full border border-line text-sm font-semibold"
      >
        Save to leftovers
      </button>
      {savedNote ? <p className="text-sm text-muted">{savedNote}</p> : null}
    </div>
  );
}

function optionalNumber(value: string): number | null {
  const text = value.trim();
  if (!text || text === ".") return null;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function decimalText(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length ? `${whole}.${rest.join("")}` : whole;
}

function BatchPlace({
  plan,
  recipe,
  batch,
  onSave,
  onRemove,
}: {
  plan: MealPlan;
  recipe: Recipe;
  batch: PlanBatch | null;
  onSave: (batch: PlanBatch, draws: Array<{ date: string; slot: MealSlot; servings: number; personId?: string }>) => void;
  onRemove?: () => void;
}) {
  const [makes, setMakes] = useState(batch?.servings ?? recipeServingCount(recipe));
  const people = twoPeople(plan) ? plan.people ?? [] : [null];
  const days = planDates(plan);
  const [rows, setRows] = useState(() => initialBatchRows(plan, batch?.id));
  const assigned = rows.reduce((sum, row) => sum + row.servings, 0);
  const over = assigned > makes;
  const setServings = (key: string, servings: number) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, servings } : row)));
  };
  return (
    <>
      <p className="text-sm text-muted">One cook of {recipe.title}. Place whole servings on days in this range. The grocery list counts the cook once.</p>
      <label className="block text-sm font-semibold">
        Servings this cook makes
        <input
          inputMode="numeric"
          value={String(makes)}
          onChange={(event) => {
            const next = Number(event.target.value.replace(/[^\d]/g, ""));
            setMakes(Number.isFinite(next) && next > 0 ? next : 1);
          }}
          className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm font-normal outline-none focus:border-tomato"
        />
      </label>
      <p className={`text-sm ${over ? "text-tomato" : "text-muted"}`}>{assigned} of {makes} servings placed{over ? ". That is more than this cook." : "."}</p>
      <ul className="flex flex-col gap-2">
        {days.map((date) => (
          <li key={date} className="rounded-2xl border border-line bg-surface px-3 py-2">
            <p className="text-sm font-semibold">{formatDay(date)}</p>
            {people.map((person) => {
              const row = rows.find((item) => item.date === date && item.personId === person?.id);
              if (!row) return null;
              return (
                <div key={row.key} className="mt-2 flex flex-wrap items-center gap-2">
                  {person ? <span className="w-full text-xs text-muted">{person.name}</span> : null}
                  <select value={row.slot} onChange={(event) => setRows((current) => current.map((item) => (item.key === row.key ? { ...item, slot: event.target.value as MealSlot } : item)))} className="h-11 rounded-2xl border border-line bg-bg px-2 text-sm">
                    {SLOT_ORDER.map((slot) => <option key={slot} value={slot}>{SLOT_LABEL[slot]}</option>)}
                  </select>
                  <button type="button" aria-label="One fewer serving" onClick={() => setServings(row.key, Math.max(0, row.servings - 1))} className="inline-flex size-11 items-center justify-center rounded-full border border-line">−</button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{row.servings}</span>
                  <button type="button" aria-label="One more serving" disabled={assigned >= makes} onClick={() => setServings(row.key, row.servings + 1)} className="inline-flex size-11 items-center justify-center rounded-full border border-line disabled:opacity-40">+</button>
                </div>
              );
            })}
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={over}
        onClick={() => {
          onSave(
            { id: batch?.id ?? crypto.randomUUID(), recipeUid: recipe.uid, title: recipe.title, servings: makes },
            rows.filter((row) => row.servings > 0).map((row) => ({ date: row.date, slot: row.slot, servings: row.servings, personId: row.personId })),
          );
        }}
        className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-50"
      >
        Save batch
      </button>
      {onRemove ? (
        <button type="button" onClick={onRemove} className="h-11 rounded-full border border-line text-sm font-semibold">
          Remove batch
        </button>
      ) : null}
    </>
  );
}

function initialBatchRows(plan: MealPlan, batchId?: string): Array<{ key: string; date: string; personId?: string; slot: MealSlot; servings: number }> {
  const people = twoPeople(plan) ? plan.people ?? [] : [null];
  return planDates(plan).flatMap((date) =>
    people.map((person) => {
      const found = batchId ? (plan.days[date] ?? []).find((meal) => meal.batchId === batchId && (person ? meal.personId === person.id : !meal.personId)) : undefined;
      return {
        key: `${date}:${person?.id ?? "one"}`,
        date,
        personId: person?.id,
        slot: found?.slot ?? "lunch",
        servings: found?.batchServings ?? 0,
      };
    }),
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

function DayRow({ plan, date, recipeByUid, targets, menu, onOpen, picked, onToggle, onSelectSeat, seatOn, onRemoveMeal, onAssignBatch, onRemoveSeat, onCopyMeal }: { plan: MealPlan; date: string; recipeByUid: ReadonlyMap<string, Recipe>; targets: GoalTargets | null | undefined; menu?: { date: string; seat: string; slot: MealSlot }; onOpen: (route: PlanRoute) => void; picked: boolean; onToggle: () => void; onSelectSeat: (id: string) => void; seatOn: (id: string) => boolean; onRemoveMeal: (planId: string, date: string, mealId: string) => void; onAssignBatch: (planId: string, batch: PlanBatch, date: string, slot: MealSlot, servings: number, personId?: string) => void; onRemoveSeat: (seat: { kind: "person" | "group"; id: string }) => void; onCopyMeal: (meal: PlannedMeal) => void }) {
  const when = parseKey(date);
  const breakfast = mealsFor(plan, date, "breakfast");
  const lunch = mealsFor(plan, date, "lunch");
  const supper = mealsFor(plan, date, "supper");
  const snacks = mealsFor(plan, date, "snack");
  const openDay = () => onOpen({ kind: "day", planId: plan.id, date });
  const people = plan.dayPeople ? peopleForDay(plan, date) : [];
  const groups = plan.dayGroups?.[date] ?? [];
  const seated = people.length + groups.length > 0;
  const openChip = (meal: PlannedMeal, personId: string, menuSlot: MealSlot) => {
    if (meal.plate) {
      const title = meal.title.trim().toLowerCase();
      const saved = loadPlateTemplates()
        .filter((item) => item.title.trim().toLowerCase() === title)
        .sort((a, b) => (b.version || 0) - (a.version || 0))[0];
      if (saved) {
        onOpen({ kind: "plate", planId: plan.id, date, slot: meal.slot, mealId: meal.id, personId, back: "plan", savedId: saved.id });
        return;
      }
    }
    onOpen({ kind: "recipe", planId: plan.id, date, slot: meal.slot, uid: meal.recipeUid, mealId: meal.id, personId, menuSlot });
  };
  return (
    <li className="rounded-card border border-line bg-surface p-2">
      <div className="flex items-stretch gap-3">
        <div className="flex shrink-0 flex-col self-stretch">
          <div className="flex items-start gap-1">
            <button type="button" aria-pressed={picked} aria-label={`Select ${formatDay(date)}`} onClick={onToggle} className={`mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full border ${picked ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}>
              {picked ? <Check className="size-3.5" /> : null}
            </button>
            <button type="button" onClick={openDay} className="pt-1 text-left">
              <span className="block text-xs text-muted">{when.toLocaleDateString(undefined, { weekday: "short" })}</span>
              <span className="font-display text-lg font-semibold">{when.getDate()}</span>
            </button>
          </div>
          <button type="button" aria-label={`Open ${formatDay(date)}`} onClick={openDay} className="min-h-8 w-full flex-1" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {seated ? (
            <>
              {people.map((person) => (
                <SeatBubbles key={person.id} name={person.name} seat={person.id} startSlot={menu?.seat === person.id ? menu.slot : null} batches={plan.batches ?? []} catalog={recipeByUid} selected={seatOn(person.id)} marked={mealsFor(plan, date, undefined, person.id).some((meal) => meal.fitScale != null || meal.meatTrim != null || Boolean(meal.sideName) || Boolean(meal.carbItem) || Boolean(meal.tweaks?.length))} onSelect={() => onSelectSeat(person.id)} breakfast={mealsFor(plan, date, "breakfast", person.id)} lunch={mealsFor(plan, date, "lunch", person.id)} supper={mealsFor(plan, date, "supper", person.id)} snacks={mealsFor(plan, date, "snack", person.id)} onAdd={(slot, menuSlot) => onOpen({ kind: "add", planId: plan.id, date, slot, personId: person.id, menuSlot })} onPlate={(slot) => onOpen({ kind: "plate", planId: plan.id, date, slot, personId: person.id, back: "plan" })} onDropMeal={(mealId) => onRemoveMeal(plan.id, date, mealId)} onAssignBatch={(batch, slot, servings) => onAssignBatch(plan.id, batch, date, slot, servings, person.id)} onRemove={() => onRemoveSeat({ kind: "person", id: person.id })} onOpenMeal={(meal, menuSlot) => openChip(meal, person.id, menuSlot)} onCopyMeal={onCopyMeal} />
              ))}
              {groups.map((group) => (
                <SeatBubbles key={group.id} name={group.name} seat={`group:${group.id}`} startSlot={menu?.seat === `group:${group.id}` ? menu.slot : null} batches={plan.batches ?? []} catalog={recipeByUid} breakfast={mealsForGroup(plan, date, group.id, "breakfast")} lunch={mealsForGroup(plan, date, group.id, "lunch")} supper={mealsForGroup(plan, date, group.id, "supper")} snacks={mealsForGroup(plan, date, group.id, "snack")} onAdd={(slot, menuSlot) => onOpen({ kind: "add", planId: plan.id, date, slot, personId: `group:${group.id}`, menuSlot })} onPlate={(slot) => onOpen({ kind: "plate", planId: plan.id, date, slot, personId: `group:${group.id}`, back: "plan" })} onDropMeal={(mealId) => onRemoveMeal(plan.id, date, mealId)} onAssignBatch={(batch, slot, servings) => onAssignBatch(plan.id, batch, date, slot, servings, `group:${group.id}`)} onRemove={() => onRemoveSeat({ kind: "group", id: group.id })} onOpenMeal={(meal, menuSlot) => openChip(meal, `group:${group.id}`, menuSlot)} onCopyMeal={onCopyMeal} />
              ))}
            </>
          ) : (
            <div className="rounded-2xl border border-line px-2 py-2">
              <div className="flex items-start gap-2">
                <button type="button" onClick={openDay} className="grid min-w-0 flex-1 grid-cols-3 gap-1 text-left">
                  <Bubble meals={breakfast} empty="Breakfast" />
                  <Bubble meals={lunch} empty="Lunch" />
                  <Bubble meals={supper} empty="Supper" />
                </button>
                <button type="button" aria-label={`Open ${formatDay(date)}`} onClick={openDay} className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-line">
                  <Plus className="size-3" />
                </button>
              </div>
              {snacks.length ? <p className="mt-1 truncate text-xs text-muted">Snack: {snacks.map((meal) => shortName(meal)).join(", ")}</p> : null}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function MealChip({ meal, onOpen, onRemove, onCopy }: { meal: PlannedMeal; onOpen: () => void; onRemove: () => void; onCopy?: () => void }) {
  const name = meal.versionLabel ? `${meal.title} ${meal.versionLabel}` : meal.title;
  return (
    <li className="inline-flex max-w-full items-center gap-1 rounded-full bg-zinc-200 py-1 pr-1 pl-3 text-sm font-semibold text-zinc-900">
      <button type="button" onClick={onOpen} className="min-w-0 truncate text-left">
        {name}
      </button>
      {onCopy ? (
        <button type="button" onClick={onCopy} className="shrink-0 rounded-full bg-zinc-800 px-2 py-1 text-[11px] font-semibold text-zinc-100">
          Copy
        </button>
      ) : null}
      <button type="button" aria-label={`Remove ${name}`} onClick={onRemove} className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-base leading-none">
        ×
      </button>
    </li>
  );
}

function SeatBubbles({ name, seat, startSlot, batches, catalog, selected, marked, onSelect, breakfast, lunch, supper, snacks, onAdd, onPlate, onDropMeal, onAssignBatch, onRemove, onOpenMeal, onCopyMeal }: { name: string; seat: string; startSlot?: MealSlot | null; batches: PlanBatch[]; catalog: ReadonlyMap<string, Recipe>; selected?: boolean; marked?: boolean; onSelect?: () => void; breakfast: PlannedMeal[]; lunch: PlannedMeal[]; supper: PlannedMeal[]; snacks: PlannedMeal[]; onAdd: (slot: MealSlot, menuSlot: MealSlot) => void; onPlate: (slot: MealSlot) => void; onDropMeal: (mealId: string) => void; onAssignBatch: (batch: PlanBatch, slot: MealSlot, servings: number) => void; onRemove: () => void; onOpenMeal: (meal: PlannedMeal, menuSlot: MealSlot) => void; onCopyMeal?: (meal: PlannedMeal) => void }) {
  const [menu, setMenu] = useState<MealSlot | null>(startSlot ?? null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchView, setBatchView] = useState<"choose" | "recipes" | "leftovers">("choose");
  const [leftovers, setLeftovers] = useState<Leftover[]>(() => loadLeftovers());
  const [pickedBatch, setPickedBatch] = useState<PlanBatch | null>(null);
  const [servings, setServings] = useState("");
  const pick = (slot: MealSlot) => setMenu(slot);
  useEffect(() => {
    const refresh = () => setLeftovers(loadLeftovers());
    window.addEventListener("leftovers-changed", refresh);
    window.addEventListener(CLOUD_EVENT, refresh);
    return () => {
      window.removeEventListener("leftovers-changed", refresh);
      window.removeEventListener(CLOUD_EVENT, refresh);
    };
  }, []);
  const chosen = menu === "breakfast" ? breakfast : menu === "lunch" ? lunch : menu === "supper" ? supper : [];
  return (
    <div className="rounded-2xl border border-line py-2 pr-0.5 pl-1">
      <div className="flex items-center">
        <button type="button" aria-label={`Remove ${name}`} onClick={onRemove} className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-muted">
          ×
        </button>
        {onSelect ? (
          <button type="button" aria-pressed={Boolean(selected)} onClick={onSelect} className={`w-max max-w-[6ch] shrink-0 truncate rounded-full text-left text-xs font-semibold ${selected ? "bg-tomato text-tomato-ink" : ""}`}>
            {name}
          </button>
        ) : (
          <span className="w-max max-w-[6ch] shrink-0 truncate text-xs font-semibold">{name}</span>
        )}
        <div className="ml-0.5 grid min-w-0 flex-1 grid-cols-3 gap-1">
          <Bubble meals={breakfast} empty="Breakfast" onPress={() => pick("breakfast")} />
          <Bubble meals={lunch} empty="Lunch" onPress={() => pick("lunch")} />
          <Bubble meals={supper} empty="Supper" onPress={() => pick("supper")} />
        </div>
        <span className={`inline-flex w-5 shrink-0 items-center justify-end text-[10px] font-semibold ${marked ? "text-gold" : "text-transparent"}`} aria-hidden={!marked}>
          M<Check className="size-3" />
        </span>
      </div>
      {snacks.length ? <p className="mt-1 truncate pl-8 text-xs text-muted">Snack: {snacks.map((meal) => shortName(meal)).join(", ")}</p> : null}
      {menu ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pt-4 pb-[6.4rem]" role="dialog" aria-modal="true" aria-label={`${SLOT_LABEL[menu]} for ${name}`} onClick={() => setMenu(null)}>
          <div className="w-full max-w-sm rounded-card border border-white/10 bg-zinc-700/75 px-3 py-5 shadow-lg backdrop-blur-md" onClick={(event) => event.stopPropagation()}>
            <p className="text-sm font-semibold underline underline-offset-4">{SLOT_LABEL[menu]} Meal Selection:</p>
            {chosen.length ? (
              <ul className="mt-4 mb-3 flex flex-col items-start gap-1.5 pl-3">
                {chosen.map((meal) => (
                  <MealChip key={meal.id} meal={meal} onOpen={() => onOpenMeal(meal, menu)} onRemove={() => onDropMeal(meal.id)} onCopy={onCopyMeal ? () => { onCopyMeal(meal); setMenu(null); } : undefined} />
                ))}
              </ul>
            ) : (
              <p className="mt-4 mb-3 pl-3 text-sm text-zinc-300">No dish yet</p>
            )}
            {snacks.length ? (
              <>
                <p className="mb-2 pl-3 text-xs font-semibold text-zinc-300">Snacks</p>
                <ul className="mb-3 flex flex-col items-start gap-1.5 pl-3">
                  {snacks.map((meal) => (
                    <MealChip key={meal.id} meal={meal} onOpen={() => onOpenMeal(meal, menu)} onRemove={() => onDropMeal(meal.id)} onCopy={onCopyMeal ? () => { onCopyMeal(meal); setMenu(null); } : undefined} />
                  ))}
                </ul>
              </>
            ) : null}
            <div className="flex gap-1">
              <button type="button" onClick={() => { onAdd(menu, menu); setMenu(null); }} className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface/80 px-1 text-[11px] font-semibold">Add meal</button>
              <button type="button" onClick={() => { onPlate(menu); setMenu(null); }} className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface/80 px-1 text-[11px] font-semibold">Build a plate</button>
              <button type="button" onClick={() => { onAdd("snack", menu); setMenu(null); }} className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface/80 px-1 text-[11px] font-semibold">Add snack</button>
              <button type="button" onClick={() => { setBatchView("choose"); setBatchOpen(true); }} className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface/80 px-1 text-[11px] font-semibold">Batch</button>
            </div>
          </div>
        </div>
      ) : null}
      {menu && batchOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 px-4 pt-4 pb-[6.4rem]" role="dialog" aria-modal="true" aria-label={`Batches for ${name}`} onClick={() => { setBatchOpen(false); setPickedBatch(null); setMenu(null); }}>
          <div className="w-full max-w-sm rounded-card border border-white/10 bg-zinc-700/75 px-3 py-5 shadow-lg backdrop-blur-md" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <button type="button" aria-label="Back" onClick={() => (batchView === "choose" ? setBatchOpen(false) : setBatchView("choose"))} className="inline-flex h-9 items-center gap-1 rounded-full px-2 text-sm font-semibold">
                ←
              </button>
              <p className="text-sm font-semibold">{batchView === "leftovers" ? "Saved leftovers" : batchView === "recipes" ? "Batch Recipes from this Plan" : "Batches"}</p>
            </div>
            {batchView === "choose" ? (
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => setBatchView("recipes")} className="h-11 rounded-full bg-zinc-200 px-3 text-left text-sm font-semibold text-zinc-900">
                  Batch Recipes from this Plan
                </button>
                <button type="button" onClick={() => setBatchView("leftovers")} className="h-11 rounded-full bg-zinc-200 px-3 text-left text-sm font-semibold text-zinc-900">
                  Saved leftovers
                </button>
              </div>
            ) : null}
            {batchView === "recipes" ? (
              batches.length ? (
                <ul className="flex flex-col gap-2">
                  {batches.map((batch) => (
                    <li key={batch.id}>
                      <button type="button" onClick={() => { setPickedBatch(batch); setServings(""); }} className="h-11 w-full truncate rounded-full bg-zinc-200 px-3 text-left text-sm font-semibold text-zinc-900">
                        {batch.title}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-200">No batch recipes saved to Plan yet.</p>
              )
            ) : null}
            {batchView === "leftovers" ? (
              leftovers.length ? (
                <ul className="flex flex-col gap-2">
                  {leftovers.map((batch) => (
                    <li key={batch.id} className="flex items-center gap-2">
                      <button type="button" onClick={() => { setPickedBatch(batch); setServings(""); }} className="h-11 min-w-0 flex-1 truncate rounded-full bg-zinc-200 px-3 text-left text-sm font-semibold text-zinc-900">
                        {batch.versionLabel ? `${batch.title} ${batch.versionLabel}` : batch.title}
                      </button>
                      <button type="button" aria-label={`Remove ${batch.title}`} onClick={() => removeLeftover(batch.id)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-lg font-semibold text-zinc-900">
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-200">No leftovers saved yet.</p>
              )
            ) : null}
          </div>
        </div>
      ) : null}
      {menu && pickedBatch ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 px-4 pt-4 pb-[6.4rem]" role="dialog" aria-modal="true" aria-label={`Servings of ${pickedBatch.title}`} onClick={() => { setPickedBatch(null); setBatchOpen(false); setMenu(null); }}>
          <form
            className="flex w-full max-w-sm flex-col gap-3 rounded-card border border-white/10 bg-zinc-700/75 px-3 py-5 shadow-lg backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              const count = Number(servings);
              if (!Number.isFinite(count) || count <= 0) return;
              onAssignBatch(pickedBatch, menu, count);
              setPickedBatch(null);
              setBatchOpen(false);
              setMenu(null);
            }}
          >
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Back to batches" onClick={() => setPickedBatch(null)} className="inline-flex h-9 items-center gap-1 rounded-full px-2 text-sm font-semibold">
                ←
              </button>
              <p className="text-sm font-semibold">Servings for this meal</p>
            </div>
            <p className="text-sm text-zinc-200">{pickedBatch.title}</p>
            <p className="text-sm text-zinc-200">This batch makes {(() => { const makes = definedBatchServings(pickedBatch, catalog.get(pickedBatch.recipeUid), catalog); return `${trimAmount(makes)} ${makes === 1 ? "serving" : "servings"}`; })()}. The number below is how many of those.</p>
            <label className="text-sm font-semibold">
              How many servings
              <input
                inputMode="decimal"
                value={servings}
                onChange={(event) => setServings(event.target.value.replace(/[^\d.]/g, ""))}
                placeholder="Required"
                className="mt-1 h-11 w-full rounded-2xl border border-line bg-zinc-800 px-3 text-sm font-normal outline-none focus:border-tomato"
              />
            </label>
            <button type="submit" disabled={!servings.trim() || !(Number(servings) > 0)} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-40">
              Add to meal
            </button>
          </form>
        </div>
      ) : null}
    </div>
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
  const meals = withBatchPortion(plan, mealsFor(plan, date, undefined, person.id), recipeByUid);
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

function Bubble({ meals, empty, onEmpty, onFilled, onPress }: { meals: PlannedMeal[]; empty: string; onEmpty?: () => void; onFilled?: () => void; onPress?: () => void }) {
  const first = meals[0];
  const label = first ? `${shortName(first)}${meals.length > 1 ? ` +${meals.length - 1}` : ""}` : empty;
  const className = `block w-full truncate rounded-full px-2 py-1 text-left text-xs ${first ? "bg-gold-bg font-semibold text-ink" : "bg-chip text-muted"}`;
  const press = onPress ?? (first ? onFilled : onEmpty);
  if (press) return <button type="button" onClick={press} className={className}>{label}</button>;
  return <span className={className}>{label}</span>;
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
  onLogDays: (dates: string[], only?: Record<string, string[] | null>) => Promise<string>;
}) {
  const roster = peopleForDay(plan, date);
  const useRoster = Boolean(plan.dayPeople) || twoPeople(plan);
  const paired = roster.length > 1;
  const meals = withBatchPortion(plan, mealsFor(plan, date), recipeByUid);
  const math = !useRoster && meals.length && recipeByUid.size ? sumPlanMeals(meals, recipeByUid, plan.beefChoice) : null;
  const weights = useRoster ? "" : dayWeights(meals, recipeByUid, plan.beefChoice);
  const [goals, setGoals] = useState<SavedMacroGoal[]>([]);
  useEffect(() => {
    if (!useRoster) return;
    const load = () => {
      readSavedMacroGoals().then(setGoals).catch(() => setGoals([]));
    };
    load();
    window.addEventListener(CLOUD_EVENT, load);
    return () => window.removeEventListener(CLOUD_EVENT, load);
  }, [useRoster]);
  const shop = paired ? dayShop(plan, date, recipeByUid) : null;
  const [logging, setLogging] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [pickedNames, setPickedNames] = useState<string[]>([]);
  const toggleClosed = (id: string) => setOpenSections((current) => ({ ...current, [id]: !current[id] }));
  const toggleName = (id: string) => setPickedNames((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const runLog = async () => {
    if (logging) return;
    setLogging(true);
    try {
      onNotify(await onLogDays([date], pickedNames.length ? { [date]: pickedNames } : { [date]: null }));
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
            {logging ? "Logging…" : pickedNames.length ? "Log" : "Log day"}
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
      {(plan.dayGroups?.[date] ?? []).map((group) => {
        const mine = mealsForGroup(plan, date, group.id);
        const shut = !openSections[group.id];
        return (
          <section key={group.id} className="flex flex-col gap-3">
            <button type="button" aria-expanded={!shut} onClick={() => toggleClosed(group.id)} className="inline-flex h-9 max-w-full items-center gap-1 self-start rounded-full bg-tomato px-3 font-display text-lg font-semibold text-tomato-ink">
              <span className="truncate">{group.name}</span>
              <ChevronDown className={`size-4 shrink-0 ${shut ? "" : "rotate-180"}`} />
            </button>
            {shut ? null : (
              <>
                <button type="button" onClick={() => onOpen({ kind: "add", planId: plan.id, date, slot: "breakfast", personId: `group:${group.id}` })} className="h-11 self-start rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink">
                  Add meal
                </button>
                {mine.length ? <DayMeals plan={plan} date={date} meals={mine} recipeByUid={recipeByUid} personId={`group:${group.id}`} onOpen={onOpen} onRemoveMeal={onRemoveMeal} /> : <p className="text-sm text-muted">No meals</p>}
              </>
            )}
          </section>
        );
      })}
      {useRoster ? (
        <>
          {roster.length ? roster.map((person) => {
            const mine = withBatchPortion(plan, mealsFor(plan, date, undefined, person.id), recipeByUid);
            const mineMath = mine.length && recipeByUid.size ? sumPlanMeals(mine, recipeByUid, plan.beefChoice) : null;
            const goal = goalTargets(goalForPlanPerson(goals, person)?.goals);
            const mineWeights = dayWeights(mine, recipeByUid, plan.beefChoice);
            const plateSlot = SLOT_ORDER.find((item) => item !== "snack" && !mine.some((meal) => meal.slot === item)) ?? "supper";
            const tailored = mine.some((meal) => meal.fitScale != null || meal.meatTrim != null || Boolean(meal.sideName) || Boolean(meal.carbItem) || Boolean(meal.tweaks?.length));
            const shut = !openSections[person.id];
            const chosen = pickedNames.includes(person.id);
            return (
              <section key={person.id} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className={`inline-flex h-9 max-w-full items-center rounded-full ${chosen ? "bg-tomato text-tomato-ink" : "border border-line"}`}>
                    <button type="button" aria-pressed={chosen} onClick={() => toggleName(person.id)} className="h-9 max-w-[12rem] truncate px-3 font-display text-lg font-semibold">
                      {person.name || "Choose a person"}
                    </button>
                    <button type="button" aria-expanded={!shut} aria-label={shut ? `Show ${person.name}` : `Hide ${person.name}`} onClick={() => toggleClosed(person.id)} className="inline-flex h-9 w-8 items-center justify-center">
                      <ChevronDown className={`size-4 shrink-0 ${shut ? "" : "rotate-180"}`} />
                    </button>
                  </div>
                  {tailored ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-muted">
                      macros <Check className="size-4" />
                    </span>
                  ) : null}
                </div>
                {shut ? null : (
                  <>
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
                      <p className="text-sm text-muted">{mine.length ? "Macros are not available for these meals." : "No meals"}</p>
                    )}
                    <DayMeals plan={plan} date={date} meals={mine} recipeByUid={recipeByUid} personId={person.id} onOpen={onOpen} onRemoveMeal={onRemoveMeal} />
                  </>
                )}
              </section>
            );
          }) : <p className="text-sm text-muted">No one is on this day yet.</p>}
          {shop ? (
            <div className="mt-6 border-t border-line pt-6">
              <div className="rounded-card border border-line bg-surface px-3 py-3">
                <p className="font-display text-lg font-semibold">Day totals</p>
                <p className="mt-1 text-sm text-muted">Ingredients and cost for everyone on this day.</p>
                <p className="mt-2 text-base font-semibold tabular-nums">
                  {money(shop.cost)}
                  {shop.partial ? " · partial" : ""}
                </p>
                {shop.lines.length ? (
                  <ul className="mt-3 flex flex-col gap-1">
                    {shop.lines.map((line) => (
                      <li key={line} className="text-sm leading-snug">{line}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
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

function withBatchPortion(plan: MealPlan, meals: PlannedMeal[], catalog: ReadonlyMap<string, Recipe>): PlannedMeal[] {
  const leftovers = loadLeftovers();
  return meals.map((meal) => {
    if (!meal.batchId) return meal;
    const batch = (plan.batches ?? []).find((item) => item.id === meal.batchId) ?? leftovers.find((item) => item.id === meal.batchId);
    const recipe = catalog.get(meal.recipeUid) ?? (batch ? catalog.get(batch.recipeUid) : undefined);
    const defined = batch ? definedBatchServings(batch, recipe, catalog) : meal.batchYield;
    if (!(defined && defined > 0)) return meal;
    const count = meal.batchServings && meal.batchServings > 0 ? meal.batchServings : 1;
    return { ...meal, batchYield: defined, portion: count / defined };
  });
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
        const plated = plateServings(meal);
        const ingredients = plated
          ? plated.map((line) => {
              const item = getIngredient(line.name);
              const servings = line.servings * mealScale(meal) * (isMeatName(line.name) ? meal.meatTrim ?? 1 : 1);
              return item ? `${line.name} · ${describeUse(item, servings)}` : line.name;
            })
          : recipe
            ? usedIngredientLines(edited ?? recipe, recipeByUid, mealScale(meal), meal.meatTrim ?? 1, meal.carbItem, meal.carbScale, meal.tweaks, plan.beefChoice)
            : [];
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
                  {meal.batchServings ? ` · ${trimAmount(meal.batchServings)} servings` : ""}
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
  menuSlot,
  recipes,
  versionsByBase,
  onOpen,
  onPick,
  mode = "meal",
}: {
  plan: MealPlan;
  date: string;
  slot: MealSlot;
  personId?: string;
  menuSlot?: MealSlot;
  recipes: SlimRecipe[];
  versionsByBase: Map<string, SlimRecipe[]>;
  onOpen: (route: PlanRoute) => void;
  onPick: (recipe: SlimRecipe) => void;
  mode?: "meal" | "batch";
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
  const backToPlan = () => onOpen(menuSlot && personId ? { kind: "edit", planId: plan.id, menu: { date, seat: personId, slot: menuSlot } } : { kind: "edit", planId: plan.id });

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
    <Shell title={mode === "batch" ? "Add a batch" : person ? `${person.name || "Person"} · ${formatDay(date)}` : `Add to ${formatDay(date)}`} onBack={backToPlan}>
      {mode === "batch" ? <p className="text-sm text-muted">Open a recipe, then use Add batch. It shows on the plan under Add a batch.</p> : (
      <div className="flex gap-2 overflow-x-auto">
        {SLOT_ORDER.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={slot === item}
            onClick={() => onOpen({ kind: "add", planId: plan.id, date, slot: item, ...who, ...(menuSlot ? { menuSlot } : {}) })}
            className={`h-11 shrink-0 rounded-full px-3 text-sm font-semibold ${slot === item ? "bg-tomato text-tomato-ink" : "border border-line bg-surface"}`}
          >
            {SLOT_LABEL[item]}
          </button>
        ))}
      </div>
      )}
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

function CopyPlanSheet({
  plan,
  into,
  onClose,
  onCopy,
  onInto,
}: {
  plan: MealPlan;
  into?: MealPlan[];
  onClose: () => void;
  onCopy: (rangeDates: string[], pairs: Array<{ from: string; to: string }>) => void;
  onInto?: (planId: string, pairs: Array<{ from: string; to: string }>) => void;
}) {
  const source = planDates(plan);
  const saved = (into ?? []).filter((item) => item.id !== plan.id && item.start && item.end);
  const initial = source[0] ? parseKey(source[0]) : new Date();
  const [where, setWhere] = useState(Boolean(saved.length && onInto));
  const [mode, setMode] = useState<"each" | "span">("span");
  const [pickedDays, setPickedDays] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [span, setSpan] = useState<{ start: string; end: string } | null>(null);
  const [cursor, setCursor] = useState({ year: initial.getFullYear(), month: initial.getMonth() });
  const [place, setPlace] = useState<{ range: string[]; choices: string[]; need: number; fromSource: boolean; targetId?: string } | null>(null);
  const [marked, setMarked] = useState<string[]>([]);
  const first = new Date(cursor.year, cursor.month, 1);
  const lead = first.getDay();
  const count = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const cells: Array<string | null> = [...Array(lead).fill(null)];
  for (let day = 1; day <= count; day += 1) cells.push(todayKey(new Date(cursor.year, cursor.month, day)));
  const from = span ? (span.start <= span.end ? span.start : span.end) : anchor ?? "";
  const to = span ? (span.start <= span.end ? span.end : span.start) : anchor ?? "";
  const chosen = mode === "each" ? [...pickedDays].sort() : span ? eachDay(span.start, span.end) : anchor ? [anchor] : [];
  const toggleMark = (date: string) => setMarked((current) => (current.includes(date) ? current.filter((item) => item !== date) : current.length >= (place?.need ?? 0) ? current : [...current, date]));
  const land = (range: string[], pairs: Array<{ from: string; to: string }>, targetId?: string) => {
    if (targetId && onInto) onInto(targetId, pairs);
    else onCopy(range, pairs);
  };
  const aimAt = (dates: string[], targetId?: string) => {
    if (!dates.length || !source.length) return;
    if (dates.length === source.length) {
      land(dates, source.map((date, index) => ({ from: date, to: dates[index] ?? date })), targetId);
      return;
    }
    setWhere(false);
    if (dates.length > source.length) {
      setPlace({ range: dates, choices: dates, need: source.length, fromSource: false, targetId });
      setMarked([]);
      return;
    }
    setPlace({ range: dates, choices: source, need: dates.length, fromSource: true, targetId });
    setMarked([]);
  };
  const finishPlace = () => {
    if (!place || marked.length !== place.need) return;
    const landing = [...marked].sort();
    if (place.fromSource) {
      land(place.range, landing.map((date, index) => ({ from: date, to: place.range[index] ?? date })), place.targetId);
      return;
    }
    land(place.range, source.map((date, index) => ({ from: date, to: landing[index] ?? date })), place.targetId);
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Copy plan" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-card border border-line bg-bg p-4" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 font-display text-lg font-semibold">Copy {formatRange(plan.start, plan.end)}</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="inline-flex size-11 items-center justify-center rounded-full border border-line">
            <X className="size-4" />
          </button>
        </div>
        {where ? (
          <>
            <p className="text-sm text-muted">Copy these {source.length} {source.length === 1 ? "day" : "days"} onto new dates, or into a plan that is already saved.</p>
            <button type="button" onClick={() => setWhere(false)} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink">
              New dates
            </button>
            <p className="text-sm font-semibold">Into a saved plan</p>
            <ul className="flex flex-col gap-2">
              {saved.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => aimAt(planDates(item), item.id)} className="flex min-h-11 w-full items-center rounded-2xl border border-line bg-surface px-3 text-left text-sm font-semibold">
                    {formatRange(item.start, item.end)}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : place ? (
          <>
            <p className="text-sm text-muted">
              {place.fromSource
                ? `This range has fewer days. Pick ${place.need} of the original days to bring. They stay in order.`
                : place.targetId
                  ? `This plan has more days. Pick ${place.need} days to replace. They stay in order. The other days are left alone.`
                  : `This range has more days. Pick ${place.need} days for the meals. They stay in order. The other days stay empty.`}
            </p>
            <ul className="flex flex-col gap-2">
              {place.choices.map((date) => {
                const on = marked.includes(date);
                return (
                  <li key={date}>
                    <button type="button" aria-pressed={on} onClick={() => toggleMark(date)} className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3 text-left text-sm font-semibold">
                      <span className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-tomato bg-tomato text-tomato-ink" : "border-line"}`}>
                        {on ? <Check className="size-3" /> : null}
                      </span>
                      {formatDay(date)}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={() => { setPlace(null); if (saved.length && onInto) setWhere(true); }} className="h-11 rounded-full border border-line px-4 text-sm font-semibold">
              Back
            </button>
            <button type="button" disabled={marked.length !== place.need} onClick={finishPlace} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-50">
              Copy onto these days
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Pick the dates this copy should cover. The original has {source.length} {source.length === 1 ? "day" : "days"}.</p>
            {saved.length && onInto ? (
              <button type="button" onClick={() => setWhere(true)} className="h-11 rounded-full border border-line px-4 text-sm font-semibold">
                Back
              </button>
            ) : null}
            <div className="flex gap-2">
              <button type="button" aria-pressed={mode === "each"} onClick={() => { setMode("each"); setPickedDays(chosen); setSpan(null); setAnchor(null); }} className={`h-10 flex-1 rounded-full px-3 text-sm font-semibold ${mode === "each" ? "bg-tomato text-tomato-ink" : "border border-line"}`}>
                Each day
              </button>
              <button type="button" aria-pressed={mode === "span"} onClick={() => { const days = (pickedDays.length ? [...pickedDays] : chosen).sort(); setMode("span"); setSpan(days.length ? { start: days[0] ?? "", end: days[days.length - 1] ?? "" } : null); setAnchor(null); setPickedDays([]); }} className={`h-10 flex-1 rounded-full px-3 text-sm font-semibold ${mode === "span" ? "bg-tomato text-tomato-ink" : "border border-line"}`}>
                First & last
              </button>
            </div>
            <div className="flex items-center justify-between">
              <button type="button" aria-label="Previous month" onClick={() => setCursor((current) => shiftMonth(current, -1))} className="inline-flex size-11 items-center justify-center rounded-full">
                <ChevronLeft className="size-5" />
              </button>
              <p className="font-display text-lg font-semibold">{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
              <button type="button" aria-label="Next month" onClick={() => setCursor((current) => shiftMonth(current, 1))} className="inline-flex size-11 items-center justify-center rounded-full">
                <ChevronRight className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
              {WEEKDAYS.map((day) => <span key={day} className="py-1">{day}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((key, index) => {
                if (!key) return <span key={`empty-${index}`} />;
                const selected = mode === "each" ? pickedDays.includes(key) : key === from || key === to;
                const inside = mode === "span" && Boolean(span && key > from && key < to);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected || inside}
                    onClick={() => {
                      if (mode === "each") {
                        setPickedDays((current) => (current.includes(key) ? current.filter((date) => date !== key) : [...current, key]));
                        return;
                      }
                      if (!anchor || span) {
                        setSpan(null);
                        setAnchor(key);
                        return;
                      }
                      setSpan({ start: anchor <= key ? anchor : key, end: anchor <= key ? key : anchor });
                      setAnchor(null);
                    }}
                    className={`inline-flex h-11 items-center justify-center rounded-full text-sm font-medium ${selected ? "bg-tomato text-tomato-ink" : inside ? "bg-gold-bg text-ink" : "bg-surface"}`}
                  >
                    {Number(key.slice(-2))}
                  </button>
                );
              })}
            </div>
            <button type="button" disabled={!chosen.length} onClick={() => aimAt(chosen)} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-50">
              Use these days
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const CHIP_SLOTS: MealSlot[] = ["breakfast", "lunch", "supper", "snack"];

function CopyMealSheet({ plan, meal, onClose, onCopy }: { plan: MealPlan; meal: PlannedMeal; onClose: () => void; onCopy: (targets: ChipTarget[]) => void }) {
  const days = planDates(plan);
  const rows = days.flatMap((date) => {
    const seats = [
      ...peopleForDay(plan, date).map((person) => ({ id: person.id, name: person.name, personId: person.id, groupId: undefined as string | undefined })),
      ...(plan.dayGroups?.[date] ?? []).map((group) => ({ id: `group:${group.id}`, name: group.name, personId: undefined as string | undefined, groupId: group.id })),
    ];
    return seats.flatMap((seat) =>
      CHIP_SLOTS.map((slot) => {
        const meals = seat.groupId ? mealsForGroup(plan, date, seat.groupId, slot) : mealsFor(plan, date, slot, seat.personId);
        const key = `${date}|${seat.id}|${slot}`;
        return { key, date, slot, name: seat.name, personId: seat.personId, groupId: seat.groupId, label: meals.length ? meals.map((item) => shortName(item)).join(", ") : "Empty" };
      }),
    );
  });
  const [checked, setChecked] = useState<string[]>([]);
  const toggle = (key: string) => setChecked((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  const title = meal.versionLabel ? `${meal.title} ${meal.versionLabel}` : meal.title;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Copy meal" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 rounded-card border border-line bg-bg p-4" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 font-display text-lg font-semibold">Copy meal</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="inline-flex size-11 items-center justify-center rounded-full border border-line">
            <X className="size-4" />
          </button>
        </div>
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted">Check the chips to copy it onto. Empty chips and chips that already have a meal both work. What is already there stays.</p>
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {rows.map((row) => {
            const on = checked.includes(row.key);
            return (
              <li key={row.key}>
                <button type="button" aria-pressed={on} onClick={() => toggle(row.key)} className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2 text-left">
                  <span className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-tomato bg-tomato text-tomato-ink" : "border-line"}`}>
                    {on ? <Check className="size-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{formatDay(row.date)} · {row.name} · {SLOT_LABEL[row.slot]}</span>
                    <span className="block truncate text-xs text-muted">{row.label}</span>
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
            const targets = rows
              .filter((row) => checked.includes(row.key))
              .map((row) => ({ date: row.date, slot: row.slot, personId: row.personId, groupId: row.groupId }));
            onCopy(targets);
          }}
          className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-50"
        >
          Copy
        </button>
      </div>
    </div>
  );
}

function nextDayTargets(days: string[], sources: string[], extend: boolean): string[] {
  const ordered = [...sources].sort();
  const last = ordered[ordered.length - 1] ?? "";
  const after = days.filter((date) => date > last);
  if (!extend) return after.slice(0, ordered.length);
  const targets = [...after];
  let cursor = targets[targets.length - 1] ?? days[days.length - 1] ?? last;
  while (targets.length < ordered.length && cursor) {
    cursor = shiftDay(cursor, 1);
    if (!targets.includes(cursor)) targets.push(cursor);
  }
  return targets.slice(0, ordered.length);
}

function CopyDaysSheet({
  plan,
  plans,
  sources,
  onClose,
  onCopy,
}: {
  plan: MealPlan;
  plans: MealPlan[];
  sources: string[];
  onClose: () => void;
  onCopy: (pairs: Array<{ from: string; to: DayCopyTarget }>) => void;
}) {
  const days = planDates(plan);
  const [mode, setMode] = useState<"home" | "days" | "calendar" | "ask">(sources.length > 1 ? "home" : "days");
  const [chosen, setChosen] = useState<string[]>([]);
  const [pending, setPending] = useState<Array<{ from: string; date: string }>>([]);
  const [where, setWhere] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [cursor, setCursor] = useState(() => {
    const first = sources[0] ? parseKey(sources[0]) : new Date();
    return { year: first.getFullYear(), month: first.getMonth() };
  });
  const leadDate = new Date(cursor.year, cursor.month, 1);
  const lead = leadDate.getDay();
  const count = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const cells: Array<string | null> = [...Array(lead).fill(null)];
  for (let day = 1; day <= count; day += 1) cells.push(todayKey(new Date(cursor.year, cursor.month, day)));

  const commit = (targets: string[]) => {
    const unique = [...new Set(targets)].filter((date) => date && !sources.includes(date)).sort();
    const pairs = sources.length === 1
      ? unique.map((date) => ({ from: sources[0] ?? "", date }))
      : sources.flatMap((from, index) => (unique[index] ? [{ from, date: unique[index] ?? "" }] : []));
    if (!pairs.length) {
      setNote("There is no later day in this plan to copy onto. Add a day, or pick dates.");
      return;
    }
    const dates = pairs.map((pair) => pair.date);
    const conflicts = dates.filter((date) => !days.includes(date) && plansOnDate(plans, date, plan.id).length);
    if (conflicts.length) {
      setPending(pairs);
      setWhere(Object.fromEntries(conflicts.map((date) => [date, plan.id])));
      setMode("ask");
      return;
    }
    onCopy(pairs.map((pair) => ({ from: pair.from, to: { date: pair.date, planId: plan.id } })));
  };
  const finishAsk = () => {
    onCopy(pending.map((pair) => {
      const holders = plansOnDate(plans, pair.date, plan.id);
      const pick = where[pair.date];
      const planId = pick && pick !== plan.id && holders.some((item) => item.id === pick) ? pick : plan.id;
      return { from: pair.from, to: { date: pair.date, planId } };
    }));
  };
  const toggle = (date: string) => setChosen((current) => (current.includes(date) ? current.filter((item) => item !== date) : [...current, date]));
  const one = sources.length === 1;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Copy days" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-card border border-line bg-bg p-4" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 font-display text-lg font-semibold">{one ? "Copy day" : "Copy days"}</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="inline-flex size-11 items-center justify-center rounded-full border border-line">
            <X className="size-4" />
          </button>
        </div>
        {mode === "home" ? (
          <>
        <p className="text-sm text-muted">{sources.map((date) => formatDay(date)).join(", ")} copy in that order.</p>
        {note ? <p className="text-sm text-tomato">{note}</p> : null}
            <button type="button" onClick={() => commit(nextDayTargets(days, sources, false))} className="h-11 rounded-full border border-line bg-surface px-4 text-left text-sm font-semibold">
              Next days already in this plan
            </button>
            <button type="button" onClick={() => commit(nextDayTargets(days, sources, true))} className="h-11 rounded-full border border-line bg-surface px-4 text-left text-sm font-semibold">
              Next days, add a day if the plan runs out
            </button>
            <button type="button" onClick={() => { setChosen([]); setMode("calendar"); }} className="h-11 rounded-full border border-line bg-surface px-4 text-left text-sm font-semibold">
              Pick the days on a calendar
            </button>
          </>
        ) : null}
        {mode === "days" ? (
          <>
            <p className="text-sm text-muted">Copy {formatDay(sources[0] ?? "")} onto days already in this plan. Meals already on those days are replaced.</p>
            <ul className="flex flex-col gap-2">
              {days.filter((date) => date !== sources[0]).map((date) => {
                const on = chosen.includes(date);
                return (
                  <li key={date}>
                    <button type="button" aria-pressed={on} onClick={() => toggle(date)} className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3 text-left text-sm font-semibold">
                      <span className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-tomato bg-tomato text-tomato-ink" : "border-line"}`}>
                        {on ? <Check className="size-3" /> : null}
                      </span>
                      {formatDay(date)}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={() => { setChosen([]); setMode("calendar"); }} className="h-11 rounded-full border border-line px-4 text-sm font-semibold">
              A day that is not in this plan yet
            </button>
            <button type="button" disabled={!chosen.length} onClick={() => commit([...chosen].sort())} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-50">
              Copy
            </button>
          </>
        ) : null}
        {mode === "calendar" ? (
          <>
            <p className="text-sm text-muted">Pick {sources.length} {sources.length === 1 ? "day" : "days"}. A day that is not in this plan is added. If another plan already has that day, you will be asked where it goes.</p>
            <div className="flex items-center justify-between">
              <button type="button" aria-label="Previous month" onClick={() => setCursor((current) => shiftMonth(current, -1))} className="inline-flex size-11 items-center justify-center rounded-full">
                <ChevronLeft className="size-5" />
              </button>
              <p className="font-display text-lg font-semibold">{leadDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
              <button type="button" aria-label="Next month" onClick={() => setCursor((current) => shiftMonth(current, 1))} className="inline-flex size-11 items-center justify-center rounded-full">
                <ChevronRight className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
              {WEEKDAYS.map((day) => <span key={day} className="py-1">{day}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((key, index) => {
                if (!key) return <span key={`empty-${index}`} />;
                const on = chosen.includes(key);
                return (
                  <button key={key} type="button" aria-pressed={on} onClick={() => toggle(key)} className={`inline-flex h-11 items-center justify-center rounded-full text-sm font-medium ${on ? "bg-tomato text-tomato-ink" : days.includes(key) ? "bg-gold-bg" : "bg-surface"}`}>
                    {Number(key.slice(-2))}
                  </button>
                );
              })}
            </div>
            <button type="button" disabled={!chosen.length} onClick={() => commit([...chosen].sort())} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-50">
              Copy to selected days
            </button>
          </>
        ) : null}
        {mode === "ask" ? (
          <>
            <p className="text-sm text-muted">One of those days is already on another plan. Add it here, or put the meals on that plan.</p>
            {pending.filter((pair) => !days.includes(pair.date) && plansOnDate(plans, pair.date, plan.id).length).map((pair) => (
              <div key={`${pair.from}-${pair.date}`} className="flex flex-col gap-2 rounded-2xl border border-line p-3">
                <p className="text-sm font-semibold">{formatDay(pair.date)}</p>
                <button type="button" aria-pressed={(where[pair.date] ?? plan.id) === plan.id} onClick={() => setWhere((current) => ({ ...current, [pair.date]: plan.id }))} className={`h-11 rounded-full px-3 text-left text-sm font-semibold ${(where[pair.date] ?? plan.id) === plan.id ? "bg-tomato text-tomato-ink" : "border border-line"}`}>
                  Add it to this plan
                </button>
                {plansOnDate(plans, pair.date, plan.id).map((other) => (
                  <button key={other.id} type="button" aria-pressed={where[pair.date] === other.id} onClick={() => setWhere((current) => ({ ...current, [pair.date]: other.id }))} className={`h-11 rounded-full px-3 text-left text-sm font-semibold ${where[pair.date] === other.id ? "bg-tomato text-tomato-ink" : "border border-line"}`}>
                    Put it on {formatRange(other.start, other.end)}
                  </button>
                ))}
              </div>
            ))}
            <button type="button" onClick={finishAsk} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink">
              Copy
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function DatePicker({ plan, onUse }: { plan: MealPlan; onUse: (dates: string[]) => void }) {
  const included = planDates(plan);
  const gapped = Boolean(plan.omitDates?.length);
  const [mode, setMode] = useState<"each" | "span">(gapped ? "each" : "span");
  const [pickedDays, setPickedDays] = useState<string[]>(gapped ? included : []);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [span, setSpan] = useState<{ start: string; end: string } | null>(!gapped && plan.start && plan.end ? { start: plan.start, end: plan.end } : null);
  const initial = plan.start ? parseKey(plan.start) : new Date();
  const [cursor, setCursor] = useState({ year: initial.getFullYear(), month: initial.getMonth() });
  const first = new Date(cursor.year, cursor.month, 1);
  const lead = first.getDay();
  const count = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const cells: Array<string | null> = [...Array(lead).fill(null)];
  for (let day = 1; day <= count; day += 1) cells.push(todayKey(new Date(cursor.year, cursor.month, day)));
  const from = span ? (span.start <= span.end ? span.start : span.end) : anchor ?? "";
  const to = span ? (span.start <= span.end ? span.end : span.start) : anchor ?? "";
  const chosen = mode === "each" ? [...pickedDays].sort() : span ? eachDay(span.start, span.end) : anchor ? [anchor] : [];

  const switchMode = (next: "each" | "span") => {
    if (next === mode) return;
    if (next === "each") {
      const days = span ? eachDay(span.start, span.end) : anchor ? [anchor] : included;
      setPickedDays(days);
      setAnchor(null);
      setSpan(null);
    } else {
      const days = (pickedDays.length ? [...pickedDays] : included).sort();
      setSpan(days.length ? { start: days[0] ?? "", end: days[days.length - 1] ?? "" } : null);
      setAnchor(null);
      setPickedDays([]);
    }
    setMode(next);
  };

  const pick = (key: string) => {
    if (mode === "each") {
      setPickedDays((current) => (current.includes(key) ? current.filter((date) => date !== key) : [...current, key]));
      return;
    }
    if (!anchor || span) {
      setSpan(null);
      setAnchor(key);
      return;
    }
    setSpan({ start: anchor <= key ? anchor : key, end: anchor <= key ? key : anchor });
    setAnchor(null);
  };

  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <div className="mb-3 flex gap-2">
        <button type="button" aria-pressed={mode === "each"} onClick={() => switchMode("each")} className={`h-10 flex-1 rounded-full px-3 text-sm font-semibold ${mode === "each" ? "bg-tomato text-tomato-ink" : "border border-line"}`}>
          Each day
        </button>
        <button type="button" aria-pressed={mode === "span"} onClick={() => switchMode("span")} className={`h-10 flex-1 rounded-full px-3 text-sm font-semibold ${mode === "span" ? "bg-tomato text-tomato-ink" : "border border-line"}`}>
          First & last
        </button>
      </div>
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
          const selected = mode === "each" ? pickedDays.includes(key) : key === from || key === to;
          const inside = mode === "span" && Boolean(span && key > from && key < to);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected || inside}
              onClick={() => pick(key)}
              className={`inline-flex h-11 items-center justify-center rounded-full text-sm font-medium ${selected ? "bg-tomato text-tomato-ink" : inside ? "bg-gold-bg text-ink" : "bg-bg"} ${key === todayKey() && !selected ? "ring-1 ring-tomato" : ""}`}
            >
              {Number(key.slice(-2))}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-muted">{mode === "each" ? "Tap every day you want. Tap a highlighted day to clear it." : "Tap the first day, then the last. The days between are included."}</p>
      <button type="button" disabled={!chosen.length} onClick={() => onUse(chosen)} className="mt-3 h-11 w-full rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-40">
        Use selected date range
      </button>
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
  const meals = withBatchPortion(plan, mealsFor(plan, date), catalog);
  if (!meals.length || !catalog.size) return null;
  const totals = new Map<string, number>();
  const add = (name: string, servings: number) => {
    if (!name || servings <= 0) return;
    totals.set(name, (totals.get(name) ?? 0) + servings);
  };
  for (const meal of meals) {
    const recipe = meal.recipeUid ? catalog.get(meal.recipeUid) : undefined;
    const plated = plateServings(meal);
    if (plated) {
      const scale = mealScale(meal);
      for (const line of plated) add(line.name, line.servings * scale * (isMeatName(line.name) ? meal.meatTrim ?? 1 : 1));
    } else if (recipe) {
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
