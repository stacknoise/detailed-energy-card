export interface StateLike {
  state: string;
  attributes: { unit_of_measurement?: string; friendly_name?: string; [k: string]: unknown };
}

const FACTORS: Record<string, number> = { W: 1, kW: 1000, MW: 1_000_000 };

/** Converts a power sensor state to watts; null if unavailable, non-numeric or wrong unit. */
export function stateToWatts(st: StateLike | undefined): number | null {
  if (!st) return null;
  const value = Number(st.state);
  if (st.state === "" || !Number.isFinite(value)) return null;
  const unit = st.attributes?.unit_of_measurement ?? "W";
  const factor = FACTORS[unit];
  return factor === undefined ? null : value * factor;
}

export type UnitOption = "auto" | "W" | "kW";

/** Formats watts, e.g. 3420 -> "3.42 kW" (auto). Values below 1 W show "0 W". */
export function formatPower(watts: number, unit: UnitOption = "auto", decimals = 2, locale?: string): string {
  const abs = Math.abs(watts);
  if (abs < 1) return "0 W";
  // Intl.NumberFormat throws outside 0..20; never let a bad option break rendering.
  const d = Number.isFinite(decimals) ? Math.min(20, Math.max(0, Math.trunc(decimals))) : 2;
  const useKw = unit === "kW" || (unit === "auto" && abs >= 1000);
  const nf = (n: number, d: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  return useKw ? `${nf(abs / 1000, d)} kW` : `${nf(abs, 0)} W`;
}
