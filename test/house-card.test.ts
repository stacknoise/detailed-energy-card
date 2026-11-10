import { describe, expect, it } from "vitest";
import { computeModel, type Reader } from "../src/model/compute";
import { validateHouseConfig, HOUSE_STORAGE_PREFIX, type HouseConfig } from "../src/model/house";
import { removeLegacyKeys, selectionKey } from "../src/model/selection";
import {
  HOUSE_SELECTION_PREFIX,
  houseActionsOf,
  houseGestureOf,
  houseDetail,
  houseSelectionKey,
  parseHouseSelection,
  resolveHouseSelection,
  toggleHouseSelection,
} from "../src/model/house-selection";

const reader = (values: Record<string, number>): Reader => (id) =>
  id in values ? { watts: values[id], valid: true } : { watts: 0, valid: false };

const config = (extra: Partial<HouseConfig> = {}): HouseConfig =>
  validateHouseConfig({
    type: "custom:detailed-energy-3d-card",
    sources: [{ entity: "sensor.grid", type: "grid" }],
    floors: [
      {
        floor_id: "eg",
        name: "EG",
        tap_action: { action: "navigate", navigation_path: "/lovelace/eg" },
        rooms: [
          { area_id: "kueche", name: "Küche", layout: { x: 0, y: 0, w: 5, h: 3 }, consumers: [{ entity: "sensor.herd", name: "Herd" }, { entity: "sensor.kuehl" }] },
          { area_id: "flur", name: "Flur", layout: { x: 5, y: 0, w: 7, h: 3 }, consumers: [{ entity: "sensor.licht" }] },
        ],
      },
      { floor_id: "og", name: "OG", rooms: [{ area_id: "bad", name: "Bad", consumers: [{ entity: "sensor.heizung" }] }] },
    ],
    ...extra,
  });

const model = (cfg = config()) =>
  computeModel(cfg, reader({ "sensor.grid": 1000, "sensor.herd": 700, "sensor.kuehl": 100, "sensor.licht": 50, "sensor.heizung": 150 }), () => ({ watts: 0, valid: false }), { solar: "S", battery: "B", grid: "G", generic: "Q" } as never);

describe("selection key of the 3D card", () => {
  it("lives under its own prefix, so the energy card never cleans it up", () => {
    const key = houseSelectionKey(config());
    expect(key.startsWith(HOUSE_SELECTION_PREFIX)).toBe(true);
    expect(key.startsWith(HOUSE_STORAGE_PREFIX)).toBe(true);
    expect(key.startsWith("detailed-energy-card:")).toBe(false);
    const removed: string[] = [];
    const keys = [key, selectionKey(config()), "detailed-energy-card:old"];
    removeLegacyKeys({ length: keys.length, key: (i) => keys[i], removeItem: (k) => removed.push(k) });
    expect(removed).toEqual(["detailed-energy-card:old"]);
  });

  it("ignores names and colors, differs by structure and storage_id", () => {
    const base = houseSelectionKey(config());
    expect(houseSelectionKey(config({ title: "Anders", colors: { accent: "#fff" } } as Partial<HouseConfig>))).toBe(base);
    expect(houseSelectionKey(config({ options: { storage_id: "b" } }))).not.toBe(base);
    expect(houseSelectionKey(validateHouseConfig({ type: "x", rooms: [{ area_id: "a" }] }))).not.toBe(base);
  });
});

describe("parseHouseSelection", () => {
  it("reads the expected shape and nothing else", () => {
    expect(parseHouseSelection(JSON.stringify({ floor_id: "eg", area_id: "kueche" }))).toEqual({ floor_id: "eg", area_id: "kueche" });
    for (const bad of [null, "", "nope", "[]", "5", JSON.stringify({ floor_id: 3, area_id: null })]) expect(parseHouseSelection(bad)).toEqual({});
  });
});

describe("resolving and toggling the selection", () => {
  it("drops ids that are not in the model and gives a room its floor", () => {
    const m = model();
    expect(resolveHouseSelection(m, { area_id: "kueche" })).toEqual({ floor_id: "eg", area_id: "kueche" });
    expect(resolveHouseSelection(m, { floor_id: "eg", area_id: "bad" })).toEqual({ floor_id: "og", area_id: "bad" });
    expect(resolveHouseSelection(m, { floor_id: "weg", area_id: "weg" })).toEqual({});
    expect(resolveHouseSelection(m, { floor_id: "og" })).toEqual({ floor_id: "og" });
    expect(resolveHouseSelection(undefined, { floor_id: "og" })).toEqual({});
  });

  it("selects on a tap and clears on a second tap", () => {
    const m = model();
    let sel = toggleHouseSelection(m, {}, { floor_id: "eg" });
    expect(sel).toEqual({ floor_id: "eg" });
    sel = toggleHouseSelection(m, sel, { floor_id: "eg", area_id: "kueche" });
    expect(sel).toEqual({ floor_id: "eg", area_id: "kueche" });
    // the selected room again: back to its floor
    expect(toggleHouseSelection(m, sel, { floor_id: "eg", area_id: "kueche" })).toEqual({ floor_id: "eg" });
    // the floor of the selected room: the floor alone, then nothing
    expect(toggleHouseSelection(m, sel, { floor_id: "eg" })).toEqual({ floor_id: "eg" });
    expect(toggleHouseSelection(m, { floor_id: "eg" }, { floor_id: "eg" })).toEqual({});
    expect(toggleHouseSelection(m, sel, {})).toEqual({});
  });

  it("keeps a room of a house without floors", () => {
    const m = model(validateHouseConfig({ type: "x", sources: [{ entity: "sensor.grid", type: "grid" }], rooms: [{ area_id: "a", consumers: [{ entity: "sensor.herd" }] }] }));
    expect(toggleHouseSelection(m, {}, { area_id: "a" })).toEqual({ area_id: "a" });
    expect(toggleHouseSelection(m, { area_id: "a" }, { area_id: "a" })).toEqual({});
  });
});

describe("actions of floors and rooms", () => {
  it("finds the actions of the config, none for a node without", () => {
    const m = model();
    expect(houseActionsOf(m, { floor_id: "eg" })?.tap).toEqual({ action: "navigate", navigation_path: "/lovelace/eg" });
    expect(houseActionsOf(m, { floor_id: "eg", area_id: "kueche" })).toBeUndefined();
    expect(houseActionsOf(m, { floor_id: "nope" })).toBeUndefined();
  });

  it("lets a room without hold and double tap action take those of its floor, but not the tap", () => {
    const cfg = config();
    cfg.floors![0] = { ...cfg.floors![0], hold_action: { action: "more-info", entity: "sensor.herd" }, double_tap_action: { action: "navigate", navigation_path: "/lovelace/eg" } };
    cfg.floors![0].rooms![1] = { ...cfg.floors![0].rooms![1], hold_action: { action: "none" } };
    const m = model(validateHouseConfig(cfg));
    expect(houseGestureOf(m, { floor_id: "eg", area_id: "kueche" }, "hold")?.action).toEqual({ action: "more-info", entity: "sensor.herd" });
    expect(houseGestureOf(m, { floor_id: "eg", area_id: "kueche" }, "double")?.action).toEqual({ action: "navigate", navigation_path: "/lovelace/eg" });
    expect(houseGestureOf(m, { floor_id: "eg", area_id: "flur" }, "hold")).toBeUndefined(); // an own "none" on the room turns it off
    expect(houseGestureOf(m, { floor_id: "og" }, "hold")).toBeUndefined();
    expect(houseActionsOf(m, { floor_id: "eg", area_id: "kueche" })?.tap).toBeUndefined();
  });
});

describe("detail list", () => {
  const names = (d: ReturnType<typeof houseDetail>) => d.rows.map((r) => (r.kind === "consumer" ? r.consumer.entity : r.kind === "remainder" ? "rest" : r.name));

  it("shows the consumers of a room sorted by power", () => {
    const d = houseDetail(model(), { floor_id: "eg", area_id: "kueche" }, false);
    expect(d.scope).toBe("room");
    expect(d.name).toBe("Küche");
    expect(d.watts).toBe(800);
    expect(names(d)).toEqual(["sensor.herd", "sensor.kuehl"]);
    expect([d.shown, d.total]).toEqual([2, 2]);
  });

  it("leaves idle consumers out with only_active", () => {
    const cfg = config();
    const m = computeModel(cfg, reader({ "sensor.grid": 1, "sensor.herd": 700, "sensor.kuehl": 0 }), () => ({ watts: 0, valid: false }), { solar: "S", battery: "B", grid: "G", generic: "Q" } as never);
    const d = houseDetail(m, { floor_id: "eg", area_id: "kueche" }, true);
    expect(names(d)).toEqual(["sensor.herd"]);
    expect([d.shown, d.total]).toEqual([1, 2]);
  });

  it("shows the rooms of a floor and the floors of the home", () => {
    const m = model();
    const floor = houseDetail(m, { floor_id: "eg" }, false);
    expect(floor.scope).toBe("floor");
    expect(names(floor)).toEqual(["Küche", "Flur"]);
    const home = houseDetail(m, {}, false);
    expect(home.scope).toBe("home");
    expect(names(home).slice(0, 2)).toEqual(["EG", "OG"]);
    expect(home.watts).toBe(m.homeWatts);
  });

  it("falls back to the home for a stale selection", () => {
    expect(houseDetail(model(), { floor_id: "weg", area_id: "weg" }, false).scope).toBe("home");
  });
});

describe("selecting a power source", () => {
  const withSources = () => {
    const cfg = config({ sources: [{ entity: "sensor.pv", type: "solar", name: "PV", tap_action: { action: "more-info" }, hold_action: { action: "navigate", navigation_path: "/lovelace/pv" } }, { entity: "sensor.grid", type: "grid" }] } as never);
    return computeModel(cfg, reader({ "sensor.pv": 3000, "sensor.grid": 1000, "sensor.herd": 700, "sensor.kuehl": 100, "sensor.licht": 50, "sensor.heizung": 150 }), () => ({ watts: 0, valid: false }), { solar: "S", battery: "B", grid: "G", generic: "Q" } as never);
  };

  it("resolves, toggles and reads a stored source", () => {
    const m = withSources();
    expect(resolveHouseSelection(m, { source: "sensor.pv" })).toEqual({ source: "sensor.pv" });
    expect(resolveHouseSelection(m, { source: "sensor.nope" })).toEqual({});
    expect(toggleHouseSelection(m, {}, { source: "sensor.pv" })).toEqual({ source: "sensor.pv" });
    expect(toggleHouseSelection(m, { source: "sensor.pv" }, { source: "sensor.pv" })).toEqual({});
    expect(toggleHouseSelection(m, { floor_id: "eg" }, { source: "sensor.grid" })).toEqual({ source: "sensor.grid" });
    expect(parseHouseSelection(JSON.stringify({ source: "sensor.pv" }))).toEqual({ source: "sensor.pv" });
  });

  it("takes the actions of the source", () => {
    const m = withSources();
    expect(houseGestureOf(m, { source: "sensor.pv" }, "hold")?.action).toEqual({ action: "navigate", navigation_path: "/lovelace/pv" });
    expect(houseGestureOf(m, { source: "sensor.grid" }, "hold")).toBeUndefined();
  });

  it("shows where the power of a source goes, proportionally", () => {
    const m = withSources();
    const d = houseDetail(m, { source: "sensor.pv" }, false);
    expect(d.scope).toBe("source");
    expect(d.name).toBe("PV");
    expect(d.watts).toBe(3000);
    const total = d.rows.reduce((s, r) => s + (r.kind === "floor" || r.kind === "room" ? r.watts : 0), 0);
    const share = m.sources.find((s) => s.entity === "sensor.pv")!.share;
    expect(total).toBeCloseTo(m.floors.reduce((s, f) => s + f.watts, 0) * share, 5);
  });
});
