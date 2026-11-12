import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  collectUsage,
  groceryLabel,
  groupRows,
  money,
  packLabel,
  purchaseCost,
  rowFor,
  rowsFromUsage,
  type GroceryList,
  type GroceryRow,
} from "@/lib/plans/grocery";
import { CLOUD_EVENT } from "@/lib/cloud/sync";
import type { MealPlan, PlanRoute } from "@/lib/plans/model";
import { readGroceryLists, writeGroceryLists } from "@/lib/recipes/idb";
import type { Recipe } from "@/lib/recipes/types";

export function ShopCheckout({
  plans,
  planIds,
  catalog,
  existing,
  onOpen,
  onNotify,
}: {
  plans: MealPlan[];
  planIds: string[];
  catalog: ReadonlyMap<string, Recipe>;
  existing?: GroceryList | null;
  onOpen: (route: PlanRoute) => void;
  onNotify: (message: string) => void;
}) {
  const totals = useMemo(() => {
    if (existing) return new Map(existing.lines.map((line) => [line.name, line.servings]));
    return collectUsage(plans, planIds, catalog);
  }, [existing, plans, planIds, catalog]);
  const rows = useMemo(() => rowsFromUsage(totals, existing?.lines), [totals, existing]);
  const [have, setHave] = useState<Record<string, boolean>>(() => Object.fromEntries((existing?.lines ?? []).map((line) => [line.name, line.have])));
  const [packages, setPackages] = useState<Record<string, number>>(() => Object.fromEntries(rows.map((row) => [row.name, row.packages])));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPackages(Object.fromEntries(rows.map((row) => [row.name, existing?.lines.find((line) => line.name === row.name)?.packages ?? row.packages])));
    if (existing) setHave(Object.fromEntries(existing.lines.map((line) => [line.name, line.have])));
  }, [existing, rows]);

  const buying = useMemo(() => new Set(rows.filter((row) => !have[row.name]).map((row) => row.name)), [rows, have]);
  const packageMap = useMemo(() => new Map(Object.entries(packages)), [packages]);
  const consumed = rows.reduce((sum, row) => sum + row.consumedCost, 0);
  const purchase = purchaseCost(rows, buying, packageMap);
  const groups = groupRows(rows);
  const buyingRows = rows.filter((row) => buying.has(row.name));

  const save = async () => {
    setSaving(true);
    try {
      const lists = await readGroceryLists();
      const next: GroceryList = {
        id: existing?.id ?? `groc-${Date.now().toString(36)}`,
        savedAt: Date.now(),
        planIds: existing?.planIds ?? planIds,
        label: existing?.label ?? groceryLabel(plans, planIds),
        lines: rows.map((row) => ({
          name: row.name,
          servings: row.servings,
          have: Boolean(have[row.name]),
          packages: Math.max(0, packages[row.name] ?? row.packages),
        })),
      };
      const rest = lists.filter((list) => list.id !== next.id);
      await writeGroceryLists([next, ...rest]);
      onNotify("Grocery list saved.");
      onOpen({ kind: "grocery", listId: next.id });
    } catch {
      onNotify("Could not save that grocery list.");
    } finally {
      setSaving(false);
    }
  };

  if (!rows.length) {
    return <p className="text-sm text-muted">Those dates have no ingredients the library can add up.</p>;
  }

  return (
    <>
      <p className="text-sm text-muted">
        Used in the meals: {money(consumed)}. Mark what you already have. What is left becomes whole packages from the library.
      </p>
      {groups.map((group) => (
        <section key={group.category} className="flex flex-col gap-3">
          <h3 className="font-display text-lg font-semibold">{group.category}</h3>
          {group.subs.map((sub) => (
            <div key={sub.sub} className="flex flex-col gap-2">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">{sub.sub}</p>
              {sub.rows.map((row) => (
                <article key={row.name} className="rounded-card border border-line bg-surface px-3 py-3">
                  <p className="text-sm font-semibold">{row.name}</p>
                  <p className="mt-0.5 text-sm tabular-nums text-muted">
                    {row.usedLabel} used · {money(row.consumedCost)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={Boolean(have[row.name])} onChange={() => setHave((current) => ({ ...current, [row.name]: true }))} className="size-4 accent-tomato" />
                      Have already
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={!have[row.name]} onChange={() => setHave((current) => ({ ...current, [row.name]: false }))} className="size-4 accent-tomato" />
                      Need to buy
                    </label>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </section>
      ))}
      <section className="flex flex-col gap-2">
        <h3 className="font-display text-lg font-semibold">To buy</h3>
        {buyingRows.length ? (
          buyingRows.map((row) => (
            <PackageRow
              key={row.name}
              row={row}
              count={packages[row.name] ?? row.packages}
              onCount={(count) => setPackages((current) => ({ ...current, [row.name]: count }))}
            />
          ))
        ) : (
          <p className="text-sm text-muted">Nothing to buy. Everything is marked as already on hand.</p>
        )}
        <p className="text-sm font-semibold tabular-nums">Estimated purchase {money(purchase)}</p>
      </section>
      <button type="button" disabled={saving} onClick={() => void save()} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-50">
        {saving ? "Saving…" : "Save grocery list"}
      </button>
    </>
  );
}

function PackageRow({ row, count, onCount }: { row: GroceryRow; count: number; onCount: (count: number) => void }) {
  const price = Math.max(0, count) * row.packagePrice;
  return (
    <article className="rounded-card border border-line bg-surface px-3 py-3">
      <p className="text-sm font-semibold">{row.name}</p>
      <p className="mt-0.5 text-sm text-muted">{row.usedLabel} used</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{packLabel(row, count)} · {money(price)}</p>
      <p className="mt-0.5 text-sm text-muted">{productTitle(row.product)}</p>
      {count > 1 ? <p className="mt-0.5 text-xs tabular-nums text-muted">{money(row.packagePrice)} each</p> : null}
      <div className="mt-2 flex items-center gap-2">
        <button type="button" aria-label={`Fewer ${row.name}`} onClick={() => onCount(Math.max(0, count - 1))} className="inline-flex size-11 items-center justify-center rounded-full border border-line text-lg">
          −
        </button>
        <input
          aria-label={`${row.name} packages`}
          inputMode="numeric"
          value={String(count)}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            onCount(Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0);
          }}
          className="h-11 w-16 rounded-2xl border border-line bg-bg text-center text-sm font-semibold tabular-nums outline-none focus:border-tomato"
        />
        <button type="button" aria-label={`More ${row.name}`} onClick={() => onCount(count + 1)} className="inline-flex size-11 items-center justify-center rounded-full border border-line text-lg">
          +
        </button>
        <span className="ml-auto text-sm font-semibold tabular-nums">{money(price)}</span>
      </div>
      {count > 2 ? <p className="mt-1 text-xs text-muted">More than two packages. Change the count if you want fewer.</p> : null}
    </article>
  );
}

function productTitle(product: string): string {
  const cut = product.split(",")[0]?.trim();
  return cut || product;
}

export function GroceryIndex({ onOpen }: { onOpen: (route: PlanRoute) => void }) {
  const [lists, setLists] = useState<GroceryList[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const load = () => {
      readGroceryLists()
        .then(setLists)
        .catch(() => setLists([]));
    };
    load();
    window.addEventListener(CLOUD_EVENT, load);
    return () => window.removeEventListener(CLOUD_EVENT, load);
  }, []);
  const picked = lists?.filter((list) => chosen.includes(list.id)) ?? [];
  const canBuy = picked.some((list) => !list.bought);
  const canUnmark = picked.some((list) => list.bought);
  const toggle = (id: string) => setChosen((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const change = async (next: GroceryList[]) => {
    setBusy(true);
    try {
      await writeGroceryLists(next);
      setLists(next);
      setChosen([]);
    } finally {
      setBusy(false);
    }
  };
  if (!lists) return <p className="text-sm text-muted">Loading grocery lists…</p>;
  if (!lists.length) return <p className="text-sm text-muted">No grocery lists saved yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canBuy || busy}
          onClick={() => {
            const boughtAt = new Date().toLocaleDateString("en-CA");
            void change(lists.map((list) => (chosen.includes(list.id) && !list.bought ? { ...list, bought: true, boughtAt, lines: list.lines.map((line) => ({ ...line, have: true })) } : list)));
          }}
          className={`inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold ${canBuy ? "border-line bg-surface text-ink" : "border-line bg-bg text-muted opacity-45"}`}
        >
          Mark bought
        </button>
        <button
          type="button"
          disabled={!canUnmark || busy}
          onClick={() => void change(lists.map((list) => (chosen.includes(list.id) && list.bought ? { ...list, bought: false, boughtAt: null, lines: list.lines.map((line) => ({ ...line, have: false })) } : list)))}
          className={`inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold ${canUnmark ? "border-line bg-surface text-ink" : "border-line bg-bg text-muted opacity-45"}`}
        >
          Unmark bought
        </button>
        <button
          type="button"
          disabled={!chosen.length || busy}
          onClick={() => void change(lists.filter((list) => !chosen.includes(list.id)))}
          className={`inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold ${chosen.length ? "border-line bg-surface text-ink" : "border-line bg-bg text-muted opacity-45"}`}
        >
          Delete
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {lists.map((list) => {
          const buying = new Set(list.lines.filter((line) => !line.have).map((line) => line.name));
          const packages = new Map(list.lines.map((line) => [line.name, line.packages]));
          const rows = list.lines.flatMap((line) => {
            const row = rowFor(line.name, line.servings, line.packages);
            return row ? [row] : [];
          });
          const when = new Date(list.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
          const boughtWhen = list.boughtAt ? new Date(`${list.boughtAt}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : when;
          const selected = chosen.includes(list.id);
          return (
            <li key={list.id} className="flex items-center gap-2">
              <button type="button" aria-pressed={selected} aria-label={`Select ${list.label}`} onClick={() => toggle(list.id)} className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full border ${selected ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"}`}>
                {selected ? <Check className="size-4" /> : null}
              </button>
              <button type="button" onClick={() => onOpen({ kind: "grocery", listId: list.id })} className={`min-w-0 flex-1 rounded-card border bg-surface px-3 py-3 text-left ${list.bought ? "border-gold" : "border-line"}`}>
                <span className="flex items-center gap-2">
                  <span className="min-w-0 truncate font-semibold">{list.label}</span>
                  {list.bought ? <span className="shrink-0 rounded-full bg-gold-bg px-2 py-0.5 text-[10px] font-semibold tracking-wide text-gold uppercase">Bought</span> : null}
                </span>
                <span className="text-sm text-muted">
                  {list.bought ? `Bought ${boughtWhen}` : `Saved ${when} · ${money(purchaseCost(rows, buying, packages))} to buy`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function GroceryDetail({
  listId,
  editing,
  plans,
  catalog,
  onOpen,
  onNotify,
}: {
  listId: string;
  editing?: boolean;
  plans: MealPlan[];
  catalog: ReadonlyMap<string, Recipe>;
  onOpen: (route: PlanRoute) => void;
  onNotify: (message: string) => void;
}) {
  const [list, setList] = useState<GroceryList | null | undefined>(undefined);
  useEffect(() => {
    const load = () => {
      readGroceryLists()
        .then((lists) => setList(lists.find((item) => item.id === listId) ?? null))
        .catch(() => setList(null));
    };
    load();
    window.addEventListener(CLOUD_EVENT, load);
    return () => window.removeEventListener(CLOUD_EVENT, load);
  }, [listId]);
  if (list === undefined) return <p className="text-sm text-muted">Loading grocery list…</p>;
  if (!list) return <p className="text-sm text-muted">That grocery list is no longer saved.</p>;
  if (editing) return <ShopCheckout plans={plans} planIds={list.planIds} catalog={catalog} existing={list} onOpen={onOpen} onNotify={onNotify} />;
  return <PurchaseList list={list} onUpdate={() => onOpen({ kind: "groceryEdit", listId: list.id })} />;
}

function PurchaseList({ list, onUpdate }: { list: GroceryList; onUpdate: () => void }) {
  const buying = list.lines.filter((line) => !line.have && line.packages > 0);
  const rows = buying.flatMap((line) => {
    const row = rowFor(line.name, line.servings, line.packages);
    return row ? [row] : [];
  });
  const total = rows.reduce((sum, row) => sum + row.packages * row.packagePrice, 0);
  return (
    <>
      <p className="text-sm text-muted">{list.label}</p>
      {rows.length ? (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.name} className="rounded-card border border-line bg-surface px-3 py-3">
              <p className="text-sm font-semibold">{row.name}</p>
              <p className="mt-0.5 text-sm text-muted">{row.usedLabel} used</p>
              <p className="mt-0.5 text-sm text-muted">{productTitle(row.product)}</p>
              <p className="mt-1 flex items-baseline justify-between gap-3 text-sm tabular-nums">
                <span>{packLabel(row, row.packages)}</span>
                <span className="font-semibold">{money(row.packages * row.packagePrice)}</span>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nothing to buy. Everything is marked as already on hand.</p>
      )}
      <p className="text-sm font-semibold tabular-nums">Estimated purchase {money(total)}</p>
      <button type="button" onClick={onUpdate} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink">
        Update list
      </button>
    </>
  );
}
