import { describe, expect, it } from "vitest";
import { computeModel, type Reader } from "../src/model/compute";
import { collectEnergyIds, validateConfig, type EnergyCardConfig } from "../src/model/config";
import { SOURCE } from "../src/editor/schema";
import { computeLayout, SECONDARY_H } from "../src/view/layout";

const reader = (values: Record<string, number>): Reader => (id) =>
  id in values ? { watts: values[id], valid: true } : { watts: 0, valid: false };

const CFG: EnergyCardConfig = {
  type: "x",
  home: { total_entity: "sensor.total", total_energy_entity: "sensor.total_e" },
  sources: [
    { entity: "sensor.pv", energy_entity: "sensor.pv_e", type: "solar" },
    { entity: "sensor.bat", energy_entity: "sensor.bat_out", energy_entity_return: "sensor.bat_in", type: "battery" },
    { entity: "sensor.grid", energy_entity: "sensor.grid_in", energy_entity_return: "sensor.grid_out", type: "grid" },
  ],
  rooms: [{ area_id: "a", consumers: [{ entity: "sensor.x", energy_entity: "sensor.x_e" }] }],
};
const energy = (values: Record<string, number>) => computeModel(CFG, reader(values), undefined, undefined, true);

describe("feed-in and charging in the energy mode", () => {
  it("keeps what a source delivered as its value and reads the other direction separately", () => {
    const m = energy({ "sensor.pv_e": 12400, "sensor.bat_out": 2000, "sensor.bat_in": 2400, "sensor.grid_in": 5100, "sensor.grid_out": 3800, "sensor.total_e": 15700 });
    const [, bat, grid] = m.sources;
    expect(grid).toMatchObject({ watts: 5100, returned: 3800, flow: 1300, reverse: false, returnCounter: true });
    // the battery took more than it gave: the line points to the battery
    expect(bat).toMatchObject({ watts: 2000, returned: 2400, flow: -400, reverse: true });
    // self-sufficiency is unchanged: import / consumption
    expect(m.autarky).toBeCloseTo(1 - 5100 / 15700);
  });

  it("computes the self-consumption from solar and feed-in", () => {
    const m = energy({ "sensor.pv_e": 12400, "sensor.grid_in": 5100, "sensor.grid_out": 3800, "sensor.total_e": 15700 });
    expect(m.selfConsumption).toBeCloseTo((12400 - 3800) / 12400);
    // more feed-in than production (other sources feeding in) is clamped
    expect(energy({ "sensor.pv_e": 1000, "sensor.grid_in": 0, "sensor.grid_out": 3000 }).selfConsumption).toBe(0);
  });

  it("has no self-consumption without solar, without production or without a feed-in counter", () => {
    const noSolar: EnergyCardConfig = { ...CFG, sources: CFG.sources!.filter((s) => s.type !== "solar") };
    expect(computeModel(noSolar, reader({ "sensor.grid_in": 1, "sensor.grid_out": 1 }), undefined, undefined, true).selfConsumption).toBeNull();
    expect(energy({ "sensor.pv_e": 0, "sensor.grid_in": 100, "sensor.grid_out": 0 }).selfConsumption).toBeNull();
    // the feed-in counter cannot be read
    expect(energy({ "sensor.pv_e": 12400, "sensor.grid_in": 5100 }).selfConsumption).toBeNull();
    const noReturn: EnergyCardConfig = { ...CFG, sources: CFG.sources!.map((s) => (s.type === "grid" ? { ...s, energy_entity_return: undefined } : s)) };
    expect(computeModel(noReturn, reader({ "sensor.pv_e": 12400, "sensor.grid_in": 5100 }), undefined, undefined, true).selfConsumption).toBeNull();
  });

  it("uses the export of the grid in the power mode", () => {
    const m = computeModel(CFG, reader({ "sensor.pv": 4000, "sensor.bat": 0, "sensor.grid": -1000, "sensor.total": 3000, "sensor.x": 3000 }));
    expect(m.selfConsumption).toBeCloseTo(0.75);
    // importing: all of the solar power is used in the home
    expect(computeModel(CFG, reader({ "sensor.pv": 2000, "sensor.bat": 0, "sensor.grid": 500 })).selfConsumption).toBe(1);
    // at night there is nothing to share
    expect(computeModel(CFG, reader({ "sensor.pv": 0, "sensor.bat": 0, "sensor.grid": 500 })).selfConsumption).toBeNull();
    // the grid cannot be read
    expect(computeModel(CFG, reader({ "sensor.pv": 2000, "sensor.bat": 0 })).selfConsumption).toBeNull();
    // the return counters play no part in the power mode
    expect(m.sources[2]).toMatchObject({ watts: -1000, flow: -1000, reverse: true, returned: undefined });
  });

  it("validates the return counter and asks the statistics for it", () => {
    expect(() => validateConfig(CFG)).not.toThrow();
    expect(() => validateConfig({ type: "x", sources: [{ entity: "sensor.pv", type: "solar", energy_entity_return: "sensor.pv_back" }] })).toThrow(/sources\[0\]\.energy_entity_return: only for the types grid, battery and generic/);
    expect(() => validateConfig({ type: "x", sources: [{ entity: "sensor.g", energy_entity_return: "light.x" }] })).toThrow(/sources\[0\]\.energy_entity_return/);
    expect(() => validateConfig({ type: "x", options: { show_self_consumption: "yes" } })).toThrow(/options\.show_self_consumption/);
    expect(collectEnergyIds(CFG)).toEqual(expect.arrayContaining(["sensor.bat_in", "sensor.grid_out"]));
  });

  it("offers the return field for grid, battery and generic sources only", () => {
    const field = SOURCE.find((f) => f.path === "energy_entity_return")!;
    expect(field.when!({ type: "grid" })).toBe(true);
    expect(field.when!({ type: "battery" })).toBe(true);
    expect(field.when!({})).toBe(true);
    expect(field.when!({ type: "solar" })).toBe(false);
  });

  it("gives the sources one line more for the other direction", () => {
    const base = { width: 400, sources: 3, floors: 0, rooms: 1 };
    const a = computeLayout(base);
    const b = computeLayout({ ...base, returnLine: true });
    expect(b.sourceH - a.sourceH).toBe(SECONDARY_H);
    expect(b.yHome - a.yHome).toBe(SECONDARY_H);
    expect(computeLayout({ ...base, returnLine: true, secondary: true }).sourceH - a.sourceH).toBe(2 * SECONDARY_H);
  });
});
