import { describe, expect, it } from "vitest";
import { EDITOR_SECTIONS } from "../src/editor/card-editor";
import { HOUSE_SECTIONS } from "../src/editor/house-editor";
import {
  CUSTOM_AREA,
  areaChoices,
  floorViews,
  freeSpot,
  gridRooms,
  layoutFits,
  minGrid,
  nextCustomId,
  roomWatts,
  unplacedRooms,
  withGrid,
  withNewRoom,
  withRoomLayout,
  withoutRoom,
} from "../src/editor/house-layout";
import { GRID_LIMITS, HOUSE, configPaths, houseFields, toSchema } from "../src/editor/schema";
import { gridOf, type HouseConfig } from "../src/model/house";
import { validateConfig } from "../src/model/config";
import { makeTr } from "../src/localize/editor";
import { houseEditorDe, houseEditorEn } from "../src/localize/house-editor";
import { mockConfig } from "./fixtures/house-scene";

const cfg = (): HouseConfig => ({
  type: "custom:detailed-energy-3d-card",
  sources: [{ entity: "sensor.grid", type: "grid" }],
  floors: [
    {
      floor_id: "eg",
      rooms: [
        { area_id: "kueche", consumers: [{ entity: "sensor.herd" }, { entity: "sensor.kuehl" }], layout: { x: 0, y: 0, w: 4, h: 3 } },
        { area_id: "wohnen", layout: { x: 4, y: 0, w: 8, h: 3 } },
        { area_id: "flur" },
      ],
    },
    { floor_id: "og", rooms: [{ area_id: "bad", layout: { x: 0, y: 0, w: 2, h: 2 } }] },
  ],
});

describe("3D editor: layout checks", () => {
  it("accepts a free rectangle inside the grid and refuses the rest", () => {
    const others = [{ x: 0, y: 0, w: 4, h: 3 }];
    expect(layoutFits({ x: 4, y: 0, w: 2, h: 2 }, others, 12, 6)).toBe(true);
    expect(layoutFits({ x: 3, y: 0, w: 2, h: 2 }, others, 12, 6)).toBe(false); // overlaps
    expect(layoutFits({ x: 11, y: 0, w: 2, h: 1 }, [], 12, 6)).toBe(false); // outside right
    expect(layoutFits({ x: 0, y: 5, w: 1, h: 2 }, [], 12, 6)).toBe(false); // outside bottom
    expect(layoutFits({ x: -1, y: 0, w: 1, h: 1 }, [], 12, 6)).toBe(false);
    expect(layoutFits({ x: 0, y: 0, w: 0, h: 1 }, [], 12, 6)).toBe(false);
    expect(layoutFits({ x: 0.5, y: 0, w: 1, h: 1 }, [], 12, 6)).toBe(false);
    expect(layoutFits({ x: NaN, y: 0, w: 1, h: 1 }, [], 12, 6)).toBe(false);
    // touching edges are fine
    expect(layoutFits({ x: 4, y: 3, w: 8, h: 3 }, [{ x: 4, y: 0, w: 8, h: 3 }], 12, 6)).toBe(true);
  });

  it("finds the first free spot, shrinks it, and gives up on a full floor", () => {
    expect(freeSpot([], 12, 6)).toEqual({ x: 0, y: 0, w: 2, h: 2 });
    expect(freeSpot([{ x: 0, y: 0, w: 2, h: 2 }], 12, 6)).toEqual({ x: 2, y: 0, w: 2, h: 2 });
    // only a single free cell is left
    const full = [{ x: 0, y: 0, w: 4, h: 2 }, { x: 0, y: 2, w: 3, h: 1 }];
    expect(freeSpot(full, 4, 3)).toEqual({ x: 3, y: 2, w: 1, h: 1 });
    expect(freeSpot([{ x: 0, y: 0, w: 4, h: 3 }], 4, 3)).toBeUndefined();
  });
});

describe("3D editor: floors and rooms", () => {
  it("shows the floors as tabs, or the rooms of a config without floors as one", () => {
    const f = floorViews(cfg());
    expect(f.map((x) => x.floor_id)).toEqual(["eg", "og"]);
    expect(f[1].rooms_ptr).toEqual(["floors", 1, "rooms"]);
    const flat = floorViews({ rooms: [{ area_id: "a" }] });
    expect(flat).toHaveLength(1);
    expect(flat[0].rooms_ptr).toEqual(["rooms"]);
    expect(floorViews({})[0].rooms).toEqual([]);
  });

  it("moves a room only to a place that is free and leaves the input untouched", () => {
    const c = cfg();
    const eg = floorViews(c)[0];
    const moved = withRoomLayout(c, eg, "kueche", { x: 0, y: 3, w: 4, h: 3 })!;
    expect(moved.floors![0].rooms![0].layout).toEqual({ x: 0, y: 3, w: 4, h: 3 });
    expect(c.floors![0].rooms![0].layout).toEqual({ x: 0, y: 0, w: 4, h: 3 });
    expect(moved.floors![0].rooms![0].consumers).toHaveLength(2); // the rest of the room is kept
    expect(withRoomLayout(c, eg, "kueche", { x: 3, y: 0, w: 4, h: 3 })).toBeUndefined(); // overlaps Wohnen
    expect(withRoomLayout(c, eg, "kueche", { x: 0, y: 0, w: 5, h: 3 })).toBeUndefined(); // overlaps, too
    expect(withRoomLayout(c, eg, "kueche", { x: 0, y: 0, w: 4, h: 7 })).toBeUndefined(); // outside
    // a room may stay where it is: it does not collide with itself
    expect(withRoomLayout(c, eg, "kueche", { x: 0, y: 0, w: 4, h: 3 })).toBeDefined();
  });

  it("checks against the rooms of the same floor only", () => {
    const c = cfg();
    const og = floorViews(c)[1];
    expect(withRoomLayout(c, og, "bad", { x: 0, y: 0, w: 12, h: 6 })).toBeDefined();
  });

  it("adds a drawn room with an area, with a fresh id for a custom one, and refuses a taken area", () => {
    const c = cfg();
    const og = floorViews(c)[1];
    const a = withNewRoom(c, og, "schlafen", { x: 4, y: 0, w: 3, h: 3 }, "")!;
    expect(a.area_id).toBe("schlafen");
    expect(a.cfg.floors![1].rooms!.at(-1)).toEqual({ area_id: "schlafen", consumers: [], layout: { x: 4, y: 0, w: 3, h: 3 } });
    const b = withNewRoom(c, og, CUSTOM_AREA, { x: 4, y: 0, w: 3, h: 3 }, "Werkstatt")!;
    expect(b.area_id).toBe("custom_1");
    expect(b.cfg.floors![1].rooms!.at(-1)).toMatchObject({ area_id: "custom_1", name: "Werkstatt" });
    const again = withNewRoom(b.cfg, floorViews(b.cfg)[1], CUSTOM_AREA, { x: 8, y: 0, w: 1, h: 1 }, "Lager")!;
    expect(again.area_id).toBe("custom_2");
    expect(withNewRoom(c, og, "kueche", { x: 4, y: 0, w: 3, h: 3 }, "")).toBeUndefined(); // area used on another floor
    expect(withNewRoom(c, og, "schlafen", { x: 1, y: 1, w: 3, h: 3 }, "")).toBeUndefined(); // overlaps Bad
  });

  it("adds a room to the top-level list of a config without floors", () => {
    const flat: HouseConfig = { type: "custom:detailed-energy-3d-card", rooms: [] };
    const r = withNewRoom(flat, floorViews(flat)[0], "a", { x: 0, y: 0, w: 2, h: 2 }, "")!;
    expect(r.cfg.rooms).toEqual([{ area_id: "a", consumers: [], layout: { x: 0, y: 0, w: 2, h: 2 } }]);
  });

  it("deletes a room with everything in it", () => {
    const c = cfg();
    const next = withoutRoom(c, floorViews(c)[0], "kueche");
    expect(next.floors![0].rooms!.map((r) => r.area_id)).toEqual(["wohnen", "flur"]);
    expect(c.floors![0].rooms).toHaveLength(3);
  });

  it("numbers custom ids from the first gap", () => {
    expect(nextCustomId([])).toBe("custom_1");
    expect(nextCustomId(["custom_1", "x", "custom_3"])).toBe("custom_2");
  });

  it("offers the free areas, those of the floor first", () => {
    const areas = [
      { area_id: "bad", name: "Bad", floor_id: "og" },
      { area_id: "kueche", name: "Küche", floor_id: "eg" },
      { area_id: "flur", name: "Flur", floor_id: "eg" },
      { area_id: "garten", name: "Garten", floor_id: null },
    ];
    expect(areaChoices(areas, ["kueche"], "eg").map((c) => c.value)).toEqual(["flur", "bad", "garten"]);
    expect(areaChoices(areas, [], "").map((c) => c.value)).toEqual(["bad", "kueche", "flur", "garten"]);
  });

  it("lists the rooms without a place so they can be put on the grid", () => {
    expect(unplacedRooms(floorViews(cfg())[0].rooms).map((r) => r.area_id)).toEqual(["flur"]);
  });
});

describe("3D editor: grid size", () => {
  it("changes the grid, writes only values that differ from the default, and keeps the other options", () => {
    const c = cfg();
    const wide = withGrid(c, "cols", 16)!;
    expect(wide.house).toEqual({ cols: 16 });
    expect(gridOf(wide)).toEqual({ cols: 16, rows: 6 });
    const back = withGrid(wide, "cols", 12)!;
    expect(back.house).toBeUndefined();
    expect(withGrid(wide, "rows", 8)!.house).toEqual({ cols: 16, rows: 8 });
    expect(wide.sources).toEqual(c.sources);
  });

  it("refuses a grid that is out of range or too small for a placed room", () => {
    const c = cfg();
    expect(minGrid(c)).toEqual({ cols: 12, rows: 3 });
    expect(withGrid(c, "cols", 11)).toBeUndefined(); // Wohnen reaches column 12
    expect(withGrid(c, "rows", 2)).toBeUndefined(); // Küche is 3 rows high
    expect(withGrid(c, "rows", 3)).toBeDefined();
    expect(withGrid(c, "cols", GRID_LIMITS.cols[1] + 1)).toBeUndefined();
    expect(withGrid(c, "cols", GRID_LIMITS.cols[0] - 1)).toBeUndefined();
    expect(withGrid(c, "cols", 12.5)).toBeUndefined();
  });
});

describe("3D editor: values in the grid", () => {
  const states = {
    "sensor.herd": { state: "900", attributes: { unit_of_measurement: "W" } },
    "sensor.kuehl": { state: "0.1", attributes: { unit_of_measurement: "kW" } },
    "sensor.raum": { state: "250", attributes: { unit_of_measurement: "W" } },
  };

  it("takes the power of the room's own meter, else the sum of its consumers", () => {
    expect(roomWatts({ area_id: "a", entity: "sensor.raum", consumers: [{ entity: "sensor.herd" }] }, states)).toBe(250);
    expect(roomWatts({ area_id: "a", consumers: [{ entity: "sensor.herd" }, { entity: "sensor.kuehl" }] }, states)).toBe(1000);
    expect(roomWatts({ area_id: "a", consumers: [{ entity: "sensor.fehlt" }] }, states)).toBeUndefined();
    expect(roomWatts({ area_id: "a" }, states)).toBeUndefined();
  });

  it("hands the placed rooms to the grid with name and value, the others not", () => {
    const rooms = gridRooms(floorViews(cfg())[0].rooms, (r) => r.area_id.toUpperCase(), states, "de");
    expect(rooms.map((r) => r.key)).toEqual(["kueche", "wohnen"]);
    expect(rooms[0]).toMatchObject({ name: "KUECHE", layout: { x: 0, y: 0, w: 4, h: 3 } });
    expect(rooms[0].value).toMatch(/1[,.]0/);
    expect(rooms[1].value).toBeUndefined();
  });
});

describe("3D editor: fields", () => {
  it("has a field for every option of the 3D card beyond the energy card, and no field without an option", () => {
    const FULL = { house: { cols: 12, rows: 6 }, layout: { x: 0, y: 0, w: 1, h: 1 } };
    const covered = new Set(HOUSE.map((f) => f.path));
    expect(configPaths(FULL).filter((p) => !covered.has(p))).toEqual([]);
    expect([...covered].filter((p) => !configPaths(FULL).includes(p))).toEqual([]);
  });

  it("builds the ranges of the room fields from the grid", () => {
    const f = houseFields(16, 8);
    const range = (path: string) => (f.find((x) => x.path === path)!.selector.number as { min: number; max: number });
    expect(range("layout.x")).toMatchObject({ min: 0, max: 15 });
    expect(range("layout.y")).toMatchObject({ min: 0, max: 7 });
    expect(range("layout.w")).toMatchObject({ min: 1, max: 16 });
    expect(range("layout.h")).toMatchObject({ min: 1, max: 8 });
    expect(toSchema(f, {}, makeTr("de")).map((s) => s.name)).toEqual(["house.cols", "house.rows", "layout.x", "layout.y", "layout.w", "layout.h"]);
  });

  it("labels every field in both languages", () => {
    for (const tr of [makeTr("de"), makeTr("en")]) {
      for (const f of HOUSE) expect(tr(f.label)).not.toMatch(/^house_ed_/);
    }
  });

  it("has the same editor texts in German and English", () => {
    expect(Object.keys(houseEditorDe)).toEqual(Object.keys(houseEditorEn));
    for (const k of Object.keys(houseEditorDe) as Array<keyof typeof houseEditorDe>) {
      expect(houseEditorDe[k].length).toBeGreaterThan(0);
      expect(houseEditorEn[k]).not.toBe(houseEditorDe[k]);
    }
  });
});

describe("3D editor: sections of the energy card's editor", () => {
  it("shows every section by default and the 3D editor leaves out the import wizard only", () => {
    expect(EDITOR_SECTIONS).toEqual(["import", "general", "colors", "home", "sources", "structure"]);
    expect(HOUSE_SECTIONS).toEqual(["general", "colors", "home", "sources", "structure"]);
  });

  it("keeps the layout of a room in a config the energy card validates unchanged", () => {
    const c = mockConfig();
    const checked = validateConfig(c);
    expect(JSON.stringify(checked)).toBe(JSON.stringify(c));
  });
});
