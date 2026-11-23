import { useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import { IngredientSwap, KitchenField } from "@/components/plans/plate";
import { FindMacros } from "@/components/plans/find";
import { CLOUD_EVENT } from "@/lib/cloud/sync";
import { datedName, defaultMacroName, EMPTY_GOALS, todayKey, type BeefChoice, type DaySplit, type MacroGoals, type PersonGroup, type SavedMacroGoal, type SavedPerson, type SnackDraw } from "@/lib/plans/model";
import { kitchenChoices, servingsForAmount } from "@/lib/plans/kitchen";
import { householdSupplementNames, rankFor, tagSupplement, writePersonRank, type SupplementRank } from "@/lib/plans/supplements";
import { loadToppings, toppingStarsFor, writeToppingStars } from "@/lib/plans/toppings";
import { readPersonGroups, readSavedMacroGoals, readSavedPeople, writePersonGroups, writeSavedMacroGoal, writeSavedMacroGoals, writeSavedPeople } from "@/lib/recipes/idb";
import { ingredientTitle, searchIngredients } from "@/lib/sourced";

export function UserProfiles({ onClose }: { onClose: () => void }) {
  const [people, setPeople] = useState<SavedPerson[]>([]);
  const [personId, setPersonId] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const load = () => {
      readSavedPeople().then(setPeople).catch(() => setPeople([]));
    };
    load();
    window.addEventListener(CLOUD_EVENT, load);
    return () => window.removeEventListener(CLOUD_EVENT, load);
  }, []);
  const person = people.find((item) => item.id === personId) ?? null;
  if (person && finding) {
    return <FindMacros personId={person.id} onOpen={() => setFinding(false)} onNotify={setNotice} />;
  }
  return (
    <div className="fixed inset-0 z-40 flex h-dvh flex-col overflow-hidden bg-bg">
      <header className="shrink-0 border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <button type="button" onClick={() => (person ? setPersonId(null) : onClose())} className="inline-flex h-11 items-center rounded-full px-2 text-sm font-semibold">
            ← Back
          </button>
          <h1 className="min-w-0 flex-1 truncate font-display text-xl font-semibold">{person ? person.name : "People"}</h1>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-3">
          {person ? (
            <PersonProfile person={person} people={people} onPeople={setPeople} onFind={() => setFinding(true)} notice={notice} />
          ) : (
            <>
              <p className="text-sm text-muted">These stay on this household login. Each person can have their own macros and supplement order.</p>
              <AddPerson people={people} onSaved={setPeople} />
              {people.map((item) => (
                <button key={item.id} type="button" onClick={() => setPersonId(item.id)} className="flex h-14 items-center justify-between rounded-card border border-line bg-surface px-4 text-left">
                  <span className="font-semibold">{item.name}</span>
                  <span className="text-sm text-muted">Profile</span>
                </button>
              ))}
              <PeopleGroups people={people} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PeopleGroups({ people }: { people: SavedPerson[] }) {
  const [groups, setGroups] = useState<PersonGroup[]>([]);
  const [editing, setEditing] = useState<PersonGroup | "new" | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    const load = () => {
      readPersonGroups().then(setGroups).catch(() => setGroups([]));
    };
    load();
    window.addEventListener(CLOUD_EVENT, load);
    return () => window.removeEventListener(CLOUD_EVENT, load);
  }, []);
  const save = async (group: PersonGroup) => {
    const name = group.name.trim();
    if (!name) {
      setNote("Name the group.");
      return;
    }
    if (!group.personIds.length) {
      setNote("Add at least one person.");
      return;
    }
    if (groups.some((item) => item.id !== group.id && item.name.toLowerCase() === name.toLowerCase())) {
      setNote("That group name is already used.");
      return;
    }
    const next = groups.some((item) => item.id === group.id) ? groups.map((item) => (item.id === group.id ? { ...group, name } : item)) : [...groups, { ...group, name }];
    await writePersonGroups(next);
    setGroups(next);
    setEditing(null);
    setNote(`${name} saved.`);
  };
  const remove = async (id: string) => {
    const next = groups.filter((group) => group.id !== id);
    await writePersonGroups(next);
    setGroups(next);
    setNote("Group removed.");
  };
  return (
    <section className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <h2 className="font-display text-lg font-semibold">Groups</h2>
      <p className="text-sm text-muted">A named subset of the people above.</p>
      {editing ? (
        <GroupForm
          people={people}
          group={editing === "new" ? { id: crypto.randomUUID(), name: "", personIds: [] } : editing}
          onCancel={() => setEditing(null)}
          onSave={(group) => void save(group)}
        />
      ) : (
        <button type="button" onClick={() => setEditing("new")} className="h-11 self-start rounded-full border border-line bg-surface px-4 text-sm font-semibold">
          New group
        </button>
      )}
      {groups.length ? (
        <ul className="flex flex-col gap-2">
          {groups.map((group) => {
            const names = group.personIds.map((id) => people.find((person) => person.id === id)?.name).filter((name): name is string => Boolean(name));
            return (
              <li key={group.id} className="flex items-center gap-2 rounded-card border border-line bg-surface px-3 py-2">
                <button type="button" onClick={() => setEditing(group)} className="min-w-0 flex-1 py-1 text-left">
                  <span className="block font-semibold">{group.name}</span>
                  <span className="block text-xs text-muted">{names.length ? names.join(", ") : "No one in this group"}</span>
                </button>
                <button type="button" onClick={() => void remove(group.id)} className="h-11 shrink-0 rounded-full px-2 text-sm font-semibold text-muted">
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      ) : editing ? null : (
        <p className="text-sm text-muted">No groups yet.</p>
      )}
      {note ? <p className="text-sm text-muted">{note}</p> : null}
    </section>
  );
}

function GroupForm({ people, group, onCancel, onSave }: { people: SavedPerson[]; group: PersonGroup; onCancel: () => void; onSave: (group: PersonGroup) => void }) {
  const [name, setName] = useState(group.name);
  const [ids, setIds] = useState<string[]>(group.personIds);
  const toggle = (id: string) => setIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
      <label className="block text-sm font-semibold">
        Group name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name this group" className="mt-1 h-11 w-full rounded-2xl border border-line bg-bg px-3 text-sm font-normal outline-none focus:border-tomato" />
      </label>
      {people.length ? (
        <div className="flex flex-wrap gap-2">
          {people.map((person) => {
            const on = ids.includes(person.id);
            return (
              <button key={person.id} type="button" aria-pressed={on} onClick={() => toggle(person.id)} className={`h-11 rounded-full px-3 text-sm font-semibold ${on ? "bg-tomato text-tomato-ink" : "border border-line bg-bg"}`}>
                {person.name}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted">Add people above before you can put them in a group.</p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => onSave({ ...group, name, personIds: ids })} className="h-11 rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink">
          Save group
        </button>
        <button type="button" onClick={onCancel} className="h-11 rounded-full border border-line px-4 text-sm font-semibold">
          Cancel
        </button>
      </div>
    </div>
  );
}

function AddPerson({ people, onSaved }: { people: SavedPerson[]; onSaved: (people: SavedPerson[]) => void }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const save = async () => {
    const next = name.trim();
    if (!next) return;
    if (people.some((person) => person.name.toLowerCase() === next.toLowerCase())) {
      setNote("That person is already saved.");
      return;
    }
    const nextPeople = [...people, { id: crypto.randomUUID(), name: next }];
    await writeSavedPeople(nextPeople);
    onSaved(nextPeople);
    setName("");
    setNote(`${next} saved.`);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          aria-label="New person name"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save();
          }}
          placeholder="Add a name"
          className="h-11 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-3 text-sm outline-none focus:border-tomato"
        />
        <button type="button" onClick={() => void save()} className="h-11 rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink">
          Add person
        </button>
      </div>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
    </div>
  );
}

function PersonProfile({ person, people, onPeople, onFind, notice }: { person: SavedPerson; people: SavedPerson[]; onPeople: (people: SavedPerson[]) => void; onFind: () => void; notice: string }) {
  const [name, setName] = useState(person.name);
  const [goals, setGoals] = useState<MacroGoals>(EMPTY_GOALS);
  const [existing, setExisting] = useState<SavedMacroGoal | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    setName(person.name);
    const load = () => {
      readSavedMacroGoals()
        .then((saved) => {
          const match = saved.find((goal) => goal.forPersonId === person.id) ?? null;
          setExisting(match);
          setGoals(match ? { ...EMPTY_GOALS, ...match.goals, mode: "grams" } : EMPTY_GOALS);
        })
        .catch(() => setExisting(null));
    };
    load();
    window.addEventListener(CLOUD_EVENT, load);
    return () => window.removeEventListener(CLOUD_EVENT, load);
  }, [person.id, person.name]);
  const saveName = async () => {
    const next = name.trim();
    if (!next || next === person.name) return;
    if (people.some((item) => item.id !== person.id && item.name.toLowerCase() === next.toLowerCase())) {
      setNote("That name is already used.");
      return;
    }
    const nextPeople = people.map((item) => (item.id === person.id ? { ...item, name: next } : item));
    await writeSavedPeople(nextPeople);
    onPeople(nextPeople);
    const saved = await readSavedMacroGoals();
    const changed = saved.map((goal) => (goal.forPersonId === person.id ? { ...goal, forName: next } : goal));
    if (changed.some((goal, index) => goal.forName !== saved[index]?.forName)) await writeSavedMacroGoals(changed);
    setNote("Name saved.");
  };
  const saveMacros = async () => {
    for (const field of GRAM_FIELDS) {
      if (goals[field.key].trim() && !/^\d+(\.\d+)?$/.test(goals[field.key].trim())) {
        setNote(`${field.label} needs a number.`);
        return;
      }
    }
    const protein = Number(goals.protein) || 0;
    const carbs = Number(goals.carbs) || 0;
    const fat = Number(goals.fat) || 0;
    const calories = protein || carbs || fat ? String(Math.round(protein * 4 + carbs * 4 + fat * 9)) : "";
    const savedOn = existing?.savedOn || todayKey();
    const record: SavedMacroGoal = {
      name: existing?.name ?? datedName(defaultMacroName(savedOn), savedOn),
      savedOn,
      goals: { ...goals, mode: "grams", protein: goals.protein.trim(), carbs: goals.carbs.trim(), fat: goals.fat.trim(), calories },
      forPersonId: person.id,
      forName: name.trim() || person.name,
    };
    await writeSavedMacroGoal(record);
    setExisting(record);
    setNote("Macros saved for this person.");
  };
  const savePrefs = async (patch: { daySplit?: DaySplit; snackDraw?: SnackDraw; beefChoice?: BeefChoice; plateMeat?: string; plateMeatServings?: number }) => {
    const nextPeople = people.map((item) => (item.id === person.id ? { ...item, ...patch } : item));
    await writeSavedPeople(nextPeople);
    onPeople(nextPeople);
  };
  return (
    <>
      <label className="block text-sm font-semibold">
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm font-normal outline-none focus:border-tomato" />
      </label>
      <button type="button" onClick={() => void saveName()} className="h-11 self-start rounded-full border border-line px-4 text-sm font-semibold">
        Save name
      </button>
      <h2 className="pt-2 text-sm font-semibold tracking-wide text-muted uppercase">Daily macros</h2>
      <p className="text-sm text-muted">Tailor uses the newest goal saved for this person. Calories are figured from the grams.</p>
      <button type="button" onClick={onFind} className="h-11 self-start rounded-full border border-line bg-surface px-4 text-sm font-semibold">
        Find my macros
      </button>
      {GRAM_FIELDS.map((field) => (
        <label key={field.key} className="block text-sm font-semibold">
          {field.label} <span className="font-normal text-muted">(g)</span>
          <input
            inputMode="decimal"
            value={goals[field.key]}
            placeholder="0"
            onChange={(event) => setGoals((current) => ({ ...current, [field.key]: event.target.value }))}
            className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm font-normal outline-none focus:border-tomato"
          />
        </label>
      ))}
      <button type="button" onClick={() => void saveMacros()} className="h-11 self-start rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink">
        Save macros
      </button>
      {note || notice ? <p className="text-sm text-muted">{note || notice}</p> : null}
      <h2 className="pt-2 text-sm font-semibold tracking-wide text-muted uppercase">Tailor</h2>
      <p className="text-sm text-muted">Used when this person's day is tailored. Either keeps the recipe's own ground beef.</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Two meals</span>
        <ChoiceChip label="50 / 50" selected={person.daySplit !== "25-75"} onClick={() => void savePrefs({ daySplit: "50-50" })} />
        <ChoiceChip label="25 / 75" selected={person.daySplit === "25-75"} onClick={() => void savePrefs({ daySplit: "25-75" })} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Snack comes out of</span>
        <ChoiceChip label="Lunch" selected={person.snackDraw !== "supper"} onClick={() => void savePrefs({ snackDraw: "lunch" })} />
        <ChoiceChip label="Supper" selected={person.snackDraw === "supper"} onClick={() => void savePrefs({ snackDraw: "supper" })} />
      </div>
      <PreferredPlateMeat person={person} onSave={(plateMeat, plateMeatServings) => void savePrefs({ plateMeat, plateMeatServings })} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Ground beef</span>
        <ChoiceChip label="80/20" selected={person.beefChoice === "80/20"} onClick={() => void savePrefs({ beefChoice: "80/20" })} />
        <ChoiceChip label="73/27" selected={person.beefChoice === "73/27"} onClick={() => void savePrefs({ beefChoice: "73/27" })} />
        <ChoiceChip label="Either" selected={person.beefChoice !== "80/20" && person.beefChoice !== "73/27"} onClick={() => void savePrefs({ beefChoice: "either" })} />
      </div>
      <h2 className="pt-2 text-sm font-semibold tracking-wide text-muted uppercase">Preferred supplements</h2>
      <PreferredSupplements personId={person.id} />
      <h2 className="pt-2 text-sm font-semibold tracking-wide text-muted uppercase">Starred toppings</h2>
      <StarredToppings personId={person.id} />
    </>
  );
}

const GRAM_FIELDS = [
  { key: "protein", label: "Protein" },
  { key: "carbs", label: "Net carbs" },
  { key: "fat", label: "Fat" },
] as const;

function poundsAsServings(name: string): number {
  const pound = kitchenChoices(name).find((choice) => choice.id === "lb");
  return pound ? servingsForAmount(1, pound) : 1;
}

function PreferredPlateMeat({ person, onSave }: { person: SavedPerson; onSave: (meat: string, servings: number) => void }) {
  const [open, setOpen] = useState(false);
  const meat = person.plateMeat?.trim() ?? "";
  const servings = meat ? (person.plateMeatServings && person.plateMeatServings > 0 ? person.plateMeatServings : poundsAsServings(meat)) : 0;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">New plate meat</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className={`h-11 min-w-0 flex-1 truncate rounded-2xl border border-line bg-surface px-3 text-left text-sm font-semibold ${meat ? "" : "text-muted"}`}>
          {meat ? ingredientTitle(meat) : "Select meat"}
        </button>
        {meat ? <KitchenField key={meat} value={servings} name={meat} label="Default meat amount" onChange={(next) => onSave(meat, next)} /> : null}
        {meat ? (
          <button type="button" aria-label="Clear preferred meat" onClick={() => onSave("", 0)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted">
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      {open ? (
        <IngredientSwap
          current={meat || "meat"}
          scope="meat"
          onClose={() => setOpen(false)}
          onPick={(name) => {
            onSave(name, meat === name && servings > 0 ? servings : poundsAsServings(name));
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function ChoiceChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={`h-11 rounded-full px-3 text-sm font-semibold ${selected ? "bg-tomato text-tomato-ink" : "border border-line bg-surface"}`}>
      {label}
    </button>
  );
}

function StarredToppings({ personId }: { personId: string }) {
  const [ids, setIds] = useState<string[]>(() => toppingStarsFor(personId));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const refresh = () => {
      setIds(toppingStarsFor(personId));
      setTick((value) => value + 1);
    };
    refresh();
    window.addEventListener(CLOUD_EVENT, refresh);
    return () => window.removeEventListener(CLOUD_EVENT, refresh);
  }, [personId]);
  const toppings = loadToppings();
  const starred = ids.flatMap((id) => {
    const item = toppings.find((entry) => entry.id === id);
    if (!item) return [];
    const family = toppings.filter((entry) => entry.baseId === item.baseId).sort((a, b) => a.version - b.version);
    const parent = family[0];
    const label = parent && item.id !== parent.id ? `${item.title} ${item.versionLabel || `V${item.version}`}` : item.title;
    return [{ id, label }];
  });
  const drop = (id: string) => {
    const next = ids.filter((item) => item !== id);
    setIds(next);
    writeToppingStars(personId, next);
  };
  return (
    <>
      <p className="text-sm text-muted">Saved for this person. A filled star on the toppings list is one of these.</p>
      {starred.length ? (
        <ul className="flex flex-col gap-2">
          {starred.map((item) => (
            <li key={`${item.id}-${tick}`} className="flex items-center gap-2 rounded-card border border-line bg-surface px-3 py-2">
              <button type="button" aria-label={`Unstar ${item.label}`} onClick={() => drop(item.id)} className="inline-flex size-11 shrink-0 items-center justify-center text-gold">
                <Star className="size-4 fill-current" />
              </button>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.label}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">No starred toppings yet.</p>}
    </>
  );
}

function PreferredSupplements({ personId }: { personId: string }) {
  const [names, setNames] = useState<string[]>(() => householdSupplementNames());
  const [rank, setRank] = useState<SupplementRank>(() => rankFor(personId));
  useEffect(() => {
    const refresh = () => {
      setNames(householdSupplementNames());
      setRank(rankFor(personId));
    };
    refresh();
    window.addEventListener(CLOUD_EVENT, refresh);
    return () => window.removeEventListener(CLOUD_EVENT, refresh);
  }, [personId]);
  const setOrder = (name: string, value: string) => {
    const next = { ...rank, order: renumber(names, rank.order, name, value) };
    setRank(next);
    writePersonRank(next);
  };
  return (
    <>
      <p className="text-sm text-muted">Same household list. 1 is tried first for this person. A blank number keeps the household order.</p>
      <RankList names={names} order={rank.order} onChange={setOrder} />
    </>
  );
}

function RankList({ names, order, onChange }: { names: string[]; order: string[]; onChange: (name: string, value: string) => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {names.map((name) => {
        const place = order.indexOf(name);
        return (
          <li key={name} className="flex items-center gap-2 rounded-card border border-line bg-surface px-3 py-2">
            <input
              inputMode="numeric"
              aria-label={`Rank for ${ingredientTitle(name)}`}
              value={place >= 0 ? String(place + 1) : ""}
              placeholder="—"
              onChange={(event) => onChange(name, event.target.value.replace(/[^\d]/g, ""))}
              className="h-11 w-14 rounded-2xl border border-line bg-bg text-center text-sm font-semibold tabular-nums outline-none focus:border-tomato"
            />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{ingredientTitle(name)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function renumber(names: string[], order: string[], name: string, value: string): string[] {
  const wanted = value.trim() ? Number(value) : 0;
  const kept = order.filter((item) => item !== name && names.includes(item));
  if (!wanted) return kept;
  const next = [...kept];
  next.splice(Math.min(wanted, next.length + 1) - 1, 0, name);
  return next;
}

export function HouseholdSupplements({ onClose }: { onClose: () => void }) {
  const [names, setNames] = useState<string[]>(() => householdSupplementNames());
  const [query, setQuery] = useState("");
  useEffect(() => {
    const refresh = () => setNames(householdSupplementNames());
    window.addEventListener(CLOUD_EVENT, refresh);
    return () => window.removeEventListener(CLOUD_EVENT, refresh);
  }, []);
  const needle = query.trim().toLowerCase();
  const hits = needle ? searchIngredients(needle).slice(0, 8) : [];
  const change = (name: string, on: boolean) => {
    tagSupplement(name, on);
    setNames(householdSupplementNames());
  };
  return (
    <div className="fixed inset-0 z-40 flex h-dvh flex-col overflow-hidden bg-bg">
      <header className="shrink-0 border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center rounded-full px-2 text-sm font-semibold">
            ← Back
          </button>
          <h1 className="min-w-0 flex-1 truncate font-display text-xl font-semibold">Supplements</h1>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-3">
          <p className="text-sm text-muted">Ingredients tagged Supplement. Rank the order on each person's profile. Search here to tag another one.</p>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the ingredient library"
            className="h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm outline-none focus:border-tomato"
          />
          {needle ? (
            <ul className="flex flex-col gap-1">
              {hits.map((item) => (
                <li key={item.name}>
                  <button type="button" disabled={names.includes(item.name)} onClick={() => change(item.name, true)} className="flex h-11 w-full items-center justify-between rounded-2xl border border-line bg-surface px-3 text-left text-sm disabled:opacity-50">
                    <span className="min-w-0 truncate">{ingredientTitle(item.name)}</span>
                    <span className="shrink-0 text-xs text-muted">{names.includes(item.name) ? "Added" : "Add"}</span>
                  </button>
                </li>
              ))}
              {!hits.length ? <li className="text-sm text-muted">Nothing matches.</li> : null}
            </ul>
          ) : null}
          <ul className="flex flex-col gap-2">
            {names.map((name) => (
              <li key={name} className="flex items-center gap-2 rounded-card border border-line bg-surface px-3">
                <span className="min-w-0 flex-1 truncate py-3 text-sm font-semibold">{ingredientTitle(name)}</span>
                <button type="button" aria-label={`Remove ${name}`} onClick={() => change(name, false)} className="inline-flex size-11 items-center justify-center text-sm font-semibold text-muted">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
