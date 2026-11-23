import { Check, ChevronDown, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  collectUsage,
  extraRow,
  groceryLabel,
  groupRows,
  money,
  packLabel,
  packageMeasure,
  parentBuy,
  parentPackage,
  purchaseCost,
  rowFor,
  rowsFromUsage,
  type GroceryList,
  type GroceryRow,
} from "@/lib/plans/grocery";
import { CLOUD_EVENT } from "@/lib/cloud/sync";
import { datedName, todayKey, type MealPlan, type PlanRoute } from "@/lib/plans/model";
import { householdSupplementNames } from "@/lib/plans/supplements";
import { groupPlateNames, plateIngredientNames } from "@/components/plans/plate";
import { restockNames, seedRestock } from "@/lib/sourced/tags";
import { readGroceryLists, writeGroceryLists } from "@/lib/recipes/idb";
import type { Recipe } from "@/lib/recipes/types";
import { getIngredient, ingredientTitle, searchIngredients, type SourcedIngredient } from "@/lib/sourced";

export function ShopCheckout({
  plans,
  planIds,
  catalog,
  existing,
  restock = false,
  restockList = false,
  cartOpen: cartOpenProp,
  onCartOpen,
  onOpen,
  onNotify,
}: {
  plans: MealPlan[];
  planIds: string[];
  catalog: ReadonlyMap<string, Recipe>;
  existing?: GroceryList | null;
  restock?: boolean;
  restockList?: boolean;
  cartOpen?: boolean;
  onCartOpen?: (open: boolean) => void;
  onOpen: (route: PlanRoute) => void;
  onNotify: (message: string) => void;
}) {
  const totals = useMemo(() => {
    if (existing) return new Map(existing.lines.filter((line) => !line.extra).map((line) => [line.name, line.servings]));
    return collectUsage(plans, planIds, catalog);
  }, [existing, plans, planIds, catalog]);
  const rows = useMemo(() => rowsFromUsage(totals, existing?.lines), [totals, existing]);
  const [have, setHave] = useState<Record<string, boolean>>(() => Object.fromEntries((existing?.lines ?? []).map((line) => [line.name, line.have])));
  const [packages, setPackages] = useState<Record<string, number>>(() => Object.fromEntries(rows.map((row) => [row.name, row.packages])));
  const [extras, setExtras] = useState<Array<{ name: string; wanted: number }>>(() => (existing?.lines ?? []).filter((line) => line.extra).map((line) => ({ name: line.name, wanted: line.servings })));
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [cartOpenState, setCartOpenState] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [plateOpen, setPlateOpen] = useState(false);
  const [openCats, setOpenCats] = useState<string[]>([]);
  const cartOpen = cartOpenProp ?? cartOpenState;
  const setCartOpen = (open: boolean) => {
    onCartOpen?.(open);
    if (cartOpenProp == null) setCartOpenState(open);
  };
  const plateNames = useMemo(() => {
    if (restock) {
      seedRestock([...plateIngredientNames(), ...householdSupplementNames().filter((name) => getIngredient(name))]);
      return restockNames()
        .filter((name) => getIngredient(name))
        .sort((a, b) => ingredientTitle(a).localeCompare(ingredientTitle(b), undefined, { sensitivity: "base" }));
    }
    if (!restockList) return [];
    return plateIngredientNames().slice().sort((a, b) => ingredientTitle(a).localeCompare(ingredientTitle(b), undefined, { sensitivity: "base" }));
  }, [restock, restockList]);

  useEffect(() => {
    setPackages(Object.fromEntries(rows.map((row) => [row.name, existing?.lines.find((line) => line.name === row.name)?.packages ?? row.packages])));
    if (existing) setHave(Object.fromEntries(existing.lines.map((line) => [line.name, line.have])));
  }, [existing, rows]);

  const buying = useMemo(() => new Set(rows.filter((row) => !have[row.name]).map((row) => row.name)), [rows, have]);
  const packageMap = useMemo(() => new Map(Object.entries(packages)), [packages]);
  const extraRows = extras.flatMap((item) => {
    const buy = parentBuy(item.name, item.wanted);
    const row = buy ? extraRow(item.name, buy.count) : null;
    return row ? [row] : [];
  });
  const consumed = rows.reduce((sum, row) => sum + row.consumedCost, 0);
  const purchase = purchaseCost(rows, buying, packageMap) + extraRows.reduce((sum, row) => sum + row.packages * row.packagePrice, 0);
  const groups = groupRows(rows);
  const buyingRows = rows.filter((row) => buying.has(row.name));
  const hits = query.trim() ? groceryHits(query).slice(0, 24) : [];

  const save = async () => {
    setSaving(true);
    try {
      const lists = await readGroceryLists();
      const next: GroceryList = {
        id: existing?.id ?? `groc-${Date.now().toString(36)}`,
        savedAt: Date.now(),
        planIds: existing?.planIds ?? planIds,
        label: restock ? datedName(existing?.label ?? "Restock", todayKey()) : existing?.label ?? groceryLabel(plans, planIds),
        lines: [
          ...rows.map((row) => ({
            name: row.name,
            servings: row.servings,
            have: Boolean(have[row.name]),
            packages: Math.max(0, packages[row.name] ?? row.packages),
          })),
          ...extras
            .map((item) => {
              const buy = parentBuy(item.name, item.wanted);
              const packages = restock && item.wanted <= 0 ? 0 : buy?.count ?? 1;
              return { name: item.name, servings: item.wanted, have: false, packages, extra: true as const };
            }),
        ],
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

  const needle = query.trim().toLowerCase();
  const plateShown = plateNames.filter((name) => !needle || name.toLowerCase().includes(needle) || ingredientTitle(name).toLowerCase().includes(needle));
  const plateGroups = groupPlateNames(plateShown);
  const otherHits = restock && needle ? groceryHits(query).filter((item) => !plateNames.includes(item.name)).slice(0, 16) : [];
  const addExtra = (name: string, wanted: number) => {
    setExtras((current) => {
      const next = { name, wanted };
      return current.some((row) => row.name === name) ? current.map((row) => (row.name === name ? next : row)) : [next, ...current];
    });
    setDraft((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    if (!restock) setQuery("");
  };
  const cartTotal = extras.reduce((sum, item) => sum + (item.wanted > 0 ? parentBuy(item.name, item.wanted)?.price ?? 0 : 0), 0);
  const commitFrom = (name: string, wanted: number, source?: HTMLElement) => {
    addExtra(name, wanted);
    if (source) flyToCart(source);
    setPulse(true);
    window.setTimeout(() => setPulse(false), 420);
  };

  return (
    <>
      {restock && !cartOpen ? (
        <button
          type="button"
          data-restock-cart
          onClick={() => setCartOpen(true)}
          className={`fixed top-2.5 right-[4.6rem] z-50 inline-flex h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-semibold shadow-sm transition-transform ${pulse ? "scale-110" : ""}`}
        >
          <ShoppingCart className="size-4" />
          <span className="tabular-nums">{money(cartTotal)}</span>
        </button>
      ) : null}
      {restock && cartOpen ? (
        <RestockCart
          items={extras}
          total={cartTotal}
          saving={saving}
          onBack={() => setCartOpen(false)}
          onWanted={(name, wanted) => setExtras((current) => current.map((row) => (row.name === name ? { ...row, wanted } : row)))}
          onRemove={(name) => {
            setExtras((current) => current.filter((row) => row.name !== name));
            setDraft((current) => {
              const next = { ...current };
              delete next[name];
              return next;
            });
          }}
          onSave={() => void save()}
        />
      ) : (
      <>
      <div className={restock ? "sticky top-16 z-20 bg-bg pb-2" : "relative"}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={restock ? "Search ingredients" : "Search ingredients to add"}
          className="h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm outline-none focus:border-tomato"
        />
        {restock ? null : query.trim() ? (
          <ul className="absolute z-20 mt-1 flex max-h-72 w-full flex-col overflow-y-auto rounded-card border border-line bg-surface shadow-lg">
            {hits.length ? (
              hits.map((item) => {
                const wanted = draft[item.name] ?? 0;
                return (
                  <li key={item.name} className="flex flex-col gap-2 border-b border-line px-3 py-2 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 text-sm font-semibold">{ingredientTitle(item)}</span>
                      <button
                        type="button"
                        onClick={() => addExtra(item.name, draft[item.name] ?? 0)}
                        className="inline-flex h-9 shrink-0 items-center rounded-full bg-tomato px-3 text-sm font-semibold text-tomato-ink"
                      >
                        Add
                      </button>
                    </div>
                    <WantAndPackage name={item.name} wanted={wanted} onWanted={(value) => setDraft((current) => ({ ...current, [item.name]: value }))} />
                  </li>
                );
              })
            ) : (
              <li className="px-3 py-3 text-sm text-muted">Nothing in the library matches that.</li>
            )}
          </ul>
        ) : null}
      </div>
      {restockList ? (
        <section className="rounded-card border border-line bg-surface">
          <button type="button" aria-expanded={plateOpen} onClick={() => setPlateOpen((open) => !open)} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left">
            <span className="text-sm font-semibold">Bookmarked Build a Plate Ingredients</span>
            <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${plateOpen ? "rotate-180" : ""}`} />
          </button>
          {plateOpen ? (
            <div className="flex flex-col gap-2 border-t border-line px-3 py-3">
              {plateNames.length ? plateNames.map((name) => {
                const saved = extras.find((item) => item.name === name);
                const shown = draft[name] ?? saved?.wanted ?? 0;
                const dirty = saved != null && draft[name] != null && draft[name] !== saved.wanted;
                return (
                  <AddChoice
                    key={name}
                    name={name}
                    wanted={shown}
                    added={saved != null}
                    dirty={dirty}
                    onWanted={(value) => setDraft((current) => ({ ...current, [name]: value }))}
                    onCommit={(source) => commitFrom(name, shown, source)}
                    onCancel={() => setDraft((current) => {
                      const next = { ...current };
                      delete next[name];
                      return next;
                    })}
                  />
                );
              }) : <p className="text-sm text-muted">No plate ingredients yet.</p>}
            </div>
          ) : null}
        </section>
      ) : null}
      {restock ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Plate ingredients for a fridge refill. Search finds anything else.</p>
          {plateGroups.map((group) => {
            const open = Boolean(needle) || openCats.includes(group.category);
            return (
              <section key={group.category} className="rounded-2xl border border-line bg-surface">
                <button type="button" aria-expanded={open} onClick={() => setOpenCats((current) => (current.includes(group.category) ? current.filter((item) => item !== group.category) : [...current, group.category]))} className="flex h-11 w-full items-center gap-2 px-3 text-left">
                  <ChevronDown className={`size-4 shrink-0 text-muted motion-safe:transition-transform ${open ? "" : "-rotate-90"}`} />
                  <span className="min-w-0 flex-1 text-xs font-semibold tracking-wide text-muted uppercase">{group.category}</span>
                  <span className="text-xs text-muted">{group.names.length}</span>
                </button>
                {open ? (
                  <div className="flex flex-col gap-2 border-t border-line px-2 py-2">
                    {group.names.map((name) => {
                      const saved = extras.find((item) => item.name === name);
                      const shown = draft[name] ?? saved?.wanted ?? 0;
                      const dirty = saved != null && draft[name] != null && draft[name] !== saved.wanted;
                      return (
                        <AddChoice
                          key={name}
                          name={name}
                          wanted={shown}
                          added={saved != null}
                          dirty={dirty}
                          onWanted={(value) => setDraft((current) => ({ ...current, [name]: value }))}
                          onCommit={(source) => commitFrom(name, shown, source)}
                          onCancel={() => setDraft((current) => {
                            const next = { ...current };
                            delete next[name];
                            return next;
                          })}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
          {needle && otherHits.length ? <p className="pt-2 text-xs font-semibold tracking-wide text-muted uppercase">Other ingredients</p> : null}
          {otherHits.map((item) => {
            const saved = extras.find((row) => row.name === item.name);
            const shown = draft[item.name] ?? saved?.wanted ?? 0;
            const dirty = saved != null && draft[item.name] != null && draft[item.name] !== saved.wanted;
            return (
              <AddChoice
                key={item.name}
                name={item.name}
                wanted={shown}
                added={saved != null}
                dirty={dirty}
                onWanted={(value) => setDraft((current) => ({ ...current, [item.name]: value }))}
                onCommit={(source) => commitFrom(item.name, shown, source)}
                onCancel={() => setDraft((current) => {
                  const next = { ...current };
                  delete next[item.name];
                  return next;
                })}
              />
            );
          })}
          {needle && !plateShown.length && !otherHits.length ? <p className="text-sm text-muted">Nothing in the library matches that.</p> : null}
          {!plateNames.length && !needle ? <p className="text-sm text-muted">No plate ingredients yet. Search to add something.</p> : null}
        </div>
      ) : null}
      {extraRows.length && !restock ? (
        <section className="flex flex-col gap-2">
          {restockList ? null : (
            <>
              <h3 className="font-display text-lg font-semibold">Single items</h3>
              <p className="text-sm text-muted">Leave the amount at 0 to buy one package. Otherwise it rounds up to whole packages.</p>
            </>
          )}
          {extras.map((item) => (
              <article key={item.name} className="rounded-card border border-line bg-surface px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{ingredientTitle(item.name)}</p>
                  <button type="button" onClick={() => setExtras((current) => current.filter((row) => row.name !== item.name))} className="text-sm font-semibold text-muted">
                    Remove
                  </button>
                </div>
                <div className="mt-2">
                  <ParentPackage name={item.name} wanted={item.wanted} onWanted={(value) => setExtras((current) => current.map((row) => (row.name === item.name ? { ...row, wanted: value } : row)))} />
                </div>
              </article>
            ))}
        </section>
      ) : null}
      {restock || existing ? null : rows.length ? (
      <p className="text-sm text-muted">
        Used in the meals: {money(consumed)}. Mark what you already have. What is left becomes whole packages from the library.
      </p>
      ) : existing ? null : (
        <p className="text-sm text-muted">Those dates have no ingredients the library can add up. You can still add single items.</p>
      )}
      {existing ? null : groups.map((group) => (
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
      {restock || restockList ? null : (
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
      )}
      {restockList ? <p className="text-sm font-semibold tabular-nums">Estimated purchase {money(purchase)}</p> : null}
      <button type="button" disabled={saving || restock} onClick={() => void save()} className={`h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-50 ${restock ? "hidden" : ""}`}>
        {saving ? "Saving…" : "Save grocery list"}
      </button>
      </>
      )}
    </>
  );
}

function PackageRow({ row, count, onCount }: { row: GroceryRow; count: number; onCount: (count: number) => void }) {
  const price = Math.max(0, count) * row.packagePrice;
  const [text, setText] = useState(() => formatQty(count));
  useEffect(() => setText(formatQty(count)), [count]);
  return (
    <article className="rounded-card border border-line bg-surface px-3 py-3">
      <p className="text-sm font-semibold">{ingredientTitle(row.name)}</p>
      {row.usedLabel === "Added" ? null : <p className="mt-0.5 text-sm text-muted">Recipes need {row.usedLabel} · {money(row.consumedCost)}</p>}
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{packLabel(row, count)} · {money(price)}</p>
      <p className="mt-0.5 text-sm text-muted">{productTitle(row.product)}</p>
      {count > 1 ? <p className="mt-0.5 text-xs tabular-nums text-muted">{money(row.packagePrice)} each</p> : null}
      <div className="mt-2 flex items-center gap-2">
        <button type="button" aria-label={`Fewer ${row.name}`} onClick={() => onCount(Math.max(0, roundQty(count - 1)))} className="inline-flex size-11 items-center justify-center rounded-full border border-line text-lg">
          −
        </button>
        <input
          aria-label={`${row.name} packages`}
          inputMode="decimal"
          value={text}
          onChange={(event) => {
            const value = event.target.value;
            if (!/^\d*\.?\d{0,2}$/.test(value)) return;
            setText(value);
            if (value === "" || value === "." || value.endsWith(".")) return;
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed > 0) onCount(parsed);
          }}
          onBlur={() => {
            const parsed = Number(text);
            if (!text.trim() || !Number.isFinite(parsed) || parsed <= 0) onCount(0);
            else onCount(roundQty(parsed));
          }}
          className="h-11 w-20 rounded-2xl border border-line bg-bg text-center text-sm font-semibold tabular-nums outline-none focus:border-tomato"
        />
        <button type="button" aria-label={`More ${row.name}`} onClick={() => onCount(roundQty(count + 1))} className="inline-flex size-11 items-center justify-center rounded-full border border-line text-lg">
          +
        </button>
        <span className="ml-auto text-sm font-semibold tabular-nums">{money(price)}</span>
      </div>
      {count > 2 ? <p className="mt-1 text-xs text-muted">More than two packages. Change the count if you want fewer.</p> : null}
    </article>
  );
}

function groceryHits(query: string): SourcedIngredient[] {
  const needle = query.trim().toLowerCase();
  return searchIngredients(query)
    .slice()
    .sort((a, b) => groceryRank(a, needle) - groceryRank(b, needle) || ingredientTitle(a).localeCompare(ingredientTitle(b)));
}

function groceryRank(item: SourcedIngredient, needle: string): number {
  const name = item.name.toLowerCase();
  const title = ingredientTitle(item).toLowerCase();
  const words = `${name} ${title}`.split(/[^a-z0-9]+/);
  if (name === needle || title === needle) return 0;
  if (name.startsWith(needle) || title.startsWith(needle)) return 1;
  if (words.includes(needle)) return 1;
  if (name.includes(needle) || title.includes(needle)) return 2;
  return 3;
}

function AddChoice({
  name,
  wanted,
  added,
  dirty,
  onWanted,
  onCommit,
  onCancel,
}: {
  name: string;
  wanted: number;
  added: boolean;
  dirty: boolean;
  onWanted: (value: number) => void;
  onCommit: (source: HTMLElement) => void;
  onCancel: () => void;
}) {
  const label = !added ? "Add" : dirty ? "Update" : "Added";
  const [warn, setWarn] = useState(false);
  const warnTimer = useRef<number | null>(null);
  const tryCommit = (source: HTMLElement) => {
    if (!added && wanted <= 0) {
      setWarn(false);
      window.requestAnimationFrame(() => setWarn(true));
      if (warnTimer.current) window.clearTimeout(warnTimer.current);
      warnTimer.current = window.setTimeout(() => setWarn(false), 520);
      return;
    }
    onCommit(source);
  };
  return (
    <article className="flex flex-col gap-2 rounded-card border border-line bg-surface px-3 py-2">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 pt-1.5 text-sm font-semibold">{ingredientTitle(name)}</span>
        <div className="flex shrink-0 flex-col items-end">
          <button
            type="button"
            disabled={added && !dirty}
            onClick={(event) => tryCommit(event.currentTarget)}
            className={`inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold ${added && !dirty ? "bg-tomato/45 text-tomato-ink" : "bg-tomato text-tomato-ink"}`}
          >
            {label}
          </button>
          {dirty ? (
            <button type="button" onClick={onCancel} className="mt-4 px-1 text-xs font-semibold text-muted">
              Cancel
            </button>
          ) : null}
        </div>
      </div>
      <ParentPackage name={name} wanted={wanted} onWanted={onWanted} zero alert={warn} />
    </article>
  );
}

function RestockCart({
  items,
  total,
  saving,
  onBack,
  onWanted,
  onRemove,
  onSave,
}: {
  items: Array<{ name: string; wanted: number }>;
  total: number;
  saving: boolean;
  onBack: () => void;
  onWanted: (name: string, wanted: number) => void;
  onRemove: (name: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onBack} className="self-start text-sm font-semibold text-muted">
        Keep shopping
      </button>
      {items.length ? (
        items.map((item) => (
          <article key={item.name} className="rounded-card border border-line bg-surface px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold">{ingredientTitle(item.name)}</p>
              <button type="button" onClick={() => onRemove(item.name)} className="text-sm font-semibold text-muted">
                Remove
              </button>
            </div>
            <div className="mt-2">
              <ParentPackage name={item.name} wanted={item.wanted} onWanted={(value) => onWanted(item.name, value)} zero />
            </div>
          </article>
        ))
      ) : (
        <p className="text-sm text-muted">Nothing in the cart yet.</p>
      )}
      <p className="text-sm font-semibold tabular-nums">Estimated purchase {money(total)}</p>
      <button type="button" disabled={saving || !items.length} onClick={onSave} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-50">
        {saving ? "Saving…" : "Save grocery list"}
      </button>
    </div>
  );
}

function flyToCart(source: HTMLElement) {
  const cart = document.querySelector("[data-restock-cart]");
  if (!cart) return;
  const from = source.getBoundingClientRect();
  const to = cart.getBoundingClientRect();
  const chip = document.createElement("div");
  chip.textContent = "Added";
  chip.className = "pointer-events-none fixed z-[70] rounded-full bg-tomato px-3 py-1 text-xs font-semibold text-tomato-ink";
  chip.style.left = `${from.left}px`;
  chip.style.top = `${from.top}px`;
  document.body.appendChild(chip);
  requestAnimationFrame(() => {
    chip.style.transition = "transform 480ms cubic-bezier(.2,.8,.2,1), opacity 480ms ease";
    chip.style.transform = `translate(${to.left + to.width / 2 - from.left - 24}px, ${to.top + to.height / 2 - from.top - 12}px) scale(0.55)`;
    chip.style.opacity = "0.15";
  });
  window.setTimeout(() => chip.remove(), 520);
}

function ParentPackage({ name, wanted, onWanted, zero = false, alert = false }: { name: string; wanted: number; onWanted: (value: number) => void; zero?: boolean; alert?: boolean }) {
  const buy = parentBuy(name, wanted);
  const pack = parentPackage(name);
  const one = pack ? parentBuy(name, pack.servings) : null;
  if (!buy || !pack || !one) return null;
  const count = zero ? (wanted > 0 ? buy.count : 0) : buy.count;
  return (
    <div className="flex items-center gap-2">
      <AmountField
        value={count}
        min={zero ? 0 : 1}
        alert={alert}
        onChange={(next) => {
          const packages = Math.max(zero ? 0 : 1, Math.round(next));
          onWanted(packages <= 0 ? 0 : roundQty(packages * pack.servings));
        }}
      />
      <span className="text-sm font-semibold">
        {pack.name}
        <span className="mt-0.5 block tabular-nums text-muted">{money(zero ? one.price * (count > 1 ? count : 1) : buy.price)}</span>
      </span>
    </div>
  );
}

function AmountField({ value, unit, min = 0, alert = false, onChange }: { value: number; unit?: string; min?: number; alert?: boolean; onChange: (value: number) => void }) {
  const [text, setText] = useState(() => formatQty(value));
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => setText(formatQty(value)), [value]);
  useEffect(() => {
    if (!alert || !box.current) return;
    box.current.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-5px)" },
        { transform: "translateX(5px)" },
        { transform: "translateX(-4px)" },
        { transform: "translateX(3px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 380, easing: "ease-in-out" },
    );
  }, [alert]);
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="Less" onClick={() => onChange(Math.max(min, roundQty(value - 1)))} className="inline-flex size-11 items-center justify-center rounded-full border border-line text-lg">
        −
      </button>
      <input
        ref={box}
        aria-label="Amount wanted"
        inputMode="decimal"
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          if (!/^\d*\.?\d{0,2}$/.test(next)) return;
          setText(next);
          if (next === "" || next === "." || next.endsWith(".")) return;
          const parsed = Number(next);
          if (Number.isFinite(parsed) && parsed >= min) onChange(parsed);
        }}
        onBlur={() => {
          const parsed = Number(text);
          onChange(!text.trim() || !Number.isFinite(parsed) || parsed < min ? min : roundQty(parsed));
        }}
        className={`h-11 w-16 rounded-2xl border bg-bg text-center text-sm font-semibold tabular-nums outline-none focus:border-tomato ${alert ? "border-red-500" : "border-line"}`}
      />
      {unit ? <span className="w-8 shrink-0 text-sm text-muted">{unit}</span> : null}
      <button type="button" aria-label="More" onClick={() => onChange(roundQty(value + 1))} className="inline-flex size-11 items-center justify-center rounded-full border border-line text-lg">
        +
      </button>
    </div>
  );
}

function WantAndPackage({ name, wanted, onWanted }: { name: string; wanted: number; onWanted: (value: number) => void }) {
  const buy = parentBuy(name, wanted);
  const pack = parentPackage(name);
  const measure = packageMeasure(name);
  if (!buy || !pack || !measure) return null;
  const shown = wanted * measure.each;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <AmountField value={shown} unit={measure.unit} onChange={(amount) => onWanted(amount <= 0 ? 0 : amount / measure.each)} />
      <div className="flex items-center gap-2">
        <AmountField value={buy.count} min={1} onChange={(count) => onWanted(roundQty(Math.max(1, count) * pack.servings))} />
        <span className="text-sm font-semibold">
          {pack.name}
          <span className="mt-0.5 block tabular-nums text-muted">{money(buy.price)}</span>
        </span>
      </div>
    </div>
  );
}

function formatQty(value: number): string {
  const rounded = roundQty(value);
  return String(rounded);
}

function roundQty(value: number): number {
  return Math.round(value * 100) / 100;
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
  onRestock,
}: {
  listId: string;
  editing?: boolean;
  plans: MealPlan[];
  catalog: ReadonlyMap<string, Recipe>;
  onOpen: (route: PlanRoute) => void;
  onNotify: (message: string) => void;
  onRestock?: (restock: boolean) => void;
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
  const restock = list ? isRestockList(list) : false;
  useEffect(() => {
    onRestock?.(Boolean(list) && restock);
  }, [list, restock, editing, onRestock]);
  if (list === undefined) return <p className="text-sm text-muted">Loading grocery list…</p>;
  if (!list) return <p className="text-sm text-muted">That grocery list is no longer saved.</p>;
  if (editing) return <ShopCheckout plans={plans} planIds={list.planIds} catalog={catalog} existing={list} restockList={restock} onOpen={onOpen} onNotify={onNotify} />;
  return <PurchaseList list={list} restock={restock} onUpdate={() => onOpen({ kind: "groceryEdit", listId: list.id })} />;
}

function isRestockList(list: GroceryList): boolean {
  return list.label.trim().toLowerCase().startsWith("restock");
}

function PurchaseList({ list, restock = false, onUpdate }: { list: GroceryList; restock?: boolean; onUpdate: () => void }) {
  const buying = list.lines.filter((line) => !line.have && line.packages > 0 && !line.extra);
  const added = list.lines.filter((line) => line.extra && line.packages > 0);
  const rows = buying.flatMap((line) => {
    const row = rowFor(line.name, line.servings, line.packages);
    return row ? [row] : [];
  });
  const addedRows = added.flatMap((line) => {
    const row = extraRow(line.name, line.packages);
    return row ? [row] : [];
  });
  const total = [...rows, ...addedRows].reduce((sum, row) => sum + row.packages * row.packagePrice, 0);
  return (
    <>
      <p className="text-sm font-semibold tabular-nums">Estimated purchase {money(total)}</p>
      {restock ? null : (
        <button type="button" onClick={onUpdate} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink">
          Edit list
        </button>
      )}
      <p className="text-sm text-muted">{list.label}</p>
      {addedRows.length ? (
        <section className="flex flex-col gap-2">
          {restock ? null : <h3 className="font-display text-lg font-semibold">Single items</h3>}
          {addedRows.map((row) => (
            <GroceryCard key={row.name} row={row} />
          ))}
        </section>
      ) : null}
      {rows.length ? (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <GroceryCard key={row.name} row={row} />
          ))}
        </ul>
      ) : addedRows.length ? null : (
        <p className="text-sm text-muted">Nothing to buy. Everything is marked as already on hand.</p>
      )}
    </>
  );
}

function GroceryCard({ row }: { row: GroceryRow }) {
  return (
    <li className="rounded-card border border-line bg-surface px-3 py-3">
      <p className="text-sm font-semibold">{row.name}</p>
      <p className="mt-0.5 text-sm text-muted">{row.usedLabel === "Added" ? "Added" : `${row.usedLabel} used`}</p>
      <p className="mt-0.5 text-sm text-muted">{productTitle(row.product)}</p>
      <p className="mt-1 flex items-baseline justify-between gap-3 text-sm tabular-nums">
        <span>{packLabel(row, row.packages)}</span>
        <span className="font-semibold">{money(row.packages * row.packagePrice)}</span>
      </p>
    </li>
  );
}
