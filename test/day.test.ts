import { describe, expect, it } from "vitest";
import { computeModel, type Reader } from "../src/model/compute";
import { validateConfig, type EnergyCardConfig } from "../src/model/config";
import { SURPLUS_DEFAULT_W, SURPLUS_KEEP, dayTiles, surplusDevices, surplusOf } from "../src/model/day";

const reader = (values: Record<string, number>): Reader => (id) => (id in values ? { watts: values[id], valid: true } : { watts: 0, valid: false });

const cfg: EnergyCardConfig = {
  type: "x",
  sources: [
    { entity: "sensor.pv", type: "solar" },
    { entity: "sensor.grid", type: "grid" },
  ],
};
const power = (pv: number, grid: number) => computeModel(cfg, reader({ "sensor.pv": pv, "sensor.grid": grid }));

describe("surplusOf", () => {
  it("reports the feed-in from the limit on", () => {
    expect(surplusOf(power(4000, -3400), SURPLUS_DEFAULT_W, false)?.watts).toBe(3400);
    expect(surplusOf(power(4000, -400), SURPLUS_DEFAULT_W, false)).toBeUndefined();
    expect(surplusOf(power(4000, 300), SURPLUS_DEFAULT_W, false)).toBeUndefined();
  });
  it("keeps a shown banner until the feed-in falls below 80 % of the limit", () => {
    const w = SURPLUS_DEFAULT_W * SURPLUS_KEEP;
    expect(surplusOf(power(4000, -(w + 10)), SURPLUS_DEFAULT_W, true)).toBeDefined();
    expect(surplusOf(power(4000, -(w + 10)), SURPLUS_DEFAULT_W, false)).toBeUndefined();
    expect(surplusOf(power(4000, -(w - 10)), SURPLUS_DEFAULT_W, true)).toBeUndefined();
  });
  it("names what using it at home saves per hour: the price minus the compensation", () => {
    expect(surplusOf(power(5000, -2000), 500, false, 0.3, 0.08)?.savedPerHour).toBeCloseTo(0.44);
    expect(surplusOf(power(5000, -2000), 500, false, 0.3)?.savedPerHour).toBeCloseTo(0.6);
    expect(surplusOf(power(5000, -2000), 500, false)?.savedPerHour).toBeUndefined();
    expect(surplusOf(power(5000, -2000), 500, false, 0.05, 0.08)?.savedPerHour).toBe(0);
  });
});

describe("dayTiles", () => {
  const energy: EnergyCardConfig = {
    type: "x",
    home: { total_energy_entity: "sensor.e_home" },
    sources: [
      { entity: "sensor.pv", type: "solar", energy_entity: "sensor.e_pv" },
      { entity: "sensor.bat", type: "battery", energy_entity: "sensor.e_bat", energy_entity_return: "sensor.e_bat_in" },
      { entity: "sensor.grid", type: "grid", energy_entity: "sensor.e_grid", energy_entity_return: "sensor.e_grid_out" },
    ],
  };
  const values = { "sensor.e_pv": 14200, "sensor.e_bat": 4200, "sensor.e_bat_in": 6100, "sensor.e_grid": 2100, "sensor.e_grid_out": 6300, "sensor.e_home": 12000 };
  it("sums the values of today and the self-sufficiency", () => {
    const tiles = dayTiles(computeModel(energy, reader(values), () => ({ watts: 0, valid: false }), undefined, true));
    expect(tiles.map((t) => t.kind)).toEqual(["solar", "import", "export", "battery", "home", "autarky"]);
    expect(tiles.find((t) => t.kind === "solar")?.wh).toBe(14200);
    expect(tiles.find((t) => t.kind === "export")?.wh).toBe(6300);
    expect(tiles.find((t) => t.kind === "battery")).toMatchObject({ wh: 6100, whOut: 4200 });
    expect(tiles.find((t) => t.kind === "autarky")?.share).toBeCloseTo(1 - 2100 / 12000);
  });
  it("leaves out what is not configured: no feed-in counter, no battery", () => {
    const small: EnergyCardConfig = { type: "x", sources: [{ entity: "sensor.grid", type: "grid", energy_entity: "sensor.e_grid" }] };
    const tiles = dayTiles(computeModel(small, reader({ "sensor.e_grid": 1000 }), () => ({ watts: 0, valid: false }), undefined, true));
    expect(tiles.map((t) => t.kind)).toEqual(["import"]);
  });
});

describe("options of the overview package", () => {
  const base = { type: "x", sources: [{ entity: "sensor.a", type: "grid" }] };
  it("want true or false", () => {
    for (const key of ["lines_by_source", "show_surplus", "show_day_values"]) {
      expect(() => validateConfig({ ...base, options: { [key]: true } })).not.toThrow();
      expect(() => validateConfig({ ...base, options: { [key]: 1 } })).toThrow(new RegExp(`options\\.${key} must be true or false`));
    }
  });
  it("want a surplus limit above 0", () => {
    expect(() => validateConfig({ ...base, options: { surplus_min_w: 800 } })).not.toThrow();
    for (const bad of [0, -5, "500", NaN]) expect(() => validateConfig({ ...base, options: { surplus_min_w: bad } })).toThrow(/surplus_min_w must be a number greater than 0/);
  });
});

describe("surplusDevices", () => {
  const withDevices = validateConfig({
    type: "x",
    sources: cfg.sources,
    floors: [{ floor_id: "eg", rooms: [{ area_id: "kueche", consumers: [{ entity: "sensor.spuel", surplus_w: 2000 }, { entity: "sensor.kaffee", name: "Kaffee", surplus_w: 1200, switch_entity: "switch.kaffee" }, { entity: "sensor.herd" }] }] }],
    consumers: [{ entity: "sensor.licht", surplus_w: 60 }, { entity: "sensor.ofen", surplus_w: 2500 }, { entity: "sensor.tv", surplus_w: 100 }],
  });
  const model = (surplus: number, extra: Record<string, number> = {}) =>
    computeModel(withDevices, reader({ "sensor.pv": 4000, "sensor.grid": -surplus, "sensor.spuel": 0, "sensor.kaffee": 0, "sensor.herd": 0, "sensor.licht": 0, "sensor.ofen": 0, "sensor.tv": 0, ...extra }));
  it("names idle consumers that fit, the biggest first, at most three", () => {
    expect(surplusDevices(model(3000), 3000).map((d) => d.entity)).toEqual(["sensor.ofen", "sensor.spuel", "sensor.kaffee"]);
    expect(surplusDevices(model(1300), 1300).map((d) => d.entity)).toEqual(["sensor.kaffee", "sensor.tv", "sensor.licht"]);
  });
  it("leaves out running consumers and ones that do not fit, and passes the switch on", () => {
    const d = surplusDevices(model(1300, { "sensor.kaffee": 900 }), 1300);
    expect(d.map((x) => x.entity)).toEqual(["sensor.tv", "sensor.licht"]);
    expect(surplusDevices(model(50), 50)).toEqual([]);
    expect(surplusDevices(model(3000), 3000).find((x) => x.entity === "sensor.kaffee")).toMatchObject({ name: "Kaffee", switchEntity: "switch.kaffee", watts: 1200 });
  });
  it("rejects a typical power that is not a positive number", () => {
    expect(() => validateConfig({ type: "x", sources: cfg.sources, consumers: [{ entity: "sensor.a", surplus_w: 0 }] })).toThrow(/surplus_w/);
  });
});
