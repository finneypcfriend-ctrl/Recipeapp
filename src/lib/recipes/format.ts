const FRACTIONS: Record<string, string> = {
  "0.125": "⅛",
  "0.25": "¼",
  "0.333": "⅓",
  "0.375": "⅜",
  "0.5": "½",
  "0.625": "⅝",
  "0.667": "⅔",
  "0.75": "¾",
  "0.875": "⅞",
};

export function formatQuantity(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value.trim();
  if (!Number.isFinite(value)) return "";
  const whole = Math.floor(value + 1e-8);
  const fraction = Math.round((value - whole) * 1000) / 1000;
  if (fraction === 0) return String(whole);
  const glyph = FRACTIONS[String(fraction)];
  if (!glyph) {
    const rounded = Math.round(value * 100) / 100;
    return String(rounded);
  }
  return whole > 0 ? `${whole}${glyph}` : glyph;
}

export function formatPublished(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatBuildDate(value: string | null | undefined): string {
  return formatPublished(value) ?? value ?? "Unknown";
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
