import { describe, expect, it } from "vitest";
import { computeModel, type Reader } from "../src/model/compute";
import type { EnergyCardConfig } from "../src/model/config";
import { buildSankey, type SankeyInput } from "../src/model/sankey";

const text = {
  unassigned: "Unassigned",
  unassignedIn: (n: string) => `Unassigned in ${n}`,
  feedIn: "Feed-in",
  charge: "Charging",
  consumer: (c: { entity: string }) => c.entity,
};

const CFG: EnergyCardConfig = {
  type: "x",
  home: { total_entity: "sensor.home" },
  sources: [
    { entity: "sensor.pv", type: "solar" },
    { entity: "sensor.grid", type: "grid" },
    { entity: "sensor.bat", type: "battery" },
  ],
  floors: [
    {
      floor_id: "eg",
      rooms: [
        { area_id: "kueche", consumers: [{ entity: "sensor.ofen" }, { entity: "sensor.kuehl" }] },
        { area_id: "bad", consumers: [{ entity: "sensor.boiler" }] },
      ],
    },
    { floor_id: "og", rooms: [{ area_id: "schlaf", consumers: [{ entity: "sensor.tv" }] }] },
  ],
};

const reader = (m: Record<string, number>): Reader => (id) => (id in m ? { watts: m[id], valid: true } : { watts: 0, valid: false });
const build = (values: Record<string, number>, over: Partial<SankeyInput> = {}, cfg = CFG) =>
  buildSankey({ model: computeModel(cfg, reader(values)), showUnassigned: true, energy: false, text, ...over });
const sum = (g: ReturnType<typeof build>, pred: (l: { from: string; to: string }) => boolean) =>
  g.links.filter(pred).reduce((t, l) => t + l.value, 0);
const ids = (g: ReturnType<typeof build>, col: number) => g.nodes.filter((n) => n.col === col).map((n) => n.id);

const DAY = { "sensor.pv": 3000, "sensor.grid": 1000, "sensor.bat": 0, "sensor.home": 4000, "sensor.ofen": 1500, "sensor.kuehl": 500, "sensor.boiler": 1000, "sensor.tv": 600 };

describe("sankey graph", () => {
  it("builds the columns sources, floors, rooms of all floors", () => {
    const g = build(DAY);
    expect(ids(g, 0)).toEqual(["s:sensor.pv", "s:sensor.grid"]);
    expect(ids(g, 1)).toEqual(["f:eg", "f:og", "u:home"]);
    expect(ids(g, 2)).toEqual(["r:kueche", "r:bad", "r:schlaf"]);
    expect(ids(g, 3)).toEqual([]);
  });

  it("splits every source over the first column in the share it supplies the home", () => {
    const g = build(DAY);
    // PV supplies 3000 of 4000 W: three quarters of every node of the first column
    const toEg = g.links.find((l) => l.id === "s:sensor.pv>f:eg")!;
    expect(toEg.value).toBeCloseTo(0.75 * 3000, 6);
    // the bands into a node add up to its value, the bands out of a source to what it delivers
    expect(sum(g, (l) => l.to === "f:eg")).toBeCloseTo(3000, 6);
    expect(sum(g, (l) => l.from === "s:sensor.grid")).toBeCloseTo(1000, 6);
    expect(g.nodes.find((n) => n.id === "f:eg")!.split).toBe(true);
  });

  it("shows only the rooms of the selected floor and the consumers of the selected room", () => {
    const g = build(DAY, { floorId: "eg", roomId: "kueche" });
    expect(ids(g, 2)).toEqual(["r:kueche", "r:bad"]);
    expect(ids(g, 3)).toEqual(["c:sensor.ofen", "c:sensor.kuehl"]);
    expect(sum(g, (l) => l.from === "r:kueche")).toBe(2000);
    // the other floor keeps its node, without rooms
    expect(ids(g, 1)).toContain("f:og");
    expect(g.links.some((l) => l.from === "f:og")).toBe(false);
  });

  it("ignores a selected room that is not visible", () => {
    expect(ids(build(DAY, { floorId: "eg", roomId: "schlaf" }), 3)).toEqual([]);
  });

  it("without floors draws sources, rooms and the consumers of the selected room", () => {
    const cfg: EnergyCardConfig = { ...CFG, floors: undefined, rooms: CFG.floors!.flatMap((f) => f.rooms!) };
    const g = build(DAY, { roomId: "bad" }, cfg);
    expect(ids(g, 1)).toEqual(["r:kueche", "r:bad", "r:schlaf", "u:home"]);
    expect(ids(g, 2)).toEqual(["c:sensor.boiler"]);
    expect(g.nodes.some((n) => n.col === 3)).toBe(false);
  });

  it("draws what no one measures, unless that is switched off", () => {
    const values = { ...DAY, "sensor.home": 4500 };
    expect(build(values).nodes.find((n) => n.id === "u:home")!.value).toBe(900);
    expect(build(values, { showUnassigned: false }).nodes.some((n) => n.id === "u:home")).toBe(false);
  });

  it("leaves out nodes without value and sources that are not readable", () => {
    const g = build({ ...DAY, "sensor.pv": 0, "sensor.tv": 0 });
    expect(ids(g, 0)).toEqual(["s:sensor.grid"]);
    expect(g.nodes.some((n) => n.id === "r:schlaf")).toBe(false);
    expect(ids(build({ "sensor.home": 0 }), 0)).toEqual([]);
  });

  it("draws feed-in and charging as nodes below the first column, fed by PV first", () => {
    // PV 5000 W, home 2000 W, 2500 W fed in, 500 W charged
    const g = build({ ...DAY, "sensor.pv": 5000, "sensor.grid": -2500, "sensor.bat": -500, "sensor.home": 2000, "sensor.ofen": 2000, "sensor.kuehl": 0, "sensor.boiler": 0, "sensor.tv": 0 });
    const feed = g.nodes.find((n) => n.id === "r:feedin")!;
    const charge = g.nodes.find((n) => n.id === "r:charge")!;
    expect([feed.col, feed.tail, feed.value]).toEqual([1, true, 2500]);
    expect([charge.col, charge.tail, charge.value]).toEqual([1, true, 500]);
    expect(sum(g, (l) => l.from === "s:sensor.pv" && l.to === "r:feedin")).toBe(2500);
    expect(sum(g, (l) => l.to === "r:charge")).toBe(500);
    // what is left of PV goes into the home; the grid takes no part (it exports, it does not deliver)
    expect(sum(g, (l) => l.from === "s:sensor.pv" && l.to.startsWith("f:"))).toBeCloseTo(2000, 6);
    expect(g.nodes.some((n) => n.id === "s:sensor.grid")).toBe(false);
    // the tail nodes come last in their column
    expect(ids(g, 1).slice(-2)).toEqual(["r:feedin", "r:charge"]);
  });

  it("charges the battery from the grid when nothing else produces, but never feeds the grid from the grid", () => {
    const g = build({ "sensor.pv": 0, "sensor.grid": 3000, "sensor.bat": -1000, "sensor.home": 2000, "sensor.ofen": 2000 });
    expect(sum(g, (l) => l.from === "s:sensor.grid" && l.to === "r:charge")).toBe(1000);
    expect(g.nodes.some((n) => n.id === "r:feedin")).toBe(false);
    expect(sum(g, (l) => l.from === "s:sensor.grid" && l.to.startsWith("f:"))).toBeCloseTo(2000, 6);
  });

  it("reads the return directions from the counters in the energy mode", () => {
    const cfg: EnergyCardConfig = {
      ...CFG,
      sources: [
        { entity: "sensor.pv", energy_entity: "sensor.pv_e", type: "solar" },
        { entity: "sensor.grid", energy_entity: "sensor.grid_in", energy_entity_return: "sensor.grid_out", type: "grid" },
      ],
      home: { total_energy_entity: "sensor.home_e" },
    };
    const values = { "sensor.pv_e": 8000, "sensor.grid_in": 1000, "sensor.grid_out": 5000, "sensor.home_e": 4000 };
    const model = computeModel(cfg, reader(values), undefined, undefined, true);
    const g = buildSankey({ model, showUnassigned: true, energy: true, text });
    expect(g.nodes.find((n) => n.id === "r:feedin")!.value).toBe(5000);
    expect(sum(g, (l) => l.from === "s:sensor.pv" && l.to === "r:feedin")).toBe(5000);
    // no room has a counter: the whole home is unassigned, PV supplies the 3000 of 4000 Wh that stay in the home
    expect(sum(g, (l) => l.from === "s:sensor.pv" && l.to === "u:home")).toBeCloseTo(3000, 6);
  });

  it("draws the meter remainders of a floor and of the selected room", () => {
    const cfg: EnergyCardConfig = {
      ...CFG,
      floors: [
        {
          floor_id: "eg",
          entity: "sensor.eg",
          rooms: [{ area_id: "kueche", entity: "sensor.kueche", consumers: [{ entity: "sensor.ofen" }] }],
        },
      ],
    };
    const g = build({ ...DAY, "sensor.eg": 3000, "sensor.kueche": 2000, "sensor.ofen": 1500, "sensor.home": 3000 }, { roomId: "kueche" }, cfg);
    expect(g.nodes.find((n) => n.id === "u:f:eg")).toMatchObject({ col: 2, value: 1000, name: "Unassigned in eg" });
    expect(g.nodes.find((n) => n.id === "u:r:kueche")).toMatchObject({ col: 3, value: 500, name: "Unassigned in kueche" });
    expect(build({ ...DAY, "sensor.eg": 3000, "sensor.kueche": 2000, "sensor.ofen": 1500, "sensor.home": 3000 }, { roomId: "kueche", showUnassigned: false }, cfg).nodes.some((n) => n.id.startsWith("u:"))).toBe(false);
  });

  it("marks what can be clicked by kind", () => {
    const g = build(DAY, { floorId: "eg", roomId: "kueche" });
    const kinds = new Set(g.nodes.map((n) => n.ref.kind));
    expect([...kinds].sort()).toEqual(["consumer", "floor", "room", "source", "unassigned"].filter((k) => kinds.has(k as never)));
  });
});
