import { describe, expect, it } from "vitest";
import { computeModel, nodeKey, nodeValues, type Reader } from "../src/model/compute";
import { validateConfig, type EnergyCardConfig } from "../src/model/config";
import { computeLayout, FLOOR_H, ROOM_H, SECONDARY_H, SOURCE_H } from "../src/view/layout";

const reader = (values: Record<string, number>): Reader => (id) =>
  id in values ? { watts: values[id], valid: true } : { watts: 0, valid: false };

const CFG: EnergyCardConfig = {
  type: "x",
  home: { total_entity: "sensor.total", total_energy_entity: "sensor.total_e" },
  sources: [
    { entity: "sensor.pv", energy_entity: "sensor.pv_e", type: "solar" },
    { entity: "sensor.netz", type: "grid" },
  ],
  floors: [
    {
      floor_id: "eg",
      rooms: [
        { area_id: "kueche", consumers: [{ entity: "sensor.ofen", energy_entity: "sensor.ofen_e" }, { entity: "sensor.kaffee" }] },
        { area_id: "flur", consumers: [{ entity: "sensor.licht" }] },
      ],
    },
    { floor_id: "og", rooms: [{ area_id: "bad", consumers: [{ entity: "sensor.boiler" }] }] },
  ],
};

describe("second values", () => {
  it("are left out for nodes without a value, so no 0 kWh appears", () => {
    const energy = computeModel(CFG, reader({ "sensor.pv_e": 12400, "sensor.ofen_e": 4200 }), undefined, undefined, true);
    const v = nodeValues(energy);
    expect(v.get(nodeKey.source("sensor.pv"))).toBe(12400);
    // the grid has no energy counter
    expect(v.has(nodeKey.source("sensor.netz"))).toBe(false);
    expect(v.get(nodeKey.consumer("sensor.ofen"))).toBe(4200);
    expect(v.has(nodeKey.consumer("sensor.kaffee"))).toBe(false);
    // the kitchen sums its oven; the hall and the whole OG have no energy sensor at all
    expect(v.get(nodeKey.room("kueche"))).toBe(4200);
    expect(v.has(nodeKey.room("flur"))).toBe(false);
    expect(v.get(nodeKey.floor("eg"))).toBe(4200);
    expect(v.has(nodeKey.floor("og"))).toBe(false);
    expect(v.has(nodeKey.room("bad"))).toBe(false);
    // the home has its own counter, but it was not answered: it still sums the rooms that have a value
    expect(v.get(nodeKey.home)).toBe(4200);
  });

  it("take the power of every readable sensor in the energy mode", () => {
    const power = computeModel(CFG, reader({ "sensor.total": 3900, "sensor.pv": 3200, "sensor.netz": 300, "sensor.ofen": 1900, "sensor.kaffee": 0, "sensor.licht": 20, "sensor.boiler": 500 }));
    const v = nodeValues(power);
    expect(v.get(nodeKey.source("sensor.netz"))).toBe(300);
    expect(v.get(nodeKey.consumer("sensor.kaffee"))).toBe(0);
    expect(v.get(nodeKey.room("flur"))).toBe(20);
    expect(v.get(nodeKey.floor("og"))).toBe(500);
    expect(v.get(nodeKey.home)).toBe(3900);
  });

  it("use a room or floor meter even without consumer values", () => {
    const cfg: EnergyCardConfig = { type: "x", floors: [{ floor_id: "eg", energy_entity: "sensor.eg_e", rooms: [{ area_id: "a", energy_entity: "sensor.a_e" }] }] };
    const v = nodeValues(computeModel(cfg, reader({ "sensor.eg_e": 900, "sensor.a_e": 700 }), undefined, undefined, true));
    expect(v.get(nodeKey.room("a"))).toBe(700);
    expect(v.get(nodeKey.floor("eg"))).toBe(900);
  });

  it("leave the home out when nothing has a value", () => {
    const cfg: EnergyCardConfig = { type: "x", rooms: [{ area_id: "a", consumers: [{ entity: "sensor.x" }] }] };
    expect(nodeValues(computeModel(cfg, reader({}), undefined, undefined, true)).size).toBe(0);
  });

  it("are an option with four values", () => {
    for (const v of ["none", "auto", "today", "power"]) expect(() => validateConfig({ type: "x", options: { secondary_value: v } })).not.toThrow();
    expect(() => validateConfig({ type: "x", options: { secondary_value: "both" } })).toThrow(/options\.secondary_value/);
  });
});

describe("layout with a second value", () => {
  it("gives sources, floors and rooms one line more", () => {
    const base = { width: 400, sources: 3, floors: 3, rooms: 3 };
    const a = computeLayout(base);
    const b = computeLayout({ ...base, secondary: true });
    expect(a.sourceH).toBe(SOURCE_H);
    expect(b.sourceH).toBe(SOURCE_H + SECONDARY_H);
    expect(b.floorH).toBe(FLOOR_H + SECONDARY_H);
    expect(b.yHome - a.yHome).toBe(SECONDARY_H);
    expect(b.yRoom - a.yRoom).toBe(2 * SECONDARY_H);
    expect(b.height - a.height).toBe(3 * SECONDARY_H);
    expect(b.height).toBe(b.yRoom + ROOM_H + SECONDARY_H);
  });

  it("keeps the layout without the option", () => {
    const flat = computeLayout({ width: 400, sources: 2, floors: 0, rooms: 4 });
    expect(flat.sourceH).toBe(SOURCE_H);
    expect(flat.floorH).toBe(FLOOR_H);
    expect(flat.yRoom).toBe(flat.yHome + 102);
  });
});
