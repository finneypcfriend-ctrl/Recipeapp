/**
 * Keto Savage macro calculator, reversed from
 * https://ketosavage.com/keto-macro-calculator/ and its
 * `api/macro-calculator` responses.
 *
 * Weight in kg is pounds times 0.4536. Lean mass is that weight times
 * (1 - body fat). BMR fits their numbers to within a hundredth of a calorie:
 * 872.002 + 13.587 * lean kg + 9.613 * fat mass kg - 3.351 * age, then
 * minus 198 for female. TDEE is BMR times the activity multiplier.
 *
 * Body-comp fat to lose is the current fat mass times the share of body-fat
 * points being given up. Total weight change is that fat divided by 0.75:
 * the calculator always treats 75% of the weight change as fat. That is not
 * the maintenance fat percent, and it is not "1 minus the share." Weeks are
 * the pounds, at 1 lb a week.
 *
 * Maintenance fat is that percent of TDEE calories. Maintenance carbs are a
 * gram entry. Protein is whatever calories remain.
 *
 * Build calories are TDEE plus the target percent. Fat-loss calories are
 * TDEE minus the target percent. Those splits are percents of calories.
 * Build then moves carbs to 20 g and puts the difference on protein.
 * Fat loss moves carbs to 15 g the same way. Their page note says 20 g for
 * both; the API uses 15 g on the fat-loss side.
 */

export type MacroSex = "Male" | "Female";

export interface MacroInputs {
  sex: MacroSex;
  age: number;
  weightLbs: number;
  bodyFat: number;
  activity: number;
  desiredBodyFat: number;
  maintainFatPct: number;
  maintainCarbs: number;
  buildTargetPct: number;
  buildFatPct: number;
  buildProteinPct: number;
  buildCarbPct: number;
  lossTargetPct: number;
  lossFatPct: number;
  lossProteinPct: number;
  lossCarbPct: number;
}

export interface MacroGrams {
  calories: number;
  fat: number;
  protein: number;
  carbs: number;
}

export interface MacroMath {
  weightKg: number;
  leanKg: number;
  fatMassKg: number;
  bmr: number;
  tdee: number;
  fatPoints: number;
  fatShare: number;
  fatToLoseKg: number;
  weightToLoseKg: number;
  weightToLoseLbs: number;
  stageWeightLbs: number;
  weeks: number;
  maintenance: MacroGrams;
  /** Percent split before carbs are pinned. */
  buildSplit: MacroGrams;
  lossSplit: MacroGrams;
  /** Carb-pinned results. Build pins to 20 g, fat loss to 15 g. */
  build: MacroGrams;
  loss: MacroGrams;
}

const KG_PER_LB = 0.4536;

export function findMacros(input: MacroInputs): MacroMath | null {
  if (!valid(input)) return null;
  const weightKg = input.weightLbs * KG_PER_LB;
  const leanKg = weightKg * (1 - input.bodyFat / 100);
  const fatMassKg = weightKg - leanKg;
  const bmr = 872.00233333 + 13.58675044 * leanKg + 9.61276455 * fatMassKg - 3.351 * input.age + (input.sex === "Female" ? -198 : 0);
  const tdee = bmr * input.activity;
  const fatPoints = input.bodyFat - input.desiredBodyFat;
  const fatShare = input.bodyFat > 0 ? (fatPoints / input.bodyFat) * 100 : 0;
  const fatToLoseKg = fatMassKg * (fatShare / 100);
  const weightToLoseKg = fatToLoseKg / 0.75;
  const weightToLoseLbs = weightToLoseKg / KG_PER_LB;
  const maintenanceFat = (tdee * input.maintainFatPct) / 100 / 9;
  const maintenance = {
    calories: tdee,
    fat: maintenanceFat,
    carbs: input.maintainCarbs,
    protein: (tdee - maintenanceFat * 9 - input.maintainCarbs * 4) / 4,
  };
  const buildCalories = tdee * (1 + input.buildTargetPct / 100);
  const lossCalories = tdee * (1 - input.lossTargetPct / 100);
  const buildSplit = fromPercents(buildCalories, input.buildFatPct, input.buildProteinPct, input.buildCarbPct);
  const lossSplit = fromPercents(lossCalories, input.lossFatPct, input.lossProteinPct, input.lossCarbPct);
  return {
    weightKg,
    leanKg,
    fatMassKg,
    bmr,
    tdee,
    fatPoints,
    fatShare,
    fatToLoseKg,
    weightToLoseKg,
    weightToLoseLbs,
    stageWeightLbs: input.weightLbs - weightToLoseLbs,
    weeks: weightToLoseLbs,
    maintenance,
    buildSplit,
    lossSplit,
    build: pinCarbs(buildSplit, 20),
    loss: pinCarbs(lossSplit, 15),
  };
}

function fromPercents(calories: number, fatPct: number, proteinPct: number, carbPct: number): MacroGrams {
  return {
    calories,
    fat: (calories * fatPct) / 100 / 9,
    protein: (calories * proteinPct) / 100 / 4,
    carbs: (calories * carbPct) / 100 / 4,
  };
}

function pinCarbs(grams: MacroGrams, carbs: number): MacroGrams {
  return { ...grams, protein: grams.protein + (grams.carbs - carbs), carbs };
}

function valid(input: MacroInputs): boolean {
  const numbers = [input.age, input.weightLbs, input.bodyFat, input.activity, input.desiredBodyFat, input.maintainFatPct, input.maintainCarbs, input.buildTargetPct, input.buildFatPct, input.buildProteinPct, input.buildCarbPct, input.lossTargetPct, input.lossFatPct, input.lossProteinPct, input.lossCarbPct];
  return numbers.every((value) => Number.isFinite(value) && value >= 0) && input.age > 0 && input.weightLbs > 0 && input.bodyFat < 100 && input.activity > 0;
}

export function formatMacro(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
