import { Check } from "lucide-react";
import { useState } from "react";
import { aisle, describeUse } from "@/lib/plans/grocery";
import { formatDay, mealPerson, peopleForDay, planDates, SLOT_LABEL, SLOT_ORDER, twoPeople, type MealPlan, type MealSlot, type PlannedMeal } from "@/lib/plans/model";
import type { Recipe } from "@/lib/recipes/types";
import { getIngredient } from "@/lib/sourced";
import { cookParts, formatSide, libraryServingLabel, mealScale, recipeFromLines, usedLibraryServings, type CookPart } from "@/lib/sourced/meal";

const CATEGORY_ORDER = ["Meat", "Dairy", "Produce", "Fats", "Pantry", "Other"];

export function CookLegend() {
  return (
    <p className="flex flex-wrap items-center gap-3 text-xs text-muted">
      <span className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-full bg-tomato" /> Picked</span>
      <span className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-full bg-sage" /> Prepped</span>
      <span className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-full bg-cook" /> Cooked</span>
    </p>
  );
}

export function CookBoard({
  plan,
  onOpen,
}: {
  plan: MealPlan;
  onOpen: (route: { kind: "prep" | "cooking"; planId: string; mealIds: string[] }) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const days = planDates(plan);
  const toggle = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  return (
    <>
      <CookLegend />
      <p className="text-sm text-muted">Tap the meals and snacks to cook. Names stay plain. Red means picked for prep or cook.</p>
      <ul className="flex flex-col gap-2">
        {days.map((date) => {
          const when = new Date(`${date}T12:00:00`);
          const roster = peopleForDay(plan, date);
          const people = roster.length ? roster : !plan.dayPeople && !twoPeople(plan) ? [null] : [];
          return (
            <li key={date} className="rounded-card border border-line bg-surface p-2">
              <div className="flex items-start gap-2">
                <div className="w-12 shrink-0 pt-1">
                  <span className="block text-xs text-muted">{when.toLocaleDateString(undefined, { weekday: "short" })}</span>
                  <span className="font-display text-lg font-semibold">{when.getDate()}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {people.map((person) => {
                    const meals = (plan.days[date] ?? [])
                      .filter((meal) => !person || mealPerson(meal, plan) === person.id)
                      .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
                    return (
                      <div key={person?.id ?? "one"} className="rounded-2xl border border-line px-2 py-2">
                        <p className="mb-1 text-sm font-semibold">{person?.name || "Meals"}</p>
                        {meals.length ? (
                          <div className="flex flex-col gap-1">
                            {meals.map((meal) => {
                              const on = picked.includes(meal.id);
                              const mark = plan.cook?.[meal.id];
                              const tone = on
                                ? "border-tomato bg-tomato text-tomato-ink"
                                : mark === "cooked"
                                  ? "border-cook bg-cook text-cook-ink"
                                  : mark === "prepped"
                                    ? "border-sage bg-sage text-sage-ink"
                                    : "border-line bg-chip text-ink";
                              return (
                                <button key={meal.id} type="button" aria-pressed={on} onClick={() => toggle(meal.id)} className={`min-h-11 w-full rounded-2xl border px-3 py-2 text-left text-sm font-semibold ${tone}`}>
                                  {SLOT_LABEL[meal.slot]} · {meal.title}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-muted">No meals</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2">
        <button type="button" disabled={!picked.length} onClick={() => onOpen({ kind: "prep", planId: plan.id, mealIds: picked })} className="h-11 rounded-full border border-line bg-surface text-sm font-semibold disabled:opacity-45">
          Prep ingredients
        </button>
        <button type="button" disabled={!picked.length} onClick={() => onOpen({ kind: "cooking", planId: plan.id, mealIds: picked })} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink disabled:opacity-45">
          Cook now
        </button>
      </div>
    </>
  );
}

export function PrepPage({
  plan,
  mealIds,
  catalog,
  onCook,
  onPrepped,
}: {
  plan: MealPlan;
  mealIds: string[];
  catalog: ReadonlyMap<string, Recipe>;
  onCook: () => void;
  onPrepped: () => void;
}) {
  const groups = gatherGroups(plan, catalog, mealIds);
  return (
    <>
      <p className="text-sm text-muted">Gather these for the meals you picked. Open a category to see the amounts.</p>
      <IngredientFolders groups={groups} startOpen />
      <div className="flex flex-col gap-2">
        <button type="button" onClick={onPrepped} className="h-11 rounded-full bg-sage text-sm font-semibold text-sage-ink">
          Prepped complete
        </button>
        <button type="button" onClick={onCook} className="h-11 rounded-full bg-tomato text-sm font-semibold text-tomato-ink">
          Cook now
        </button>
      </div>
    </>
  );
}

export function CookingPage({
  plan,
  mealIds,
  catalog,
  onMark,
}: {
  plan: MealPlan;
  mealIds: string[];
  catalog: ReadonlyMap<string, Recipe>;
  onMark: (ids: string[]) => void;
}) {
  const groups = cookGroups(plan, catalog, mealIds);
  const [picked, setPicked] = useState<string[]>(mealIds);
  const [checks, setChecks] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  return (
    <>
      <p className="text-sm text-muted">Same recipe for two people uses one method. Each name keeps its own amounts. Cook them apart, or in one pan and divide by those amounts.</p>
      <IngredientFolders groups={gatherGroups(plan, catalog, mealIds)} startOpen={false} label="All ingredients" />
      <ul className="flex flex-col gap-3">
        {groups.map((group) => (
          <li key={group.key} className="rounded-card border border-line bg-surface px-3 py-3">
            <p className="text-xs text-muted">{formatDay(group.date)} · {SLOT_LABEL[group.slot]}</p>
            <p className="mt-1 font-display text-lg font-semibold">{group.title}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {group.people.map((person) => {
                const on = picked.includes(person.mealId);
                return (
                  <button key={person.mealId} type="button" aria-pressed={on} onClick={() => toggle(person.mealId)} className={`h-10 rounded-full border px-3 text-sm font-semibold ${on ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-bg"}`}>
                    {person.name}
                  </button>
                );
              })}
            </div>
            {group.people[0]?.part.image ? (
              <img src={group.people[0].part.image} alt="" referrerPolicy="no-referrer" className="mt-3 h-44 w-full rounded-2xl object-cover" />
            ) : null}
            <p className="mt-1 text-xs text-muted">Tap a name, then Mark cooked. Check an ingredient when it is in the pan.</p>
            {group.people.length > 1 ? (
              <p className="mt-2 text-sm leading-snug text-muted">Cook this once if the steps match. Keep each person's food in its own pan when the amounts differ a lot. Otherwise cook it together, then divide onto separate plates using the amounts under each name.</p>
            ) : null}
            <PartBlock groupKey={group.key} part={mergeParts(group.people)} depth={0} checks={checks} onToggle={(checkKey) => setChecks((current) => (current.includes(checkKey) ? current.filter((id) => id !== checkKey) : [...current, checkKey]))} />
          </li>
        ))}
      </ul>
      <button type="button" disabled={!picked.length} onClick={() => onMark(picked)} className="h-11 rounded-full bg-cook text-sm font-semibold text-cook-ink disabled:opacity-45">
        Mark cooked
      </button>
    </>
  );
}

function IngredientFolders({ groups, startOpen, label }: { groups: Array<{ category: string; lines: string[] }>; startOpen: boolean; label?: string }) {
  const [open, setOpen] = useState(startOpen);
  if (!groups.length) return <p className="text-sm text-muted">No library ingredients on these meals.</p>;
  return (
    <section className="rounded-card border border-line bg-surface">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex h-11 w-full items-center justify-between px-3 text-left text-sm font-semibold">
        {label ?? "Ingredients to gather"}
        <span className="text-xs text-muted">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="flex flex-col gap-3 px-3 pb-3">
          {groups.map((group) => (
            <div key={group.category} className="rounded-2xl border border-line bg-bg px-3 py-3">
              <p className="text-sm font-semibold">{group.category}</p>
              <ul className="mt-2 flex flex-col gap-2">
                {group.lines.map((line) => (
                  <li key={line} className="text-base leading-snug">{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function gatherGroups(plan: MealPlan, catalog: ReadonlyMap<string, Recipe>, mealIds: string[]): Array<{ category: string; lines: string[] }> {
  const wanted = new Set(mealIds);
  const hits: Array<{ who: string; recipeKey: string; date: string; servings: Map<string, number> }> = [];
  for (const date of planDates(plan)) {
    for (const meal of plan.days[date] ?? []) {
      if (!wanted.has(meal.id)) continue;
      const servings = new Map<string, number>();
      const recipe = meal.recipeUid ? catalog.get(meal.recipeUid) : undefined;
      if (recipe) {
        const basis = meal.lines?.length ? recipeFromLines(recipe, meal.lines) : recipe;
        for (const row of usedLibraryServings(basis, catalog, mealScale(meal), meal.meatTrim ?? 1, meal.carbItem, meal.carbScale, meal.tweaks, plan.beefChoice)) {
          servings.set(row.name, (servings.get(row.name) ?? 0) + row.servings);
        }
      }
      if (meal.sideName && meal.sideServings) servings.set(meal.sideName, (servings.get(meal.sideName) ?? 0) + meal.sideServings);
      const personId = mealPerson(meal, plan);
      const who = plan.people?.find((person) => person.id === personId)?.name || "You";
      hits.push({ who, recipeKey: `${date}\0${meal.recipeUid || meal.title}`, date, servings });
    }
  }
  const people = [...new Set(hits.map((hit) => hit.who))];
  const split = people.length > 1;
  const totals = new Map<string, Map<string, number>>();
  const add = (bucket: string, name: string, servings: number) => {
    const bag = totals.get(bucket) ?? new Map<string, number>();
    bag.set(name, (bag.get(name) ?? 0) + servings);
    totals.set(bucket, bag);
  };
  const byRecipe = new Map<string, typeof hits>();
  for (const hit of hits) {
    const list = byRecipe.get(hit.recipeKey) ?? [];
    list.push(hit);
    byRecipe.set(hit.recipeKey, list);
  }
  for (const group of byRecipe.values()) {
    const names = [...new Set(group.map((hit) => hit.who))];
    const shared = split && names.length > 1;
    for (const hit of group) {
      const bucket = shared ? "both" : split ? hit.who : "";
      for (const [name, servings] of hit.servings) add(bucket, name, servings);
    }
  }
  const cards: Array<{ category: string; lines: string[] }> = [];
  for (const category of CATEGORY_ORDER) {
    const heads = split ? ["both", ...people.filter((name) => name !== "both").sort((a, b) => a.localeCompare(b))] : [""];
    for (const who of heads) {
      const bag = totals.get(who);
      if (!bag) continue;
      const lines: string[] = [];
      for (const [name, servings] of bag) {
        const item = getIngredient(name);
        if (!item || servings <= 0) continue;
        if (aisle(name).category !== category) continue;
        const used = libraryServingLabel(name, servings) ?? describeUse(item, servings);
        const first = name.toLowerCase().split(/\s+/)[0]?.replace(/s$/, "");
        lines.push(first && used.toLowerCase().includes(first) ? used : `${used} ${name}`);
      }
      if (!lines.length) continue;
      lines.sort((a, b) => a.localeCompare(b));
      const label = who ? `${category} · ${who}` : category;
      cards.push({ category: label, lines });
    }
  }
  return cards;
}

function PartBlock({
  groupKey,
  part,
  depth,
  checks,
  onToggle,
}: {
  groupKey: string;
  part: MergedPart;
  depth: number;
  checks: string[];
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const photo = part.image ? <img src={part.image} alt="" referrerPolicy="no-referrer" className="mt-2 h-36 w-full rounded-2xl object-cover" /> : null;
  const body = (
    <>
      {depth > 0 ? photo : null}
      {part.subs.map((sub, index) => (
        <PartBlock key={`${sub.title}-${index}`} groupKey={`${groupKey}/${index}`} part={sub} depth={depth + 1} checks={checks} onToggle={onToggle} />
      ))}
      {part.steps.length ? (
        <StepList groupKey={`${groupKey}:${part.title}`} steps={part.steps} people={part.people} checks={checks} onToggle={onToggle} />
      ) : part.people.some((person) => person.ingredients.length) ? (
        <div className="mt-2">
          <IngredientChecks groupKey={`${groupKey}:${part.title}`} index={0} items={looseItems(part.people)} several={part.people.length > 1} checks={checks} onToggle={onToggle} />
        </div>
      ) : depth > 0 ? (
        <p className="mt-1 text-sm text-muted">No steps on this recipe.</p>
      ) : (
        <p className="mt-3 text-sm text-muted">This recipe has no written steps. Use the amounts in All ingredients.</p>
      )}
    </>
  );
  if (!depth) return <div className="mt-3 flex flex-col gap-3">{body}</div>;
  return (
    <div className="rounded-2xl border border-line bg-bg">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left">
        <span className="font-display text-base font-semibold">{part.title}</span>
        <span className="shrink-0 text-xs text-muted">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? <div className="flex flex-col gap-3 px-3 pb-3">{body}</div> : null}
    </div>
  );
}

function mergeParts(people: Array<{ name: string; part: CookPart }>): MergedPart {
  const first = people[0]?.part;
  const count = Math.max(0, ...people.map((person) => person.part.subs.length));
  return {
    title: first?.title || "Recipe",
    image: first?.image || "",
    steps: first?.steps ?? [],
    people: people.map((person) => ({ name: person.name, ingredients: person.part.ingredients })),
    subs: Array.from({ length: count }, (_, index) => mergeParts(people.filter((person) => person.part.subs[index]).map((person) => ({ name: person.name, part: person.part.subs[index]! })))),
  };
}

type MergedPart = {
  title: string;
  image: string;
  steps: string[];
  people: Array<{ name: string; ingredients: string[] }>;
  subs: MergedPart[];
};

function looseItems(people: Array<{ name: string; ingredients: string[] }>): StepItem[] {
  return assignSteps(["Use these."], people).steps[0]?.items ?? [];
}

function StepList({
  groupKey,
  steps,
  people,
  checks,
  onToggle,
}: {
  groupKey: string;
  steps: string[];
  people: Array<{ name: string; ingredients: string[] }>;
  checks: string[];
  onToggle: (key: string) => void;
}) {
  const assigned = assignSteps(steps, people);
  return (
    <>
      <ol className="mt-3 flex list-decimal flex-col gap-4 pl-5 text-base leading-snug">
        {assigned.steps.map((step, index) => (
          <li key={index}>
            {step.text}
            {step.items.length ? <IngredientChecks groupKey={groupKey} index={index} items={step.items} several={people.length > 1} checks={checks} onToggle={onToggle} /> : null}
          </li>
        ))}
      </ol>
      {assigned.supplements.length ? (
        <div className="mt-3">
          <p className="text-sm font-semibold">Supplement</p>
          <IngredientChecks groupKey={groupKey} index={-2} items={assigned.supplements} several={people.length > 1} checks={checks} onToggle={onToggle} />
        </div>
      ) : null}
      {assigned.rest.length ? (
        <div className="mt-3">
          <p className="text-sm font-semibold">Also used</p>
          <IngredientChecks groupKey={groupKey} index={-1} items={assigned.rest} several={people.length > 1} checks={checks} onToggle={onToggle} />
        </div>
      ) : null}
    </>
  );
}

function IngredientChecks({
  groupKey,
  index,
  items,
  several,
  checks,
  onToggle,
}: {
  groupKey: string;
  index: number;
  items: StepItem[];
  several: boolean;
  checks: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <ul className="mt-2 ml-1 flex list-none flex-col gap-2 border-l border-line pl-3">
      {items.map((item) => {
        const checkKey = `${groupKey}:${index}:${item.key}`;
        const checked = checks.includes(checkKey);
        return (
          <li key={item.key} className="flex items-start gap-2">
            <button type="button" aria-pressed={checked} aria-label={checked ? `Uncheck ${item.label}` : `Check ${item.label}`} onClick={() => onToggle(checkKey)} className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border ${checked ? "border-sage bg-sage text-sage-ink" : "border-line bg-bg"}`}>
              {checked ? <Check className="size-3" /> : null}
            </button>
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${checked ? "text-muted line-through" : ""}`}>{item.label}</p>
              {item.amounts.map((amount) => (
                amount.amount ? <p key={`${amount.person}-${amount.amount}`} className="text-sm text-muted">{several ? `${amount.person} · ` : ""}{amount.amount}</p> : null
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

type StepItem = { key: string; label: string; amounts: Array<{ person: string; amount: string }> };

function assignSteps(steps: string[], people: Array<{ name: string; ingredients: string[] }>): { steps: Array<{ text: string; items: StepItem[] }>; supplements: StepItem[]; rest: StepItem[] } {
  const catalog = new Map<string, StepItem & { spice: boolean; batter: boolean; supplement: boolean }>();
  for (const person of people) {
    for (const line of person.ingredients) {
      const supplement = /\*supplement\*/i.test(line);
      const split = splitLine(line);
      const label = split.label || line;
      const key = `${supplement ? "supplement:" : ""}${plain(label).replace(/[^a-z0-9]+/g, " ").trim()}`;
      if (key === "supplement:" || !key) continue;
      const row = catalog.get(key) ?? { key, label, amounts: [], spice: isSpice(label), batter: isBatter(label), supplement };
      if (split.amount) row.amounts.push({ person: person.name, amount: split.amount });
      catalog.set(key, row);
    }
  }
  const used = new Set<string>();
  const take = (key: string, row: StepItem & { spice: boolean; batter: boolean; supplement: boolean }, items: StepItem[]) => {
    if (used.has(key) || row.supplement) return;
    used.add(key);
    items.push({ key, label: row.label, amounts: row.amounts });
  };
  const allIndex = steps.findIndex((step) => claimsEveryIngredient(step));
  const best = new Map<string, { index: number; score: number }>();
  if (allIndex < 0) {
    steps.forEach((step, index) => {
      const text = plain(step);
      for (const [key, row] of catalog) {
        if (row.supplement) continue;
        const score = matchScore(text, row.label);
        const prev = best.get(key);
        if (score > 0 && (!prev || score > prev.score)) best.set(key, { index, score });
      }
    });
  }
  const planned = steps.map((step, index) => {
    const text = plain(step);
    const items: StepItem[] = [];
    if (allIndex >= 0) {
      if (index === allIndex) {
        for (const [key, row] of catalog) take(key, row, items);
      }
      return { text: step, items };
    }
    for (const [key, row] of catalog) {
      if (best.get(key)?.index === index) take(key, row, items);
    }
    const namedSpice = /\b(chili|cumin|paprika|oregano|salt|pepper|garlic|chipotle|cayenne)\b/.test(text);
    if ((/\b(spices?|seasonings?)\b/.test(text) || /\bseason\b/.test(text)) && !namedSpice) {
      for (const [key, row] of catalog) if (row.spice && !best.has(key)) take(key, row, items);
    }
    if (/\b(remaining|the rest|everything else)\b/.test(text)) {
      for (const [key, row] of catalog) take(key, row, items);
    }
    return { text: step, items };
  });
  const supplements = [...catalog.values()].filter((row) => row.supplement).map((row) => ({ key: row.key, label: row.label, amounts: row.amounts }));
  const rest = [...catalog.values()].filter((row) => !row.supplement && !used.has(row.key)).map((row) => ({ key: row.key, label: row.label, amounts: row.amounts }));
  return { steps: planned, supplements, rest };
}

function claimsEveryIngredient(step: string): boolean {
  const text = plain(step);
  if (/\b(spices?|seasonings?)\b/.test(text) && !/\bingredients?\b/.test(text)) return false;
  if (/\b(mix|beat|combine|stir|whisk|blend|fold)\s+all\b/.test(text)) return true;
  if (/\ball\s+(the\s+|of\s+the\s+)?ingredients?\b/.test(text)) return true;
  if (/\b(mix|beat|combine|stir|whisk|blend)\s+(everything|them all)\b/.test(text)) return true;
  return false;
}

function splitLine(line: string): { amount: string; label: string } {
  const marked = line.split(" || ");
  if (marked.length === 2) return { amount: marked[0].trim(), label: marked[1].trim() };
  const cleaned = line.replace(/\s*\([^)]*\)/g, " ").replace(/\*supplement\*/gi, "").replace(/\s+/g, " ").trim();
  const match = cleaned.match(/^([\d./¼½¾⅛⅜⅝⅞]+)(?:\s+(cups?|tbsp|tsp|teaspoons?|tablespoons?|lb|lbs|oz|g|kg|slices?|medium|large|small|cloves?|eggs?|pinch|dash))?\s+(.+)$/i);
  if (!match) return { amount: "", label: cleaned };
  const amount = [match[1], match[2]].filter(Boolean).join(" ");
  const label = match[3].trim();
  if (!label) return { amount: "", label: cleaned };
  return { amount, label };
}

function plain(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function wordsOf(label: string): string[] {
  const stop = new Set(["good", "quality", "finely", "shredded", "thinly", "sliced", "into", "about", "only", "more", "necessary", "warm", "golden", "medium", "large", "small", "fresh", "dried", "divided", "optional", "garnish", "wanted", "needed", "very", "least", "strips"]);
  return plain(label).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length >= 3 && !stop.has(word));
}

function matchScore(step: string, label: string): number {
  if (!mentions(step, label)) return 0;
  const words = wordsOf(label);
  let score = words.reduce((sum, word) => sum + (step.includes(word) ? word.length : 0), 0);
  const name = plain(label);
  if (/bell/.test(name) && /\bpeppers?\b/.test(step)) score += /\bbell\b|\bpeppers\b/.test(step) ? 8 : 0;
  if (/bell/.test(name) && /\bpepper\b/.test(step) && !/\bbell\b|\bpeppers\b/.test(step)) score = 1;
  if (/\b(beef|hamburger|ground|steak|chuck|brisket|roast|sirloin)\b/.test(name) && /\b(beef|hamburger|meat|ground)\b/.test(step)) score += 8;
  if (/powder/.test(name) && /\bonions?\b/.test(step) && !/\bpowder\b/.test(step)) score = Math.min(score, 1);
  return score;
}

function mentions(step: string, label: string): boolean {
  const words = wordsOf(label);
  if (words.some((word) => step.includes(word))) return true;
  const joined = words.join(" ");
  if (/\b(beef|hamburger|ground)\b/.test(joined) && /\b(beef|hamburger|meat|ground)\b/.test(step)) return true;
  if (/onion/.test(joined) && /\bonion/.test(step)) return true;
  if (/\b(cheese|cheddar|provolone)\b/.test(joined) && /\b(cheese|cheddar|provolone)\b/.test(step)) return true;
  return false;
}

function isSpice(label: string): boolean {
  return /\b(powder|salt|cumin|paprika|oregano|pepper|seasoning|chili|chipotle|cayenne|spice|cinnamon|nutmeg)\b/.test(plain(label));
}

function isBatter(label: string): boolean {
  return /\b(egg|flax|water|coconut)\b/.test(plain(label));
}

function cookGroups(plan: MealPlan, catalog: ReadonlyMap<string, Recipe>, mealIds: string[]) {
  const wanted = new Set(mealIds);
  const rows: Array<{ meal: PlannedMeal; date: string; person: string; part: CookPart }> = [];
  for (const date of planDates(plan)) {
    for (const meal of plan.days[date] ?? []) {
      if (!wanted.has(meal.id)) continue;
      const recipe = meal.recipeUid ? catalog.get(meal.recipeUid) : undefined;
      const basis = recipe && meal.lines?.length ? recipeFromLines(recipe, meal.lines) : recipe;
      const part = basis
        ? cookParts(basis, catalog, mealScale(meal), meal.meatTrim ?? 1, meal.carbItem, meal.carbScale, meal.tweaks, plan.beefChoice)
        : { title: meal.title, image: "", steps: [], ingredients: [], subs: [] };
      if (meal.sideName && meal.sideServings) part.ingredients.push(`*supplement* ${formatSide(meal.sideName, meal.sideServings)}`);
      const person = twoPeople(plan) ? plan.people?.find((item) => item.id === mealPerson(meal, plan))?.name || "Person" : "You";
      rows.push({ meal, date, person, part });
    }
  }
  const grouped = new Map<string, { key: string; date: string; slot: MealSlot; title: string; people: Array<{ mealId: string; name: string; part: CookPart }> }>();
  for (const row of rows) {
    const key = `${row.date}\0${row.meal.slot}\0${row.meal.recipeUid || row.meal.title}`;
    let group = grouped.get(key);
    if (!group) {
      group = { key, date: row.date, slot: row.meal.slot, title: row.meal.title, people: [] };
      grouped.set(key, group);
    }
    group.people.push({ mealId: row.meal.id, name: row.person, part: row.part });
  }
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date) || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
}
