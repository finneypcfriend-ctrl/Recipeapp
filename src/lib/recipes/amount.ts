const GLYPHS: Record<string, string> = {
  "½": "1/2",
  "⅓": "1/3",
  "⅔": "2/3",
  "¼": "1/4",
  "¾": "3/4",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};

const FRACTIONS: Array<[number, string]> = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [1 / 2, "½"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
];

export function parseAmount(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  let text = String(value).trim();
  if (!text) return null;
  text = text.replace(/(\d)\s*([½⅓⅔¼¾⅛⅜⅝⅞])/g, (_, whole, glyph) => `${whole} ${GLYPHS[glyph] ?? glyph}`);
  text = text.replace(/[½⅓⅔¼¾⅛⅜⅝⅞]/g, (glyph) => GLYPHS[glyph] ?? glyph);
  const mixed = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const den = Number(mixed[3]);
    if (!den) return null;
    return Number(mixed[1]) + Number(mixed[2]) / den;
  }
  const fraction = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const den = Number(fraction[2]);
    if (!den) return null;
    return Number(fraction[1]) / den;
  }
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return "";
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs + 1e-8);
  const fraction = abs - whole;
  let body = "";
  if (fraction < 0.02) body = String(whole);
  else {
    const nearest = FRACTIONS.find(([amount]) => Math.abs(fraction - amount) < 0.02);
    if (nearest) body = whole > 0 ? `${whole}${nearest[1]}` : nearest[1];
    else {
      const rounded = Math.round(abs * 1000) / 1000;
      body = String(rounded);
    }
  }
  if (body === "0") return "0";
  return negative ? `-${body}` : body;
}

/** Teaspoons print as decimals: 0.5, 1.25, 1.5. Not ½ or 1½. */
export function formatTsp(value: number): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(Math.abs(value) * 1000) / 1000;
  return String(rounded);
}

export function scaleRatio(oldQuantity: string, nextQuantity: string): number | null {
  const oldAmount = parseAmount(oldQuantity);
  const nextAmount = parseAmount(nextQuantity);
  if (oldAmount == null || nextAmount == null || oldAmount === 0) return null;
  return nextAmount / oldAmount;
}
