import { formatQuantity } from "./format";
import type { Recipe } from "./types";

export interface IngredientLine {
  key: string;
  text: string;
  estimated: boolean;
  /** Copied from the ingredient's pair.ts fields. "zero" has no sourcedName. Ignored lines stay null and render nothing. */
  sourcedName: string | null;
  sourcedMatch: "exact" | "closest" | "none" | "zero" | null;
  /** Uid of another recipe this line includes whole. Not a pantry item. */
  sourcedRecipe: string | null;
}

export interface IngredientGroup {
  heading: string | null;
  lines: IngredientLine[];
}

export interface StepGroup {
  heading: string | null;
  steps: string[];
}

export interface VideoLink {
  url: string;
  label: string;
}

function cleanHeading(heading: string | null | undefined, onlyOne: boolean): string | null {
  if (!heading) return null;
  const trimmed = heading.trim();
  if (!trimmed) return null;
  if (onlyOne && /^ingredients$/i.test(trimmed)) return null;
  return trimmed;
}

export function makesLabel(recipe: { title?: string | null; yield?: string | null; servings?: string | number | null } | null | undefined): string {
  if (!recipe) return "";
  const written = recipe.yield?.trim() || (recipe.servings != null && String(recipe.servings).trim() ? `${recipe.servings} servings` : "");
  const count = written.match(/\d+(?:\.\d+)?/)?.[0];
  const title = (recipe.title || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (count && /\bcrepes?\b/.test(title)) return `${count} crepes`;
  if (count && /\btortillas?\b/.test(title)) return `${count} tortillas`;
  if (count && /\bwraps?\b/.test(title)) return `${count} wraps`;
  return written;
}

export function ingredientGroups(recipe: Recipe): { groups: IngredientGroup[]; note: string | null; estimated: boolean } {
  if (Array.isArray(recipe.ingredient_sections) && recipe.ingredient_sections.some((section) => section.items?.length)) {
    const groups: IngredientGroup[] = [];
    recipe.ingredient_sections.forEach((section, sectionIndex) => {
      const lines: IngredientLine[] = [];
      (section.items ?? []).forEach((item, itemIndex) => {
        const text = (item.raw || [formatQuantity(item.quantity), item.unit, item.item].filter(Boolean).join(" ")).trim();
        if (!text) return;
        lines.push({ key: `${sectionIndex}-${itemIndex}`, text, estimated: false, sourcedName: item.sourced_name ?? null, sourcedMatch: item.sourced_match ?? null, sourcedRecipe: item.sourced_recipe ?? null });
      });
      if (lines.length) groups.push({ heading: section.heading ?? null, lines });
    });
    const onlyOne = groups.length === 1;
    return {
      groups: groups.map((group) => ({ ...group, heading: cleanHeading(group.heading, onlyOne) })),
      note: null,
      estimated: false,
    };
  }

  if (Array.isArray(recipe.ingredients) && recipe.ingredients.length) {
    const rows: Array<IngredientLine & { section: string | null }> = [];
    recipe.ingredients.forEach((entry, index) => {
      if (typeof entry === "string") {
        const text = entry.trim();
        if (text) rows.push({ key: `s-${index}`, text, estimated: false, section: null, sourcedName: null, sourcedMatch: null, sourcedRecipe: null });
        return;
      }
      const text = (entry.raw || [formatQuantity(entry.quantity ?? entry.quantity_value), entry.unit, entry.item].filter(Boolean).join(" ")).trim();
      if (!text) return;
      rows.push({
        key: `o-${index}`,
        text,
        estimated: Boolean(entry.estimated),
        section: entry.section?.trim() || null,
        sourcedName: entry.sourced_name ?? null,
        sourcedMatch: entry.sourced_match ?? null,
        sourcedRecipe: entry.sourced_recipe ?? null,
      });
    });

    const groups: IngredientGroup[] = [];
    for (const line of rows) {
      const last = groups[groups.length - 1];
      const row = { key: line.key, text: line.text, estimated: line.estimated, sourcedName: line.sourcedName, sourcedMatch: line.sourcedMatch, sourcedRecipe: line.sourcedRecipe };
      if (!last || last.heading !== line.section) groups.push({ heading: line.section, lines: [row] });
      else last.lines.push(row);
    }
    const onlyOne = groups.length === 1;
    return {
      groups: groups.map((group) => ({ ...group, heading: cleanHeading(group.heading, onlyOne) })),
      note: null,
      estimated: false,
    };
  }

  if (Array.isArray(recipe.estimated_ingredients) && recipe.estimated_ingredients.length) {
    const lines: IngredientLine[] = recipe.estimated_ingredients
      .map((entry, index) => {
        const text = [formatQuantity(entry.quantity), entry.unit, entry.item].filter(Boolean).join(" ").trim();
        return { key: `e-${index}`, text, estimated: entry.estimated === true, sourcedName: entry.sourced_name ?? null, sourcedMatch: entry.sourced_match ?? null, sourcedRecipe: entry.sourced_recipe ?? null };
      })
      .filter((line) => line.text);
    return {
      groups: lines.length ? [{ heading: null, lines }] : [],
      note: recipe.estimate_note || "Ingredient amounts are estimated for one serving and are not from the original post.",
      estimated: true,
    };
  }

  return { groups: [], note: null, estimated: false };
}

export function stepGroups(recipe: Recipe): StepGroup[] {
  if (Array.isArray(recipe.instruction_sections) && recipe.instruction_sections.some((section) => section.steps?.some((step) => step?.trim()))) {
    const groups = recipe.instruction_sections
      .map((section) => ({
        heading: section.heading?.trim() || null,
        steps: (section.steps ?? []).map((step) => step.trim()).filter(Boolean),
      }))
      .filter((group) => group.steps.length);
    const onlyOne = groups.length === 1;
    return groups.map((group) => ({
      ...group,
      heading: onlyOne && group.heading && /^instructions$/i.test(group.heading) ? null : group.heading,
    }));
  }

  if (Array.isArray(recipe.instructions) && recipe.instructions.length) {
    const groups: StepGroup[] = [];
    recipe.instructions.forEach((entry) => {
      const text = typeof entry === "string" ? entry.trim() : entry.text?.trim() || "";
      if (!text) return;
      const heading = typeof entry === "string" ? null : entry.section?.trim() || null;
      const last = groups[groups.length - 1];
      if (!last || last.heading !== heading) groups.push({ heading, steps: [text] });
      else last.steps.push(text);
    });
    return groups;
  }

  return [];
}

export function postFallback(recipe: Recipe): { text: string; replies: string[] } | null {
  if (stepGroups(recipe).length) return null;
  const text = recipe.full_text?.trim() || "";
  const replies = (recipe.self_reply_texts ?? []).map((reply) => reply.trim()).filter(Boolean);
  if (!text && !replies.length) return null;
  return { text, replies };
}

export function videoLinks(recipe: Recipe): VideoLink[] {
  const links: VideoLink[] = [];
  for (const item of recipe.media ?? []) {
    if (item?.type === "video" && item.video_url) {
      links.push({ url: item.video_url, label: links.length ? `Watch video ${links.length + 1}` : "Watch video" });
    }
  }
  return links;
}

export function macroPills(recipe: Recipe): Array<{ label: string; value: string }> | null {
  const nutrition = recipe.nutrition;
  if (!nutrition || nutrition.as_stated?.length) {
    return null;
  }
  const pills: Array<{ label: string; value: string }> = [];
  if (typeof nutrition.calories === "number") pills.push({ label: "Calories", value: String(Math.round(nutrition.calories)) });
  if (typeof nutrition.protein_g === "number") pills.push({ label: "Protein", value: `${trimNum(nutrition.protein_g)}g` });
  if (typeof nutrition.fat_g === "number") pills.push({ label: "Fat", value: `${trimNum(nutrition.fat_g)}g` });
  if (typeof nutrition.net_carbs_g === "number") pills.push({ label: "Net carbs", value: `${trimNum(nutrition.net_carbs_g)}g` });
  return pills.length ? pills : null;
}

function trimNum(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function noteLines(recipe: Recipe): string[] {
  if (!recipe.notes) return [];
  if (typeof recipe.notes === "string") return recipe.notes.trim() ? [recipe.notes.trim()] : [];
  if (Array.isArray(recipe.notes)) return recipe.notes.map((note) => String(note).trim()).filter(Boolean);
  return [];
}
