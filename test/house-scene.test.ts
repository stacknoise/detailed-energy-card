import { describe, expect, it } from "vitest";
import { computeModel, type Reader } from "../src/model/compute";
import { validateConfig } from "../src/model/config";
import { CELL, PITCH, ROOM_INSET, SLAB, type HouseConfig, type RoomLayout, type SceneBox } from "../src/model/house";
import { buildHouseScene } from "../src/model/house-scene";
import { SOURCE_COLORS } from "../src/model/mix";
import { MOCK_FLOORS, MOCK_SLOTS, MOCK_VALUES, mockConfig, mockScene } from "./fixtures/house-scene";

const reader = (values: Record<string, number>): Reader => (id) =>
  id in values ? { watts: values[id], valid: true } : { watts: 0, valid: false };

/** The format of the fixture: 1,2 kW. */
const kw = (w: number): string => `${(w / 1000).toFixed(1).replace(".", ",")} kW`;

/** The sensor of a room's consumer; the battery room holds the sensor of the battery itself, as the model recognises it. */
const roomSensor = (area: string): string => (area === "akku" ? "sensor.akku" : `sensor.room_${area}`);

/** The example of the mocks as a real config with sensors: the fixture's structure and layout plus sources, floor meters and consumers. */
function mockInput(extra: Partial<HouseConfig> = {}, selection = {}) {
  const base = mockConfig();
  const config = validateConfig({
    ...base,
    ...extra,
    sources: [
      { entity: "sensor.pv", type: "solar", name: "Solaranlage" },
      { entity: "sensor.grid", type: "grid", name: "Netz" },
      { entity: "sensor.akku", type: "battery", name: "Akku" },
    ],
    floors: base.floors!.map((f, i) => ({
      ...f,
      entity: `sensor.floor_${f.floor_id}`,
      rooms: f.rooms!.map((r) => ({ ...r, consumers: [{ entity: roomSensor(r.area_id) }] })),
    })),
  }) as HouseConfig;
  const values: Record<string, number> = { "sensor.pv": MOCK_VALUES.solar * 1000, "sensor.grid": MOCK_VALUES.grid * 1000, "sensor.akku": -MOCK_VALUES.battery * 1000 };
  for (const f of MOCK_FLOORS) {
    values[`sensor.floor_${f.floor_id}`] = f.kw * 1000;
    for (const r of f.rooms) if (!r.battery) values[roomSensor(r.area_id)] = r.kw * 1000;
  }
  const model = computeModel(config, reader(values));
  return { model, config, selection, format: kw, lang: "de" };
}

const byKey = <T extends { key: string }>(list: T[]): Record<string, T> => Object.fromEntries(list.map((x) => [x.key, x]));
const close = (a: number[], b: number[]): void => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 0));

describe("buildHouseScene: the mock", () => {
  const scene = buildHouseScene(mockInput());
  const mock = mockScene();

  it("builds the same boxes as the fixture (order aside)", () => {
    expect(scene.boxes.map((b) => b.key).sort()).toEqual(mock.boxes.map((b) => b.key).sort());
    const mine = byKey(scene.boxes);
    for (const m of mock.boxes) {
      const b = mine[m.key];
      expect({ ...b, aria: undefined }).toEqual({ ...m, aria: undefined });
      if (m.kind === "slab" && m.floor_id) expect(b.aria).toBe(m.aria);
    }
  });

  it("builds the same labels as the fixture", () => {
    expect(scene.labels.map((l) => l.key).sort()).toEqual(mock.labels.map((l) => l.key).sort());
    const mine = byKey(scene.labels);
    for (const m of mock.labels) expect(mine[m.key]).toEqual(m);
  });

  it("builds the flow lines of the fixture with the colors of the sources", () => {
    const mine = byKey(scene.flows);
    const names: Record<string, string> = { "solar:roof": "solar:roof", "solar:eg": "floor:eg", "solar:og": "floor:og", "solar:keller": "floor:keller", "battery:keller": "battery:sensor.akku", "grid:keller": "grid:feed" };
    expect(scene.flows).toHaveLength(Object.keys(names).length);
    for (const m of mockScene().flows) {
      const f = mine[names[m.key]];
      expect(f.points).toHaveLength(m.points.length);
      m.points.forEach((p, i) => close(f.points[i], p));
      // the one deliberate difference to the mock: the node of the roof line sits where the line starts on the roof, not at its bend
      close(f.node!, m.key === "solar:roof" ? m.points[0] : m.node!);
      expect(f.color).toBe(m.color);
      expect(f.width).toBe(m.width);
      expect(f.active).toBe(true);
    }
  });

  it("shows the values of the model", () => {
    const l = byKey(scene.labels);
    expect(l["label:keller"].value).toBe("1,0 kW");
    expect(l["label:akku"].value).toBe("lädt 1,1 kW");
    expect(l["label:solar"].value).toBe("4,2 kW");
    expect(l["label:grid"].value).toBe("0,6 kW");
  });

  it("is deterministic and free of selection and dimming by default", () => {
    expect(buildHouseScene(mockInput())).toEqual(scene);
    expect([...scene.boxes, ...scene.labels, ...scene.flows].some((x) => x.dimmed)).toBe(false);
    expect(scene.boxes.some((b) => b.selected)).toBe(false);
  });
});

describe("buildHouseScene: selection", () => {
  it("marks a floor and dims the others with their rooms, labels and branches", () => {
    const s = buildHouseScene(mockInput({}, { floor_id: "eg" }));
    const boxes = byKey(s.boxes);
    expect(boxes["slab:eg"].selected).toBe(true);
    expect(boxes["slab:eg"].dimmed).toBe(false);
    expect(boxes["room:kueche"].dimmed).toBe(false);
    expect(boxes["slab:og"].dimmed).toBe(true);
    expect(boxes["room:bad"].dimmed).toBe(true);
    expect(byKey(s.labels)["label:bad"].dimmed).toBe(true);
    expect(byKey(s.flows)["floor:keller"].dimmed).toBe(true);
    expect(byKey(s.flows)["floor:eg"].dimmed).toBe(false);
    // roof, solar, battery, pole, their labels and lines fade out too; the ground stays
    expect(boxes.roof.dimmed).toBe(true);
    expect(s.boxes.filter((b) => b.kind === "solar" || b.kind === "battery" || b.kind === "mast").every((b) => b.dimmed)).toBe(true);
    expect(byKey(s.labels)["label:solar"].dimmed).toBe(true);
    expect(boxes.ground.dimmed).toBe(false);
    expect(byKey(s.flows)["solar:roof"].dimmed).toBe(true);
  });

  it("dims nothing without a selection", () => {
    const s = buildHouseScene(mockInput({}, {}));
    expect(s.boxes.some((b) => b.dimmed) || s.labels.some((l) => l.dimmed) || s.flows.some((f) => f.dimmed)).toBe(false);
  });

  it("marks a room and dims its neighbours; the floor is the context", () => {
    const s = buildHouseScene(mockInput({}, { area_id: "kueche" }));
    const boxes = byKey(s.boxes);
    expect(boxes["room:kueche"].selected).toBe(true);
    expect(boxes["room:kueche"].dimmed).toBe(false);
    expect(boxes["room:flur"].dimmed).toBe(true);
    expect(boxes["slab:eg"].selected).toBe(false);
    expect(boxes["slab:eg"].dimmed).toBe(false);
    expect(boxes["slab:og"].dimmed).toBe(true);
    const both = byKey(buildHouseScene(mockInput({}, { floor_id: "eg", area_id: "kueche" })).boxes);
    expect(both["slab:eg"].selected).toBe(false);
    expect(both["room:kueche"].selected).toBe(true);
  });
});

describe("buildHouseScene: lines", () => {
  const thresholds = [{ from: 0, color: "#00ff00" }, { from: 1000, color: "#ff0000", width: 5 }];

  it("takes threshold colors and widths of the level, own thresholds win", () => {
    const input = mockInput({ colors: { thresholds } });
    const flows = byKey(buildHouseScene(input).flows);
    expect(flows["solar:roof"].color).toBe("#ff0000");
    expect(flows["solar:roof"].width).toBe(5);
    expect(flows["grid:feed"].color).toBe("#00ff00");
    expect(flows["grid:feed"].width).toBe(2 + 0.75);
    const own = mockInput({ colors: { thresholds }, sources: undefined });
    own.config.sources![0].thresholds = [{ from: 0, color: "#123456" }];
    own.model.sources[0].thresholds = own.config.sources![0].thresholds;
    expect(byKey(buildHouseScene(own).flows)["solar:roof"].color).toBe("#123456");
  });

  it("takes the colors of the sources with lines_by_source, the branches the color of the leading source", () => {
    const flows = byKey(buildHouseScene(mockInput({ colors: { thresholds }, options: { lines_by_source: true } })).flows);
    expect(flows["solar:roof"].color).toBe(SOURCE_COLORS.solar);
    expect(flows["grid:feed"].color).toBe(SOURCE_COLORS.grid);
    expect(flows["battery:sensor.akku"].color).toBe(SOURCE_COLORS.battery);
    expect(flows["floor:eg"].color).toBe(SOURCE_COLORS.solar);
    expect(flows["floor:eg"].width).toBe(2);
  });

  it("lets an idle source keep its line but not move it, and runs the battery the right way", () => {
    const input = mockInput();
    const grid = input.model.sources.find((s) => s.type === "grid")!;
    grid.watts = 0;
    const idle = byKey(buildHouseScene(input).flows)["grid:feed"];
    expect(idle.active).toBe(false);
    const charging = byKey(buildHouseScene(mockInput()).flows)["battery:sensor.akku"];
    expect(charging.points[0][0]).toBeGreaterThan(150); // starts at the riser
    expect(charging.node).toEqual(charging.points[charging.points.length - 1]);
    const dis = mockInput();
    const bat = dis.model.sources.find((s) => s.type === "battery")!;
    bat.watts = 800;
    bat.reverse = false;
    const out = byKey(buildHouseScene(dis).flows)["battery:sensor.akku"];
    expect(out.points[0]).toEqual(charging.points[charging.points.length - 1]);
    expect(out.node).toEqual(out.points[0]);
    expect(byKey(buildHouseScene(dis).labels)["label:akku"].value).toBe("0,8 kW");
  });

  it("runs the grid line back to the pole while feeding in and says so in the label", () => {
    const input = mockInput();
    const grid = input.model.sources.find((s) => s.type === "grid")!;
    grid.watts = -700;
    grid.reverse = true;
    const s = buildHouseScene(input);
    const f = byKey(s.flows)["grid:feed"];
    expect(f.points[0][1]).toBeLessThan(f.points[1][1]);
    expect(byKey(s.labels)["label:grid"].value).toBe("Einspeisung 0,7 kW");
  });
});

describe("buildHouseScene: structure", () => {
  const cfg = (extra: Record<string, unknown>): HouseConfig => validateConfig({ type: "x", ...extra }) as HouseConfig;

  it("draws an empty home as ground and roof", () => {
    const config = cfg({});
    const s = buildHouseScene({ model: computeModel(config, reader({})), config, selection: {}, format: kw });
    expect(s.boxes.map((b) => b.key)).toEqual(["ground", "roof"]);
    expect(s.labels).toEqual([]);
    expect(s.flows).toEqual([]);
  });

  it("puts a home without floors on one anonymous floor, without a floor label", () => {
    const config = cfg({ rooms: [{ area_id: "a", name: "A", consumers: [{ entity: "sensor.a" }] }, { area_id: "b", name: "B", consumers: [{ entity: "sensor.b" }] }] });
    const s = buildHouseScene({ model: computeModel(config, reader({ "sensor.a": 300, "sensor.b": 200 })), config, selection: {}, format: kw });
    expect(s.boxes.filter((b) => b.key.startsWith("slab:"))).toHaveLength(1);
    expect(s.boxes.find((b) => b.kind === "slab")!.floor_id).toBeUndefined();
    expect(s.labels.some((l) => l.kind === "floor")).toBe(false);
    expect(s.labels.filter((l) => l.kind === "room").map((l) => l.value)).toEqual(["0,3 kW", "0,2 kW"]);
  });

  it("lays rooms without a layout out on the grid, inside it and without overlap", () => {
    for (const n of [1, 2, 3, 4, 5, 7]) {
      const rooms = Array.from({ length: n }, (_, i) => ({ area_id: `r${i}`, name: `R${i}`, consumers: [{ entity: `sensor.r${i}` }] }));
      const config = cfg({ floors: [{ floor_id: "f", name: "F", rooms }], house: { cols: 12, rows: 6 } });
      const s = buildHouseScene({ model: computeModel(config, reader({})), config, selection: {}, format: kw });
      const r = s.boxes.filter((b) => b.kind === "room");
      expect(r).toHaveLength(n);
      for (const b of r) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(12 * CELL);
        expect(b.y + b.d).toBeLessThanOrEqual(6 * CELL);
      }
      for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) expect(overlap(r[i], r[j])).toBe(false);
    }
  });

  it("follows the grid of the config and stacks floors in the order of the config", () => {
    const config = cfg({ house: { cols: 8, rows: 4 }, floors: [{ floor_id: "a", name: "A", rooms: [] }, { floor_id: "b", name: "B", rooms: [] }] });
    const s = buildHouseScene({ model: computeModel(config, reader({})), config, selection: {}, format: kw });
    expect(s).toMatchObject({ cols: 8, rows: 4 });
    const slabs = byKey(s.boxes);
    expect(slabs["slab:a"].z).toBe(0);
    expect(slabs["slab:b"].z).toBe(PITCH);
    expect(slabs["slab:a"].w).toBe(8 * CELL);
    expect(slabs.roof.z).toBe(2 * PITCH);
  });

  it("omits the label of a room that is too small and keeps its aria text", () => {
    const config = cfg({ floors: [{ floor_id: "f", name: "F", rooms: [{ area_id: "tiny", name: "Tiny", layout: { x: 0, y: 0, w: 1, h: 1 }, consumers: [{ entity: "sensor.t" }] }] }] });
    const s = buildHouseScene({ model: computeModel(config, reader({ "sensor.t": 100 })), config, selection: {}, format: kw });
    expect(s.labels.some((l) => l.key === "label:tiny")).toBe(false);
    expect(byKey(s.boxes)["room:tiny"].aria).toBe("Tiny, 0,1 kW");
  });

  it("gives a battery without a room a block of its own and a line into it", () => {
    const config = cfg({ sources: [{ entity: "sensor.bat", type: "battery", name: "Akku" }] });
    const s = buildHouseScene({ model: computeModel(config, reader({ "sensor.bat": -500 })), config, selection: {}, format: kw, lang: "en" });
    const b = byKey(s.boxes)["battery:sensor.bat"];
    expect(b).toMatchObject({ kind: "battery", tone: "battery", z: 0 });
    expect(byKey(s.labels)["label:battery:sensor.bat"].value).toBe("charging 0,5 kW");
    const f = byKey(s.flows)["battery:sensor.bat"];
    expect(f.points[f.points.length - 1][0]).toBe(b.x);
  });

  it("draws rooms behind others first (random layouts against a brute-force check)", () => {
    let seed = 7;
    const rnd = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let round = 0; round < 40; round++) {
      const placed: RoomLayout[] = [];
      for (let t = 0; t < 60 && placed.length < 6; t++) {
        const l = { x: rnd(12), y: rnd(6), w: 1 + rnd(5), h: 1 + rnd(3) };
        if (l.x + l.w > 12 || l.y + l.h > 6) continue;
        if (placed.some((p) => l.x < p.x + p.w && p.x < l.x + l.w && l.y < p.y + p.h && p.y < l.y + l.h)) continue;
        placed.push(l);
      }
      const rooms = placed.map((layout, i) => ({ area_id: `r${i}`, name: `R${i}`, layout }));
      const config = cfg({ floors: [{ floor_id: "f", name: "F", rooms }] });
      const s = buildHouseScene({ model: computeModel(config, reader({})), config, selection: {}, format: kw });
      const order = s.boxes.filter((b) => b.kind === "room").map((b) => b.area_id);
      for (let i = 0; i < placed.length; i++) {
        for (let j = 0; j < placed.length; j++) {
          const a = placed[i];
          const b = placed[j];
          // a lies completely left of or behind b and not the other way round: a must be drawn first
          const aBehind = a.x + a.w <= b.x || a.y + a.h <= b.y;
          const bBehind = b.x + b.w <= a.x || b.y + b.h <= a.y;
          if (aBehind && !bBehind) expect(order.indexOf(`r${i}`)).toBeLessThan(order.indexOf(`r${j}`));
        }
      }
    }
  });

  it("insets every room like the mock", () => {
    const s = byKey(buildHouseScene(mockInput()).boxes);
    const l = MOCK_SLOTS[1];
    expect(s["room:wohnzimmer"].x).toBeCloseTo(l.x * CELL + ROOM_INSET);
    expect(s["room:wohnzimmer"].z).toBe(PITCH + SLAB);
  });
});

function overlap(a: SceneBox, b: SceneBox): boolean {
  return a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.d - 1e-9 && b.y < a.y + a.d - 1e-9;
}

describe("buildHouseScene: batteries without a room", () => {
  const scene = (n: number) => {
    const config = validateConfig({
      type: "custom:detailed-energy-3d-card",
      sources: Array.from({ length: n }, (_, i) => ({ entity: `sensor.akku${i}`, type: "battery", name: `Akku ${i}` })),
      rooms: [{ area_id: "a", consumers: [{ entity: "sensor.a" }] }],
    }) as HouseConfig;
    const model = computeModel(config, reader({ "sensor.a": 100, ...Object.fromEntries(Array.from({ length: n }, (_, i) => [`sensor.akku${i}`, 50])) }));
    return buildHouseScene({ model, config, selection: {}, format: kw, lang: "de" });
  };
  /** every battery block lies on the ground */
  const onGround = (s: ReturnType<typeof scene>) => {
    const g = s.boxes.find((b) => b.key === "ground")!;
    return s.boxes.filter((b) => b.kind === "battery").every((b) => b.y >= g.y && b.y + b.d <= g.y + g.d && b.x >= g.x && b.x + b.w <= g.x + g.w);
  };

  it("keeps up to two on the ground as before and lets the ground grow for more", () => {
    expect(onGround(scene(2))).toBe(true);
    expect(onGround(scene(3))).toBe(true);
    expect(onGround(scene(6))).toBe(true);
    const back = (n: number) => scene(n).boxes.find((b) => b.key === "ground")!.y;
    expect(back(3)).toBeLessThan(back(2));
    expect(back(2)).toBe(back(1));
  });
});
