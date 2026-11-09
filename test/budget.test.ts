import { describe, expect, it } from "vitest";
import { BUDGET_OVER, budgetStatus, yearPace } from "../src/model/budget";
import { validateConfig } from "../src/model/config";

describe("budgetStatus", () => {
  it("compares the use with the budget and with the straight pace", () => {
    const b = budgetStatus(1_000_000, 4000, 0.5);
    expect(b.usedKwh).toBe(1000);
    expect(b.share).toBeCloseTo(0.25);
    expect(b.projectedKwh).toBeCloseTo(2000);
    expect(b.over).toBe(false);
  });
  it("is over the pace from a little above it on", () => {
    expect(budgetStatus(2_000_000, 4000, 0.5).over).toBe(false);
    expect(budgetStatus(2_000_000 * (1 + BUDGET_OVER) + 100_000, 4000, 0.5).over).toBe(true);
    expect(budgetStatus(3_000_000, 4000, 0.5).projectedKwh).toBeCloseTo(6000);
  });
  it("does not project from the first days of the year", () => {
    expect(budgetStatus(10_000, 4000, 0.005).projectedKwh).toBe(4000);
    expect(budgetStatus(0, 4000, 0).over).toBe(false);
  });
  it("gives the share of the year that is over", () => {
    const a = new Date(Date.UTC(2026, 0, 1));
    const e = new Date(Date.UTC(2027, 0, 1));
    expect(yearPace(new Date(Date.UTC(2026, 6, 2, 12)), a, e)).toBeCloseTo(0.5, 2);
  });
  it("needs a positive number as the budget in the config", () => {
    expect(() => validateConfig({ type: "x", rooms: [], options: { year_budget_kwh: 0 } })).toThrow(/year_budget_kwh/);
    expect(() => validateConfig({ type: "x", rooms: [], options: { year_budget_kwh: 4000 } })).not.toThrow();
  });
});
