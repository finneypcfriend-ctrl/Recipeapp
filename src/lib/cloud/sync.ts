import { muteCloud, setCloudSink, type CloudPatch } from "@/lib/cloud/bridge";
import { FIREBASE_WEB } from "@/lib/cloud/firebase-web";
import type { HistoryEntry } from "@/lib/plans/history";
import { householdGoal, type MealPlan, type PersonGroup, type PlanBatch, type PlanDefaults, type PlanTemplate, type SavedMacroGoal, type SavedPerson } from "@/lib/plans/model";
import type { MacroLog } from "@/lib/plans/logs";
import { loadSupplementRanks, loadSupplements, saveSupplementRanks, saveSupplements, type SupplementRank } from "@/lib/plans/supplements";
import { loadLeftovers, saveLeftovers } from "@/lib/plans/leftovers";
import { loadMeatStars, loadPlateTemplates, loadToppingStars, loadToppings, saveMeatStars, savePlateTemplates, saveToppingStars, saveToppings, type ToppingStars } from "@/lib/plans/toppings";
import type { Recipe } from "@/lib/recipes/types";
import { stampGrocerySources } from "@/lib/plans/grocery";
import { readGroceryLists, readMacroLogs, readPersonGroups, readPlanDefaults, readPlans, readSavedMacroGoals, readSavedPeople, writeGroceryLists, writeMacroLogs, writePersonGroups, writePlanDefaults, writePlans, writeSavedMacroGoal, writeSavedMacroGoals, writeSavedPeople } from "@/lib/recipes/idb";

const CONFIG = FIREBASE_WEB;

export const CLOUD_EVENT = "household-cloud";

type FirebaseAuth = import("firebase/auth").Auth;
type FirebaseDb = import("firebase/firestore").Firestore;
type RemoteRecord = Record<string, unknown>;

let auth: FirebaseAuth | null = null;
let db: FirebaseDb | null = null;
let lastWriteAt = 0;
let started = false;
let currentEmail: string | null | undefined;
let currentName = "Household";
const authListeners = new Set<(email: string | null) => void>();
const nameListeners = new Set<(name: string) => void>();
const planListeners = new Set<(plans: MealPlan[]) => void>();
const statusListeners = new Set<(message: string) => void>();
const favoriteListeners = new Set<(uids: string[] | null) => void>();
const historyListeners = new Set<(entries: HistoryEntry[]) => void>();
let historyEntries: HistoryEntry[] = [];
const templateListeners = new Set<(entries: PlanTemplate[]) => void>();
let templateEntries: PlanTemplate[] = [];
const versionListeners = new Set<(versions: Recipe[]) => void>();
let versionWriteAt = 0;
let versionUploadPending = false;
let localVersionSource: () => Recipe[] | null = () => null;
const plateIngredientListeners = new Set<(names: string[]) => void>();
let plateIngredientWriteAt = 0;
let plateIngredientUploadPending = false;
let localPlateIngredientSource: () => string[] | null = () => null;
let cloudFavorites: string[] | null = null;
let favoriteWriteAt = 0;
let favoriteUploadPending = false;
let localFavoriteSource: () => string[] | null = () => null;

async function client() {
  if (typeof window === "undefined") return null;
  if (auth && db) return { auth, db };
  const [{ getApps, initializeApp }, authMod, { getFirestore }] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
    import("firebase/firestore"),
  ]);
  const app = getApps()[0] ?? initializeApp(CONFIG);
  auth = authMod.getAuth(app);
  db = getFirestore(app);
  return { auth, db };
}

function memoryRef(database: FirebaseDb) {
  return import("firebase/firestore").then(({ doc }) => doc(database, "household", "memory"));
}

function profileRef(database: FirebaseDb, uid: string) {
  return import("firebase/firestore").then(({ doc }) => doc(database, "household", `profile_${uid}`));
}

function notifyFavorites() {
  for (const listener of favoriteListeners) listener(cloudFavorites);
}

function stamp(patch: CloudPatch) {
  return JSON.parse(JSON.stringify({ ...patch, updatedAt: Date.now() })) as CloudPatch & { updatedAt: number };
}

let pushChain = Promise.resolve();

function push(patch: CloudPatch) {
  const payload = stamp(patch);
  if (payload.updatedAt > lastWriteAt) lastWriteAt = payload.updatedAt;
  pushChain = pushChain
    .then(async () => {
      const ready = await client();
      if (!ready?.auth.currentUser) return;
      const [{ setDoc }, ref] = await Promise.all([import("firebase/firestore"), memoryRef(ready.db)]);
      await setDoc(ref, payload, { merge: true });
    })
    .catch(() => undefined);
}

function hasHouseholdData(data: RemoteRecord | undefined) {
  if (!data) return false;
  const plans = data.plans;
  const grocery = data.groceryLists;
  const macro = data.macroGoal;
  const macros = data.macroGoals;
  const people = data.people;
  return (
    (Array.isArray(plans) && plans.length > 0) ||
    (Array.isArray(grocery) && grocery.length > 0) ||
    (!!macro && typeof macro === "object") ||
    (Array.isArray(macros) && macros.length > 0) ||
    (Array.isArray(people) && people.length > 0)
  );
}

async function localMemory() {
  const [plans, groceryLists, macroGoals, people, peopleGroups, planDefaults, macroLogs] = await Promise.all([
    readPlans(),
    readGroceryLists(),
    readSavedMacroGoals(),
    readSavedPeople(),
    readPersonGroups(),
    readPlanDefaults(),
    readMacroLogs(),
  ]);
  return {
    plans,
    groceryLists: stampGrocerySources(groceryLists),
    macroGoal: householdGoal(macroGoals) ?? macroGoals[0] ?? null,
    macroGoals,
    people,
    peopleGroups,
    planDefaults,
    macroLogs,
    supplements: loadSupplements(),
    supplementRanks: loadSupplementRanks(),
    toppings: loadToppings(),
    plateTemplates: loadPlateTemplates(),
    meatStars: loadMeatStars(),
    toppingStars: loadToppingStars(),
    leftovers: loadLeftovers(),
  };
}

function isToppingStars(value: unknown): value is ToppingStars {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ToppingStars>;
  return typeof record.personId === "string" && Array.isArray(record.ids);
}

function isSupplementRank(value: unknown): value is SupplementRank {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<SupplementRank>;
  return typeof record.personId === "string" && (Array.isArray(record.order) || Array.isArray((record as { meals?: unknown }).meals));
}

function isRemoteGoal(value: unknown): value is SavedMacroGoal {
  if (!value || typeof value !== "object") return false;
  const record = value as { name?: unknown; savedOn?: unknown; goals?: { mode?: unknown; protein?: unknown } };
  const goals = record.goals;
  if (!goals || typeof goals !== "object") return false;
  return typeof record.name === "string" && typeof record.savedOn === "string" && (goals.mode === "grams" || goals.mode === "split") && typeof goals.protein === "string";
}

async function applyRemote(data: RemoteRecord) {
  await muteCloud(async () => {
    if (Array.isArray(data.plans)) await writePlans((data.plans as MealPlan[]).map((plan) => plan.people?.some((person) => person.name.trim().toLowerCase() === "bethany") ? { ...plan, people: plan.people.map((person) => person.name.trim().toLowerCase() === "bethany" ? { ...person, name: "Beth" } : person) } : plan));
    if (Array.isArray(data.groceryLists)) await writeGroceryLists(data.groceryLists);
    if (Array.isArray(data.macroGoals)) await writeSavedMacroGoals(data.macroGoals.filter(isRemoteGoal));
    else if (data.macroGoal && typeof data.macroGoal === "object" && !Array.isArray(data.macroGoal)) await writeSavedMacroGoal(data.macroGoal as SavedMacroGoal);
    if (Array.isArray(data.supplements)) saveSupplements(data.supplements);
    if (Array.isArray(data.supplementRanks)) saveSupplementRanks(data.supplementRanks.filter(isSupplementRank));
    if (Array.isArray(data.toppings)) saveToppings(data.toppings);
    if (Array.isArray(data.plateTemplates)) savePlateTemplates(data.plateTemplates);
    if (Array.isArray(data.meatStars)) saveMeatStars(data.meatStars.filter((name): name is string => typeof name === "string"));
    if (Array.isArray(data.toppingStars)) saveToppingStars(data.toppingStars.filter(isToppingStars));
    if (Array.isArray(data.leftovers)) saveLeftovers(data.leftovers as PlanBatch[]);
    if (Array.isArray(data.people)) await writeSavedPeople(data.people.filter((person): person is SavedPerson => !!person && typeof person === "object" && typeof (person as SavedPerson).id === "string" && typeof (person as SavedPerson).name === "string").map((person) => person.name.trim().toLowerCase() === "bethany" ? { ...person, name: "Beth" } : person));
    if (Array.isArray(data.peopleGroups)) await writePersonGroups(data.peopleGroups.filter((group): group is PersonGroup => !!group && typeof group === "object" && typeof (group as PersonGroup).id === "string" && typeof (group as PersonGroup).name === "string" && Array.isArray((group as PersonGroup).personIds)));
    if (data.planDefaults && typeof data.planDefaults === "object" && typeof (data.planDefaults as PlanDefaults).peopleOn === "boolean") await writePlanDefaults(data.planDefaults as PlanDefaults);
    if (Array.isArray(data.macroLogs)) await writeMacroLogs(data.macroLogs.filter((entry): entry is MacroLog => !!entry && typeof entry === "object" && typeof (entry as MacroLog).id === "string" && typeof (entry as MacroLog).date === "string" && typeof (entry as MacroLog).personId === "string"));
  });
  if (Array.isArray(data.plans)) {
    for (const listener of planListeners) listener(data.plans as MealPlan[]);
  }
  window.dispatchEvent(new Event(CLOUD_EVENT));
}

export function startHouseholdSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  setCloudSink((patch) => {
    push(patch);
  });
  void client()
    .then(async (ready) => {
      if (!ready) return;
      const { onAuthStateChanged } = await import("firebase/auth");
      const { getDoc, onSnapshot, setDoc } = await import("firebase/firestore");
      let stopSnap: (() => void) | null = null;
      let stopFavorites: (() => void) | null = null;
      let generation = 0;
      onAuthStateChanged(ready.auth, (user) => {
        const token = ++generation;
        stopSnap?.();
        stopSnap = null;
        stopFavorites?.();
        stopFavorites = null;
        currentEmail = user?.email ?? null;
        currentName = user?.displayName?.trim() || "Household";
        for (const listener of authListeners) listener(currentEmail);
        for (const listener of nameListeners) listener(currentName);
        if (!user) {
          cloudFavorites = null;
          notifyFavorites();
          return;
        }
        const current = user;
        void (async () => {
          const ref = await memoryRef(ready.db);
          if (token !== generation) return;
          try {
            const existing = await getDoc(ref);
            const remote = existing.data();
            const local = await localMemory();
            if (token !== generation) return;
            if (!hasHouseholdData(remote) && (hasHouseholdData(local) || !existing.exists())) {
              const payload = stamp(local);
              await setDoc(ref, payload);
              lastWriteAt = payload.updatedAt;
            }
          } catch {
            const message = current.email ? `${current.email} is signed in, but this household is not open to that email.` : "Could not open the household data.";
            for (const listener of statusListeners) listener(message);
            return;
          }
          if (token !== generation) return;
          stopSnap = onSnapshot(
            ref,
            (snap) => {
              const data = snap.data();
              if (!data) return;
              const updatedAt = typeof data.updatedAt === "number" ? data.updatedAt : 0;
              if (updatedAt && updatedAt <= lastWriteAt) return;
              lastWriteAt = updatedAt;
              void applyRemote(data);
            },
            () => {
              const message = current.email ? `${current.email} is signed in, but this household is not open to that email.` : "Could not open the household data.";
              for (const listener of statusListeners) listener(message);
            },
          );
          const favoritesDoc = await profileRef(ready.db, current.uid);
          if (token !== generation) return;
          const savedFavorites = await getDoc(favoritesDoc);
          if (!savedFavorites.exists()) {
            const local = localFavoriteSource();
            if (local) {
              const payload = { favorites: local, updatedAt: Date.now() };
              await setDoc(favoritesDoc, payload);
              favoriteWriteAt = payload.updatedAt;
              cloudFavorites = local;
              notifyFavorites();
            } else favoriteUploadPending = true;
          }
          if (token !== generation) return;
          if (!Array.isArray(savedFavorites.data()?.recipeVersions)) {
            const local = localVersionSource();
            if (local) void publishRecipeVersions(local);
            else versionUploadPending = true;
          }
          if (token !== generation) return;
          if (!Array.isArray(savedFavorites.data()?.plateIngredients)) {
            const local = localPlateIngredientSource();
            if (local) void publishPlateIngredients(local);
            else plateIngredientUploadPending = true;
          }
          if (token !== generation) return;
          stopFavorites = onSnapshot(favoritesDoc, (snap) => {
            const data = snap.data();
            const versionsAt = typeof data?.versionsUpdatedAt === "number" ? data.versionsUpdatedAt : 0;
            if (Array.isArray(data?.recipeVersions) && versionsAt !== versionWriteAt) {
              versionWriteAt = versionsAt;
              for (const listener of versionListeners) listener(data.recipeVersions as Recipe[]);
            }
            const plateAt = typeof data?.plateIngredientsUpdatedAt === "number" ? data.plateIngredientsUpdatedAt : 0;
            if (Array.isArray(data?.plateIngredients) && plateAt !== plateIngredientWriteAt) {
              plateIngredientWriteAt = plateAt;
              const names = data.plateIngredients.filter((name): name is string => typeof name === "string");
              for (const listener of plateIngredientListeners) listener(names);
            }
            const updatedAt = typeof data?.updatedAt === "number" ? data.updatedAt : 0;
            if (updatedAt && updatedAt === favoriteWriteAt) return;
            if (!data || !Array.isArray(data.favorites)) return;
            favoriteWriteAt = updatedAt;
            cloudFavorites = data.favorites.filter((uid): uid is string => typeof uid === "string");
            notifyFavorites();
          });
          const historyDoc = await import("firebase/firestore").then(({ doc }) => doc(ready.db, "household", "history"));
          if (token !== generation) return;
          const stopHistory = onSnapshot(historyDoc, (snap) => {
            const data = snap.data();
            historyEntries = Array.isArray(data?.entries) ? (data.entries as HistoryEntry[]) : [];
            for (const listener of historyListeners) listener(historyEntries);
          });
          const templateDoc = await import("firebase/firestore").then(({ doc }) => doc(ready.db, "household", "templates"));
          if (token !== generation) return;
          const stopTemplates = onSnapshot(templateDoc, (snap) => {
            const data = snap.data();
            templateEntries = Array.isArray(data?.entries) ? (data.entries as PlanTemplate[]) : [];
            for (const listener of templateListeners) listener(templateEntries);
          });
          const previousStop = stopSnap;
          stopSnap = () => {
            previousStop?.();
            stopHistory();
            stopTemplates();
          };
        })();
      });
    })
    .catch(() => {
      currentEmail = null;
      for (const listener of authListeners) listener(null);
    });
}

export function watchAuth(listener: (email: string | null) => void) {
  authListeners.add(listener);
  if (currentEmail !== undefined) listener(currentEmail);
  return () => {
    authListeners.delete(listener);
  };
}

export function watchHouseholdName(listener: (name: string) => void) {
  nameListeners.add(listener);
  listener(currentName);
  return () => {
    nameListeners.delete(listener);
  };
}

export async function renameHousehold(name: string) {
  const user = (await client())?.auth.currentUser;
  if (!user) return;
  const next = name.trim() || "Household";
  const { updateProfile } = await import("firebase/auth");
  await updateProfile(user, { displayName: next === "Household" ? "" : next });
  currentName = next;
  for (const listener of nameListeners) listener(currentName);
}

export function setLocalFavoriteSource(source: () => string[] | null) {
  localFavoriteSource = source;
}

export function watchFavorites(listener: (uids: string[] | null) => void) {
  favoriteListeners.add(listener);
  listener(cloudFavorites);
  return () => {
    favoriteListeners.delete(listener);
  };
}

export async function publishFavorites(uids: string[]) {
  const ready = await client();
  const user = ready?.auth.currentUser;
  if (!ready || !user) return;
  const payload = { favorites: uids, updatedAt: Date.now() };
  const [{ setDoc }, ref] = await Promise.all([import("firebase/firestore"), profileRef(ready.db, user.uid)]);
  await setDoc(ref, payload, { merge: true });
  favoriteWriteAt = payload.updatedAt;
  favoriteUploadPending = false;
  cloudFavorites = uids;
  notifyFavorites();
}

export function setLocalVersionSource(source: () => Recipe[] | null) {
  localVersionSource = source;
}

export function watchRecipeVersions(listener: (versions: Recipe[]) => void) {
  versionListeners.add(listener);
  return () => {
    versionListeners.delete(listener);
  };
}

export async function publishRecipeVersions(versions: Recipe[]) {
  const ready = await client();
  const user = ready?.auth.currentUser;
  if (!ready || !user) return;
  const versionsUpdatedAt = Date.now();
  const payload = JSON.parse(JSON.stringify({ recipeVersions: versions, versionsUpdatedAt })) as { recipeVersions: Recipe[]; versionsUpdatedAt: number };
  const [{ setDoc }, ref] = await Promise.all([import("firebase/firestore"), profileRef(ready.db, user.uid)]);
  await setDoc(ref, payload, { merge: true });
  versionWriteAt = versionsUpdatedAt;
  versionUploadPending = false;
}

export function noteVersionsReady() {
  if (!versionUploadPending) return;
  const local = localVersionSource();
  if (!local) return;
  versionUploadPending = false;
  void publishRecipeVersions(local);
}

export function setLocalPlateIngredientSource(source: () => string[] | null) {
  localPlateIngredientSource = source;
}

export function watchPlateIngredients(listener: (names: string[]) => void) {
  plateIngredientListeners.add(listener);
  return () => {
    plateIngredientListeners.delete(listener);
  };
}

export async function publishPlateIngredients(names: string[]) {
  const ready = await client();
  const user = ready?.auth.currentUser;
  if (!ready || !user) return;
  const plateIngredientsUpdatedAt = Date.now();
  const payload = { plateIngredients: names, plateIngredientsUpdatedAt };
  const [{ setDoc }, ref] = await Promise.all([import("firebase/firestore"), profileRef(ready.db, user.uid)]);
  await setDoc(ref, payload, { merge: true });
  plateIngredientWriteAt = plateIngredientsUpdatedAt;
  plateIngredientUploadPending = false;
}

export function notePlateIngredientsReady() {
  if (!plateIngredientUploadPending) return;
  const local = localPlateIngredientSource();
  if (!local) return;
  plateIngredientUploadPending = false;
  void publishPlateIngredients(local);
}

export function noteFavoritesReady() {
  if (!favoriteUploadPending) return;
  const local = localFavoriteSource();
  if (!local) return;
  favoriteUploadPending = false;
  void publishFavorites(local);
}

export function watchPlans(listener: (plans: MealPlan[]) => void) {
  planListeners.add(listener);
  return () => {
    planListeners.delete(listener);
  };
}

export function watchHistory(listener: (entries: HistoryEntry[]) => void) {
  historyListeners.add(listener);
  listener(historyEntries);
  return () => {
    historyListeners.delete(listener);
  };
}

export function watchTemplates(listener: (entries: PlanTemplate[]) => void) {
  templateListeners.add(listener);
  listener(templateEntries);
  return () => {
    templateListeners.delete(listener);
  };
}

export async function addTemplates(entries: PlanTemplate[]) {
  const ready = await client();
  if (!ready?.auth.currentUser) throw new Error("Sign in to change plan templates.");
  const { doc, getDoc } = await import("firebase/firestore");
  const existing = await getDoc(doc(ready.db, "household", "templates"));
  const previous = Array.isArray(existing.data()?.entries) ? (existing.data()?.entries as PlanTemplate[]) : templateEntries;
  await saveTemplates([...entries, ...previous]);
}

export async function saveTemplates(entries: PlanTemplate[]) {
  const ready = await client();
  if (!ready?.auth.currentUser) throw new Error("Sign in to change plan templates.");
  const { doc, setDoc } = await import("firebase/firestore");
  try {
    await setDoc(doc(ready.db, "household", "templates"), { entries, updatedAt: Date.now() });
  } catch {
    throw new Error("Could not update plan templates. Sign in with an allowed household email.");
  }
}

export async function saveHistory(entries: HistoryEntry[]) {
  const ready = await client();
  if (!ready?.auth.currentUser) throw new Error("Sign in to change archived plans.");
  const { doc, setDoc } = await import("firebase/firestore");
  try {
    await setDoc(doc(ready.db, "household", "history"), { entries, updatedAt: Date.now() });
  } catch {
    throw new Error("Could not update archived plans. Sign in with an allowed household email.");
  }
}

export async function archiveHistory(entries: HistoryEntry[]) {
  const ready = await client();
  if (!ready?.auth.currentUser) throw new Error("Sign in to archive a date range.");
  const { doc, getDoc } = await import("firebase/firestore");
  const existing = await getDoc(doc(ready.db, "household", "history"));
  const previous = Array.isArray(existing.data()?.entries) ? (existing.data()?.entries as HistoryEntry[]) : historyEntries;
  await saveHistory([...entries, ...previous].slice(0, 200));
}

export function watchCloudStatus(listener: (message: string) => void) {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export async function signInHousehold(email: string, password: string) {
  const ready = await client();
  if (!ready) throw new Error("Sign-in is only available in the browser.");
  const { signInWithEmailAndPassword } = await import("firebase/auth");
  await signInWithEmailAndPassword(ready.auth, email.trim(), password);
}

export async function createHouseholdAccount(email: string, password: string) {
  const ready = await client();
  if (!ready) throw new Error("Sign-in is only available in the browser.");
  const { createUserWithEmailAndPassword } = await import("firebase/auth");
  await createUserWithEmailAndPassword(ready.auth, email.trim(), password);
}

export async function signOutHousehold() {
  const ready = await client();
  if (!ready) return;
  const { signOut } = await import("firebase/auth");
  await signOut(ready.auth);
}

export function authError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "auth/invalid-email") return "That email is not valid.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") return "That email or password does not match.";
  if (code === "auth/email-already-in-use") return "That email already has an account. Sign in instead.";
  if (code === "auth/weak-password") return "Use a password of at least 6 characters.";
  if (code === "auth/too-many-requests") return "Too many tries. Wait a minute and try again.";
  return "Could not sign in.";
}
