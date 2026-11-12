import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AddPersonButton, PersonSelect, useSavedPeople } from "@/components/plans/people";
import { defaultMacroName, todayKey, type MacroGoals, type PlanRoute, type SavedMacroGoal } from "@/lib/plans/model";
import { findMacros, formatMacro, type MacroGrams, type MacroSex } from "@/lib/plans/findMacros";
import { readSavedMacroGoal, writeSavedMacroGoal } from "@/lib/recipes/idb";

const ACTIVITIES = [
  { value: "1.2", label: "1.2 — desk job, no training" },
  { value: "1.375", label: "1.375 — some training, or a lightly active job" },
  { value: "1.55", label: "1.55 — hard training, or a physical job" },
  { value: "1.725", label: "1.725 — hard training and a physical job" },
  { value: "1.9", label: "1.9 — training most days and a heavy job" },
];

export function FindMacros({ onOpen, onNotify }: { onOpen: (route: PlanRoute) => void; onNotify: (message: string) => void }) {
  const [sex, setSex] = useState<MacroSex>("Male");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [activity, setActivity] = useState("1.2");
  const [desired, setDesired] = useState("15");
  const [maintainFat, setMaintainFat] = useState("75");
  const [maintainCarbs, setMaintainCarbs] = useState("20");
  const [buildTarget, setBuildTarget] = useState("5");
  const [buildFat, setBuildFat] = useState("70");
  const [buildProtein, setBuildProtein] = useState("25");
  const [buildCarb, setBuildCarb] = useState("5");
  const [lossTarget, setLossTarget] = useState("5");
  const [lossFat, setLossFat] = useState("80");
  const [lossProtein, setLossProtein] = useState("18");
  const [lossCarb, setLossCarb] = useState("2");
  const [name, setName] = useState("");
  const [forPersonId, setForPersonId] = useState("");
  const people = useSavedPeople();
  const [saving, setSaving] = useState(false);
  const math = findMacros({
    sex,
    age: numberOrNaN(age),
    weightLbs: numberOrNaN(weight),
    bodyFat: numberOrNaN(bodyFat),
    activity: Number(activity),
    desiredBodyFat: numberOrNaN(desired),
    maintainFatPct: numberOrNaN(maintainFat),
    maintainCarbs: numberOrNaN(maintainCarbs),
    buildTargetPct: numberOrNaN(buildTarget),
    buildFatPct: numberOrNaN(buildFat),
    buildProteinPct: numberOrNaN(buildProtein),
    buildCarbPct: numberOrNaN(buildCarb),
    lossTargetPct: numberOrNaN(lossTarget),
    lossFatPct: numberOrNaN(lossFat),
    lossProteinPct: numberOrNaN(lossProtein),
    lossCarbPct: numberOrNaN(lossCarb),
  });
  const save = async (set: MacroGrams) => {
    setSaving(true);
    try {
      const existing = await readSavedMacroGoal();
      const savedOn = existing?.savedOn || todayKey();
      const goals: MacroGoals = {
        mode: "grams",
        calories: String(Math.round(set.calories)),
        protein: trim(set.protein),
        carbs: trim(set.carbs),
        fat: trim(set.fat),
        proteinPct: "",
        carbsPct: "",
        fatPct: "",
      };
      const chosen = people.find((item) => item.id === forPersonId);
      const record: SavedMacroGoal = {
        name: name.trim() || (chosen ? chosen.name : existing?.name) || defaultMacroName(savedOn),
        savedOn: chosen ? todayKey() : savedOn,
        goals,
      };
      if (chosen) {
        record.forPersonId = chosen.id;
        record.forName = chosen.name;
      }
      await writeSavedMacroGoal(record);
      onNotify("Daily macros saved.");
    } catch {
      onNotify("Could not save those macros.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/90 px-2 py-2 backdrop-blur">
          <button type="button" onClick={() => onOpen({ kind: "list" })} className="inline-flex h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold">
            <ArrowLeft className="size-4" />
            Back
          </button>
          <h2 className="min-w-0 flex-1 truncate font-display text-xl font-semibold">Find my Macros</h2>
          <button type="button" onClick={() => { window.location.hash = ""; }} className="inline-flex h-11 shrink-0 items-center rounded-full border border-line px-3 text-sm font-semibold">
            Home
          </button>
        </div>
        <div className="flex flex-col gap-4 px-4 py-4">
          <p className="text-sm text-muted">Same baseline as the Keto Savage calculator. Leave the person on one-person plan to update that goal. Choose a saved person to keep this goal for them. Tailor uses the newest goal for that person.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Sex
              <select value={sex} onChange={(event) => setSex(event.target.value === "Female" ? "Female" : "Male")} className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm">
                <option>Male</option>
                <option>Female</option>
              </select>
            </label>
            <Field label="Age" value={age} onChange={setAge} />
            <Field label="Weight (lb)" value={weight} onChange={setWeight} />
            <Field label="Body fat %" value={bodyFat} onChange={setBodyFat} />
            <Field label="Desired body fat %" value={desired} onChange={setDesired} />
          </div>
          <label className="block text-sm font-semibold">Activity
            <select value={activity} onChange={(event) => setActivity(event.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm">
              {ACTIVITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <p className="text-xs text-muted">The form uses 1.375 and 1.725. The written guide rounds those to 1.37 and 1.72. These use the form values.</p>
          {math ? (
            <section className="rounded-card border border-line bg-surface px-3 py-3 text-sm">
              <h3 className="font-semibold">Baseline</h3>
              <p className="mt-1 tabular-nums text-muted">{formatMacro(math.weightKg)} kg · lean {formatMacro(math.leanKg)} kg · fat mass {formatMacro(math.fatMassKg)} kg</p>
              <p className="tabular-nums text-muted">BMR {formatMacro(math.bmr)} · maintenance {formatMacro(math.tdee)}</p>
              <p className="mt-2 tabular-nums text-muted">Body fat to lose {formatMacro(math.fatPoints)} points ({formatMacro(math.fatShare)}% of current fat). Fat {formatMacro(math.fatToLoseKg)} kg. Total {formatMacro(math.weightToLoseKg)} kg, {formatMacro(math.weightToLoseLbs)} lb, treating 75% of the change as fat. Stage weight {formatMacro(math.stageWeightLbs)} lb. About {formatMacro(math.weeks)} weeks at 1 lb a week.</p>
            </section>
          ) : <p className="text-sm text-muted">Enter age, weight, and body fat to calculate.</p>}
          <Field label="Saved name" value={name} onChange={setName} />
          <PersonSelect people={people} value={forPersonId} label="Person" emptyLabel="One-person plan" onChange={setForPersonId} />
          <AddPersonButton people={people} onNotify={onNotify} />
          <section className="flex flex-col gap-2 rounded-card border border-line bg-surface px-3 py-3">
            <h3 className="text-sm font-semibold">Maintenance</h3>
            <p className="text-xs text-muted">Fat is that percent of maintenance calories. Carbs are the gram entry. Protein is whatever calories remain.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Fat % of calories" value={maintainFat} onChange={setMaintainFat} />
              <Field label="Carbs (g)" value={maintainCarbs} onChange={setMaintainCarbs} />
            </div>
            {math ? <Result set={math.maintenance} saving={saving} onSave={() => void save(math.maintenance)} /> : null}
          </section>
          <section className="flex flex-col gap-2 rounded-card border border-line bg-surface px-3 py-3">
            <h3 className="text-sm font-semibold">Lean mass</h3>
            <p className="text-xs text-muted">Calories are maintenance plus the target percent. Carbs are then set to 20 g and the difference moves to protein.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Target surplus %" value={buildTarget} onChange={setBuildTarget} />
              <Field label="Fat %" value={buildFat} onChange={setBuildFat} />
              <Field label="Protein %" value={buildProtein} onChange={setBuildProtein} />
              <Field label="Carb %" value={buildCarb} onChange={setBuildCarb} />
            </div>
            <PercentNote fat={buildFat} protein={buildProtein} carb={buildCarb} />
            {math ? <Result set={math.build} before={math.buildSplit} saving={saving} onSave={() => void save(math.build)} /> : null}
          </section>
          <section className="flex flex-col gap-2 rounded-card border border-line bg-surface px-3 py-3">
            <h3 className="text-sm font-semibold">Fat loss</h3>
            <p className="text-xs text-muted">Calories are maintenance minus the target percent. The page note says carbs over 20 g move to protein. The calculator itself pins fat loss to 15 g.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Target reduction %" value={lossTarget} onChange={setLossTarget} />
              <Field label="Fat %" value={lossFat} onChange={setLossFat} />
              <Field label="Protein %" value={lossProtein} onChange={setLossProtein} />
              <Field label="Carb %" value={lossCarb} onChange={setLossCarb} />
            </div>
            <PercentNote fat={lossFat} protein={lossProtein} carb={lossCarb} />
            {math ? <Result set={math.loss} before={math.lossSplit} saving={saving} onSave={() => void save(math.loss)} /> : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function Result({ set, before, saving, onSave }: { set: MacroGrams; before?: MacroGrams; saving: boolean; onSave: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      {before ? <p className="text-sm tabular-nums text-muted">From the percents: {gramsLine(before)}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold tabular-nums">{before ? "Carb adjusted: " : ""}{gramsLine(set)}</p>
        <button type="button" onClick={onSave} disabled={saving} className="h-11 rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink disabled:opacity-50">
          Save goal
        </button>
      </div>
    </div>
  );
}

function gramsLine(set: MacroGrams): string {
  return `${Math.round(set.calories).toLocaleString()} kcal · P ${formatMacro(set.protein)}g · F ${formatMacro(set.fat)}g · carb ${formatMacro(set.carbs)}g`;
}

function PercentNote({ fat, protein, carb }: { fat: string; protein: string; carb: string }) {
  const total = [fat, protein, carb].reduce((sum, value) => sum + (Number(value) || 0), 0);
  if (!Number.isFinite(total) || Math.abs(total - 100) < 0.05) return null;
  return <p className="text-xs text-muted">These add up to {formatMacro(total)}%, not 100. They are used as entered.</p>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-semibold">{label}
      <input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm outline-none focus:border-tomato" />
    </label>
  );
}

function numberOrNaN(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function trim(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(rounded);
}
