import { Check, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccountBar, useHouseholdEmail } from "@/components/plans/account";
import { plateIngredientNames, replacePlateIngredients, togglePlateIngredient, watchStoredPlateIngredients } from "@/components/plans/plate";
import { listIngredients, type SourcedIngredient } from "@/lib/sourced";
import type { SlimRecipe } from "@/lib/recipes/types";

export function RecipeLibrary({ recipes, onOpen, onClose }: { recipes: SlimRecipe[]; onOpen: (uid: string) => void; onClose: () => void }) {
  const rows = useMemo(
    () => recipes.filter((recipe) => !recipe.isVersion).slice().sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }) || a.sourceLabel.localeCompare(b.sourceLabel)),
    [recipes],
  );
  return (
    <Directory title="Recipe library" count={`${rows.length} original recipes`} onClose={onClose}>
      <ul className="flex flex-col">
        {rows.map((recipe, index) => (
          <li key={recipe.uid} className={index ? "border-t border-line" : ""}>
            <button type="button" onClick={() => onOpen(recipe.uid)} className="flex w-full items-baseline justify-between gap-3 px-1 py-3 text-left">
              <span className="font-semibold">{recipe.title}</span>
              <span className="shrink-0 text-xs text-muted">{recipe.sourceLabel}</span>
            </button>
          </li>
        ))}
      </ul>
    </Directory>
  );
}

export function IngredientLibrary({ onClose }: { onClose: () => void }) {
  const email = useHouseholdEmail();
  const rows = useMemo(() => listIngredients().slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })), []);
  const [open, setOpen] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[]>(() => plateIngredientNames());
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

  const onToggle = (name: string) => {
    if (!email) {
      pending.current = name;
      setSignIn(true);
      return;
    }
    togglePlateIngredient(name);
    setSaved(plateIngredientNames());
  };

  return (
    <>
      <Directory
        title="Ingredients library"
        count={`${rows.length} ingredients`}
        onClose={onClose}
        toolbar={<p className="mx-auto max-w-3xl px-4 pb-3 text-sm text-muted">A filled circle is saved to this account for the Build a Plate list. Tap a circle to add or remove it.</p>}
      >
        <ul className="flex flex-col">
          {rows.map((item, index) => {
            const shown = open === item.name;
            const on = Boolean(email) && saved.includes(item.name);
            return (
              <li key={item.name} className={index ? "border-t border-line" : ""}>
                <div className="flex items-center gap-2">
                  <button type="button" aria-expanded={shown} onClick={() => setOpen(shown ? null : item.name)} className="flex min-w-0 flex-1 items-center gap-2 px-1 py-3 text-left">
                    <ChevronDown className={`size-4 shrink-0 text-muted ${shown ? "rotate-180" : ""}`} />
                    <span className="font-semibold">{item.name}</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={on ? `Remove ${item.name} from the plate list` : `Add ${item.name} to the plate list`}
                    onClick={() => onToggle(item.name)}
                    className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full border ${on ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}
                  >
                    {on ? <Check className="size-4" /> : null}
                  </button>
                </div>
                {shown ? <IngredientFacts item={item} /> : null}
              </li>
            );
          })}
        </ul>
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

function Directory({ title, count, onClose, toolbar, children }: { title: string; count: string; onClose: () => void; toolbar?: ReactNode; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg">
      <div className="sticky top-0 z-10 border-b border-line bg-bg/95 backdrop-blur">
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
      <div className="mx-auto max-w-3xl px-4 py-3">
        <p className="mb-2 text-sm text-muted">{count}</p>
        {children}
      </div>
    </div>
  );
}

function IngredientFacts({ item }: { item: SourcedIngredient }) {
  const serving = item.perServing;
  return (
    <dl className="mb-3 ml-6 rounded-card border border-line bg-surface px-3 py-2">
      <Fact label="Full name" value={item.fullName} />
      <Fact label="Brand" value={item.brand} />
      <Fact label="Package size" value={item.size} />
      <Fact label="Price" value={money(item.price)} />
      <Fact label="Serving size" value={item.servingSize} />
      <Fact label="Servings per package" value={number(item.servingsPerPackage)} />
      <Fact label="Cost per serving" value={money(item.costPerServing)} />
      <Fact label="Cost per pound" value={money(item.costPerLb)} />
      <Fact label="Calories" value={grams(serving.calories, "")} />
      <Fact label="Protein" value={grams(serving.proteinG, "g")} />
      <Fact label="Fat" value={grams(serving.fatG, "g")} />
      <Fact label="Net carbs" value={grams(serving.netCarbsG, "g")} />
      <Fact label="Fiber" value={grams(serving.fiberG, "g")} />
      <Fact label="Basis" value={item.basis} />
      <Fact label="Label ingredients" value={item.labelIngredients} />
      <Fact label="Macro source" value={item.macroSource} />
      <Fact label="Notes" value={item.notes} />
    </dl>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div className="flex items-start justify-between gap-3 border-t border-line py-2 text-sm first:border-t-0">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right">{linkText(value)}</dd>
    </div>
  );
}

function money(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "";
  return `$${value.toFixed(2)}`;
}

function number(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "";
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

function grams(value: number, unit: string): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}${unit}`;
}

function linkText(value: string) {
  const parts = value.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, index) =>
    part.startsWith("http") ? (
      <a key={index} href={part} target="_blank" rel="noreferrer" className="break-all text-tomato underline">
        {part}
      </a>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}
