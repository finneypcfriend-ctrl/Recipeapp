import type { GroceryList } from "@/lib/plans/grocery";
import type { MacroLog } from "@/lib/plans/logs";
import type { MealPlan, SavedMacroGoal, SavedPerson } from "@/lib/plans/model";
import type { SupplementItem } from "@/lib/plans/supplements";
import type { PlateTemplate, ToppingRecipe } from "@/lib/plans/toppings";

export interface CloudPatch {
  plans?: MealPlan[];
  groceryLists?: GroceryList[];
  macroGoal?: SavedMacroGoal | null;
  /** Every saved goal. `macroGoal` stays the first one, which a one-person plan uses. */
  macroGoals?: SavedMacroGoal[];
  people?: SavedPerson[];
  macroLogs?: MacroLog[];
  supplements?: SupplementItem[];
  toppings?: ToppingRecipe[];
  plateTemplates?: PlateTemplate[];
}

let sink: ((patch: CloudPatch) => void) | null = null;
let muted = 0;

export function setCloudSink(fn: (patch: CloudPatch) => void) {
  sink = fn;
}

export function emitCloud(patch: CloudPatch) {
  if (muted === 0) sink?.(patch);
}

export async function muteCloud<T>(run: () => Promise<T>): Promise<T> {
  muted += 1;
  try {
    return await run();
  } finally {
    muted -= 1;
  }
}
