/** Colors by power range: from `from` watts upwards the line / bar gets `color`. */
export interface ThresholdConfig {
  from: number;
  color: string;
}

/** Below this power a node or consumer counts as idle (also: no animation). */
export const IDLE_BELOW_W = 1;

export const isIdle = (watts: number): boolean => Math.abs(watts) < IDLE_BELOW_W;

/** Valid thresholds sorted by `from`; entries without a usable number or color are ignored. */
export function sortThresholds(list: ThresholdConfig[] | undefined): ThresholdConfig[] {
  return (list ?? [])
    .filter((t) => t && Number.isFinite(t.from) && t.from >= 0 && typeof t.color === "string" && t.color !== "")
    .sort((a, b) => a.from - b.from);
}

/**
 * Color of the highest range whose `from` is reached, undefined below the first range
 * (or without thresholds), so the normal flow / bar color applies there.
 * `sorted` must come from sortThresholds().
 */
export function thresholdColor(sorted: ThresholdConfig[], watts: number): string | undefined {
  const abs = Math.abs(watts);
  let color: string | undefined;
  for (const t of sorted) {
    if (abs >= t.from) color = t.color;
    else break;
  }
  return color;
}

/** `from` values used by more than one threshold (only the last of them would apply). */
export function duplicateThresholds(list: ThresholdConfig[] | undefined): number[] {
  const seen = new Set<number>();
  const dups = new Set<number>();
  for (const t of list ?? []) {
    if (seen.has(t.from)) dups.add(t.from);
    seen.add(t.from);
  }
  return [...dups];
}

/** Traffic-light style defaults offered by the editor, in watts. */
export const DEFAULT_THRESHOLDS: ThresholdConfig[] = [
  { from: 0, color: "#4caf50" },
  { from: 500, color: "#ff9800" },
  { from: 2000, color: "#f44336" },
];
