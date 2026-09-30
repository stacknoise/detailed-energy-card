import { describe, expect, it } from "vitest";
import { validateConfig } from "../src/model/config";
import { buildStubConfig, type StubHass } from "../src/model/stub-config";

const sensor = (device_class?: string) => ({ attributes: { device_class } });
const base: StubHass = {
  states: {
    "sensor.grid": sensor("power"),
    "sensor.oven": sensor("power"),
    "sensor.fridge": sensor("power"),
    "sensor.dishwasher": sensor("power"),
    "sensor.temp": sensor("temperature"),
    "light.lamp": sensor(),
  },
};

describe("buildStubConfig", () => {
  it("uses power sensors only: the first as grid, the next two as consumers", () => {
    const cfg = buildStubConfig({ ...base, areas: { kueche: { area_id: "kueche" } } }) as any;
    expect(cfg.sources).toEqual([{ entity: "sensor.grid", type: "grid", name: "Netz" }]);
    expect(cfg.rooms[0].consumers).toEqual([{ entity: "sensor.oven" }, { entity: "sensor.fridge" }]);
  });

  it("puts the first area of the first floor that has one on that floor", () => {
    const cfg = buildStubConfig({
      ...base,
      floors: { og: { floor_id: "og", level: 1 }, eg: { floor_id: "eg", level: 0 }, keller: { floor_id: "keller", level: -1 } },
      areas: {
        bad: { area_id: "bad", floor_id: "og" },
        wohnzimmer: { area_id: "wohnzimmer", floor_id: "eg" },
        kueche: { area_id: "kueche", floor_id: "eg" },
        garten: { area_id: "garten" },
      },
    }) as any;
    // keller has no area, so the lowest floor with an area is eg; its first area by id is kueche
    expect(cfg.rooms).toBeUndefined();
    expect(cfg.floors).toEqual([
      { floor_id: "eg", rooms: [{ area_id: "kueche", consumers: [{ entity: "sensor.oven" }, { entity: "sensor.fridge" }] }] },
    ]);
  });

  it("falls back to a flat room when no area sits on a floor", () => {
    const cfg = buildStubConfig({
      ...base,
      floors: { eg: { floor_id: "eg", level: 0 } },
      areas: { garten: { area_id: "garten" }, bad: { area_id: "bad" } },
    }) as any;
    expect(cfg.floors).toBeUndefined();
    expect(cfg.rooms).toEqual([{ area_id: "bad", consumers: expect.any(Array) }]);
  });

  it("still returns a usable config without areas or sensors", () => {
    expect(buildStubConfig(undefined)).toEqual({ title: "Energiefluss", sources: [] });
    const cfg = buildStubConfig({ states: {} }) as any;
    expect(cfg.floors ?? cfg.rooms).toBeUndefined();
  });

  it("always passes the config validation (never floors and rooms together, no duplicates)", () => {
    const variants: Array<StubHass | undefined> = [
      undefined,
      { states: {} },
      base,
      { ...base, areas: { a: { area_id: "a" } } },
      { ...base, floors: { eg: { floor_id: "eg" } }, areas: { a: { area_id: "a", floor_id: "eg" } } },
    ];
    for (const v of variants) {
      expect(() => validateConfig({ type: "custom:detailed-energy-card", ...buildStubConfig(v) })).not.toThrow();
    }
  });
});
