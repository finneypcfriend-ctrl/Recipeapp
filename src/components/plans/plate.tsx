import { ChevronDown, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CLOUD_EVENT, publishPlateIngredients } from "@/lib/cloud/sync";
import { loadPlateTemplates, loadToppings, newToppingId, nextToppingVersion, savePlateTemplates, saveToppings, type PlateTemplate, type ToppingLine, type ToppingRecipe } from "@/lib/plans/toppings";
import type { MealPlan, MealSlot, PlanRoute, PlannedMeal } from "@/lib/plans/model";
import { formatDay, SLOT_LABEL } from "@/lib/plans/model";
import { getIngredient, searchIngredients } from "@/lib/sourced";
import { aisle } from "@/lib/plans/grocery";

interface PlateRow {
  key: string;
  title: string;
  sourceId: string | null;
  baseId: string | null;
  lines: ToppingLine[];
}

const BEEF_CHOICES = ["ground beef 80/20", "ground beef 73/27"];
const PLATE_LIST_KEY = "recipes.plate-ingredients";
const PANTRY_VERSION = "2026-11-11";
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
  initial,
  initialTitle,
  onOpen,
  onSave,
}: {
  plan: MealPlan;
  date: string;
  slot: MealSlot;
  initial?: PlannedMeal["plate"];
  initialTitle?: string;
  onOpen: (route: PlanRoute) => void;
  onSave: (meal: { title: string; lines: ToppingLine[]; draft: NonNullable<PlannedMeal["plate"]> }) => Promise<void>;
}) {
  const [beefName, setBeefName] = useState(initial?.beefName ?? (plan.beefChoice === "73/27" ? "ground beef 73/27" : "ground beef 80/20"));
  const [beefOpen, setBeefOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle || DEFAULT_PLATE_TITLE);
  const [nameEdited, setNameEdited] = useState(false);
  const [beef, setBeef] = useState(initial?.beef ?? 0.5);
  const [loadId, setLoadId] = useState(0);
  const [templates, setTemplates] = useState<PlateTemplate[]>(() => loadPlateTemplates());
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [platePicked, setPlatePicked] = useState<string[]>([]);
  const [pending, setPending] = useState<{ title: string; lines: ToppingLine[]; draft: NonNullable<PlannedMeal["plate"]> } | null>(null);
  const [extras, setExtras] = useState<ToppingLine[]>(initial?.extras ?? []);
  const [listOpen, setListOpen] = useState(false);
  const [rows, setRows] = useState<PlateRow[]>(() => (initial?.rows ?? []).map((row) => ({ ...row, key: newToppingId(), lines: row.lines.map((line) => ({ ...line })) })));
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [library, setLibrary] = useState<ToppingRecipe[]>(() => loadToppings());
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const refresh = () => {
      setLibrary(loadToppings());
      setTemplates(loadPlateTemplates());
    };
    window.addEventListener(CLOUD_EVENT, refresh);
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
      if (beef > 0) lines.set(beefName, beef);
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
      const draft = { beefName, beef, extras, rows: rows.map(({ title: rowTitle, sourceId, baseId, lines: rowLines }) => ({ title: rowTitle, sourceId, baseId, lines: rowLines })) };
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
    setBeef(item.beef);
    setExtras(item.extras.map((line) => ({ ...line })));
    setRows(item.rows.map((row) => ({ ...row, key: newToppingId(), lines: row.lines.map((line) => ({ ...line })) })));
    setOpenKeys([]);
    setLoadId((value) => value + 1);
    setTemplatesOpen(false);
    setPlatePicked([]);
  };

  const grouped = groupToppings(library);
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/90 px-2 py-2 backdrop-blur">
          <button type="button" onClick={() => onOpen({ kind: "day", planId: plan.id, date })} className="inline-flex h-11 items-center rounded-full px-3 text-sm font-semibold">
            Back
          </button>
          <h2 className="min-w-0 flex-1 truncate font-display text-xl font-semibold">{title.trim() && title.trim().toLowerCase() !== DEFAULT_PLATE_TITLE.toLowerCase() ? title : formatDay(date)}</h2>
        </div>
        <div className="flex flex-1 flex-col gap-4 px-4 py-4">
          <input value={title} onChange={(event) => { setTitle(event.target.value); setNameEdited(true); }} aria-label="Meal name" className="h-11 rounded-2xl border border-line bg-surface px-3 font-display text-lg font-semibold outline-none focus:border-tomato" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setRecipesOpen(true)} className="h-11 rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink">
              Saved Toppings
            </button>
            <button type="button" onClick={() => setListOpen(true)} className="h-11 rounded-full border border-line bg-surface px-4 text-sm font-semibold">
              + Ingredient(s)
            </button>
            <button type="button" onClick={() => { setPlatePicked([]); setTemplatesOpen(true); }} className="h-11 rounded-full border border-line bg-surface px-4 text-sm font-semibold">
              Saved Plates
            </button>
          </div>
          <div className={extras.length || rows.length ? "flex flex-col gap-4 border-y border-line py-4" : "contents"}>
          <div className="relative rounded-card border border-line bg-surface">
            <div className="flex items-center gap-2 px-3 py-2">
              <button type="button" onClick={() => setBeefOpen((open) => !open)} className="min-w-0 flex-1 truncate text-left text-sm font-semibold">
                {beefName}
              </button>
              <AmountField key={`${beefName}-${loadId}`} value={beef} onChange={setBeef} label="Ground beef amount" />
            </div>
            {beefOpen ? (
              <ul className="border-t border-line">
                {BEEF_CHOICES.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      onClick={() => {
                        setBeefName(name);
                        setBeefOpen(false);
                      }}
                      className={`flex h-11 w-full items-center px-3 text-left text-sm ${name === beefName ? "font-semibold" : ""}`}
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
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
        </div>
      </div>
      {listOpen ? <IngredientList onClose={() => setListOpen(false)} onAdd={addFromList} /> : null}
      {recipesOpen ? (
        <ToppingRecipeList
          items={grouped}
          onClose={() => setRecipesOpen(false)}
          onAdd={(picked) => {
            for (const item of picked) addSaved(item);
            setRecipesOpen(false);
          }}
          onDelete={(ids) => {
            const drop = new Set(ids);
            const next = library.filter((item) => !drop.has(item.id));
            saveToppings(next);
            setLibrary(next);
          }}
        />
      ) : null}
      {templatesOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Saved plates">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 rounded-card border border-line bg-bg p-4">
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 font-display text-lg font-semibold">Saved plates</h3>
              <button type="button" aria-label="Close" onClick={() => setTemplatesOpen(false)} className="inline-flex size-11 items-center justify-center rounded-full border border-line">
                <X className="size-4" />
              </button>
            </div>
            <p className="text-xs text-muted">Tap a plate to highlight it. Use loads that plate. Delete takes it off this list.</p>
            <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {templates.length ? templates.map((item) => {
                const on = platePicked.includes(item.id);
                return (
                  <li key={item.id}>
                    <button type="button" aria-pressed={on} onClick={() => setPlatePicked((current) => (current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]))} className={`flex h-11 w-full items-center rounded-2xl border bg-surface px-3 text-left text-sm font-semibold ${on ? "border-tomato" : "border-line"}`}>
                      {item.title}
                    </button>
                  </li>
                );
              }) : (
                <li>
                  <p className="text-sm leading-relaxed text-muted">You don't have any Saved Plates yet. To save a plate for future use, build a plate and rename it and hit Save Plate to Day.</p>
                </li>
              )}
            </ul>
            {templates.length ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={platePicked.length !== 1}
                  onClick={() => {
                    const item = templates.find((template) => template.id === platePicked[0]);
                    if (item) useTemplate(item);
                  }}
                  className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-40"
                >
                  Use
                </button>
                <button
                  type="button"
                  disabled={!platePicked.length}
                  onClick={() => {
                    const drop = new Set(platePicked);
                    const next = templates.filter((item) => !drop.has(item.id));
                    savePlateTemplates(next);
                    setTemplates(next);
                    setPlatePicked([]);
                  }}
                  className="h-11 rounded-full border border-line text-sm font-semibold disabled:opacity-40"
                >
                  {platePicked.length ? `Delete selected (${platePicked.length})` : "Delete selected"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
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

function ToppingRecipeList({
  items,
  onClose,
  onAdd,
  onDelete,
}: {
  items: Array<{ baseId: string; title: string; items: ToppingRecipe[] }>;
  onClose: () => void;
  onAdd: (items: ToppingRecipe[]) => void;
  onDelete: (ids: string[]) => void;
}) {
  const rows = items.flatMap((group) => group.items);
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Topping recipes">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 rounded-card border border-line bg-bg p-4">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 font-display text-lg font-semibold">Topping recipes</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="inline-flex size-11 items-center justify-center rounded-full border border-line">
            <X className="size-4" />
          </button>
        </div>
        <p className="text-xs text-muted">Tap a topping to highlight it. Add puts the highlighted ones on this plate. Delete removes that saved version.</p>
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {rows.map((item) => {
            const on = picked.includes(item.id);
            return (
              <li key={item.id}>
                <button type="button" aria-pressed={on} onClick={() => toggle(item.id)} className={`flex w-full items-center gap-3 rounded-2xl border bg-surface px-3 py-3 text-left ${on ? "border-tomato" : "border-line"}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{item.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted">{item.lines.map((line) => line.name).join(", ")}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold">{item.versionLabel}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" disabled={!picked.length} onClick={() => onAdd(rows.filter((item) => picked.includes(item.id)))} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-40">
          {picked.length ? `Add selected (${picked.length})` : "Add selected"}
        </button>
        <button
          type="button"
          disabled={!picked.length}
          onClick={() => {
            onDelete(picked);
            setPicked([]);
          }}
          className="h-11 rounded-full border border-line text-sm font-semibold disabled:opacity-40"
        >
          {picked.length ? `Delete selected (${picked.length})` : "Delete selected"}
        </button>
      </div>
    </div>
  );
}

function IngredientList({ onClose, onAdd }: { onClose: () => void; onAdd: (lines: ToppingLine[]) => void }) {
  const [names, setNames] = useState<string[]>(() => loadPlateIngredients());
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [category, setCategory] = useState("All");
  const hits = query.trim() ? searchIngredients(query.trim().toLowerCase()).slice(0, 8) : [];
  const groups = groupPlateNames(names);
  const titles = plateTitles(names);
  const chips = ["All", ...groups.map((group) => group.category)];
  const shown = category === "All" ? groups : groups.filter((group) => group.category === category);

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
    setCategory("All");
  };

  const addToPlate = () => {
    const lines = names.flatMap((name) => {
      const parsed = Number(amounts[name]);
      return amounts[name]?.trim() && Number.isFinite(parsed) && parsed > 0 ? [{ name, servings: parsed }] : [];
    });
    if (lines.length) onAdd(lines);
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Plate ingredients">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 rounded-card border border-line bg-bg p-4">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 font-display text-lg font-semibold">Plate ingredients</h3>
          <button type="button" aria-pressed={adding} aria-label="Search ingredients to add" onClick={() => setAdding((value) => !value)} className="inline-flex size-11 items-center justify-center rounded-full border border-line">
            <Plus className="size-4" />
          </button>
          <button type="button" aria-label="Close" onClick={onClose} className="inline-flex size-11 items-center justify-center rounded-full border border-line">
            <X className="size-4" />
          </button>
        </div>
        <p className="text-xs text-muted">Tap a name to highlight it, then Remove selected. Type a number for anything that goes on this plate.</p>
        <div className="flex gap-2 overflow-x-auto">
          {chips.map((chip) => (
            <button key={chip} type="button" aria-pressed={category === chip} onClick={() => setCategory(chip)} className={`h-9 shrink-0 rounded-full border px-3 text-xs font-semibold ${category === chip ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}>
              {chip}
            </button>
          ))}
        </div>
        {adding ? (
          <>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the ingredient library" className="h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm outline-none focus:border-tomato" />
            {hits.length ? (
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {hits.map((item) => (
                  <li key={item.name}>
                    <button
                      type="button"
                      disabled={names.includes(item.name)}
                      onClick={() => {
                        remember(names.includes(item.name) ? names : [...names, item.name]);
                        setQuery("");
                        setAdding(false);
                      }}
                      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-3 py-2 text-left text-sm disabled:opacity-50"
                    >
                      <span className="min-w-0 leading-snug">{plateTitle(item.name)}</span>
                      <span className="shrink-0 text-xs text-muted">{names.includes(item.name) ? "Added" : "Add"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
        <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {shown.map((group) => (
            <li key={group.category}>
              <p className="px-1 text-xs font-semibold tracking-wide text-muted uppercase">{group.category}</p>
              <ul className="mt-1 flex flex-col gap-2">
                {group.names.map((name) => {
                  const on = picked.includes(name);
                  return (
                    <li key={name} className={`flex items-start gap-2 rounded-2xl border bg-surface px-2 py-2 ${on ? "border-tomato" : "border-line"}`}>
                      <button type="button" aria-pressed={on} onClick={() => togglePicked(name)} className="min-w-0 flex-1 py-1 text-left">
                        <p className="text-sm font-semibold leading-snug">{titles.get(name)}</p>
                        <p className="text-xs text-muted">{getIngredient(name)?.servingSize}</p>
                      </button>
                      <AmountField startBlank value={Number(amounts[name]) || 0} label={`${name} amount`} onChange={(servings) => setAmounts((current) => ({ ...current, [name]: String(servings) }))} />
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
        <button type="button" disabled={!picked.length} onClick={removeSelected} className="h-11 rounded-full border border-line text-sm font-semibold disabled:opacity-40">
          {picked.length ? `Remove selected (${picked.length})` : "Remove selected"}
        </button>
        <button type="button" onClick={addToPlate} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink">
          Add to plate
        </button>
      </div>
    </div>
  );
}

const PLATE_CATEGORY_ORDER = ["Meat", "Dairy", "Fats", "Produce", "Pantry", "Other"];

function plateCategory(name: string): string {
  if (/sauce|pesto|ketchup|dressing|vinegar|mustard|alfredo|\bbbq\b|\bacv\b|tortilla/.test(name.toLowerCase())) return "Pantry";
  return aisle(name).category;
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

const SKIP_BRAND = /^(fresh produce|fresh beef|fresh pork|fresh chicken|unbranded|fieldpack unbranded|whole muscle beef)$/i;

function baseTitle(name: string): string {
  if (name === "American cheese (Kraft Singles)") return "Kraft cheese";
  const item = getIngredient(name);
  if (!item) return name;
  const brand = SKIP_BRAND.test(item.brand.trim()) ? "" : item.brand.trim();
  let title = stripBrand(name, brand);
  if (isCryptic(title)) {
    const fromFull = stripBrand(item.fullName.replace(/,.*$/, ""), brand);
    if (fromFull && !isCryptic(fromFull)) title = fromFull;
  }
  title = tidy(title.replace(/\bsf\b/gi, "sugar-free"));
  return title || name;
}

function isCryptic(text: string): boolean {
  const words = text.replace(/[()]/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.length === 0 || words.every((word) => word.length <= 3);
}

function stripBrand(text: string, brand: string): string {
  if (!brand) return tidy(text);
  const phrase = escapeReg(brand).replace(/\s+/g, "\\s+");
  const next = text.replace(/\(([^)]*)\)/g, (_full, inner: string) => {
    const cleaned = tidy(inner.replace(new RegExp(phrase, "ig"), "").replace(/\bsingles\b/gi, ""));
    return cleaned ? `(${cleaned})` : "";
  }).replace(new RegExp(`\\b${phrase}\\b`, "ig"), "");
  return tidy(next) || text.trim();
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tidy(text: string): string {
  return text
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,)])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .replace(/^[\s,&/-]+|[\s,&/-]+$/g, "")
    .trim();
}

function groupPlateNames(names: string[]): Array<{ category: string; names: string[] }> {
  const bags = new Map<string, string[]>();
  for (const name of names) {
    const category = plateCategory(name);
    const list = bags.get(category) ?? [];
    list.push(name);
    bags.set(category, list);
  }
  return PLATE_CATEGORY_ORDER.flatMap((category) => {
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
  for (const item of items) {
    const group = groups.get(item.baseId) ?? { baseId: item.baseId, title: item.title, items: [] };
    group.items.push(item);
    groups.set(item.baseId, group);
  }
  return [...groups.values()];
}

function AmountField({ value, onChange, label, startBlank = false }: { value: number; onChange: (value: number) => void; label: string; startBlank?: boolean }) {
  const [text, setText] = useState(startBlank && value === 0 ? "" : String(value));
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
          <span className="min-w-0 truncate">{item.name}</span>
          <span className="shrink-0 text-xs text-muted">{getIngredient(item.name)?.servingSize}</span>
        </button>
      ))}
    </div>
  );
}
