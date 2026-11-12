export interface IngredientObj {
  raw?: string | null;
  quantity?: string | number | null;
  quantity_value?: number | null;
  unit?: string | null;
  item?: string | null;
  section?: string | null;
  estimated?: boolean;
  /**
   * Library link written by `src/lib/sourced/pair.ts`. `sourced_name` is an
   * ingredient-library `name` (null when unmatched, ignored, or zero).
   * `sourced_match` is "exact" | "closest" | "none" | "zero". Absent on purpose
   * for ignored lines such as "dressing to taste".
   * `sourced_recipe` is a different link: the uid of another recipe in this
   * file, for a line like "1 recipe Flaxseed Meal Crêpes". It is not a pantry
   * item. When it is set, the pantry fields are cleared. One of those is the
   * whole other recipe, not one serving of it.
   */
  sourced_name?: string | null;
  sourced_match?: "exact" | "closest" | "none" | "zero" | null;
  sourced_recipe?: string | null;
}

export interface IngredientSection {
  heading?: string | null;
  items?: IngredientObj[] | null;
}

export interface EstimatedIngredient {
  item?: string | null;
  quantity?: string | number | null;
  unit?: string | null;
  estimated?: boolean;
  /**
   * Library link written by `src/lib/sourced/pair.ts`. `sourced_name` is an
   * ingredient-library `name` (null when unmatched, ignored, or zero).
   * `sourced_match` is "exact" | "closest" | "none" | "zero". Absent on purpose
   * for ignored lines such as "dressing to taste".
   * `sourced_recipe` is a different link: the uid of another recipe in this
   * file, for a line like "1 recipe Flaxseed Meal Crêpes". It is not a pantry
   * item. When it is set, the pantry fields are cleared. One of those is the
   * whole other recipe, not one serving of it.
   */
  sourced_name?: string | null;
  sourced_match?: "exact" | "closest" | "none" | "zero" | null;
  sourced_recipe?: string | null;
}

export interface InstructionObj {
  step?: number | null;
  section?: string | null;
  text?: string | null;
}

export interface InstructionSection {
  heading?: string | null;
  steps?: string[] | null;
}

export interface Nutrition {
  serving_size?: string | null;
  calories?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  carbs_g?: number | null;
  fiber_g?: number | null;
  net_carbs_g?: number | null;
  sugar_g?: number | null;
  sodium_mg?: number | null;
  raw?: string | null;
  basis?: string | null;
  source?: string | null;
  as_stated?: string[] | null;
  note?: string | null;
}

export interface MediaItem {
  type?: string | null;
  url?: string | null;
  video_url?: string | null;
}

export interface Recipe {
  uid: string;
  title: string;
  id?: string;
  collection?: string;
  collection_name?: string;
  image_url?: string | null;
  video_thumbnail_url?: string | null;
  description?: string | null;
  ingredients?: Array<string | IngredientObj> | null;
  ingredient_sections?: IngredientSection[] | null;
  estimated_ingredients?: EstimatedIngredient[] | null;
  estimate_note?: string | null;
  instructions?: Array<string | InstructionObj> | null;
  instruction_sections?: InstructionSection[] | null;
  full_text?: string | null;
  self_reply_texts?: string[] | null;
  notes?: string[] | string | null;
  nutrition?: Nutrition | null;
  servings?: string | number | null;
  yield?: string | null;
  serving_basis?: string | null;
  prep_time?: string | null;
  cook_time?: string | null;
  total_time?: string | null;
  url?: string | null;
  media?: MediaItem[] | null;
  has_video?: boolean;
  categories?: string[] | null;
  tags?: string[] | null;
  recipe_type?: string | null;
  recipe_kind?: string | null;
  custom_recipe?: boolean;
  label?: string | null;
  author?: string | null;
  created_by?: string | null;
  date_published?: string | null;
  mod_of?: string | null;
  variant?: "original" | "mod" | "version" | null;
  version?: number | null;
  version_label?: string | null;
  favorite?: boolean;
  custom_notes?: string | null;
  /** Fit tag. `fit_of` is the recipe that was scaled. `fit_goal` is the macro goal it was fitted to. `fit_source` is that recipe's ingredient list, so the same recipe is reused and an edit does not reuse a stale fit. */
  fit_of?: string | null;
  fit_goal?: string | null;
  fit_source?: string | null;
}

export interface SlimRecipe {
  uid: string;
  title: string;
  thumb: string | null;
  videoThumb: boolean;
  course: string;
  proteins: string[];
  collection: string;
  sourceLabel: string;
  date: string | null;
  dateMs: number | null;
  hasFull: boolean;
  hasPhoto: boolean;
  searchText: string;
  custom: boolean;
  isVersion: boolean;
  version: number | null;
  versionLabel: string;
  favorite: boolean;
  baseUid: string;
}

export interface RecipeMeta {
  title?: string;
  build_date?: string;
  recipe_count?: number;
  counts_per_collection?: Record<string, number>;
  mod_count?: number;
  version_count?: number;
}

export interface RecipeFile {
  metadata?: RecipeMeta;
  recipes?: Recipe[];
}

export type SortKey = "az" | "za" | "newest" | "source";

export interface FilterState {
  search: string;
  courses: string[];
  meats: string[];
  sources: string[];
  favorites: boolean;
  versionsOnly: boolean;
  photoOnly: boolean;
  fullOnly: boolean;
  sort: SortKey;
}

export type ThemeChoice = "light" | "dark" | "system";
