import { Plus, X } from "lucide-react";
import { useState } from "react";
import { parseAmount } from "@/lib/recipes/amount";
import { blankLine, type EditableLine } from "@/lib/recipes/lines";
import { getIngredient, searchIngredients } from "@/lib/sourced";
import { isMeatName } from "@/lib/sourced/meal";

export function RecipeEditor({
  mode,
  lines,
  snapshot,
  baseId,
  saving,
  error,
  note,
  hideUpdate,
  newLabel,
  onChange,
  onBase,
  onSave,
  onSaveAsNew,
  onSaveTemplate,
  onCancel,
  meatGroups,
  searchAdd,
}: {
  mode: "edit" | "rebalance" | "fit";
  lines: EditableLine[];
  snapshot: EditableLine[];
  baseId: string | null;
  saving: boolean;
  error: string;
  note?: string;
  hideUpdate?: boolean;
  newLabel?: string;
  onChange: (lines: EditableLine[]) => void;
  onBase: (id: string) => void;
  onSave: () => void;
  onSaveAsNew: () => void;
  onSaveTemplate?: () => void;
  onCancel: () => void;
  meatGroups?: Array<{ category: string; names: string[] }>;
  searchAdd?: boolean;
}) {
  const base = snapshot.find((line) => line.id === baseId);
  const current = lines.find((line) => line.id === baseId);
  const ratio = base && current ? changePercent(base.quantity, current.quantity) : null;
  const [openMeat, setOpenMeat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const hits = query.trim() ? searchIngredients(query.trim().toLowerCase()).slice(0, 6) : [];

  const update = (id: string, patch: Partial<EditableLine>) => {
    onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h3 className="font-display text-xl font-semibold">{mode === "rebalance" ? "Rebalance" : mode === "fit" ? "Fit to goal" : "Edit ingredients"}</h3>
      <p className="mt-1 text-sm text-muted">
        {mode === "rebalance"
          ? "Choose the base ingredient and type its new amount. Every other amount scales by the same percent."
          : mode === "fit"
            ? "Every ingredient is scaled by the same ratio from this version's amounts, with no category limit. Save a version to keep it. Cancel leaves the recipe as it was."
            : "Change a name or amount, add a line, or remove one. Save updates this version. Save as new version keeps this one and adds the next."}
      </p>
      {note ? <p className="mt-2 text-sm font-semibold text-tomato">{note}</p> : null}
      {mode === "rebalance" && ratio != null ? (
        <p className="mt-2 text-sm font-semibold text-tomato">{ratio}</p>
      ) : null}
      {mode === "rebalance" && base && parseAmount(base.quantity) == null ? (
        <p className="mt-2 text-sm text-muted">That line has no number to scale from. Pick an ingredient that already has an amount.</p>
      ) : null}
      <ul className="mt-4 flex flex-col gap-3">
        {lines.map((line) => {
          const selected = line.id === baseId;
          const locked = mode === "rebalance" && !selected;
          return (
            <li key={line.id} className="rounded-2xl border border-line bg-bg p-2">
              <div className="flex items-start gap-2">
                {mode === "rebalance" ? (
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onBase(line.id)}
                    className={`mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full border ${selected ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}
                    aria-label={selected ? "Base ingredient" : "Use as base amount"}
                  >
                    <span className={`size-2.5 rounded-full ${selected ? "bg-tomato-ink" : "bg-transparent"}`} />
                  </button>
                ) : null}
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      value={line.quantity}
                      onChange={(event) => update(line.id, { quantity: event.target.value })}
                      readOnly={locked}
                      inputMode="decimal"
                      aria-label="Amount"
                      placeholder="Amt"
                      className="h-11 w-20 rounded-xl border border-line bg-surface px-2 text-sm outline-none focus:border-tomato read-only:bg-bg"
                    />
                    <input
                      value={line.unit}
                      onChange={(event) => update(line.id, { unit: event.target.value })}
                      readOnly={mode === "rebalance"}
                      aria-label="Unit"
                      placeholder="Unit"
                      className="h-11 w-24 rounded-xl border border-line bg-surface px-2 text-sm outline-none focus:border-tomato read-only:bg-bg"
                    />
                  </div>
                  {mode === "rebalance" && meatGroups && isMeatName(line.name) ? (
                    <div>
                      <button type="button" onClick={() => setOpenMeat((current) => (current === line.id ? null : line.id))} className="h-11 w-full truncate rounded-xl border border-line bg-surface px-3 text-left text-sm font-semibold">
                        {line.name}
                      </button>
                      {openMeat === line.id ? (
                        <div className="mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface">
                          {meatGroups.map((group) => (
                            <div key={group.category}>
                              <p className="px-3 pt-2 text-xs font-semibold text-muted">{group.category}</p>
                              {group.names.map((name) => (
                                <button key={name} type="button" onClick={() => { update(line.id, { name }); setOpenMeat(null); }} className="flex h-10 w-full items-center px-3 text-left text-sm">
                                  {name}
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <input
                      value={line.name}
                      onChange={(event) => update(line.id, { name: event.target.value })}
                      readOnly={mode === "rebalance"}
                      aria-label="Ingredient"
                      placeholder="Ingredient"
                      className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-tomato read-only:bg-bg"
                    />
                  )}
                </div>
                {mode === "edit" ? (
                  <button type="button" onClick={() => onChange(lines.filter((item) => item.id !== line.id))} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full" aria-label="Remove ingredient">
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {mode === "edit" ? (
        <button
          type="button"
          onClick={() => onChange([...lines, blankLine()])}
          className="mt-3 inline-flex h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold"
        >
          <Plus className="size-4" />
          Add ingredient
        </button>
      ) : null}
      {mode === "edit" && searchAdd ? (
        <div className="mt-3 flex flex-col gap-1">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ingredients to add" className="h-11 rounded-2xl border border-line bg-bg px-3 text-sm outline-none focus:border-tomato" />
          {hits.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => {
                const size = getIngredient(item.name)?.servingSize ?? "";
                const match = size.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/);
                onChange([...lines, { id: `new-${crypto.randomUUID()}`, quantity: match?.[1] ?? "1", unit: match?.[2] ?? "", name: item.name }]);
                setQuery("");
              }}
              className="flex h-11 items-center justify-between rounded-2xl border border-line bg-bg px-3 text-left text-sm"
            >
              <span className="min-w-0 truncate">{item.name}</span>
              <span className="shrink-0 text-xs text-muted">{item.servingSize}</span>
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-tomato">{error}</p> : null}
      <div className="mt-4 flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {hideUpdate ? null : (
            <button type="button" onClick={onSave} disabled={saving} className="inline-flex h-11 items-center rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          )}
          <button type="button" onClick={onSaveAsNew} disabled={saving} className={`inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold disabled:opacity-50 ${hideUpdate ? "bg-tomato text-tomato-ink" : "border border-line"}`}>
            {saving ? "Saving…" : newLabel || "Save as new version"}
          </button>
          <button type="button" onClick={onCancel} className="inline-flex h-11 items-center rounded-full border border-line px-4 text-sm font-semibold">
            Cancel
          </button>
        </div>
        {onSaveTemplate ? (
          <button type="button" onClick={onSaveTemplate} disabled={saving} className="inline-flex h-11 items-center justify-center rounded-full border border-line bg-surface px-4 text-sm font-semibold disabled:opacity-50">
            {saving ? "Saving…" : "Save as recipe template"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function changePercent(oldQuantity: string, nextQuantity: string): string | null {
  const oldAmount = parseAmount(oldQuantity);
  const nextAmount = parseAmount(nextQuantity);
  if (oldAmount == null || nextAmount == null || oldAmount === 0) return null;
  const percent = Math.round((nextAmount / oldAmount - 1) * 100);
  if (percent === 0) return "Same amount. Other ingredients stay put.";
  return percent < 0 ? `${Math.abs(percent)}% less on the other ingredients.` : `${percent}% more on the other ingredients.`;
}
