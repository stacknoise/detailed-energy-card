/** How the energy of the year so far compares with a yearly budget. */
export interface BudgetStatus {
  /** kWh used since the first of January */
  usedKwh: number;
  budgetKwh: number;
  /** used / budget, may be above 1 */
  share: number;
  /** the part of the year that is over, 0..1: where the used share should be by now */
  pace: number;
  /** the use of the year so far as a projection for the whole year, kWh */
  projectedKwh: number;
  /** the use is more than `BUDGET_OVER` above the pace */
  over: boolean;
}

/** The use may be this much above the straight pace before the budget counts as overrun (a bit of leeway for the winter). */
export const BUDGET_OVER = 0.05;
/** Under this share of the year the projection is too uncertain: it is left at the budget. */
export const BUDGET_MIN_PACE = 0.02;

/**
 * The yearly budget against the use so far. `pace` is the share of the year that has passed (in whole days of
 * the time zone); `projectedKwh` carries the use so far over the year at the same speed, from `BUDGET_MIN_PACE` on.
 */
export function budgetStatus(usedWh: number, budgetKwh: number, pace: number): BudgetStatus {
  const usedKwh = Math.max(0, usedWh) / 1000;
  const share = budgetKwh > 0 ? usedKwh / budgetKwh : 0;
  const p = Math.min(1, Math.max(0, pace));
  return { usedKwh, budgetKwh, share, pace: p, projectedKwh: p >= BUDGET_MIN_PACE ? usedKwh / p : budgetKwh, over: p > 0 && share > p * (1 + BUDGET_OVER) };
}

/** The share of the year that is over at `now` in a time zone: days since the first of January / days of the year. */
export function yearPace(now: Date, startOfYear: Date, startOfNextYear: Date): number {
  return (now.getTime() - startOfYear.getTime()) / (startOfNextYear.getTime() - startOfYear.getTime());
}
