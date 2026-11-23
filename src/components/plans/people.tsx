import { useEffect, useState } from "react";
import { CLOUD_EVENT } from "@/lib/cloud/sync";
import type { SavedPerson } from "@/lib/plans/model";
import { readSavedPeople, writeSavedPeople } from "@/lib/recipes/idb";

export function useSavedPeople(): SavedPerson[] {
  const [people, setPeople] = useState<SavedPerson[]>([]);
  useEffect(() => {
    const load = () => {
      readSavedPeople().then(setPeople).catch(() => setPeople([]));
    };
    load();
    window.addEventListener(CLOUD_EVENT, load);
    return () => window.removeEventListener(CLOUD_EVENT, load);
  }, []);
  return people;
}

export function AddPersonButton({ people, onNotify }: { people: SavedPerson[]; onNotify?: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-11 self-start rounded-full border border-line bg-surface px-4 text-sm font-semibold">
        Add person
      </button>
    );
  }
  const save = async () => {
    const next = name.trim();
    if (!next) return;
    if (people.some((person) => person.name.toLowerCase() === next.toLowerCase())) {
      onNotify?.("That person is already saved.");
      return;
    }
    await writeSavedPeople([...people, { id: crypto.randomUUID(), name: next }]);
    setName("");
    setOpen(false);
    onNotify?.("Person saved.");
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={name}
        aria-label="New person name"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void save();
        }}
        placeholder="Name"
        className="h-11 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-3 text-sm outline-none focus:border-tomato"
      />
      <button type="button" onClick={() => void save()} className="h-11 rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink">
        Save
      </button>
      <button type="button" onClick={() => { setOpen(false); setName(""); }} className="h-11 rounded-full border border-line px-4 text-sm font-semibold">
        Cancel
      </button>
    </div>
  );
}

export function PersonSelect({
  people,
  value,
  excludeId,
  allowEmpty,
  emptyLabel,
  label,
  onChange,
}: {
  people: SavedPerson[];
  value: string;
  excludeId?: string;
  allowEmpty?: boolean;
  emptyLabel: string;
  label: string;
  onChange: (id: string) => void;
}) {
  const choices = people.filter((person) => person.id !== excludeId);
  return (
    <label className="block text-sm font-semibold">
      {label}
      <select value={choices.some((person) => person.id === value) ? value : ""} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm font-normal">
        <option value="">{emptyLabel}</option>
        {allowEmpty ? null : null}
        {choices.map((person) => (
          <option key={person.id} value={person.id}>{person.name}</option>
        ))}
      </select>
    </label>
  );
}
