import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { COURSE_ORDER, MEAT_ORDER, SOURCE_ORDER, SOURCE_SHORT, meatLabel } from "@/lib/recipes/classify";
import type { FilterState } from "@/lib/recipes/types";

export function FiltersBody({
  filters,
  counts,
  totals,
  onChange,
}: {
  filters: FilterState;
  counts: { courses: Record<string, number>; meats: Record<string, number>; sources: Record<string, number> };
  totals: { meats: Record<string, number> };
  onChange: (next: FilterState) => void;
}) {
  const toggle = (key: "courses" | "meats" | "sources", value: string) => {
    const current = filters[key];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    onChange({ ...filters, [key]: next });
  };

  const meats = MEAT_ORDER.filter((meat) => (totals.meats[meat] ?? 0) > 0);

  return (
    <div className="flex flex-col gap-6">
      <FilterSection title="Meat type">
        {meats.map((meat) => (
          <Choice
            key={meat}
            label={meatLabel(meat)}
            count={counts.meats[meat] ?? 0}
            selected={filters.meats.includes(meat)}
            onClick={() => toggle("meats", meat)}
          />
        ))}
      </FilterSection>
      <FilterSection title="Course">
        {COURSE_ORDER.map((course) => (
          <Choice
            key={course}
            label={course}
            count={counts.courses[course] ?? 0}
            selected={filters.courses.includes(course)}
            onClick={() => toggle("courses", course)}
          />
        ))}
      </FilterSection>
      <FilterSection title="Source">
        <button
          type="button"
          aria-pressed={filters.favorites}
          aria-label="Favorites"
          onClick={() => onChange({ ...filters, favorites: !filters.favorites })}
          className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-sm ${filters.favorites ? "border-gold bg-gold-bg text-gold" : "border-line bg-chip"}`}
        >
          <Star className={`size-4 ${filters.favorites ? "fill-current" : ""}`} />
          Favorites
        </button>
        {SOURCE_ORDER.map((source) => (
          <Choice
            key={source}
            label={SOURCE_SHORT[source] ?? source}
            count={counts.sources[source] ?? 0}
            selected={filters.sources.includes(source)}
            onClick={() => toggle("sources", source)}
          />
        ))}
        <button
          type="button"
          aria-pressed={filters.versionsOnly}
          onClick={() => onChange({ ...filters, versionsOnly: !filters.versionsOnly })}
          className={`inline-flex h-10 items-center rounded-full border px-3 text-sm ${filters.versionsOnly ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-chip"}`}
        >
          Saved Versions
        </button>
      </FilterSection>
      <div className="flex flex-col gap-1 border-t border-line pt-4">
        <Switch
          label="With photo only"
          hint="Hides recipes that have no photo and no video thumbnail."
          on={filters.photoOnly}
          onClick={() => onChange({ ...filters, photoOnly: !filters.photoOnly })}
        />
        <Switch
          label="Has full recipe"
          hint="Keeps recipes with both an ingredient list and steps."
          on={filters.fullOnly}
          onClick={() => onChange({ ...filters, fullOnly: !filters.fullOnly })}
        />
      </div>
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function Choice({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  const dim = count === 0 && !selected;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-sm ${selected ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-chip"} ${dim ? "opacity-40" : ""}`}
    >
      {label}
      <span className="tabular-nums opacity-75">{count}</span>
    </button>
  );
}

function Switch({ label, hint, on, onClick }: { label: string; hint: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} className="flex items-center justify-between gap-4 py-2 text-left">
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full ${on ? "bg-tomato" : "bg-line"}`}>
        <span className={`absolute top-0.5 size-6 rounded-full bg-surface shadow ${on ? "left-5" : "left-0.5"}`} />
      </span>
    </button>
  );
}
