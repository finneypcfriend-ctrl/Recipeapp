import { Star } from "lucide-react";
import type { ReactNode } from "react";
import { COURSE_ORDER, SOURCE_ORDER, SOURCE_SHORT, meatLabel } from "@/lib/recipes/classify";
import type { FilterState } from "@/lib/recipes/types";

export function CatalogFilterChips({
  filters,
  counts,
  meats,
  loaded,
  onChange,
}: {
  filters: FilterState;
  counts: { courses: Record<string, number>; meats: Record<string, number>; sources: Record<string, number> };
  meats: readonly string[];
  loaded: boolean;
  onChange: (next: FilterState) => void;
}) {
  const toggle = (key: "courses" | "meats" | "sources", value: string) => {
    const list = filters[key];
    onChange({ ...filters, [key]: list.includes(value) ? list.filter((item) => item !== value) : [...list, value] });
  };
  const dim = (count: number, selected: boolean) => loaded && count === 0 && !selected;

  return (
    <>
      <ChipRow label="Course">
        <LightChip label="All" selected={filters.courses.length === 0} onClick={() => onChange({ ...filters, courses: [] })} />
        {COURSE_ORDER.map((course) => (
          <LightChip key={course} label={course} selected={filters.courses.includes(course)} dim={dim(counts.courses[course] ?? 0, filters.courses.includes(course))} onClick={() => toggle("courses", course)} />
        ))}
      </ChipRow>
      <ChipRow label="Meat">
        <LightChip label="All" selected={filters.meats.length === 0} onClick={() => onChange({ ...filters, meats: [] })} />
        {meats.map((meat) => (
          <LightChip key={meat} label={meatLabel(meat)} selected={filters.meats.includes(meat)} dim={dim(counts.meats[meat] ?? 0, filters.meats.includes(meat))} onClick={() => toggle("meats", meat)} />
        ))}
      </ChipRow>
      <ChipRow label="Source">
        <LightChip
          label="All"
          selected={filters.sources.length === 0 && !filters.favorites && !filters.versionsOnly}
          onClick={() => onChange({ ...filters, sources: [], favorites: false, versionsOnly: false })}
        />
        <button
          type="button"
          aria-pressed={filters.favorites}
          aria-label="Favorites"
          onClick={() => onChange({ ...filters, favorites: !filters.favorites })}
          className={`inline-flex h-10 shrink-0 items-center justify-center rounded-full border px-3 ${filters.favorites ? "border-gold bg-gold-bg text-gold" : "border-line bg-surface text-muted"}`}
        >
          <Star className={`size-4 ${filters.favorites ? "fill-current" : ""}`} />
        </button>
        {SOURCE_ORDER.map((source) => (
          <LightChip key={source} label={SOURCE_SHORT[source] ?? source} selected={filters.sources.includes(source)} dim={dim(counts.sources[source] ?? 0, filters.sources.includes(source))} onClick={() => toggle("sources", source)} />
        ))}
        <LightChip label="Saved Versions" selected={filters.versionsOnly} onClick={() => onChange({ ...filters, versionsOnly: !filters.versionsOnly })} />
      </ChipRow>
    </>
  );
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</span>
      <div className="chip-row -mr-4 flex min-w-0 flex-1 gap-2 overflow-x-auto pr-4">{children}</div>
    </div>
  );
}

function LightChip({ label, selected, dim = false, onClick }: { label: string; selected: boolean; dim?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={`h-10 shrink-0 rounded-full border px-3 text-sm font-medium ${selected ? "border-tomato bg-tomato text-tomato-ink" : "border-line bg-surface"} ${dim ? "opacity-40" : ""}`}>
      {label}
    </button>
  );
}
