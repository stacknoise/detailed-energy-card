import { describe, expect, it } from "vitest";
import { computeModel, listRemainder, nodeKey, nodeValues, type Reader } from "../src/model/compute";
import { ConfigError, collectEnergyIds, collectEntityIds, hasEnergy, validateConfig, type EnergyCardConfig } from "../src/model/config";
import { buildSankey } from "../src/model/sankey";
import { treeSeries } from "../src/model/timeline";
import { DIRECT_SLOT_W, computeLayout } from "../src/view/layout";
import { focusTargets } from "../src/view/focus";
import { consumerEntitiesExcept, findDuplicates } from "../src/editor/config-utils";

// consumers directly under the home: lights outside the house belong to no floor and no room
const floors: EnergyCardConfig = {
  type: "x",
  home: { total_entity: "sensor.home" },
  sources: [{ entity: "sensor.grid", type: "grid" }],
  consumers: [{ entity: "sensor.outdoor", name: "Outdoor" }, { entity: "sensor.pump", energy_entity: "sensor.pump_e" }],
  floors: [{ floor_id: "eg", rooms: [{ area_id: "kueche", consumers: [{ entity: "sensor.oven" }] }] }],
};
const reader = (m: Record<string, number>): Reader => (id) => (id in m ? { watts: m[id], valid: true } : { watts: 0, valid: false });
const values = { "sensor.home": 1000, "sensor.grid": 1000, "sensor.oven": 400, "sensor.outdoor": 100, "sensor.pump": 50 };

describe("the model", () => {
  it("has the consumers directly under the home as nodes", () => {
    const m = computeModel(floors, reader(values));
    expect(m.consumers.map((c) => [c.entity, c.watts])).toEqual([["sensor.outdoor", 100], ["sensor.pump", 50]]);
    expect(m.consumers[0].name).toBe("Outdoor");
  });
  it("counts them in what the home has assigned", () => {
    const m = computeModel(floors, reader(values));
    // home 1000 W, kitchen 400 W and 150 W directly under the home: 450 W are not recorded
    expect(m.unassigned).toBe(450);
    expect(listRemainder(m)).toEqual({ scope: "home", value: 450 });
  });
  it("sums them for a home without a meter", () => {
    const m = computeModel({ ...floors, home: undefined }, reader(values));
    expect(m.homeWatts).toBe(550);
  });
  it("is empty without the key, and nothing else changes", () => {
    const { consumers, ...rest } = floors;
    expect(consumers).toBeDefined();
    const m = computeModel(rest, reader(values));
    expect(m.consumers).toEqual([]);
    expect(m.unassigned).toBe(600);
  });
  it("gives them a second value, and the home one too", () => {
    const v = nodeValues(computeModel({ ...floors, home: undefined }, reader(values)));
    expect(v.get(nodeKey.consumer("sensor.outdoor"))).toBe(100);
    expect(v.get(nodeKey.home)).toBe(550);
  });
  it("reads a consumer with only an energy counter in the energy mode", () => {
    const m = computeModel(floors, reader({ "sensor.pump_e": 700 }), undefined, undefined, true);
    expect(m.consumers.find((c) => c.entity === "sensor.pump")).toMatchObject({ watts: 700, valid: true });
    expect(m.consumers.find((c) => c.entity === "sensor.outdoor")).toMatchObject({ noEnergy: true, valid: false });
  });
});

describe("the config", () => {
  it("is valid", () => {
    expect(() => validateConfig(floors)).not.toThrow();
  });
  it("needs a sensor for every consumer", () => {
    expect(() => validateConfig({ ...floors, consumers: [{ name: "x" }] })).toThrow(/consumers\[0\]: entity or energy_entity is required/);
  });
  it("must be a list", () => {
    expect(() => validateConfig({ ...floors, consumers: "x" })).toThrow(ConfigError);
  });
  it("assigns a sensor only once, also against the rooms", () => {
    expect(() => validateConfig({ ...floors, consumers: [{ entity: "sensor.oven" }] })).toThrow(/already assigned/);
    expect(() => validateConfig({ ...floors, consumers: [{ entity: "sensor.a" }, { entity: "sensor.a" }] })).toThrow(/already assigned/);
  });
  it("lists their sensors where the others are listed", () => {
    expect(collectEntityIds({ ...floors, consumers: [{ entity: "sensor.a", switch_entity: "switch.a" }] })).toEqual(expect.arrayContaining(["sensor.a", "switch.a"]));
    expect(collectEnergyIds(floors)).toContain("sensor.pump_e");
    expect(hasEnergy({ type: "x", consumers: [{ energy_entity: "sensor.e" }] })).toBe(true);
  });
  it("is checked by the editor: taken sensors and duplicates", () => {
    expect(consumerEntitiesExcept(floors, ["consumers", 0])).toEqual(expect.arrayContaining(["sensor.pump", "sensor.pump_e", "sensor.oven"]));
    expect(consumerEntitiesExcept(floors, ["consumers", 0])).not.toContain("sensor.outdoor");
    const dup = findDuplicates({ ...floors, consumers: [{ entity: "sensor.oven" }] });
    expect(dup).toEqual([{ entity: "sensor.oven", places: ["Home", "EG › kueche".replace("EG", "eg")] }]);
  });
});

describe("the layout", () => {
  const base = { width: 512, sources: 1, floors: 2, rooms: 2 };
  it("puts them in the row of the floors, after the floors", () => {
    const l = computeLayout({ ...base, direct: 2 });
    expect(l.directXs).toHaveLength(2);
    expect(l.floorXs).toHaveLength(4);
    expect(l.directXs).toEqual(l.floorXs.slice(2));
    expect(l.directYs).toEqual([l.yFloor, l.yFloor]);
    expect(l.directXs[0]).toBeGreaterThan(l.floorXs[1]);
  });
  it("leaves a layout without them as it was", () => {
    expect(computeLayout({ ...base, direct: 0 })).toEqual({ ...computeLayout(base) });
    expect(computeLayout(base).directXs).toEqual([]);
  });
  it("scrolls when the row is too full", () => {
    expect(computeLayout({ ...base, direct: 8 }).width).toBe(10 * DIRECT_SLOT_W);
    expect(computeLayout({ ...base, direct: 1 }).width).toBe(512);
  });
  it("puts them in the row of the rooms without floors", () => {
    const l = computeLayout({ width: 512, sources: 1, floors: 0, rooms: 2, direct: 2 });
    expect(l.roomXs).toHaveLength(4);
    expect(l.directXs).toEqual(l.roomXs.slice(2));
    expect(l.directYs).toEqual(l.roomYs.slice(2));
    expect(l.height).toBeGreaterThan(computeLayout({ width: 512, sources: 1, floors: 0, rooms: 2 }).yRoom);
  });
  it("shows them even when there is nothing else", () => {
    const l = computeLayout({ width: 512, sources: 1, floors: 0, rooms: 0, direct: 1 });
    expect(l.directXs).toHaveLength(1);
    expect(l.height).toBeGreaterThan(l.yRoom);
  });
});

describe("the focus", () => {
  const layout = computeLayout({ width: 512, sources: 1, floors: 2, rooms: 1, direct: 2 });
  const input = { layout, floors: 2, rooms: 1, direct: 2 };
  it("keeps them while nothing is selected, and hides them behind a selected floor", () => {
    expect(focusTargets({ ...input, focus: true }).direct.map((p) => p.o)).toEqual([1, 1]);
    expect(focusTargets({ ...input, focus: true, selFloor: 0 }).direct.map((p) => p.o)).toEqual([0, 0]);
    expect(focusTargets({ ...input, focus: false, selFloor: 0 }).direct.map((p) => p.o)).toEqual([1, 1]);
  });
  it("hides them behind a selected room without floors", () => {
    const flat = computeLayout({ width: 512, sources: 1, floors: 0, rooms: 2, direct: 1 });
    const i = { layout: flat, floors: 0, rooms: 2, direct: 1, focus: true };
    expect(focusTargets(i).direct[0].o).toBe(1);
    expect(focusTargets({ ...i, selRoom: 0 }).direct[0].o).toBe(0);
  });
});

describe("the Sankey diagram and the timeline", () => {
  const text = { unassigned: "U", unassignedIn: (n: string) => n, feedIn: "F", charge: "C", consumer: (c: { entity: string }) => c.entity };
  it("draws them next to the floors, fed by the sources", () => {
    const g = buildSankey({ model: computeModel(floors, reader(values)), showUnassigned: true, energy: false, text });
    const n = g.nodes.find((x) => x.id === "c:sensor.outdoor");
    expect(n).toMatchObject({ col: 1, value: 100 });
    expect(g.nodes.find((x) => x.id === "c:sensor.pump")?.value).toBe(50);
    expect(g.links.some((l) => l.from === "s:sensor.grid" && l.to === "c:sensor.outdoor")).toBe(true);
  });
  it("adds them to the series of the home", () => {
    const rows = new Map([
      ["sensor.pump_e", [{ start: 0, wh: 3 }]],
      ["sensor.kueche_e", [{ start: 0, wh: 5 }]],
    ]);
    const cfg: EnergyCardConfig = { type: "x", consumers: floors.consumers, rooms: [{ area_id: "kueche", energy_entity: "sensor.kueche_e" }] };
    const s = treeSeries(cfg, rows, [0], 3_600_000);
    expect(s.consumers.get("sensor.pump")).toEqual([3]);
    expect(s.home).toEqual([8]);
  });
});
