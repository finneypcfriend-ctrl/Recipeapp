import { ArrowLeft, ChevronDown, CopyPlus, Eye, Star, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { CLOUD_EVENT, publishPlateIngredients } from "@/lib/cloud/sync";
import { loadMeatStars, loadPlateTemplates, loadToppings, newToppingId, nextPlateVersion, nextToppingVersion, plateBaseId, plateVersion, plateVersionLabel, saveMeatStars, savePlateTemplates, saveToppings, toppingStarsFor, writeToppingStars, type PlateTemplate, type ToppingLine, type ToppingRecipe } from "@/lib/plans/toppings";
import type { MealPlan, MealSlot, PlanRoute, PlannedMeal, SavedPerson } from "@/lib/plans/model";
import { formatDay, SLOT_LABEL } from "@/lib/plans/model";
import { getIngredient, ingredientTitle, listIngredients, searchIngredients } from "@/lib/sourced";
import { readSavedPeople } from "@/lib/recipes/idb";
import { aisle, describeUse } from "@/lib/plans/grocery";
import { defaultKitchenUnit, formatKitchen, kitchenAmount, kitchenChoices, servingsForAmount, type KitchenChoice } from "@/lib/plans/kitchen";
import { customFoodTags, libraryTag, savedFoodTag } from "@/lib/sourced/tags";

interface PlateRow {
  key: string;
  title: string;
  sourceId: string | null;
  baseId: string | null;
  lines: ToppingLine[];
}

const PLATE_LIST_KEY = "recipes.plate-ingredients";
const PANTRY_VERSION = "2026-11-16";
const PANTRY_VERSION_KEY = "recipes.plate-pantry-version";
const GV_AMERICAN_KEY = "recipes.plate-gv-american";
const GV_AMERICAN_NAME = "American cheese (Great Value)";
const PLATE_STARTERS = ["BBQ sauce (G Hughes sugar free)", "American cheese (Kraft Singles)", "lettuce"];
const PANTRY_PLATE = [
  "alfredo sauce (Classico roasted red pepper)",
  "banana pepper rings (Vlasic)",
  "mustard (stone ground)",
  "hot sauce (Cholula green)",
  "apple cider vinegar (White House)",
  "sf ketchup",
  "ranch dressing (Great Value)",
  "butter",
  "parmesan",
  "parmesan (shredded)",
  "onion",
  "zucchini",
  "cucumber",
  "cheddar (shredded mild)",
  "tortilla (Mission zero net carb)",
  "pickles (dill chips)",
  "mustard",
  "sour cream",
  "pesto (Great Value basil)",
  "sweet chili sauce (G Hughes)",
  "BBQ sauce (G Hughes tex mex)",
  GV_AMERICAN_NAME,
];
const DEFAULT_PLATE_TITLE = "Build A Plate";

export function PlatePage({
  plan,
  date,
  slot,
  personId,
  initial,
  initialTitle,
  back,
  savedId,
  plateMode,
  onOpen,
  onSave,
}: {
  plan: MealPlan;
  date: string;
  slot: MealSlot;
  personId?: string;
  initial?: PlannedMeal["plate"];
  initialTitle?: string;
  back?: "plan";
  savedId?: string;
  plateMode?: "edit" | "version";
  onOpen: (route: PlanRoute) => void;
  onSave: (meal: { title: string; lines: ToppingLine[]; draft: NonNullable<PlannedMeal["plate"]> }) => Promise<void>;
}) {
  const [beefName, setBeefName] = useState(initial?.beefName ?? "");
  const [meatOn, setMeatOn] = useState(Boolean(initial?.beefName));
  const [swapBeef, setSwapBeef] = useState(false);
  const [title, setTitle] = useState(initialTitle || DEFAULT_PLATE_TITLE);
  const [nameEdited, setNameEdited] = useState(false);
  const [beef, setBeef] = useState(initial?.beefName ? poundsOf(initial.beefName, initial.beef ?? 0) : 1);
  const [loadId, setLoadId] = useState(0);
  const [templates, setTemplates] = useState<PlateTemplate[]>(() => loadPlateTemplates());
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [pending, setPending] = useState<{ title: string; lines: ToppingLine[]; draft: NonNullable<PlannedMeal["plate"]> } | null>(null);
  const [extras, setExtras] = useState<ToppingLine[]>(initial?.extras ?? []);
  const [listOpen, setListOpen] = useState(false);
  const [rows, setRows] = useState<PlateRow[]>(() => (initial?.rows ?? []).map((row) => ({ ...row, key: newToppingId(), lines: row.lines.map((line) => ({ ...line })) })));
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [library, setLibrary] = useState<ToppingRecipe[]>(() => loadToppings());
  const [people, setPeople] = useState<SavedPerson[]>([]);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [building, setBuilding] = useState(() => Boolean(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const refresh = () => {
      setLibrary(loadToppings());
      setTemplates(loadPlateTemplates());
      void readSavedPeople().then(setPeople).catch(() => setPeople([]));
    };
    window.addEventListener(CLOUD_EVENT, refresh);
    refresh();
    return () => window.removeEventListener(CLOUD_EVENT, refresh);
  }, []);

  const addSaved = (item: ToppingRecipe) => {
    const row: PlateRow = { key: newToppingId(), title: item.title, sourceId: item.id, baseId: item.baseId, lines: item.lines.map((line) => ({ ...line })) };
    setRows((current) => [...current, row]);
    setOpenKeys((current) => [...current, row.key]);
  };

  const addFromList = (picked: ToppingLine[]) => {
    setExtras((current) => {
      const next = [...current];
      for (const line of picked) {
        const at = next.findIndex((item) => item.name === line.name);
        if (at >= 0) next[at] = { ...next[at], servings: line.servings };
        else next.push(line);
      }
      return next;
    });
    setListOpen(false);
  };

  const updateRow = (key: string, change: (row: PlateRow) => PlateRow) => {
    setRows((current) => current.map((row) => (row.key === key ? change(row) : row)));
  };

  const saveVersion = (row: PlateRow) => {
    const baseId = row.baseId ?? newToppingId();
    const version = nextToppingVersion(library, baseId);
    const saved: ToppingRecipe = {
      id: `${baseId}-v${version}`,
      title: row.title.trim() || "Topping",
      baseId,
      version,
      versionLabel: `V${version}`,
      lines: row.lines.filter((line) => line.name && line.servings > 0),
    };
    const next = [...library, saved];
    setLibrary(next);
    saveToppings(next);
    updateRow(row.key, (current) => ({ ...current, title: saved.title, sourceId: saved.id, baseId }));
  };

  const commit = async () => {
    setSaving(true);
    setError("");
    try {
      const lines = new Map<string, number>();
      if (meatOn && beef > 0 && beefName) lines.set(beefName, servingsOfPounds(beefName, beef));
      for (const line of extras) {
        if (!line.name || line.servings <= 0) continue;
        lines.set(line.name, (lines.get(line.name) ?? 0) + line.servings);
      }
      for (const row of rows) {
        for (const line of row.lines) {
          if (!line.name || line.servings <= 0) continue;
          lines.set(line.name, (lines.get(line.name) ?? 0) + line.servings);
        }
      }
      if (!lines.size) {
        setError("Add beef or a topping first.");
        return;
      }
      const plateTitle = title.trim() || DEFAULT_PLATE_TITLE;
      const draft = { beefName: meatOn ? beefName : "", beef: meatOn && beefName ? servingsOfPounds(beefName, beef) : 0, extras, rows: rows.map(({ title: rowTitle, sourceId, baseId, lines: rowLines }) => ({ title: rowTitle, sourceId, baseId, lines: rowLines })) };
      const next = { title: plateTitle, lines: [...lines].map(([name, servings]) => ({ name, servings })), draft };
      if (nameEdited && plateTitle.toLowerCase() !== DEFAULT_PLATE_TITLE.toLowerCase()) {
        setPending(next);
        return;
      }
      await onSave(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that plate.");
    } finally {
      setSaving(false);
    }
  };

  const finish = async (asTemplate: boolean) => {
    if (!pending) return;
    setSaving(true);
    setError("");
    try {
      if (asTemplate) {
        const current = loadPlateTemplates();
        const match = current.find((item) => item.title.toLowerCase() === pending.title.toLowerCase());
        const saved: PlateTemplate = match
          ? { ...match, title: pending.title, ...pending.draft }
          : { id: newToppingId(), title: pending.title, ...pending.draft };
        const next = match ? current.map((item) => (item.id === match.id ? saved : item)) : [...current, saved];
        savePlateTemplates(next);
        setTemplates(next);
      }
      await onSave(pending);
      setPending(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that plate.");
    } finally {
      setSaving(false);
    }
  };

  const useTemplate = (item: PlateTemplate) => {
    setTitle(item.title);
    setNameEdited(false);
    setBeefName(item.beefName);
    setMeatOn(Boolean(item.beefName) && item.beef > 0);
    setBeef(item.beefName ? poundsOf(item.beefName, item.beef) : 1);
    setExtras(item.extras.map((line) => ({ ...line })));
    setRows(item.rows.map((row) => ({ ...row, key: newToppingId(), lines: row.lines.map((line) => ({ ...line })) })));
    setOpenKeys([]);
    setLoadId((value) => value + 1);
    setTemplatesOpen(false);
    setBuilding(true);
  };
  const leavePlate = () => onOpen({ kind: "plate", planId: plan.id, date, slot, personId, ...(back ? { back } : {}) });
  const leaveToPlan = () => (back === "plan" ? onOpen({ kind: "edit", planId: plan.id }) : leavePlate());
  const placeSaved = async (titleText: string, draft: Pick<PlateTemplate, "beefName" | "beef" | "extras" | "rows">) => {
    const lines = new Map<string, number>();
    if (draft.beef > 0) lines.set(draft.beefName, draft.beef);
    for (const line of [...draft.extras, ...draft.rows.flatMap((row) => row.lines)]) {
      if (!line.name || line.servings <= 0) continue;
      lines.set(line.name, (lines.get(line.name) ?? 0) + line.servings);
    }
    if (!lines.size) return;
    await onSave({ title: titleText, lines: [...lines].map(([name, servings]) => ({ name, servings })), draft });
  };
  if (savedId) {
    const saved = templates.find((item) => item.id === savedId);
    return (
      <SavedPlatePage
        key={`${saved?.id ?? "missing"}-${plateMode ?? "view"}`}
        item={saved}
        mode={plateMode}
        templates={templates}
        onBack={() => (plateMode && saved ? onOpen({ kind: "plate", planId: plan.id, date, slot, personId, ...(back ? { back } : {}), savedId: saved.id }) : leaveToPlan())}
        onEdit={() => saved && onOpen({ kind: "plate", planId: plan.id, date, slot, personId, ...(back ? { back } : {}), savedId: saved.id, plateMode: "edit" })}
        onVersion={() => saved && onOpen({ kind: "plate", planId: plan.id, date, slot, personId, ...(back ? { back } : {}), savedId: saved.id, plateMode: "version" })}
        onUse={() => {
          if (!saved) return;
          void placeSaved(saved.title, { beefName: saved.beefName, beef: saved.beef, extras: saved.extras, rows: saved.rows });
        }}
        onPlace={(draft) => placeSaved(saved?.title || DEFAULT_PLATE_TITLE, draft)}
        onOpenId={(id) => onOpen({ kind: "plate", planId: plan.id, date, slot, personId, ...(back ? { back } : {}), savedId: id })}
        onChange={(next, focusId, stay) => {
          savePlateTemplates(next);
          setTemplates(next);
          if (stay) return;
          if (focusId) onOpen({ kind: "plate", planId: plan.id, date, slot, personId, ...(back ? { back } : {}), savedId: focusId });
          else leaveToPlan();
        }}
      />
    );
  }
  if (building && !initial) {
    const seat = personId && !personId.startsWith("group:") ? people.find((item) => item.id === personId) : undefined;
    const preferredMeat = seat?.plateMeat?.trim() ?? "";
    const preferredAmount = preferredMeat ? (seat?.plateMeatServings && seat.plateMeatServings > 0 ? seat.plateMeatServings : servingsOfPounds(preferredMeat, 1)) : 0;
    const blank: PlateTemplate = { id: "new", title: title.trim() || DEFAULT_PLATE_TITLE, beefName: preferredMeat, beef: preferredAmount, extras: [], rows: [] };
    return (
      <div className="fixed inset-0 z-40 overflow-y-auto bg-bg">
        <div className="mx-auto flex min-h-full max-w-3xl flex-col">
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/90 px-2 py-2 backdrop-blur">
            <button type="button" onClick={() => setBuilding(false)} className="inline-flex h-11 items-center rounded-full px-3 text-sm font-semibold">
              Back
            </button>
            <h2 className="min-w-0 flex-1 truncate font-display text-xl font-semibold">{formatDay(date)}</h2>
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
            {error ? <p className="pb-3 text-sm text-tomato">{error}</p> : null}
            <PlateDetail
              key={`${preferredMeat}-${preferredAmount}`}
              item={blank}
              purpose="edit"
              hosted
              next={1}
              onUse={() => undefined}
              onCancel={() => setBuilding(false)}
              onDelete={() => setBuilding(false)}
              onSave={(draft, note, choice) => {
                const hasFood = (draft.beef > 0 && Boolean(draft.beefName)) || draft.extras.some((line) => line.servings > 0) || draft.rows.some((row) => row.lines.some((line) => line.servings > 0));
                if (!hasFood) {
                  setError("Add meat or a topping first.");
                  return;
                }
                setError("");
                if (choice === "version" || choice === "current") {
                  const id = newToppingId();
                  const saved: PlateTemplate = { ...draft, id, title: blank.title, baseId: id, version: 1, versionLabel: choice === "version" ? versionName(1, note) : "V1" };
                  const next = [...loadPlateTemplates().filter((item) => item.id !== id), saved];
                  savePlateTemplates(next);
                  setTemplates(next);
                }
                void placeSaved(blank.title, draft);
              }}
            />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/90 px-2 py-2 backdrop-blur">
          <button type="button" onClick={() => building && !initial ? setBuilding(false) : onOpen(back === "plan" ? { kind: "edit", planId: plan.id, ...(personId ? { menu: { date, seat: personId, slot } } : {}) } : { kind: "day", planId: plan.id, date })} className="inline-flex h-11 items-center rounded-full px-3 text-sm font-semibold">
            Back
          </button>
          <h2 className="min-w-0 flex-1 truncate font-display text-xl font-semibold">{title.trim() && title.trim().toLowerCase() !== DEFAULT_PLATE_TITLE.toLowerCase() ? title : formatDay(date)}</h2>
        </div>
        <div className="flex flex-1 flex-col gap-4 px-4 py-4">
          <input value={title} onChange={(event) => { setTitle(event.target.value); setNameEdited(true); }} aria-label="Meal name" className="h-11 rounded-2xl border border-line bg-surface px-3 font-display text-lg font-semibold outline-none focus:border-tomato" />
          {building ? (
            <>
              <div className="flex items-center gap-2 rounded-card border border-line bg-surface px-3 py-2">
                <button type="button" onClick={() => setSwapBeef(true)} className={`min-w-0 flex-1 truncate text-left text-sm font-semibold ${meatOn ? "" : "text-muted"}`}>
                  {meatOn ? beefName : "Select Meat for a plate"}
                </button>
                {meatOn ? (
                  <>
                    <AmountField key={`${beefName}-${loadId}`} value={beef} onChange={setBeef} label="Meat amount in pounds" places={1} />
                    <span className="shrink-0 text-xs text-muted">lb</span>
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setRecipesOpen(true)} className="h-11 rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink">
                  Add Toppings
                </button>
                <button type="button" onClick={() => setListOpen(true)} className="h-11 rounded-full border border-line bg-surface px-4 text-sm font-semibold">
                  Add Ingredient(s)
                </button>
              </div>
              <div className={extras.length || rows.length ? "flex flex-col gap-4 border-y border-line py-4" : "contents"}>
                {extras.length ? (
                  <ul className="flex flex-col gap-2">
                    {extras.map((line) => (
                      <li key={`${line.name}-${loadId}`} className="flex items-center gap-2 rounded-card border border-line bg-surface px-3 py-2">
                        <span className="min-w-0 flex-1 truncate text-sm">{line.name}</span>
                        <AmountField
                          value={line.servings}
                          label={`${line.name} amount`}
                          onChange={(servings) => setExtras((current) => current.map((item) => (item.name === line.name ? { ...item, servings } : item)))}
                        />
                        <span className="w-24 shrink-0 text-right text-xs text-muted">{getIngredient(line.name)?.servingSize}</span>
                        <button type="button" aria-label={`Remove ${line.name}`} onClick={() => setExtras((current) => current.filter((item) => item.name !== line.name))} className="inline-flex size-11 items-center justify-center text-muted">
                          <X className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <ul className="flex flex-col gap-2">
                  {rows.map((row) => (
                    <li key={row.key} className="rounded-card border border-line bg-surface">
                      <button type="button" aria-expanded={openKeys.includes(row.key)} onClick={() => setOpenKeys((current) => (current.includes(row.key) ? current.filter((key) => key !== row.key) : [...current, row.key]))} className="flex h-11 w-full items-center gap-2 px-3 text-left text-sm font-semibold">
                        <ChevronDown className={`size-4 shrink-0 motion-safe:transition-transform ${openKeys.includes(row.key) ? "" : "-rotate-90"}`} />
                        <span className="min-w-0 flex-1 truncate">{row.title}</span>
                        <span className="text-xs text-muted">{row.lines.length} items</span>
                      </button>
                      {openKeys.includes(row.key) ? (
                        <div className="flex flex-col gap-2 border-t border-line px-3 py-3">
                          <input value={row.title} onChange={(event) => updateRow(row.key, (current) => ({ ...current, title: event.target.value }))} aria-label="Topping name" className="h-11 rounded-2xl border border-line bg-bg px-3 text-sm outline-none focus:border-tomato" />
                          {row.lines.map((line, index) => (
                            <div key={`${line.name}-${index}`} className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-sm">{line.name}</span>
                              <AmountField
                                value={line.servings}
                                label={`${line.name} amount`}
                                onChange={(servings) => updateRow(row.key, (current) => ({ ...current, lines: current.lines.map((item, at) => (at === index ? { ...item, servings } : item)) }))}
                              />
                              <button type="button" aria-label={`Remove ${line.name}`} onClick={() => updateRow(row.key, (current) => ({ ...current, lines: current.lines.filter((_, at) => at !== index) }))} className="h-11 px-2 text-sm text-muted">
                                Remove
                              </button>
                            </div>
                          ))}
                          <IngredientSearch
                            onPick={(name) => updateRow(row.key, (current) => ({ ...current, lines: current.lines.some((line) => line.name === name) ? current.lines : [...current.lines, { name, servings: 1 }] }))}
                          />
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => saveVersion(row)} className="h-11 rounded-full border border-line px-3 text-sm font-semibold">
                              Save topping version
                            </button>
                            <button type="button" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))} className="h-11 rounded-full px-3 text-sm font-semibold text-muted">
                              Remove row
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
              {error ? <p className="text-sm text-tomato">{error}</p> : null}
              <button type="button" disabled={saving} onClick={() => void commit()} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-50">
                {saving ? "Saving…" : "Save Plate to Day"}
              </button>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setBuilding(true)} className="h-11 rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink">
                New Plate
              </button>
              <button type="button" onClick={() => setTemplatesOpen(true)} className="h-11 rounded-full border border-line bg-surface px-4 text-sm font-semibold">
                Saved Plates
              </button>
            </div>
          )}
        </div>
      </div>
      {listOpen ? <IngredientList onClose={() => setListOpen(false)} onAdd={addFromList} /> : null}
      {swapBeef ? <IngredientSwap current={beefName || "meat"} scope="meat" onClose={() => setSwapBeef(false)} onPick={(name) => { setBeefName(name); setBeef(1); setMeatOn(true); setSwapBeef(false); }} /> : null}
      {recipesOpen ? (
        <ToppingLibrary
          items={library}
          personId={personId && !personId.startsWith("group:") ? personId : undefined}
          onClose={() => setRecipesOpen(false)}
          onAdd={(item) => {
            addSaved(item);
            setRecipesOpen(false);
          }}
          onUseSelected={(picked) => {
            for (const item of picked) addSaved(item);
            setRecipesOpen(false);
          }}
          onChange={(next) => {
            saveToppings(next);
            setLibrary(next);
          }}
        />
      ) : null}
      {templatesOpen ? (
        <PlateLibrary
          items={templates}
          onClose={() => setTemplatesOpen(false)}
          onUse={(item) => useTemplate(item)}
          onOpenItem={(item) => {
            setTemplatesOpen(false);
            onOpen({ kind: "plate", planId: plan.id, date, slot, personId, ...(back ? { back } : {}), savedId: item.id });
          }}
          onChange={(next) => {
            savePlateTemplates(next);
            setTemplates(next);
          }}
        />
      ) : null}
      {pending ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Save plate template">
          <div className="flex w-full max-w-lg flex-col gap-3 rounded-card border border-line bg-bg p-4">
            <h3 className="font-display text-lg font-semibold">Save this plate as a template?</h3>
            <p className="text-sm text-muted">“{pending.title}” can be used the next time you build a plate.</p>
            <button type="button" disabled={saving} onClick={() => void finish(true)} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-50">
              Save as template
            </button>
            <button type="button" disabled={saving} onClick={() => void finish(false)} className="h-11 rounded-full border border-line text-sm font-semibold disabled:opacity-50">
              Just this day
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToppingLibrary({
  items,
  personId,
  onClose,
  onAdd,
  onUseSelected,
  onChange,
}: {
  items: ToppingRecipe[];
  personId?: string;
  onClose: () => void;
  onAdd: (item: ToppingRecipe) => void;
  onUseSelected: (items: ToppingRecipe[]) => void;
  onChange: (items: ToppingRecipe[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pickedFamilies, setPickedFamilies] = useState<string[]>([]);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [stars, setStars] = useState<string[]>(() => (personId ? toppingStarsFor(personId) : []));
  const families = groupToppings(items);
  const open = items.find((item) => item.id === openId) ?? null;
  useEffect(() => {
    const refresh = () => setStars(personId ? toppingStarsFor(personId) : []);
    refresh();
    window.addEventListener(CLOUD_EVENT, refresh);
    return () => window.removeEventListener(CLOUD_EVENT, refresh);
  }, [personId]);
  const toggle = (list: string[], value: string, set: (next: string[]) => void) => set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const toggleStar = (id: string) => {
    if (!personId) return;
    const next = stars.includes(id) ? stars.filter((item) => item !== id) : [...stars, id];
    setStars(next);
    writeToppingStars(personId, next);
  };
  const saveSelected = () => {
    const chosen: ToppingRecipe[] = [];
    const seen = new Set<string>();
    for (const family of families) {
      const versions = [...family.items].sort((a, b) => a.version - b.version);
      const original = versions[0];
      const ids = [
        ...(pickedFamilies.includes(family.baseId) && original ? [original.id] : []),
        ...versions.filter((item) => pickedIds.includes(item.id)).map((item) => item.id),
      ];
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const item = versions.find((entry) => entry.id === id);
        if (item) chosen.push(item);
      }
    }
    if (chosen.length) onUseSelected(chosen);
  };
  if (creating || open) {
    return (
      <SavedToppingPage
        key={creating ? "new" : open?.id}
        item={open}
        creating={creating}
        items={items}
        onBack={() => { setCreating(false); setOpenId(null); }}
        onOpenId={(id) => { setCreating(false); setOpenId(id); }}
        onAdd={onAdd}
        onChange={onChange}
      />
    );
  }
  const anyPicked = pickedFamilies.length > 0 || pickedIds.length > 0;
  const pickedCount = pickedFamilies.length + pickedIds.length;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Saved toppings">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col gap-3 rounded-card border border-line bg-bg p-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center rounded-full px-2 text-sm font-semibold">
            Back
          </button>
          <h3 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">Saved toppings</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="inline-flex size-11 items-center justify-center rounded-full border border-line">
            <X className="size-4" />
          </button>
        </div>
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {families.length ? families.map((entry) => {
            const versions = [...entry.items].sort((a, b) => a.version - b.version);
            const original = versions[0];
            const children = versions.slice(1);
            const openVersions = expanded.includes(entry.baseId);
            const familyOn = pickedFamilies.includes(entry.baseId);
            return (
              <li key={entry.baseId} className="flex flex-col gap-2">
                <div role="button" tabIndex={0} onClick={() => { const next = !pickedFamilies.includes(entry.baseId); toggle(pickedFamilies, entry.baseId, setPickedFamilies); if (next && original) setPickedIds((current) => current.filter((id) => id !== original.id)); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); const next = !pickedFamilies.includes(entry.baseId); toggle(pickedFamilies, entry.baseId, setPickedFamilies); if (next && original) setPickedIds((current) => current.filter((id) => id !== original.id)); } }} className={`flex h-11 items-center gap-2 rounded-2xl border-2 bg-surface px-2 ${familyOn ? "border-tomato" : "border-line"}`}>
                  {original ? <StarMark on={stars.includes(original.id)} label={entry.title} onToggle={() => toggleStar(original.id)} /> : null}
                  <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">{entry.title}</span>
                  {original ? <EyeButton label={entry.title} onClick={() => setPreviewId(original.id)} /> : null}
                  {children.length ? (
                    <button type="button" aria-expanded={openVersions} onClick={(event) => { event.stopPropagation(); toggle(expanded, entry.baseId, setExpanded); }} className="shrink-0 pl-1 text-xs text-muted">
                      {`>${children.length}`}
                    </button>
                  ) : null}
                </div>
                {openVersions ? (
                  <ul className="flex flex-col gap-2 pl-6">
                    {children.map((version) => {
                      const on = pickedIds.includes(version.id);
                      return (
                        <li key={version.id}>
                          <div role="button" tabIndex={0} aria-pressed={on} onClick={() => toggle(pickedIds, version.id, setPickedIds)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(pickedIds, version.id, setPickedIds); } }} className={`flex h-11 w-full items-center gap-2 rounded-2xl border-2 bg-surface px-2 text-left text-sm font-semibold ${on ? "border-tomato" : "border-line"}`}>
                            <StarMark on={stars.includes(version.id)} label={version.versionLabel || `V${version.version}`} onToggle={() => toggleStar(version.id)} />
                            <span className="min-w-0 flex-1 truncate">{version.versionLabel || `V${version.version}`}</span>
                            <EyeButton label={version.versionLabel || version.title} onClick={() => setPreviewId(version.id)} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          }) : (
            <li><p className="text-sm leading-relaxed text-muted">No saved toppings yet.</p></li>
          )}
        </ul>
        <button type="button" disabled={!anyPicked} onClick={saveSelected} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-40">
          {pickedCount > 1 ? "Add Toppings to Plate" : "Add topping to plate"}
        </button>
        {previewId ? <ToppingPreview items={items} id={previewId} onClose={() => setPreviewId(null)} /> : null}
      </div>
    </div>
  );
}

function StarMark({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button type="button" aria-pressed={on} aria-label={on ? `Unstar ${label}` : `Star ${label}`} onClick={(event) => { event.stopPropagation(); onToggle(); }} className={`inline-flex size-9 shrink-0 items-center justify-center ${on ? "text-gold" : "text-muted"}`}>
      <Star className={`size-4 ${on ? "fill-current" : ""}`} />
    </button>
  );
}

function EyeButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={`View ${label}`} onClick={(event) => { event.stopPropagation(); onClick(); }} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted">
      <Eye className="size-4" />
    </button>
  );
}

function ToppingPreview({ items, id, onClose }: { items: ToppingRecipe[]; id: string; onClose: () => void }) {
  const item = items.find((entry) => entry.id === id);
  const family = item ? items.filter((entry) => entry.baseId === item.baseId).sort((a, b) => a.version - b.version) : [];
  const parent = family[0];
  const compared = Boolean(item && parent && item.id !== parent.id);
  const parentNames = new Map((parent?.lines ?? []).map((line) => [line.name, line.servings]));
  const nextNames = new Set((item?.lines ?? []).map((line) => line.name));
  const rows = (item?.lines ?? []).map((line) => {
    const before = parentNames.get(line.name);
    const tone = !compared || (before != null && before === line.servings) ? "same" : "gold";
    return { ...line, tone };
  });
  const removed = compared ? (parent?.lines ?? []).filter((line) => !nextNames.has(line.name)) : [];
  const title = !item ? "Topping" : item.id === parent?.id ? item.title : `${item.title} ${item.versionLabel || `V${item.version}`}`;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-6" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="flex max-h-[70vh] w-full max-w-sm flex-col gap-3 rounded-card border border-line bg-bg p-4 shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">{title}</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="inline-flex size-11 items-center justify-center rounded-full border border-line">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto rounded-2xl border border-line bg-surface">
          {rows.length ? rows.map((line) => (
            <div key={line.name} className="flex h-11 items-center justify-between gap-3 border-t border-line px-3 text-sm first:border-t-0">
              <span className={`min-w-0 truncate ${line.tone === "gold" ? "text-gold" : ""}`}>{line.name}</span>
              <span className={`shrink-0 ${line.tone === "gold" ? "text-gold" : "text-muted"}`}>{measureLabel(line.name, line.servings)}</span>
            </div>
          )) : <p className="px-3 py-3 text-sm text-muted">No ingredients yet.</p>}
          {removed.length ? (
            <div className="border-t border-line">
              {removed.map((line) => (
                <div key={line.name} className="flex h-11 items-center justify-between gap-3 px-3 text-sm text-red-400">
                  <span className="min-w-0 truncate">- {line.name}</span>
                  <span className="shrink-0">{measureLabel(line.name, line.servings)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SavedToppingPage({
  item,
  creating,
  items,
  onBack,
  onOpenId,
  onAdd,
  onChange,
}: {
  item: ToppingRecipe | null;
  creating: boolean;
  items: ToppingRecipe[];
  onBack: () => void;
  onOpenId: (id: string) => void;
  onAdd: (item: ToppingRecipe) => void;
  onChange: (items: ToppingRecipe[]) => void;
}) {
  const family = item ? items.filter((entry) => entry.baseId === item.baseId).sort((a, b) => a.version - b.version) : [];
  const original = family[0];
  const isVersion = Boolean(item && original && item.id !== original.id);
  const [mode, setMode] = useState<"view" | "edit" | "version">(creating ? "edit" : "view");
  const [name, setName] = useState(item?.title ?? "");
  const [lines, setLines] = useState<ToppingLine[]>(() => item?.lines.map((line) => ({ ...line })) ?? []);
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const next = item ? nextToppingVersion(items, item.baseId) : 1;
  useEffect(() => setName(item?.title ?? ""), [item?.title]);
  const rename = () => {
    const nextName = name.trim();
    if (!item || !nextName || nextName === item.title) {
      setName(item?.title ?? "");
      return;
    }
    onChange(items.map((entry) => (entry.baseId === item.baseId ? { ...entry, title: nextName } : entry)));
  };
  const startEdit = (purpose: "edit" | "version") => {
    setLines(item?.lines.map((line) => ({ ...line })) ?? []);
    setNote("");
    setMode(purpose);
  };
  const save = () => {
    const kept = lines.filter((line) => line.name && line.servings > 0);
    if (creating || !item) {
      const title = name.trim() || "New topping";
      const id = newToppingId();
      const saved: ToppingRecipe = { id, title, baseId: id, version: 1, versionLabel: "V1", lines: kept };
      onChange([...items, saved]);
      onOpenId(saved.id);
      setMode("view");
      return;
    }
    if (mode === "edit") {
      onChange(items.map((entry) => (entry.id === item.id ? { ...entry, lines: kept } : entry)));
      setMode("view");
      return;
    }
    const version = nextToppingVersion(items, item.baseId);
    const saved: ToppingRecipe = {
      id: newToppingId(),
      title: item.title,
      baseId: item.baseId,
      version,
      versionLabel: versionName(version, note),
      lines: kept,
    };
    onChange([...items, saved]);
    onOpenId(saved.id);
    setMode("view");
  };
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/90 px-2 py-2 backdrop-blur">
          <button type="button" onClick={() => (creating || mode === "view" ? onBack() : setMode("view"))} className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold">
            <ArrowLeft className="size-4" />
            Back
          </button>
          <input
            aria-label="Topping name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => { if (!creating) rename(); }}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
            className="min-w-0 flex-1 truncate bg-transparent font-display text-xl font-semibold outline-none"
          />
        </div>
        {mode === "view" && item ? (
          <div className="border-b border-line">
            {family.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto px-4 py-3">
                {family.map((entry, index) => (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={entry.id === item.id}
                    onClick={() => onOpenId(entry.id)}
                    className={`h-11 shrink-0 rounded-full px-3 text-sm font-semibold ${entry.id === item.id ? "bg-tomato text-tomato-ink" : "border border-line bg-surface"}`}
                  >
                    {index === 0 ? "Original" : entry.versionLabel || `V${entry.version}`}
                  </button>
                ))}
              </div>
            ) : null}
            <div className={`flex items-center gap-2 px-4 py-3 ${family.length > 1 ? "border-t border-line" : ""}`}>
              <button type="button" onClick={() => startEdit("version")} className="inline-flex h-11 items-center gap-2 rounded-full bg-tomato px-3 text-sm font-semibold text-tomato-ink">
                <CopyPlus className="size-4" />
                New version
              </button>
              {isVersion ? (
                confirmDelete ? (
                  <div className="ml-auto flex items-center gap-2">
                    <button type="button" onClick={() => { onChange(items.filter((entry) => entry.id !== item.id)); onBack(); }} className="inline-flex h-11 items-center rounded-full bg-tomato px-3 text-sm font-semibold text-tomato-ink">
                      Delete {item.versionLabel || `V${item.version}`}
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="inline-flex h-11 items-center rounded-full border border-line px-3 text-sm font-semibold">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)} className="ml-auto inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm font-semibold">
                    <Trash2 className="size-4" />
                    Delete
                  </button>
                )
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="flex flex-1 flex-col gap-3 px-4 py-4">
          {mode === "view" && item ? (
            <>
              {item.lines.length ? (
                <div className="rounded-2xl border border-line bg-surface">
                  {item.lines.map((line) => (
                    <div key={line.name} className="flex h-11 items-center justify-between gap-3 border-t border-line px-3 text-sm first:border-t-0">
                      <span className="min-w-0 truncate">{line.name}</span>
                      <span className="shrink-0 text-muted">{measureLabel(line.name, line.servings)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <button type="button" onClick={() => onAdd(item)} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink">
                Add to plate
              </button>
              <button type="button" onClick={() => startEdit("edit")} className="h-11 rounded-full border border-line bg-surface text-sm font-semibold">
                Edit
              </button>
            </>
          ) : (
            <>
              {lines.map((line, index) => (
                <div key={`${line.name}-${index}`} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{line.name}</span>
                  <AmountField
                    value={line.servings}
                    label={`${line.name} amount`}
                    onChange={(servings) => setLines((current) => current.map((entry, at) => (at === index ? { ...entry, servings } : entry)))}
                  />
                  <button type="button" aria-label={`Remove ${line.name}`} onClick={() => setLines((current) => current.filter((_, at) => at !== index))} className="inline-flex size-11 items-center justify-center text-muted">
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              <IngredientSearch onPick={(picked) => setLines((current) => (current.some((line) => line.name === picked) ? current : [...current, { name: picked, servings: 1 }]))} />
              {mode === "version" ? (
                <>
                  <label className="block">
                    <span className="text-xs font-semibold tracking-wide text-muted uppercase">Name after {`V${next}`}</span>
                    <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="(optional)" className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 text-base outline-none focus:border-tomato" />
                  </label>
                  <p className="text-xs text-muted">Saves As: {versionName(next, note)}</p>
                </>
              ) : null}
              <button type="button" onClick={save} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink">
                {creating ? "Save topping" : mode === "edit" ? "Save" : "Save as new version"}
              </button>
              <button type="button" onClick={() => (creating ? onBack() : setMode("view"))} className="h-11 rounded-full border border-line text-sm font-semibold">
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SavedPlatePage({
  item,
  mode,
  templates,
  onBack,
  onEdit,
  onVersion,
  onUse,
  onPlace,
  onOpenId,
  onChange,
}: {
  item: PlateTemplate | undefined;
  mode?: "edit" | "version";
  templates: PlateTemplate[];
  onBack: () => void;
  onEdit: () => void;
  onVersion: () => void;
  onUse: () => void;
  onPlace: (draft: Pick<PlateTemplate, "beefName" | "beef" | "extras" | "rows">) => void;
  onOpenId: (id: string) => void;
  onChange: (items: PlateTemplate[], focusId?: string, stay?: boolean) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(item?.title ?? "");
  const family = item ? templates.filter((entry) => plateBaseId(entry) === plateBaseId(item)).sort((a, b) => plateVersion(a) - plateVersion(b)) : [];
  const original = family[0];
  const isVersion = Boolean(item && original && item.id !== original.id);
  useEffect(() => setName(item?.title ?? ""), [item?.title]);
  const rename = () => {
    const next = name.trim();
    if (!item || !next || next === item.title) {
      setName(item?.title ?? "");
      return;
    }
    const base = plateBaseId(item);
    onChange(templates.map((entry) => (plateBaseId(entry) === base ? { ...entry, title: next } : entry)), item.id);
  };
  const versionRow = !mode && item ? (
    <div className="border-b border-line">
      {family.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto px-4 py-3">
          {family.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={entry.id === item.id}
              onClick={() => onOpenId(entry.id)}
              className={`h-11 shrink-0 rounded-full px-3 text-sm font-semibold ${entry.id === item.id ? "bg-tomato text-tomato-ink" : "border border-line bg-surface"}`}
            >
              {index === 0 ? "Original" : plateVersionLabel(entry)}
            </button>
          ))}
        </div>
      ) : null}
      <div className={`flex items-center gap-2 px-4 py-3 ${family.length > 1 ? "border-t border-line" : ""}`}>
        <button type="button" onClick={onVersion} className="inline-flex h-11 items-center gap-2 rounded-full bg-tomato px-3 text-sm font-semibold text-tomato-ink">
          <CopyPlus className="size-4" />
          New version
        </button>
        {isVersion ? (
          confirmDelete ? (
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => onChange(templates.filter((entry) => entry.id !== item.id))} className="inline-flex h-11 items-center rounded-full bg-tomato px-3 text-sm font-semibold text-tomato-ink">
                Delete {plateVersionLabel(item)}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="inline-flex h-11 items-center rounded-full border border-line px-3 text-sm font-semibold">
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="ml-auto inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm font-semibold">
              <Trash2 className="size-4" />
              Delete
            </button>
          )
        ) : null}
      </div>
    </div>
  ) : null;
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/90 px-2 py-2 backdrop-blur">
          <button type="button" onClick={onBack} className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold">
            <ArrowLeft className="size-4" />
            Back
          </button>
          {!mode && item ? (
            <input
              aria-label="Plate name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={rename}
              onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
              className="min-w-0 flex-1 truncate bg-transparent font-display text-xl font-semibold outline-none"
            />
          ) : null}
        </div>
        {versionRow}
        {!item ? (
          <p className="px-4 py-6 text-sm text-muted">That saved plate is gone.</p>
        ) : mode ? (
          <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
            <PlateDetail
              key={`${item.id}-${mode}`}
              item={item}
              purpose={mode}
              hosted
              next={nextPlateVersion(templates, plateBaseId(item))}
              onUse={onUse}
              onCancel={onBack}
              onDelete={() => onChange(templates.filter((entry) => entry.id !== item.id))}
              onSave={(draft, note, choice) => {
                if (mode === "edit") {
                  if (choice === "current") onChange(templates.map((entry) => (entry.id === item.id ? { ...entry, ...draft } : entry)), undefined, true);
                  if (choice === "version") {
                    const baseId = plateBaseId(item);
                    const version = nextPlateVersion(templates, baseId);
                    const saved: PlateTemplate = { ...draft, id: newToppingId(), title: item.title, baseId, version, versionLabel: versionName(version, note) };
                    onChange([...templates, saved], undefined, true);
                  }
                  onPlace(draft);
                  return;
                }
                const baseId = plateBaseId(item);
                const version = nextPlateVersion(templates, baseId);
                const saved: PlateTemplate = {
                  ...draft,
                  id: newToppingId(),
                  title: item.title,
                  baseId,
                  version,
                  versionLabel: versionName(version, note),
                };
                onChange([...templates, saved], saved.id);
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3 px-4 py-4">
            <PlateDetail
              key={item.id}
              item={item}
              hosted
              next={nextPlateVersion(templates, plateBaseId(item))}
              onUse={onUse}
              onDelete={() => onChange(templates.filter((entry) => entry.id !== item.id))}
              onSave={() => undefined}
            />
            <button type="button" onClick={onEdit} className="h-11 rounded-full border border-line bg-surface text-sm font-semibold">
              Edit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PlateLibrary({
  items,
  onClose,
  onUse,
  onChange,
  onOpenItem,
}: {
  items: PlateTemplate[];
  onClose: () => void;
  onUse: (item: PlateTemplate) => void;
  onChange: (items: PlateTemplate[]) => void;
  onOpenItem?: (item: PlateTemplate) => void;
}) {
  return (
    <VersionBook
      heading="Saved plates"
      families={groupPlates(items)}
      empty="You don't have any saved plates yet. Build a plate, rename it, and hit Save Plate to Day."
      onClose={onClose}
      onOpenItem={onOpenItem}
      renderOpen={onOpenItem ? undefined : (item, nav) => (
        <PlateDetail
          key={item.id}
          item={item}
          onUse={() => onUse(item)}
          next={nextPlateVersion(items, plateBaseId(item))}
          onDelete={() => {
            onChange(items.filter((entry) => entry.id !== item.id));
            nav.back();
          }}
          onSave={(draft, note) => {
            const baseId = plateBaseId(item);
            const version = nextPlateVersion(items, baseId);
            const saved: PlateTemplate = {
              ...draft,
              id: newToppingId(),
              title: item.title,
              baseId,
              version,
              versionLabel: versionName(version, note),
            };
            onChange([...items, saved]);
            nav.focus(baseId, saved.id);
          }}
        />
      )}
    />
  );
}

function versionName(version: number, note: string): string {
  const extra = note.trim();
  return extra ? `V${version} ${extra}` : `V${version}`;
}

function VersionBook<T extends { id: string; version?: number; versionLabel?: string }>({
  heading,
  families,
  empty,
  onClose,
  onOpenItem,
  renderOpen,
}: {
  heading: string;
  families: Array<{ baseId: string; title: string; items: T[] }>;
  empty: string;
  onClose: () => void;
  onOpenItem?: (item: T) => void;
  renderOpen?: (item: T, nav: { back: () => void; focus: (baseId: string, id: string) => void }) => ReactNode;
}) {
  const [baseId, setBaseId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const family = families.find((entry) => entry.baseId === baseId) ?? null;
  const ordered = family ? [...family.items].sort((a, b) => (a.version || 0) - (b.version || 0)) : [];
  const item = ordered.find((entry) => entry.id === itemId) ?? null;
  const openName = (next: { baseId: string; items: T[] }) => {
    const versions = [...next.items].sort((a, b) => (a.version || 0) - (b.version || 0));
    if (onOpenItem && versions.length && versions[versions.length - 1]) {
      onOpenItem(versions[versions.length - 1]);
      return;
    }
    setBaseId(next.baseId);
    setItemId(versions.length <= 1 ? versions[0]?.id ?? null : null);
  };
  const back = () => {
    if (itemId && ordered.length > 1) {
      setItemId(null);
      return;
    }
    if (baseId) {
      setBaseId(null);
      setItemId(null);
      return;
    }
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label={heading}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 rounded-card border border-line bg-bg p-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={back} className="inline-flex h-11 items-center rounded-full px-2 text-sm font-semibold">
            Back
          </button>
          <h3 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">{family ? family.title : heading}</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="inline-flex size-11 items-center justify-center rounded-full border border-line">
            <X className="size-4" />
          </button>
        </div>
        {item && family && renderOpen ? (
          renderOpen(item, { back, focus: (nextBase, nextId) => { setBaseId(nextBase); setItemId(nextId); } })
        ) : family ? (
          <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {ordered.map((entry, index) => (
              <li key={entry.id}>
                <button type="button" onClick={() => (onOpenItem ? onOpenItem(entry) : setItemId(entry.id))} className="flex h-11 w-full items-center gap-2 rounded-2xl border border-line bg-surface px-3 text-left text-sm font-semibold">
                  <span className="min-w-0 flex-1 truncate">{index === 0 ? "Original" : entry.versionLabel}</span>
                  {index === 0 ? <span className="shrink-0 text-xs text-muted">{entry.versionLabel}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {families.length ? families.map((entry) => (
              <li key={entry.baseId}>
                <button type="button" onClick={() => openName(entry)} className="flex h-11 w-full items-center gap-2 rounded-2xl border border-line bg-surface px-3 text-left text-sm font-semibold">
                  <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                  {entry.items.length > 1 ? <span className="shrink-0 text-xs text-muted">{entry.items.length} versions</span> : null}
                </button>
              </li>
            )) : (
              <li>
                <p className="text-sm leading-relaxed text-muted">{empty}</p>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function PlateDetail({
  item,
  next,
  onUse,
  onDelete,
  onSave,
  hosted,
  purpose,
  onCancel,
}: {
  item: PlateTemplate;
  next: number;
  onUse: () => void;
  onDelete: () => void;
  onSave: (draft: Pick<PlateTemplate, "beefName" | "beef" | "extras" | "rows">, note: string, choice?: "version" | "current" | "meal") => void;
  hosted?: boolean;
  purpose?: "edit" | "version";
  onCancel?: () => void;
}) {
  const [editing, setEditing] = useState(Boolean(purpose));
  const [beefName, setBeefName] = useState(item.beefName);
  const [beef, setBeef] = useState(item.beef);
  const [extras, setExtras] = useState<ToppingLine[]>(() => item.extras.map((line) => ({ ...line })));
  const [rows, setRows] = useState(() => item.rows.map((row) => ({ ...row, lines: row.lines.map((line) => ({ ...line })) })));
  const [note, setNote] = useState("");
  const [openRows, setOpenRows] = useState<number[]>(() => item.rows.map((_, index) => index));
  const [swap, setSwap] = useState<{ kind: "beef" } | { kind: "extra"; index: number } | { kind: "line"; row: number; index: number } | null>(null);
  const [rfpRow, setRfpRow] = useState<number | null>(null);
  const [measure, setMeasure] = useState<"count" | "units">("units");
  const [savedToppings, setSavedToppings] = useState(false);
  const [rfpOpen, setRfpOpen] = useState(false);
  const [library, setLibrary] = useState<ToppingRecipe[]>(() => loadToppings());
  const [dropTopping, setDropTopping] = useState<number | null>(null);
  const [askSave, setAskSave] = useState(false);
  const [beefOn, setBeefOn] = useState(Boolean(item.beefName) && item.beef > 0);
  const toggleRow = (index: number) => setOpenRows((current) => (current.includes(index) ? current.filter((value) => value !== index) : [...current, index]));
  const applyName = (name: string) => {
    if (!swap) return;
    if (swap.kind === "beef") {
      setBeefName(name);
      if (!beefOn) setBeef(servingsOfPounds(name, 1));
      setBeefOn(true);
    }
    if (swap.kind === "extra") setExtras((current) => current.map((entry, at) => (at === swap.index ? { ...entry, name } : entry)));
    if (swap.kind === "line") {
      setRows((current) => current.map((entry, at) => (at === swap.row ? { ...entry, lines: entry.lines.map((saved, lineAt) => (lineAt === swap.index ? { ...saved, name } : saved)) } : entry)));
    }
    setSwap(null);
  };
  if (!editing) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {hosted ? null : <p className="font-display text-xl font-semibold">{item.title}</p>}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <div className="flex h-11 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-3 text-sm">
            <span className="min-w-0 truncate">{item.beefName}</span>
            <span className="shrink-0 text-muted">{measureLabel(item.beefName, item.beef)}</span>
          </div>
          {item.extras.length ? (
            <ul className="flex flex-col gap-2">
              {item.extras.map((line) => (
                <li key={line.name} className="flex h-11 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{line.name}</span>
                  <span className="shrink-0 text-muted">{measureLabel(line.name, line.servings)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {item.rows.map((row, index) => (
            <div key={`${row.title}-${index}`} className="rounded-2xl border border-line bg-surface">
              <button type="button" aria-expanded={openRows.includes(index)} onClick={() => toggleRow(index)} className="flex h-11 w-full items-center gap-2 px-3 text-left text-sm font-semibold">
                <ChevronDown className={`size-4 shrink-0 motion-safe:transition-transform ${openRows.includes(index) ? "" : "-rotate-90"}`} />
                <span className="min-w-0 flex-1 truncate">{row.title}</span>
              </button>
              {openRows.includes(index) ? (
                <ul className="flex flex-col gap-2 border-t border-line px-3 py-3">
                  {row.lines.map((line) => (
                    <li key={line.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">{line.name}</span>
                      <span className="shrink-0 text-muted">{measureLabel(line.name, line.servings)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
        <button type="button" onClick={onUse} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink">
          {hosted ? "Save Plate to Meal" : "Use this plate"}
        </button>
        {hosted ? null : (
          <>
            <button type="button" onClick={() => { setBeefName(item.beefName); setBeef(item.beef); setBeefOn(true); setExtras(item.extras.map((line) => ({ ...line }))); setRows(item.rows.map((row) => ({ ...row, lines: row.lines.map((line) => ({ ...line })) }))); setNote(""); setEditing(true); }} className="h-11 rounded-full border border-line text-sm font-semibold">
              Make new version
            </button>
            <button type="button" onClick={onDelete} className="h-11 rounded-full text-sm font-semibold text-muted">
              Delete this version
            </button>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="font-display text-xl font-semibold">{item.title}</p>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold">{measure === "count" ? "Serving counts" : "Amount and unit"}</p>
        <button type="button" role="switch" aria-checked={measure === "units"} aria-label="Switch amount entry" onClick={() => setMeasure((mode) => (mode === "count" ? "units" : "count"))} className={`relative h-8 w-14 shrink-0 rounded-full ${measure === "units" ? "bg-[#34c759]" : "bg-[#c7c7cc]"}`}>
          <span className={`absolute top-1 size-6 rounded-full bg-white ${measure === "units" ? "right-1" : "left-1"}`} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {beefOn && beefName ? (
          <PlateAmountRow
            name={beefName}
            servings={beef}
            measure={measure}
            onOpen={() => setSwap({ kind: "beef" })}
            onChange={setBeef}
            onRemove={() => { setBeef(0); setBeefOn(false); }}
          />
        ) : (
          <button type="button" onClick={() => setSwap({ kind: "beef" })} className="flex h-11 items-center rounded-2xl border border-line bg-surface px-3 text-left text-sm font-semibold text-muted">
            Select Meat for a plate
          </button>
        )}
        {extras.map((line, index) => (
          <PlateAmountRow
            key={`${line.name}-${index}`}
            name={line.name}
            servings={line.servings}
            measure={measure}
            onOpen={() => setSwap({ kind: "extra", index })}
            onChange={(servings) => setExtras((current) => current.map((entry, at) => (at === index ? { ...entry, servings } : entry)))}
            onRemove={() => setExtras((current) => current.filter((_, at) => at !== index))}
          />
        ))}
        {rows.map((row, rowIndex) => {
          const open = openRows.includes(rowIndex);
          return (
          <div key={`${row.title}-${rowIndex}`} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button type="button" aria-expanded={open} onClick={() => toggleRow(rowIndex)} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left">
                <ChevronDown className={`size-4 shrink-0 motion-safe:transition-transform ${open ? "" : "-rotate-90"}`} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{row.title}</span>
              </button>
              <button type="button" aria-label={`Remove ${row.title}`} onClick={() => setDropTopping(rowIndex)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted">
                <X className="size-4" />
              </button>
            </div>
            {open ? (
              <>
                {row.lines.map((line, index) => (
                  <PlateAmountRow
                    key={`${line.name}-${index}`}
                    name={line.name}
                    servings={line.servings}
                    measure={measure}
                    indent
                    onOpen={() => setSwap({ kind: "line", row: rowIndex, index })}
                    onChange={(servings) => setRows((current) => current.map((entry, at) => (at === rowIndex ? { ...entry, lines: entry.lines.map((saved, lineAt) => (lineAt === index ? { ...saved, servings } : saved)) } : entry)))}
                    onRemove={() => setRows((current) => current.map((entry, at) => (at === rowIndex ? { ...entry, lines: entry.lines.filter((_, lineAt) => lineAt !== index) } : entry)))}
                  />
                ))}
                <button type="button" onClick={() => setRfpRow(rowIndex)} className="h-8 rounded-full border border-line text-sm font-semibold">
                  Add Ingredient to Topping
                </button>
              </>
            ) : null}
          </div>
          );
        })}
        <div className="h-0.5 bg-[#e7d7c8]" />
        <button type="button" onClick={() => setSavedToppings(true)} className="h-14 rounded-full border-2 border-line text-sm font-semibold">
          Add Saved Toppings
        </button>
        <button type="button" onClick={() => setRfpOpen(true)} className="h-14 rounded-full border-2 border-line text-sm font-semibold">
          Add New Toppings/Ingredients
        </button>
      </div>
      {purpose === "edit" ? null : (
        <>
          <label className="block">
            <span className="text-xs font-semibold tracking-wide text-muted uppercase">Name after {`V${next}`}</span>
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="(optional)" className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 text-base outline-none focus:border-tomato" />
          </label>
          <p className="text-xs text-muted">Saves As: {versionName(next, note)}</p>
        </>
      )}
      <button
        type="button"
        onClick={() => {
          const draft = { beefName, beef: beefOn ? beef : 0, extras: extras.filter((line) => line.servings > 0), rows };
          if (purpose !== "edit") {
            onSave(draft, note);
            return;
          }
          if (plateChanged(item, draft)) setAskSave(true);
          else onSave(draft, note, "meal");
        }}
        className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink"
      >
        {purpose === "edit" ? "Use Plate for Meal" : "Save as new version"}
      </button>
      <button type="button" onClick={() => (onCancel ? onCancel() : setEditing(false))} className="h-11 rounded-full border border-line text-sm font-semibold">
        Cancel
      </button>
      {askSave ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Save changes">
          <div className="flex w-full max-w-lg flex-col gap-3 rounded-card border border-line bg-bg p-4">
            <p className="font-display text-lg font-semibold">Save Changes...</p>
            <button type="button" onClick={() => { setAskSave(false); onSave({ beefName, beef: beefOn ? beef : 0, extras: extras.filter((line) => line.servings > 0), rows }, note, "version"); }} className="h-11 rounded-2xl border border-line bg-surface text-sm font-semibold">
              as New Version
            </button>
            <button type="button" onClick={() => { setAskSave(false); onSave({ beefName, beef: beefOn ? beef : 0, extras: extras.filter((line) => line.servings > 0), rows }, note, "current"); }} className="h-11 rounded-2xl border border-line bg-surface text-sm font-semibold">
              to current Plate recipe
            </button>
            <button type="button" onClick={() => { setAskSave(false); onSave({ beefName, beef: beefOn ? beef : 0, extras: extras.filter((line) => line.servings > 0), rows }, note, "meal"); }} className="h-11 rounded-2xl border border-line bg-surface text-sm font-semibold">
              Use without Saving Version
            </button>
            <button type="button" onClick={() => setAskSave(false)} className="h-11 rounded-full border border-line text-sm font-semibold">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {swap ? (
        <IngredientSwap
          current={swap.kind === "beef" ? beefName || "meat" : swap.kind === "extra" ? extras[swap.index]?.name ?? "" : rows[swap.row]?.lines[swap.index]?.name ?? ""}
          scope={swap.kind === "beef" ? "meat" : undefined}
          onClose={() => setSwap(null)}
          onPick={applyName}
        />
      ) : null}
      {rfpRow != null ? (
        <IngredientList
          onClose={() => setRfpRow(null)}
          onAdd={(lines) => {
            const index = rfpRow;
            setRows((current) => current.map((entry, at) => {
              if (at !== index) return entry;
              const next = entry.lines.map((line) => ({ ...line }));
              for (const line of lines) {
                const found = next.find((item) => item.name === line.name);
                if (found) found.servings += line.servings;
                else next.push({ ...line });
              }
              return { ...entry, lines: next };
            }));
            setRfpRow(null);
          }}
        />
      ) : null}
      {dropTopping != null ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Remove topping">
          <div className="flex w-full max-w-lg flex-col gap-3 rounded-card border border-line bg-bg p-4">
            <p className="font-display text-lg font-semibold">Remove {rows[dropTopping]?.title || "this topping"}?</p>
            <p className="text-sm text-muted">This will delete all ingredients for this topping.</p>
            <button
              type="button"
              onClick={() => {
                const index = dropTopping;
                setRows((current) => current.filter((_, at) => at !== index));
                setDropTopping(null);
              }}
              className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink"
            >
              Yes
            </button>
            <button type="button" onClick={() => setDropTopping(null)} className="h-11 rounded-full border border-line text-sm font-semibold">
              No
            </button>
          </div>
        </div>
      ) : null}
      {savedToppings ? (
        <ToppingLibrary
          items={library}
          onClose={() => setSavedToppings(false)}
          onAdd={(topping) => {
            setRows((current) => [...current, { title: topping.title, sourceId: topping.id, baseId: topping.baseId, lines: topping.lines.map((line) => ({ ...line })) }]);
            setOpenRows((current) => [...current, rows.length]);
            setSavedToppings(false);
          }}
          onUseSelected={(picked) => {
            const start = rows.length;
            setRows((current) => [
              ...current,
              ...picked.map((topping) => ({ title: topping.title, sourceId: topping.id, baseId: topping.baseId, lines: topping.lines.map((line) => ({ ...line })) })),
            ]);
            setOpenRows((current) => [...current, ...picked.map((_, index) => start + index)]);
            setSavedToppings(false);
          }}
          onChange={(next) => {
            saveToppings(next);
            setLibrary(next);
          }}
        />
      ) : null}
      {rfpOpen ? (
        <IngredientList
          chooseKind
          onClose={() => setRfpOpen(false)}
          onAdd={(lines, kind, title) => {
            if (kind === "topping") {
              setRows((current) => [...current, { title: title?.trim() || "Topping", sourceId: null, baseId: null, lines }]);
              setOpenRows((current) => [...current, rows.length]);
            } else {
              setExtras((current) => {
                const next = current.map((line) => ({ ...line }));
                for (const line of lines) {
                  const found = next.find((item) => item.name === line.name);
                  if (found) found.servings += line.servings;
                  else next.push({ ...line });
                }
                return next;
              });
            }
            setRfpOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function PlateAmountRow({ name, servings, measure, indent = false, onOpen, onChange, onRemove }: { name: string; servings: number; measure: "count" | "units"; indent?: boolean; onOpen: () => void; onChange: (servings: number) => void; onRemove: () => void }) {
  return (
    <div className={`flex items-center gap-2 ${indent ? "pl-2" : ""}`}>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 py-1 text-left">
        <p className="text-sm font-semibold leading-snug">{plateTitle(name)}</p>
        <p className="text-xs text-muted">{getIngredient(name)?.servingSize}</p>
      </button>
      <UnitAmount key={`${name}-${measure}`} name={name} servings={servings} prefer={measure === "count" ? "serving" : "kitchen"} onChange={onChange} />
      <button type="button" aria-label={`Remove ${name}`} onClick={onRemove} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted">
        <X className="size-4" />
      </button>
    </div>
  );
}

function onePoundChoice(name: string) {
  return kitchenChoices(name).find((choice) => choice.id === "lb");
}

function poundsOf(name: string, servings: number): number {
  const choice = onePoundChoice(name);
  return choice ? kitchenAmount(servings, choice) : servings;
}

function servingsOfPounds(name: string, pounds: number): number {
  const choice = onePoundChoice(name);
  return choice ? servingsForAmount(pounds, choice) : pounds;
}

function plateChanged(item: PlateTemplate, draft: Pick<PlateTemplate, "beefName" | "beef" | "extras" | "rows">): boolean {
  const lines = (rows: { name: string; servings: number }[]) => rows.map((line) => `${line.name}\0${line.servings}`).join("|");
  if (item.beefName !== draft.beefName || item.beef !== draft.beef) return true;
  if (lines(item.extras) !== lines(draft.extras)) return true;
  if (item.rows.length !== draft.rows.length) return true;
  return item.rows.some((row, index) => {
    const next = draft.rows[index];
    return !next || row.title !== next.title || lines(row.lines) !== lines(next.lines);
  });
}

function measureLabel(name: string, servings: number): string {
  const item = getIngredient(name);
  if (!item) return `${servings} × serving`;
  return describeUse(item, servings);
}

export function IngredientSwap({ current, onClose, onPick, scope }: { current: string; onClose: () => void; onPick: (name: string) => void; scope?: "meat" }) {
  const [query, setQuery] = useState("");
  const [stars, setStars] = useState<string[]>(() => loadMeatStars());
  useEffect(() => {
    const refresh = () => setStars(loadMeatStars());
    window.addEventListener(CLOUD_EVENT, refresh);
    return () => window.removeEventListener(CLOUD_EVENT, refresh);
  }, []);
  const category = scope === "meat" ? "Meat" : plateCategory(current);
  const typed = query.trim();
  const pool = listIngredients().filter((item) => (scope === "meat" ? plateCategory(item.name) === "Meat" : item.name !== current && plateCategory(item.name) === plateCategory(current)));
  const matched = typed ? pool.filter((item) => ingredientTitle(item).toLowerCase().includes(typed.toLowerCase()) || item.name.toLowerCase().includes(typed.toLowerCase())) : pool;
  const starred = new Set(stars);
  const hits = [...matched].sort((a, b) => {
    const star = Number(starred.has(b.name)) - Number(starred.has(a.name));
    return star || ingredientTitle(a).localeCompare(ingredientTitle(b));
  });
  const toggleStar = (name: string) => {
    const next = stars.includes(name) ? stars.filter((item) => item !== name) : [...stars, name];
    setStars(next);
    saveMeatStars(next);
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label={`Swap ${current}`}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 rounded-card border border-line bg-bg p-4">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 font-display text-lg font-semibold">Swap {ingredientTitle(current)}</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="inline-flex size-11 items-center justify-center rounded-full border border-line">
            <X className="size-4" />
          </button>
        </div>
        <p className="text-xs text-muted">{typed ? "Matches" : scope === "meat" ? "Meat. Star the ones you reach for and they stay at the top." : `${category}. Search if you want something else.`}</p>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the ingredient library" className="h-11 w-full rounded-2xl border border-line bg-surface px-3 text-base outline-none focus:border-tomato" />
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {hits.length ? hits.map((item) => (
            <li key={item.name} className="flex items-center gap-2">
              {scope === "meat" ? (
                <button type="button" aria-pressed={starred.has(item.name)} aria-label={starred.has(item.name) ? `Unstar ${ingredientTitle(item)}` : `Star ${ingredientTitle(item)}`} onClick={() => toggleStar(item.name)} className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line ${starred.has(item.name) ? "text-gold" : "text-muted"}`}>
                  <Star className={`size-4 ${starred.has(item.name) ? "fill-current" : ""}`} />
                </button>
              ) : null}
              <button type="button" onClick={() => onPick(item.name)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-3 py-2 text-left text-sm">
                <span className="min-w-0 leading-snug">{ingredientTitle(item)}</span>
                <span className="shrink-0 text-xs text-muted">Swap</span>
              </button>
            </li>
          )) : (
            <li className="text-sm text-muted">Nothing in that list.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function IngredientList({ onClose, onAdd, chooseKind = false }: { onClose: () => void; onAdd: (lines: ToppingLine[], kind?: "topping" | "standalone", title?: string) => void; chooseKind?: boolean }) {
  const [names, setNames] = useState<string[]>(() => loadPlateIngredients());
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [openCats, setOpenCats] = useState<string[]>([]);
  const [entry, setEntry] = useState<"count" | "units">("count");
  const [pending, setPending] = useState<ToppingLine[] | null>(null);
  const [toppingName, setToppingName] = useState("");
  const hits = query.trim() ? searchIngredients(query.trim().toLowerCase()).slice(0, 12) : [];
  const groups = groupPlateNames(names);
  const titles = plateTitles(names);
  const toggleCat = (name: string) => setOpenCats((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));

  const remember = (next: string[]) => {
    setNames(next);
    replacePlateIngredients(next);
  };

  const togglePicked = (name: string) => {
    setPicked((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));
  };

  const removeSelected = () => {
    if (!picked.length) return;
    const drop = new Set(picked);
    remember(names.filter((name) => !drop.has(name)));
    setPicked([]);
  };

  const addToPlate = () => {
    const lines = names.flatMap((name) => {
      const servings = amounts[name] ?? 0;
      return servings > 0 ? [{ name, servings }] : [];
    });
    if (!lines.length) onClose();
    else if (chooseKind) setPending(lines);
    else onAdd(lines);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Plate ingredients">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 rounded-card border border-line bg-bg p-4">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 font-display text-lg font-semibold">Plate ingredients</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="inline-flex size-11 items-center justify-center rounded-full border border-line">
            <X className="size-4" />
          </button>
        </div>
        <p className="text-xs text-muted">Tap a name to highlight it, then Remove selected. Search adds anything from the ingredient library. Pick a serving count, or switch to units and type an amount.</p>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the ingredient library" className="h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm outline-none focus:border-tomato" />
        {query.trim() && !hits.length ? <p className="text-sm text-muted">Nothing in the library matches that.</p> : null}
        {hits.length ? (
          <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {hits.slice(0, 12).map((item) => (
              <li key={item.name}>
                <button
                  type="button"
                  disabled={names.includes(item.name)}
                  onClick={() => {
                    remember(names.includes(item.name) ? names : [...names, item.name]);
                    setQuery("");
                  }}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-3 py-2 text-left text-sm disabled:opacity-50"
                >
                  <span className="min-w-0 leading-snug">{ingredientTitle(item)}</span>
                  <span className="shrink-0 text-xs text-muted">{names.includes(item.name) ? "Added" : "Add"}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-sm font-semibold">{entry === "count" ? "Serving counts" : "Amount and unit"}</p>
          <button type="button" role="switch" aria-checked={entry === "units"} aria-label="Switch amount entry" onClick={() => setEntry((mode) => (mode === "count" ? "units" : "count"))} className={`relative h-8 w-14 shrink-0 rounded-full ${entry === "units" ? "bg-[#34c759]" : "bg-[#c7c7cc]"}`}>
            <span className={`absolute top-1 size-6 rounded-full bg-white ${entry === "units" ? "right-1" : "left-1"}`} />
          </button>
        </div>
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {groups.map((group) => {
            const open = openCats.includes(group.category);
            return (
              <li key={group.category} className="rounded-2xl border border-line bg-surface">
                <button type="button" aria-expanded={open} onClick={() => toggleCat(group.category)} className="flex h-11 w-full items-center gap-2 px-3 text-left">
                  <ChevronDown className={`size-4 shrink-0 text-muted motion-safe:transition-transform ${open ? "" : "-rotate-90"}`} />
                  <span className="min-w-0 flex-1 text-xs font-semibold tracking-wide text-muted uppercase">{group.category}</span>
                  <span className="text-xs text-muted">{group.names.length}</span>
                </button>
                {open ? (
                  <ul className="flex flex-col gap-2 border-t border-line px-2 py-2">
                    {group.names.map((name) => {
                      const on = picked.includes(name);
                      return (
                        <li key={name} className={`flex items-center gap-2 rounded-2xl border bg-bg px-2 py-2 ${on ? "border-tomato" : "border-line"}`}>
                          <button type="button" aria-pressed={on} onClick={() => togglePicked(name)} className="min-w-0 flex-1 py-1 text-left">
                            <p className="text-sm font-semibold leading-snug">{titles.get(name)}</p>
                            <p className="text-xs text-muted">{getIngredient(name)?.servingSize}</p>
                          </button>
                          <UnitAmount key={`${name}-${entry}`} name={name} servings={amounts[name] ?? 0} prefer={entry === "count" ? "serving" : "kitchen"} onChange={(servings) => setAmounts((current) => ({ ...current, [name]: servings }))} />
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
        <button type="button" disabled={!picked.length} onClick={removeSelected} className="h-11 rounded-full border border-line text-sm font-semibold disabled:opacity-40">
          {picked.length ? `Remove selected (${picked.length})` : "Remove selected"}
        </button>
        <button type="button" onClick={addToPlate} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink">
          Add to plate
        </button>
        {pending ? (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-6" role="dialog" aria-modal="true" aria-label="Save ingredients">
            <div className="flex w-full max-w-sm flex-col gap-3 rounded-card border border-line bg-bg p-4">
              <h3 className="font-display text-lg font-semibold">Save these ingredients</h3>
              <label className="block text-sm font-semibold">
                Topping name
                <input value={toppingName} onChange={(event) => setToppingName(event.target.value)} placeholder="Topping" className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm font-normal outline-none focus:border-tomato" />
              </label>
              <button type="button" onClick={() => onAdd(pending, "topping", toppingName.trim() || "Topping")} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink">
                Save as Topping
              </button>
              <button type="button" onClick={() => onAdd(pending, "standalone")} className="h-11 rounded-full border border-line text-sm font-semibold">
                Standalone Ingredients
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function UnitAmount({ name, servings, prefer, onChange }: { name: string; servings: number; prefer: "serving" | "kitchen"; onChange: (servings: number) => void }) {
  const choices = [{ id: "serving", singular: "serving", label: "servings", perServing: 1 }, ...kitchenChoices(name).filter((choice) => choice.id !== "serving")];
  const kitchenId = defaultKitchenUnit(name, Math.max(servings, 1));
  const start = prefer === "serving" ? choices[0] : choices.find((choice) => choice.id === kitchenId) ?? choices.find((choice) => choice.id !== "serving") ?? choices[0];
  const [unit, setUnit] = useState(start?.id ?? "serving");
  const choice = choices.find((item) => item.id === unit) ?? start;
  const [text, setText] = useState(() => (servings > 0 && start ? formatKitchen(kitchenAmount(servings, start), start.id) : ""));
  const apply = (nextText: string, next: KitchenChoice | undefined) => {
    setText(nextText);
    const parsed = Number(nextText);
    if (nextText.trim() !== "" && Number.isFinite(parsed) && parsed >= 0) onChange(servingsForAmount(parsed, next));
  };
  return (
    <div className="flex shrink-0 items-center gap-1">
      <input aria-label={`${name} amount`} inputMode="decimal" value={text} onChange={(event) => apply(event.target.value, choice)} className="h-11 w-16 rounded-2xl border border-line bg-bg px-2 text-center text-base outline-none focus:border-tomato" />
      <select
        aria-label={`${name} unit`}
        value={choice?.id ?? "serving"}
        onChange={(event) => {
          const next = choices.find((item) => item.id === event.target.value) ?? choice;
          const parsed = Number(text);
          const nextServings = text.trim() !== "" && Number.isFinite(parsed) ? servingsForAmount(parsed, choice) : servings;
          setUnit(next?.id ?? "serving");
          setText(nextServings > 0 ? formatKitchen(kitchenAmount(nextServings, next), next?.id) : text);
          if (text.trim() !== "" && next) onChange(nextServings);
        }}
        className="h-11 w-24 rounded-2xl border border-line bg-bg px-1 text-sm outline-none focus:border-tomato"
      >
        {choices.map((item) => (
          <option key={item.id} value={item.id}>
            {text.trim() !== "" && Math.abs(Number(text) - 1) < 0.001 ? item.singular : item.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const PLATE_CATEGORY_ORDER = ["Meat", "Dairy", "Fats", "Produce", "Condiment", "Ferments/Pickled", "Pantry", "Other"];

export function foodTag(name: string): string {
  const saved = savedFoodTag(name);
  if (saved) return saved;
  if (/\bsauce\b/i.test(name)) return "Condiment";
  return libraryTag(name) ?? aisle(name).category;
}

function plateCategory(name: string): string {
  return foodTag(name);
}

function plateTitle(name: string): string {
  return baseTitle(name);
}

function plateTitles(names: string[]): Map<string, string> {
  const base = new Map(names.map((name) => [name, baseTitle(name)]));
  const counts = new Map<string, number>();
  for (const title of base.values()) {
    const key = title.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const titles = new Map<string, string>();
  for (const name of names) {
    const title = base.get(name) ?? name;
    if ((counts.get(title.toLowerCase()) ?? 0) < 2) {
      titles.set(name, title);
      continue;
    }
    const size = getIngredient(name)?.size.replace(/\s*\(.*$/, "").trim() ?? "";
    titles.set(name, size ? `${title}, ${size}` : title);
  }
  return titles;
}

function baseTitle(name: string): string {
  if (name === "American cheese (Kraft Singles)") return "Kraft cheese";
  return ingredientTitle(name);
}

export function groupPlateNames(names: string[]): Array<{ category: string; names: string[] }> {
  const bags = new Map<string, string[]>();
  for (const name of names) {
    const category = plateCategory(name);
    const list = bags.get(category) ?? [];
    list.push(name);
    bags.set(category, list);
  }
  const ordered = [...PLATE_CATEGORY_ORDER];
  for (const category of customFoodTags()) {
    if (!ordered.includes(category)) ordered.push(category);
  }
  for (const category of bags.keys()) {
    if (!ordered.includes(category)) ordered.push(category);
  }
  return ordered.flatMap((category) => {
    const list = bags.get(category);
    if (!list?.length) return [];
    return [{ category, names: list.slice().sort((a, b) => baseTitle(a).localeCompare(baseTitle(b))) }];
  });
}

const plateListeners = new Set<(names: string[]) => void>();
let applyingPlateIngredients = false;

function writePlateIngredients(names: string[], publish: boolean) {
  localStorage.setItem(PLATE_LIST_KEY, JSON.stringify(names));
  for (const listener of plateListeners) listener(names);
  if (publish && !applyingPlateIngredients) void publishPlateIngredients(names);
}

export function watchStoredPlateIngredients(listener: (names: string[]) => void) {
  plateListeners.add(listener);
  listener(plateIngredientNames());
  return () => {
    plateListeners.delete(listener);
  };
}

export function applyAccountPlateIngredients(names: string[]) {
  const filtered = names.filter((name) => typeof name === "string" && Boolean(getIngredient(name)));
  const pending = localStorage.getItem(PANTRY_VERSION_KEY) !== PANTRY_VERSION;
  const cheesePending = localStorage.getItem(GV_AMERICAN_KEY) !== "1";
  let next = pending ? addPantry(filtered) : filtered;
  if (cheesePending) next = addNamed(next, GV_AMERICAN_NAME);
  if (pending) localStorage.setItem(PANTRY_VERSION_KEY, PANTRY_VERSION);
  if (cheesePending) localStorage.setItem(GV_AMERICAN_KEY, "1");
  applyingPlateIngredients = true;
  writePlateIngredients(next, false);
  applyingPlateIngredients = false;
  if ((pending || cheesePending) && next.length !== filtered.length) void publishPlateIngredients(next);
}

export function replacePlateIngredients(names: string[]) {
  writePlateIngredients(names.filter((name) => Boolean(getIngredient(name))), true);
}

function loadPlateIngredients(): string[] {
  return plateIngredientNames();
}

export function plateIngredientNames(): string[] {
  let names = readPlateIngredients();
  if (localStorage.getItem(PANTRY_VERSION_KEY) !== PANTRY_VERSION) {
    const next = addPantry(names);
    if (next.length !== names.length) localStorage.setItem(PLATE_LIST_KEY, JSON.stringify(next));
    names = next;
  }
  if (localStorage.getItem(GV_AMERICAN_KEY) !== "1") {
    const next = addNamed(names, GV_AMERICAN_NAME);
    if (next.length !== names.length) localStorage.setItem(PLATE_LIST_KEY, JSON.stringify(next));
    names = next;
  }
  return names;
}

function readPlateIngredients(): string[] {
  try {
    const raw = localStorage.getItem(PLATE_LIST_KEY);
    if (!raw) return [...PLATE_STARTERS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...PLATE_STARTERS];
    return parsed.filter((name): name is string => typeof name === "string" && Boolean(getIngredient(name)));
  } catch {
    return [...PLATE_STARTERS];
  }
}

function addNamed(names: string[], name: string): string[] {
  if (!getIngredient(name) || names.includes(name)) return names;
  return [...names, name];
}

function addPantry(names: string[]): string[] {
  const next = [...names];
  for (const name of PANTRY_PLATE) {
    if (getIngredient(name) && !next.includes(name)) next.push(name);
  }
  return next;
}

export function togglePlateIngredient(name: string): boolean {
  if (!getIngredient(name)) return false;
  const next = plateIngredientNames();
  const on = next.includes(name);
  writePlateIngredients(on ? next.filter((item) => item !== name) : [...next, name], true);
  return !on;
}

function groupToppings(items: ToppingRecipe[]) {
  const groups = new Map<string, { baseId: string; title: string; items: ToppingRecipe[] }>();
  const sorted = [...items].sort((a, b) => (a.version || 0) - (b.version || 0));
  for (const item of sorted) {
    const group = groups.get(item.baseId) ?? { baseId: item.baseId, title: item.title, items: [] };
    group.items.push(item);
    groups.set(item.baseId, group);
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function groupPlates(items: PlateTemplate[]) {
  const groups = new Map<string, { baseId: string; title: string; items: PlateTemplate[] }>();
  const sorted = [...items].sort((a, b) => plateVersion(a) - plateVersion(b));
  for (const item of sorted) {
    const baseId = plateBaseId(item);
    const group = groups.get(baseId) ?? { baseId, title: item.title, items: [] };
    group.items.push({ ...item, baseId, version: plateVersion(item), versionLabel: plateVersionLabel(item) });
    groups.set(baseId, group);
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export function KitchenField({ value, name, label, onChange }: { value: number; name: string; label: string; onChange: (servings: number) => void }) {
  const choices = kitchenChoices(name);
  const [unit, setUnit] = useState(() => defaultKitchenUnit(name, value));
  const choice = choices.find((item) => item.id === unit) ?? choices[0];
  const [text, setText] = useState(() => formatKitchen(kitchenAmount(value, choice), choice?.id));
  const [touched, setTouched] = useState(false);
  const apply = (nextText: string, next: KitchenChoice | undefined) => {
    setTouched(true);
    setText(nextText);
    const parsed = Number(nextText);
    if (nextText.trim() !== "" && Number.isFinite(parsed) && parsed >= 0) onChange(servingsForAmount(parsed, next));
  };
  return (
    <div className="flex shrink-0 items-center gap-1">
      <input
        aria-label={label}
        inputMode="decimal"
        value={text}
        onChange={(event) => apply(event.target.value, choice)}
        className="h-11 w-16 rounded-2xl border border-line bg-bg px-2 text-center text-base outline-none focus:border-tomato"
      />
      <select
        aria-label={`${label} unit`}
        value={choice?.id ?? ""}
        onChange={(event) => {
          const next = choices.find((item) => item.id === event.target.value) ?? choice;
          const parsed = Number(text);
          const servings = touched && text.trim() !== "" && Number.isFinite(parsed) ? servingsForAmount(parsed, choice) : value;
          setUnit(next?.id ?? unit);
          setText(formatKitchen(kitchenAmount(servings, next), next?.id));
          if (touched && next) onChange(servings);
        }}
        className="h-11 w-20 rounded-2xl border border-line bg-bg px-1 text-sm outline-none focus:border-tomato"
      >
        {choices.map((item) => (
          <option key={item.id} value={item.id}>
            {Math.abs(Number(text) - 1) < 0.001 ? item.singular : item.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function AmountField({ value, onChange, label, startBlank = false, places }: { value: number; onChange: (value: number) => void; label: string; startBlank?: boolean; places?: number }) {
  const shown = (amount: number) => (places != null ? amount.toFixed(places) : String(amount));
  const [text, setText] = useState(startBlank && value === 0 ? "" : shown(value));
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const parsed = Number(next);
        if (next.trim() !== "" && Number.isFinite(parsed) && parsed >= 0) onChange(parsed);
      }}
      className="h-11 w-20 rounded-2xl border border-line bg-bg px-2 text-center text-sm outline-none focus:border-tomato"
    />
  );
}

function IngredientSearch({ onPick }: { onPick: (name: string) => void }) {
  const [query, setQuery] = useState("");
  const hits = query.trim() ? searchIngredients(query.trim().toLowerCase()).slice(0, 6) : [];
  return (
    <div className="flex flex-col gap-1">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Add an ingredient" className="h-11 rounded-2xl border border-line bg-bg px-3 text-sm outline-none focus:border-tomato" />
      {hits.map((item) => (
        <button
          key={item.name}
          type="button"
          onClick={() => {
            onPick(item.name);
            setQuery("");
          }}
          className="flex h-11 items-center justify-between rounded-2xl border border-line bg-bg px-3 text-left text-sm"
        >
          <span className="min-w-0 truncate">{ingredientTitle(item)}</span>
          <span className="shrink-0 text-xs text-muted">{getIngredient(item.name)?.servingSize}</span>
        </button>
      ))}
    </div>
  );
}
