import type { MacroGoals, MealPlan, SavedMacroGoal, SavedPerson } from "@/lib/plans/model";
import { defaultMacroName, EMPTY_GOALS, householdGoal, todayKey } from "@/lib/plans/model";
import type { GroceryList } from "@/lib/plans/grocery";
import type { MacroLog } from "@/lib/plans/logs";
import { emitCloud } from "@/lib/cloud/bridge";

const DB_NAME = "recipe-viewer";
const STORE = "files";
const KEY = "latest";
const PLANS_KEY = "plans";
const GOALS_KEY = "macro-goals";
const GROCERY_KEY = "grocery-lists";
const PEOPLE_KEY = "people";
const LOGS_KEY = "macro-logs";

export interface StoredRecipeFile {
  json: string;
  savedAt: number;
  name?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open recipe storage."));
  });
}

export async function readStoredFile(): Promise<StoredRecipeFile | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve((request.result as StoredRecipeFile | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not read saved recipes."));
    tx.oncomplete = () => db.close();
  });
}

export async function writeStoredFile(json: string, name?: string): Promise<void> {
  const db = await openDb();
  const record: StoredRecipeFile = { json, savedAt: Date.now(), name };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record, KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("Could not save recipes."));
  });
}

export async function readPlans(): Promise<MealPlan[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(PLANS_KEY);
    request.onsuccess = () => {
      const value = request.result as MealPlan[] | undefined;
      resolve(Array.isArray(value) ? value : []);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not read meal plans."));
    tx.oncomplete = () => db.close();
  });
}

export async function writePlans(plans: MealPlan[]): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(plans, PLANS_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("Could not save meal plans."));
  }).then(() => {
    emitCloud({ plans });
  });
}

export async function readGroceryLists(): Promise<GroceryList[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(GROCERY_KEY);
    request.onsuccess = () => {
      const value = request.result as GroceryList[] | undefined;
      resolve(Array.isArray(value) ? value : []);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not read grocery lists."));
    tx.oncomplete = () => db.close();
  });
}

export async function writeGroceryLists(lists: GroceryList[]): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(lists, GROCERY_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("Could not save grocery lists."));
  }).then(() => {
    emitCloud({ groceryLists: lists });
  });
}

export async function readSavedPeople(): Promise<SavedPerson[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(PEOPLE_KEY);
    request.onsuccess = () => {
      const value = request.result as SavedPerson[] | undefined;
      resolve(Array.isArray(value) ? value.filter((person) => person && typeof person.id === "string" && typeof person.name === "string").slice(0, 2) : []);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not read people."));
    tx.oncomplete = () => db.close();
  });
}

export async function writeSavedPeople(people: SavedPerson[]): Promise<void> {
  const next = people.slice(0, 2);
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(next, PEOPLE_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("Could not save people."));
  }).then(() => {
    emitCloud({ people: next });
  });
}

export async function readMacroLogs(): Promise<MacroLog[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(LOGS_KEY);
    request.onsuccess = () => {
      const value = request.result as MacroLog[] | undefined;
      resolve(Array.isArray(value) ? value.filter((entry) => entry && typeof entry.id === "string" && typeof entry.date === "string") : []);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not read logs."));
    tx.oncomplete = () => db.close();
  });
}

export async function writeMacroLogs(logs: MacroLog[]): Promise<void> {
  const next = logs.slice(0, 400);
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(next, LOGS_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("Could not save logs."));
  }).then(() => {
    emitCloud({ macroLogs: next });
  });
}

export async function readMacroGoals(): Promise<MacroGoals | null> {
  const saved = await readSavedMacroGoal();
  return saved?.goals ?? null;
}

export async function readSavedMacroGoals(): Promise<SavedMacroGoal[]> {
  const raw = await readGoalRaw();
  const tidy = (goal: SavedMacroGoal): SavedMacroGoal => {
    const next = { ...goal };
    const forName = goal.forName?.trim();
    const forPersonId = goal.forPersonId?.trim();
    if (forName) next.forName = forName;
    else delete next.forName;
    if (forPersonId) next.forPersonId = forPersonId;
    else delete next.forPersonId;
    return next;
  };
  if (Array.isArray(raw)) return raw.filter(isSavedMacroGoal).map(tidy);
  const saved = normalizeSavedGoal(raw);
  if (saved && !isSavedMacroGoal(raw)) await writeSavedMacroGoals([saved]);
  return saved ? [tidy(saved)] : [];
}

export async function readSavedMacroGoal(): Promise<SavedMacroGoal | null> {
  return householdGoal(await readSavedMacroGoals());
}

export async function writeSavedMacroGoal(saved: SavedMacroGoal): Promise<void> {
  const current = await readSavedMacroGoals();
  const rest = current.filter((item) => item.name !== saved.name);
  await writeSavedMacroGoals([saved, ...rest]);
}

export async function writeSavedMacroGoals(saved: SavedMacroGoal[]): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(saved, GOALS_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("Could not save macro goals."));
  }).then(() => {
    emitCloud({ macroGoal: householdGoal(saved) ?? saved[0] ?? null, macroGoals: saved });
  });
}

function readGoalRaw(): Promise<unknown> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const request = tx.objectStore(STORE).get(GOALS_KEY);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error ?? new Error("Could not read macro goals."));
        tx.oncomplete = () => db.close();
      }),
  );
}

function isSavedMacroGoal(value: unknown): value is SavedMacroGoal {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<SavedMacroGoal>;
  return typeof record.name === "string" && typeof record.savedOn === "string" && isMacroGoals(record.goals);
}

function isMacroGoals(value: unknown): value is MacroGoals {
  if (!value || typeof value !== "object") return false;
  const goals = value as Partial<MacroGoals>;
  return (goals.mode === "grams" || goals.mode === "split") && typeof goals.protein === "string";
}

function normalizeSavedGoal(raw: unknown): SavedMacroGoal | null {
  if (isSavedMacroGoal(raw)) return raw;
  if (!isMacroGoals(raw)) return null;
  const savedOn = todayKey();
  return {
    name: defaultMacroName(savedOn),
    savedOn,
    goals: { ...EMPTY_GOALS, ...raw, mode: raw.mode === "split" ? "split" : "grams" },
  };
}
