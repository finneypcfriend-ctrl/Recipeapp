import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccountBar, useHouseholdEmail } from "@/components/plans/account";
import { foodTag, groupPlateNames, plateIngredientNames, replacePlateIngredients, togglePlateIngredient, watchStoredPlateIngredients } from "@/components/plans/plate";
import { USE_TAGS, foodChoices, isRestock, isSupplement, restockNames, seedRestock, setFoodTag, setRestock } from "@/lib/sourced/tags";
import { householdSupplementNames, tagSupplement } from "@/lib/plans/supplements";
import { saveCustomIngredient, saveIngredientEdit, type IngredientEdit } from "@/lib/sourced/custom";
import { formatAmount } from "@/lib/recipes/amount";
import type { Recipe, SlimRecipe } from "@/lib/recipes/types";
import { packageMeasure, parentBuy, parentPackage } from "@/lib/plans/grocery";
import { COURSE_ORDER, MEAT_ORDER, SOURCE_ORDER, SOURCE_SHORT, meatLabel } from "@/lib/recipes/classify";
import { getIngredient, ingredientTitle, listIngredients, searchIngredients, shopLink, type SourcedIngredient } from "@/lib/sourced";

export function RecipeLibrary({
  recipes,
  onOpen,
  onClose,
  onRead,
  onCreate,
}: {
  recipes: SlimRecipe[];
  onOpen: (uid: string) => void;
  onClose: () => void;
  onRead: (uid: string) => Recipe | null;
  onCreate: (recipe: Recipe) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [addedOnly, setAddedOnly] = useState(false);
  const rows = useMemo(() => {
    const originals = recipes.filter((recipe) => !recipe.isVersion && (!addedOnly || recipe.custom));
    return originals.slice().sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }) || a.sourceLabel.localeCompare(b.sourceLabel));
  }, [recipes, addedOnly]);
  if (adding || editing) {
    return (
      <AddRecipe
        initial={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onCreate={onCreate}
      />
    );
  }
  return (
    <Directory
      title="Recipe library"
      count={addedOnly ? `${rows.length} added recipes` : `${rows.length} original recipes`}
      onClose={onClose}
      toolbar={
        <div className="mx-auto flex max-w-3xl flex-wrap gap-2 px-4 pb-3">
          <button type="button" onClick={() => setAdding(true)} className="h-11 rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink">
            Add recipe
          </button>
          <button type="button" aria-pressed={addedOnly} onClick={() => setAddedOnly((on) => !on)} className={`h-11 rounded-full border px-4 text-sm font-semibold ${addedOnly ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}>
            Added recipes
          </button>
        </div>
      }
    >
      <ul className="flex flex-col">
        {rows.map((recipe, index) => (
          <li key={recipe.uid} className={index ? "border-t border-line" : ""}>
            <button
              type="button"
              onClick={() => {
                if (!recipe.custom) {
                  onOpen(recipe.uid);
                  return;
                }
                const full = onRead(recipe.uid);
                if (full) setEditing(full);
              }}
              className="flex w-full items-baseline justify-between gap-3 px-1 py-3 text-left"
            >
              <span className="font-semibold">{recipe.title}</span>
              <span className="shrink-0 text-xs text-muted">{recipe.custom ? "Added" : recipe.sourceLabel}</span>
            </button>
          </li>
        ))}
      </ul>
    </Directory>
  );
}

export function IngredientLibrary({ onClose }: { onClose: () => void }) {
  const email = useHouseholdEmail();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const rows = useMemo(() => listIngredients().slice().sort((a, b) => ingredientTitle(a).localeCompare(ingredientTitle(b), undefined, { sensitivity: "base" })), [tick]);
  const [saved, setSaved] = useState<string[]>(() => plateIngredientNames());
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState<string | null>(null);
  const [openCats, setOpenCats] = useState<string[]>([]);
  const [signIn, setSignIn] = useState(false);
  const pending = useRef<string | null>(null);
  const emailRef = useRef(email);
  emailRef.current = email;

  useEffect(
    () =>
      watchStoredPlateIngredients((names) => {
        const name = pending.current;
        if (name && emailRef.current) {
          pending.current = null;
          const next = names.includes(name) ? names.filter((item) => item !== name) : [...names, name];
          replacePlateIngredients(next);
          setSaved(next);
          setSignIn(false);
          return;
        }
        setSaved(names);
      }),
    [],
  );

  useEffect(() => {
    if (email) setSignIn(false);
  }, [email]);

  useEffect(() => {
    householdSupplementNames();
    seedRestock([...plateIngredientNames(), ...householdSupplementNames().filter((name) => getIngredient(name))]);
  }, []);

  const onToggle = (name: string) => {
    if (!email) {
      pending.current = name;
      setSignIn(true);
      return;
    }
    togglePlateIngredient(name);
    setSaved(plateIngredientNames());
  };

  const needle = query.trim().toLowerCase();
  const lists = USE_TAGS.map((id) => ({ id, label: LIST_LABEL[id] ?? id, names: namesOnList(id, saved) }));
  const listed = listFilter ? rows.filter((item) => lists.find((list) => list.id === listFilter)?.names.includes(item.name)) : rows;
  const visible = needle
    ? listed.filter((item) => [item.name, ingredientTitle(item), item.fullName, item.brand].some((value) => value.toLowerCase().includes(needle)))
    : listed;
  const groups = listFilter ? groupPlateNames(visible.map((item) => item.name)) : [];

  return (
    <>
      <Directory
        title="Ingredients library"
        count={needle || listFilter ? `${visible.length} of ${rows.length}` : `${rows.length} ingredients`}
        onClose={onClose}
        toolbar={
          <div className="mx-auto max-w-3xl px-4 pb-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search ingredients"
              className="h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm outline-none focus:border-tomato"
            />
            <p className="mt-2 text-xs font-semibold tracking-wide text-muted uppercase">Lists</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {lists.map((list) => {
                const on = listFilter === list.id;
                return (
                  <button key={list.id} type="button" aria-pressed={on} onClick={() => setListFilter(on ? null : list.id)} className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold ${on ? "bg-tomato text-tomato-ink" : "border border-line bg-surface"}`}>
                    {list.label}
                    <span className={on ? "text-tomato-ink/80" : "text-muted"}>{list.names.length}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-sm text-muted">{listFilter ? `Showing the ${lists.find((list) => list.id === listFilter)?.label} list.` : "These are the lasting lists. Tap one to see who is on it."}</p>
          </div>
        }
      >
        <div className="mb-3 flex gap-2">
          <button type="button" onClick={() => setAdding((value) => !value)} className="h-11 rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink">
            {adding ? "Close" : "Add ingredient"}
          </button>
          <button type="button" onClick={() => setTagsOpen((value) => !value)} className="h-11 rounded-full border border-line px-4 text-sm font-semibold">
            {tagsOpen ? "Close tags" : "Tags"}
          </button>
        </div>
        {tagsOpen ? <TagIndex /> : null}
        {adding ? (
          <AddIngredient
            onSaved={() => {
              setTick((value) => value + 1);
              setAdding(false);
            }}
          />
        ) : null}
        {listFilter ? (
          <div className="flex flex-col gap-2">
            {groups.length ? null : <p className="py-6 text-sm text-muted">Nothing in the library matches that.</p>}
            {groups.map((group) => {
              const expanded = Boolean(needle) || openCats.includes(group.category);
              return (
                <section key={group.category} className="rounded-2xl border border-line bg-surface">
                  <button type="button" aria-expanded={expanded} onClick={() => setOpenCats((current) => (current.includes(group.category) ? current.filter((item) => item !== group.category) : [...current, group.category]))} className="flex h-11 w-full items-center gap-2 px-3 text-left">
                    <ChevronDown className={`size-4 shrink-0 text-muted motion-safe:transition-transform ${expanded ? "" : "-rotate-90"}`} />
                    <span className="min-w-0 flex-1 text-xs font-semibold tracking-wide text-muted uppercase">{group.category}</span>
                    <span className="text-xs text-muted">{group.names.length}</span>
                  </button>
                  {expanded ? (
                    <ul className="flex flex-col border-t border-line">
                      {group.names.map((name, index) => {
                        const item = getIngredient(name);
                        if (!item) return null;
                        return (
                          <LibraryRow
                            key={name}
                            item={item}
                            open={open === name}
                            onPlate={Boolean(email) && saved.includes(name)}
                            onOpen={() => setOpen(open === name ? null : name)}
                            onToggle={() => onToggle(name)}
                            onPriced={() => setTick((value) => value + 1)}
                            bordered={index > 0}
                          />
                        );
                      })}
                    </ul>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
        <ul className="flex flex-col">
          {visible.length ? null : <li className="py-6 text-sm text-muted">Nothing in the library matches that.</li>}
          {visible.map((item, index) => (
            <LibraryRow
              key={item.name}
              item={item}
              open={open === item.name}
              onPlate={Boolean(email) && saved.includes(item.name)}
              onOpen={() => setOpen(open === item.name ? null : item.name)}
              onToggle={() => onToggle(item.name)}
              onPriced={() => setTick((value) => value + 1)}
              bordered={index > 0}
            />
          ))}
        </ul>
        )}
      </Directory>
      {signIn && !email ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center">
          <div className="flex w-full max-w-lg flex-col gap-2">
            <AccountBar />
            <button
              type="button"
              onClick={() => {
                pending.current = null;
                setSignIn(false);
              }}
              className="h-11 rounded-full border border-line bg-surface text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

const LIST_LABEL: Record<string, string> = {
  BAP: "Build a Plate",
  Restock: "Restock",
  Supplement: "Supplements",
};

function namesOnList(id: string, bap: string[]): string[] {
  if (id === "BAP") return bap;
  if (id === "Restock") return restockNames();
  if (id === "Supplement") return householdSupplementNames();
  return [];
}

function LibraryRow({ item, open, onPlate, onOpen, onToggle, onPriced, bordered = false }: { item: SourcedIngredient; open: boolean; onPlate: boolean; onOpen: () => void; onToggle: () => void; onPriced: () => void; bordered?: boolean }) {
  const title = ingredientTitle(item);
  return (
    <li className={bordered ? "border-t border-line" : ""}>
      <div className="flex items-center gap-2">
        <button type="button" aria-expanded={open} onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 px-1 py-3 text-left">
          <ChevronDown className={`size-4 shrink-0 text-muted ${open ? "rotate-180" : ""}`} />
          <span className="font-semibold">{title}</span>
        </button>
        <button
          type="button"
          aria-pressed={onPlate}
          aria-label={onPlate ? `Remove ${title} from the plate list` : `Add ${title} to the plate list`}
          onClick={onToggle}
          className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full border ${onPlate ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface text-muted"}`}
        >
          <PlateMark />
        </button>
      </div>
      {open ? (
        <>
          <IngredientTags name={item.name} bap={onPlate} onBap={onToggle} />
          <IngredientFacts item={item} onPriced={onPriced} />
        </>
      ) : null}
    </li>
  );
}

function TagIndex() {
  const foods = new Map<string, number>();
  for (const item of listIngredients()) {
    const tag = foodTag(item.name);
    foods.set(tag, (foods.get(tag) ?? 0) + 1);
  }
  const foodRows = [...foods.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const uses: Array<[string, number]> = [
    ["BAP", plateIngredientNames().length],
    ["Restock", restockNames().length],
    ["Supplement", householdSupplementNames().length],
  ];
  return (
    <section className="mb-4 flex flex-col gap-3 rounded-card border border-line bg-surface p-3">
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Food type</p>
        <ul className="mt-2 flex flex-col">
          {foodRows.map(([tag, count]) => (
            <li key={tag} className="flex items-center justify-between border-t border-line py-2 text-sm first:border-t-0">
              <span className="font-semibold">{tag}</span>
              <span className="text-muted">{count}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Use type</p>
        <ul className="mt-2 flex flex-col">
          {uses.map(([tag, count]) => (
            <li key={tag} className="flex items-center justify-between border-t border-line py-2 text-sm first:border-t-0">
              <span className="font-semibold">{tag}</span>
              <span className="text-muted">{count}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PlateMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7">
      <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="7.1" fill="none" stroke="currentColor" strokeWidth="1.15" />
      <path fill="currentColor" d="M9.15 6.7c.7 0 1.25.7 1.25 1.85 0 .85-.3 1.45-.75 1.7V16.2c0 .4-.35.7-.75.7s-.75-.3-.75-.7V10.25c-.45-.25-.75-.85-.75-1.7 0-1.15.55-1.85 1.25-1.85z" />
      <path fill="currentColor" d="M13.55 6.6h.7v3.15c0 .15.15.3.35.3h.15c.2 0 .35-.15.35-.3V6.6h.7v3.15c0 .15.15.3.35.3h.15c.2 0 .35-.15.35-.3V6.6h.7v3.35c0 .9-.6 1.6-1.45 1.75V16.2c0 .4-.3.7-.7.7s-.7-.3-.7-.7v-4.5c-.85-.15-1.45-.85-1.45-1.75V6.6z" />
    </svg>
  );
}

function AddIngredient({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("g");
  const [calories, setCalories] = useState("");
  const [fat, setFat] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [price, setPrice] = useState("");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [error, setError] = useState("");
  const choices = foodChoices();

  const save = () => {
    const label = name.trim();
    const food = customCategory.trim() || category;
    if (getIngredient(label)) {
      setError("That ingredient is already in the library.");
      return;
    }
    if (!food) {
      setError("Choose a food category.");
      return;
    }
    const problem = saveCustomIngredient({
      name: label,
      amount: Number(amount),
      unit,
      calories: Number(calories),
      fatG: Number(fat),
      proteinG: Number(protein),
      netCarbsG: Number(carbs),
      price: Number(price),
      source,
    });
    if (problem) {
      setError(problem);
      return;
    }
    setFoodTag(label, food);
    onSaved();
  };

  return (
    <form
      className="mb-4 flex flex-col gap-2 rounded-card border border-line bg-surface p-3"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <p className="text-sm font-semibold">New ingredient</p>
      <Field label="Name" value={name} onChange={setName} />
      <label className="flex flex-col gap-1 text-xs text-muted">
        Food category
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-11 rounded-2xl border border-line bg-bg px-2 text-sm text-ink">
          <option value="">Choose a category</option>
          {choices.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
      <Field label="Or a new category" value={customCategory} onChange={setCustomCategory} />
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <Field label="Serving amount" value={amount} onChange={setAmount} numeric />
        <label className="flex flex-col gap-1 text-xs text-muted">
          Unit
          <select value={unit} onChange={(event) => setUnit(event.target.value)} className="h-11 rounded-2xl border border-line bg-bg px-2 text-sm text-ink">
            {["g", "ml", "oz", "lb", "tsp", "tbsp", "cup", "slice", "each"].map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted">Macros are for that one serving.</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Calories" value={calories} onChange={setCalories} numeric />
        <Field label="Fat (g)" value={fat} onChange={setFat} numeric />
        <Field label="Protein (g)" value={protein} onChange={setProtein} numeric />
        <Field label="Net carbs (g)" value={carbs} onChange={setCarbs} numeric />
      </div>
      <Field label="Price for that serving ($)" value={price} onChange={setPrice} numeric />
      <Field label="Source name or link" value={source} onChange={setSource} />
      {error ? <p className="text-sm text-tomato">{error}</p> : null}
      <button type="submit" className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink">
        Save ingredient
      </button>
    </form>
  );
}

function IngredientTags({ name, bap, onBap }: { name: string; bap: boolean; onBap: () => void }) {
  const [food, setFood] = useState(() => foodTag(name));
  const [restock, setRestockOn] = useState(() => isRestock(name));
  const [supplement, setSupplementOn] = useState(() => isSupplement(name));
  const [custom, setCustom] = useState("");
  const choices = foodChoices().includes(food) ? foodChoices() : [food, ...foodChoices()];
  const applyFood = (value: string) => {
    const next = value.trim();
    if (!next) return;
    setFood(next);
    setFoodTag(name, next);
    setCustom("");
  };
  return (
    <div className="mb-2 ml-6 flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Food type</p>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Category
        <select value={choices.includes(food) ? food : ""} onChange={(event) => applyFood(event.target.value)} className="h-11 rounded-2xl border border-line bg-bg px-2 text-sm text-ink">
          {choices.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        New food category
        <span className="flex gap-2">
          <input value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Type a new category" className="h-11 min-w-0 flex-1 rounded-2xl border border-line bg-bg px-3 text-sm text-ink outline-none focus:border-tomato" />
          <button type="button" disabled={!custom.trim()} onClick={() => applyFood(custom)} className="h-11 rounded-full border border-line px-3 text-sm font-semibold disabled:opacity-40">
            Set
          </button>
        </span>
      </label>
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Use type</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={bap} onClick={onBap} className={`h-9 rounded-full px-3 text-sm font-semibold ${bap ? "bg-tomato text-tomato-ink" : "border border-line"}`}>
          BAP
        </button>
        <button
          type="button"
          aria-pressed={restock}
          onClick={() => {
            const next = !restock;
            setRestock(name, next);
            setRestockOn(next);
          }}
          className={`h-9 rounded-full px-3 text-sm font-semibold ${restock ? "bg-tomato text-tomato-ink" : "border border-line"}`}
        >
          Restock
        </button>
        <button
          type="button"
          aria-pressed={supplement}
          onClick={() => {
            const next = !supplement;
            tagSupplement(name, next);
            setSupplementOn(next);
          }}
          className={`h-9 rounded-full px-3 text-sm font-semibold ${supplement ? "bg-tomato text-tomato-ink" : "border border-line"}`}
        >
          Supplement
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, numeric = false }: { label: string; value: string; onChange: (value: string) => void; numeric?: boolean }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input value={value} inputMode={numeric ? "decimal" : "text"} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-2xl border border-line bg-bg px-3 text-sm text-ink outline-none focus:border-tomato" />
    </label>
  );
}

type DraftLine = { id: string; query: string; name: string | null; servings: number };
type DraftStep = { id: string; text: string; saved: boolean };

function blankLine(): DraftLine {
  return { id: crypto.randomUUID(), query: "", name: null, servings: 1 };
}

function blankStep(): DraftStep {
  return { id: crypto.randomUUID(), text: "", saved: false };
}

function linesFromRecipe(recipe: Recipe): DraftLine[] {
  const items = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const lines = items.flatMap((item) => {
    if (!item || typeof item === "string" || !item.sourced_name) return [];
    const measure = packageMeasure(item.sourced_name);
    const amount = typeof item.quantity_value === "number" ? item.quantity_value : measure?.each ?? 1;
    const servings = measure && measure.each > 0 ? amount / measure.each : 1;
    return [{ id: crypto.randomUUID(), query: "", name: item.sourced_name, servings }];
  });
  return lines.length ? lines : [blankLine(), blankLine()];
}

function stepsFromRecipe(recipe: Recipe): DraftStep[] {
  const raw = Array.isArray(recipe.instructions) ? recipe.instructions : [];
  const saved = raw.flatMap((step) => {
    const text = typeof step === "string" ? step.trim() : step?.text?.trim() || "";
    return text ? [{ id: crypto.randomUUID(), text, saved: true }] : [];
  });
  return [...saved, blankStep()];
}

function AddRecipe({ initial, onClose, onCreate }: { initial?: Recipe | null; onClose: () => void; onCreate: (recipe: Recipe) => Promise<void> }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [photo, setPhoto] = useState(initial?.image_url ?? "");
  const [course, setCourse] = useState(initial?.filter_course ?? "");
  const [meats, setMeats] = useState<string[]>(initial?.filter_proteins ?? []);
  const [source, setSource] = useState(initial?.collection && SOURCE_ORDER.includes(initial.collection as (typeof SOURCE_ORDER)[number]) ? initial.collection : "custom");
  const [lines, setLines] = useState<DraftLine[]>(() => (initial ? linesFromRecipe(initial) : [blankLine(), blankLine()]));
  const [steps, setSteps] = useState<DraftStep[]>(() => (initial ? stepsFromRecipe(initial) : [blankStep()]));
  const [picking, setPicking] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const chosen = lines.filter((line) => line.name);
  const commitStep = () => {
    setSteps((current) => {
      const pending = current.some((step) => !step.saved && step.text.trim());
      if (!pending) return current;
      const kept = current.map((step) => (step.text.trim() ? { ...step, text: step.text.trim(), saved: true } : step)).filter((step) => step.saved);
      return [...kept, blankStep()];
    });
  };
  const save = async () => {
    const name = title.trim();
    if (!name) {
      setError("Add a recipe name.");
      return;
    }
    if (!chosen.length) {
      setError("Search and add at least one ingredient.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const ingredients = chosen.map((line) => {
        const measure = packageMeasure(line.name!);
        const amount = measure ? Math.round(line.servings * measure.each * 100) / 100 : line.servings;
        const unit = measure?.unit || "";
        const label = ingredientTitle(line.name!);
        return {
          item: label,
          raw: [formatAmount(amount), unit, label].filter(Boolean).join(" "),
          quantity: formatAmount(amount),
          quantity_value: amount,
          unit,
          sourced_name: line.name,
          sourced_match: "exact" as const,
        };
      });
      const instructions = steps
        .map((step) => step.text.trim())
        .filter(Boolean)
        .map((text, index) => ({ step: index + 1, text }));
      const recipe: Recipe = {
        uid: initial?.uid ?? `custom:${crypto.randomUUID()}`,
        title: name,
        collection: source,
        collection_name: SOURCE_SHORT[source] || "Added",
        custom_recipe: true,
        filter_course: course || null,
        filter_proteins: meats,
        image_url: photo || null,
        author: initial?.author || "Household",
        date_published: initial?.date_published || new Date().toISOString().slice(0, 10),
        servings: initial?.servings ?? "1",
        ingredients,
        instructions,
      };
      await onCreate(recipe);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that recipe.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Directory title={initial ? "Edit recipe" : "Add recipe"} count={initial ? "Change this added recipe" : "A new recipe in your library"} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label="Recipe name" value={title} onChange={setTitle} />
        <label className="flex flex-col gap-1 text-xs text-muted">
          Photo, if you want one
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void readPhoto(file).then(setPhoto).catch(() => setError("That photo could not be read."));
            }}
            className="text-sm text-ink"
          />
        </label>
        {photo ? (
          <div className="flex items-center gap-3">
            <img src={photo} alt="" className="h-24 w-24 rounded-2xl object-cover" />
            <button type="button" onClick={() => setPhoto("")} className="text-sm font-semibold text-muted">
              Remove photo
            </button>
          </div>
        ) : null}
        <TagGroup title="Course">
          {COURSE_ORDER.map((item) => (
            <TagChip key={item} label={item} selected={course === item} onClick={() => setCourse((current) => (current === item ? "" : item))} />
          ))}
        </TagGroup>
        <TagGroup title="Meat">
          {MEAT_ORDER.map((item) => (
            <TagChip key={item} label={meatLabel(item)} selected={meats.includes(item)} onClick={() => setMeats((current) => (current.includes(item) ? current.filter((name) => name !== item) : [...current, item]))} />
          ))}
        </TagGroup>
        <TagGroup title="Source">
          {SOURCE_ORDER.map((item) => (
            <TagChip key={item} label={SOURCE_SHORT[item] ?? item} selected={source === item} onClick={() => setSource(item)} />
          ))}
        </TagGroup>
        <p className="text-sm font-semibold">Ingredients</p>
        {lines.map((line) => (
          <IngredientRow
            key={line.id}
            line={line}
            onChange={(next) => setLines((current) => current.map((item) => (item.id === line.id ? next : item)))}
            onRemove={() => setLines((current) => (current.length > 1 ? current.filter((item) => item.id !== line.id) : current))}
          />
        ))}
        <button type="button" onClick={() => setLines((current) => [...current, blankLine()])} className="h-11 self-start rounded-full border border-line px-4 text-sm font-semibold">
          Add ingredient row
        </button>
        <p className="text-sm font-semibold">Instructions</p>
        {steps.map((step, index) =>
          step.saved ? (
            <div key={step.id} className="flex items-center gap-2 border-b border-line py-2">
              <span className="w-5 shrink-0 text-xs font-semibold text-muted">{index + 1}</span>
              <p className="min-w-0 flex-1 truncate text-sm">{step.text}</p>
              <button type="button" onClick={() => setSteps((current) => current.map((item) => (item.id === step.id ? { ...item, saved: false } : item)))} className="text-sm font-semibold">
                Edit
              </button>
              <button type="button" onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))} className="text-sm font-semibold text-muted">
                Remove
              </button>
            </div>
          ) : (
            <div key={step.id} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted">Step {index + 1}</span>
                {steps.length > 1 ? (
                  <button type="button" onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))} className="text-sm font-semibold text-muted">
                    Remove
                  </button>
                ) : null}
              </div>
              <textarea
                value={step.text}
                onChange={(event) => setSteps((current) => current.map((item) => (item.id === step.id ? { ...item, text: event.target.value } : item)))}
                rows={3}
                placeholder="What to do"
                className="w-full rounded-2xl border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-tomato"
              />
              <button
                type="button"
                onClick={() => {
                  setPicking(step.id);
                  setPicked([]);
                }}
                className="h-10 self-start rounded-full border border-line px-3 text-sm font-semibold"
              >
                Add ingredient
              </button>
            </div>
          ),
        )}
        <button type="button" onClick={commitStep} className="h-11 self-start rounded-full border border-line px-4 text-sm font-semibold">
          Add step
        </button>
        {error ? <p className="text-sm text-tomato">{error}</p> : null}
        <button type="submit" disabled={saving} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-50">
          {saving ? "Saving…" : "Save recipe"}
        </button>
      </form>
      {picking ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3" role="dialog" aria-label="Ingredients for this step">
          <div className="flex w-full max-w-lg flex-col gap-3 rounded-card bg-surface p-4">
            <p className="text-sm font-semibold">Ingredients in this recipe</p>
            {chosen.length ? (
              <div className="flex flex-wrap gap-2">
                {chosen.map((line) => {
                  const on = picked.includes(line.name!);
                  return (
                    <button
                      key={line.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPicked((current) => (current.includes(line.name!) ? current.filter((name) => name !== line.name) : [...current, line.name!]))}
                      className={`rounded-full px-3 py-2 text-sm font-semibold ${on ? "bg-tomato text-tomato-ink" : "border border-line bg-bg"}`}
                    >
                      {ingredientTitle(line.name!)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted">Add ingredients to the recipe first.</p>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setPicking(null)} className="h-11 flex-1 rounded-full border border-line text-sm font-semibold">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const names = picked.map((name) => ingredientTitle(name));
                  setSteps((current) =>
                    current.map((step) => {
                      if (step.id !== picking || !names.length) return step;
                      const missing = names.filter((name) => !step.text.toLowerCase().includes(name.toLowerCase()));
                      if (!missing.length) return step;
                      const text = step.text.trim();
                      return { ...step, text: text ? `${text} ${missing.join(", ")}` : missing.join(", ") };
                    }),
                  );
                  setPicking(null);
                }}
                className="h-11 flex-1 rounded-full bg-tomato text-sm font-semibold text-tomato-ink"
              >
                Add to step
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Directory>
  );
}

function TagGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function TagChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={`h-10 rounded-full border px-3 text-sm font-semibold ${selected ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}>
      {label}
    </button>
  );
}

function IngredientRow({ line, onChange, onRemove }: { line: DraftLine; onChange: (line: DraftLine) => void; onRemove: () => void }) {
  const hits = line.name || !line.query.trim() ? [] : searchIngredients(line.query).slice(0, 8);
  const measure = line.name ? packageMeasure(line.name) : null;
  const buy = line.name ? parentBuy(line.name, line.servings) : null;
  const pack = line.name ? parentPackage(line.name) : null;
  const shown = measure ? Math.round(line.servings * measure.each * 100) / 100 : line.servings;
  const setShown = (amount: number) => {
    const each = measure?.each || 1;
    onChange({ ...line, servings: amount <= 0 ? 0 : amount / each });
  };
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
      {line.name ? (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold">{ingredientTitle(line.name)}</p>
            <button type="button" onClick={onRemove} className="text-sm font-semibold text-muted">
              Remove
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Less" onClick={() => setShown(Math.max(0, shown - (measure && measure.each >= 10 ? measure.each : 1)))} className="inline-flex size-11 items-center justify-center rounded-full border border-line text-lg">
              −
            </button>
            <input
              inputMode="decimal"
              value={String(Math.round(shown * 100) / 100)}
              onChange={(event) => {
                const next = event.target.value;
                if (!/^\d*\.?\d{0,2}$/.test(next)) return;
                if (next === "" || next === ".") {
                  setShown(0);
                  return;
                }
                const parsed = Number(next);
                if (Number.isFinite(parsed)) setShown(parsed);
              }}
              className="h-11 w-20 rounded-2xl border border-line bg-bg text-center text-sm font-semibold tabular-nums outline-none focus:border-tomato"
            />
            <span className="text-sm text-muted">{measure?.unit}</span>
          </div>
          {buy && pack ? <p className="text-xs text-muted">{buy.count} × {pack.name} · {money(buy.price)}</p> : null}
          <button type="button" onClick={() => onChange({ ...line, name: null, query: "" })} className="self-start text-sm font-semibold text-muted">
            Search again
          </button>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
              Search the ingredient library
              <input
                value={line.query}
                onChange={(event) => onChange({ ...line, query: event.target.value })}
                placeholder="Zucchini, salt…"
                className="h-11 rounded-2xl border border-line bg-bg px-3 text-sm text-ink outline-none focus:border-tomato"
              />
            </label>
            <button type="button" onClick={onRemove} className="mt-5 text-sm font-semibold text-muted">
              Remove
            </button>
          </div>
          {hits.length ? (
            <ul className="flex flex-col rounded-2xl border border-line">
              {hits.map((item) => (
                <li key={item.name} className="border-t border-line first:border-t-0">
                  <button type="button" onClick={() => onChange({ ...line, name: item.name, query: "", servings: 1 })} className="w-full px-3 py-2 text-left text-sm font-semibold">
                    {ingredientTitle(item)}
                  </button>
                </li>
              ))}
            </ul>
          ) : line.query.trim() ? (
            <p className="text-sm text-muted">Nothing in the library matches that.</p>
          ) : null}
        </>
      )}
    </div>
  );
}

function readPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that photo."));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Could not read that photo."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.onerror = () => reject(new Error("Could not read that photo."));
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function Directory({ title, count, onClose, toolbar, children }: { title: string; count: string; onClose: () => void; toolbar?: ReactNode; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex h-dvh flex-col overflow-hidden bg-bg">
      <div className="shrink-0 border-b border-line bg-bg">
        <header>
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
            <button type="button" onClick={onClose} className="inline-flex h-11 items-center rounded-full px-2 text-sm font-semibold">
              ← Back
            </button>
            <h1 className="min-w-0 flex-1 truncate font-display text-xl font-semibold">{title}</h1>
          </div>
        </header>
        {toolbar}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <p className="mb-2 text-sm text-muted">{count}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function IngredientFacts({ item, onPriced }: { item: SourcedIngredient; onPriced: () => void }) {
  const [form, setForm] = useState(() => editFrom(item));
  const [message, setMessage] = useState("");
  useEffect(() => {
    setForm(editFrom(item));
    setMessage("");
  }, [item]);
  const set = (key: keyof IngredientEdit, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage("");
  };
  const save = () => {
    const price = num(form.price);
    const servingQty = num(form.servingQty);
    const servingsPerPackage = num(form.servingsPerPackage);
    const calories = num(form.calories);
    const proteinG = num(form.proteinG);
    const fatG = num(form.fatG);
    const carbsG = num(form.carbsG);
    const fiberG = num(form.fiberG);
    const sugarsG = num(form.sugarsG);
    const netCarbsG = num(form.netCarbsG);
    const numbers = [price, servingQty, servingsPerPackage, calories, proteinG, fatG, carbsG, fiberG, sugarsG, netCarbsG];
    if (numbers.some((value) => value == null || value < 0) || servingQty === 0) {
      setMessage("Enter numbers for the serving, package, price, and macros.");
      return;
    }
    saveIngredientEdit(item.name, {
      fullName: form.fullName.trim(),
      brand: form.brand.trim(),
      size: form.size.trim(),
      price,
      servingSize: form.servingSize.trim(),
      servingQty,
      servingsPerPackage,
      shopUrl: form.shopUrl.trim(),
      notes: form.notes.trim(),
      macroSource: form.macroSource.trim(),
      labelIngredients: form.labelIngredients.trim(),
      basis: form.basis.trim(),
      calories: calories ?? 0,
      proteinG: proteinG ?? 0,
      fatG: fatG ?? 0,
      carbsG: carbsG ?? 0,
      fiberG: fiberG ?? 0,
      sugarsG: sugarsG ?? 0,
      netCarbsG: netCarbsG ?? 0,
    });
    setMessage("Saved. Recipes still use this same ingredient.");
    onPriced();
  };
  return (
    <form
      className="mb-3 ml-6 flex flex-col gap-2 rounded-card border border-line bg-surface p-3"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <p className="text-xs text-muted">Recipes stay linked to this ingredient. These numbers are what they use.</p>
      <Field label="Full name" value={form.fullName} onChange={(value) => set("fullName", value)} />
      <Field label="Brand" value={form.brand} onChange={(value) => set("brand", value)} />
      <Field label="Package size" value={form.size} onChange={(value) => set("size", value)} />
      <Field label="Package price ($)" value={form.price} onChange={(value) => set("price", value)} numeric />
      <Field label="Servings in the package" value={form.servingsPerPackage} onChange={(value) => set("servingsPerPackage", value)} numeric />
      <Field label="Serving size" value={form.servingSize} onChange={(value) => set("servingSize", value)} />
      <Field label="Serving amount" value={form.servingQty} onChange={(value) => set("servingQty", value)} numeric />
      <p className="text-xs text-muted">Macros below are for one serving.</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Calories" value={form.calories} onChange={(value) => set("calories", value)} numeric />
        <Field label="Protein (g)" value={form.proteinG} onChange={(value) => set("proteinG", value)} numeric />
        <Field label="Fat (g)" value={form.fatG} onChange={(value) => set("fatG", value)} numeric />
        <Field label="Carbs (g)" value={form.carbsG} onChange={(value) => set("carbsG", value)} numeric />
        <Field label="Fiber (g)" value={form.fiberG} onChange={(value) => set("fiberG", value)} numeric />
        <Field label="Sugars (g)" value={form.sugarsG} onChange={(value) => set("sugarsG", value)} numeric />
        <Field label="Net carbs (g)" value={form.netCarbsG} onChange={(value) => set("netCarbsG", value)} numeric />
      </div>
      <Field label="Store link" value={form.shopUrl} onChange={(value) => set("shopUrl", value)} />
      <Field label="Source" value={form.macroSource} onChange={(value) => set("macroSource", value)} />
      <Field label="Label ingredients" value={form.labelIngredients} onChange={(value) => set("labelIngredients", value)} />
      <Field label="Notes" value={form.notes} onChange={(value) => set("notes", value)} />
      <p className="text-xs text-muted">Cost per serving {money(item.costPerServing)} · Cost per pound {money(item.costPerLb) || "—"}</p>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      <button type="submit" className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink">
        Save ingredient
      </button>
    </form>
  );
}

function editFrom(item: SourcedIngredient) {
  return {
    fullName: item.fullName,
    brand: item.brand,
    size: item.size,
    price: item.price == null ? "" : String(item.price),
    servingSize: item.servingSize,
    servingQty: item.servingQty == null ? "" : String(item.servingQty),
    servingsPerPackage: item.servingsPerPackage == null ? "" : String(item.servingsPerPackage),
    shopUrl: shopLink(item),
    notes: item.notes,
    macroSource: item.macroSource,
    labelIngredients: item.labelIngredients,
    basis: item.basis,
    calories: String(item.perServing.calories),
    proteinG: String(item.perServing.proteinG),
    fatG: String(item.perServing.fatG),
    carbsG: String(item.perServing.carbsG),
    fiberG: String(item.perServing.fiberG),
    sugarsG: String(item.perServing.sugarsG),
    netCarbsG: String(item.perServing.netCarbsG),
  };
}

function num(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "";
  return `$${value.toFixed(2)}`;
}
