import { describe, expect, it, vi } from "vitest";
import { RETRY_AFTER_MS, RegistrySource, resolveNames, type RegistryHass } from "../src/model/registry";

describe("resolveNames", () => {
  const reg = {
    floors: [{ floor_id: "eg", name: "Erdgeschoss", icon: "mdi:home-floor-0" }],
    areas: [{ area_id: "kueche", name: "Küche", icon: "mdi:stove", floor_id: "eg" }],
  };
  it("fills names and icons from the registries", () => {
    const cfg = resolveNames({ type: "x", floors: [{ floor_id: "eg", rooms: [{ area_id: "kueche" }] }] }, reg);
    expect(cfg.floors![0]).toMatchObject({ name: "Erdgeschoss", icon: "mdi:home-floor-0" });
    expect(cfg.floors![0].rooms![0]).toMatchObject({ name: "Küche", icon: "mdi:stove" });
  });
  it("falls back to the id for deleted floors and areas", () => {
    const cfg = resolveNames({ type: "x", rooms: [{ area_id: "weg" }] }, reg);
    expect(cfg.rooms![0].name).toBe("weg");
  });
});

describe("RegistrySource", () => {
  const eg = { floor_id: "eg", name: "EG" };
  const kueche = { area_id: "kueche", name: "Küche", floor_id: "eg" };
  const wsData: Record<string, unknown> = {
    "config/floor_registry/list": [eg],
    "config/area_registry/list": [kueche],
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("uses hass.areas and hass.floors directly, without a request", () => {
    const callWS = vi.fn();
    const hass: RegistryHass = { areas: { kueche }, floors: { eg }, callWS };
    const source = new RegistrySource(() => {});
    expect(source.get(hass)).toEqual({ floors: [eg], areas: [kueche] });
    source.ensure(hass);
    expect(callWS).not.toHaveBeenCalled();
  });
  it("follows renamed areas: a new hass.areas object gives new names", () => {
    const source = new RegistrySource(() => {});
    const before: RegistryHass = { areas: { kueche }, floors: { eg } };
    const first = source.get(before);
    expect(source.get(before)).toBe(first); // same objects: same result, no rebuild
    const after: RegistryHass = { ...before, areas: { kueche: { ...kueche, name: "Kochen" } } };
    expect(source.get(after)!.areas[0].name).toBe("Kochen");
  });
  it("ignores removed (undefined) entries", () => {
    const source = new RegistrySource(() => {});
    expect(source.get({ areas: { kueche, weg: undefined }, floors: { eg } })!.areas).toEqual([kueche]);
  });
  it("falls back to the WebSocket when hass has no floors (Home Assistant 2024.8 / 2024.9)", async () => {
    const callWS = vi.fn(async (m: { type: string }) => wsData[m.type]);
    const onLoaded = vi.fn();
    const hass: RegistryHass = { areas: { kueche }, callWS: callWS as RegistryHass["callWS"] };
    const source = new RegistrySource(onLoaded);
    expect(source.get(hass)).toBeUndefined();
    source.ensure(hass);
    source.ensure(hass); // already loading: no second request
    await settle();
    expect(callWS).toHaveBeenCalledTimes(2); // floors + areas, once
    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(source.get(hass)).toEqual({ floors: [eg], areas: [kueche] });
    source.ensure(hass); // loaded: nothing more
    expect(callWS).toHaveBeenCalledTimes(2);
  });
  it("retries a failed load only after the pause", async () => {
    let now = 1_000;
    const callWS = vi.fn(async () => {
      throw new Error("offline");
    });
    const source = new RegistrySource(() => {}, () => now);
    const hass: RegistryHass = { callWS: callWS as RegistryHass["callWS"] };
    source.ensure(hass);
    await settle();
    const calls = callWS.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    // many hass updates in the pause: no new request
    for (let i = 0; i < 20; i++) source.ensure(hass);
    await settle();
    expect(callWS).toHaveBeenCalledTimes(calls);
    now += RETRY_AFTER_MS;
    source.ensure(hass);
    await settle();
    expect(callWS.mock.calls.length).toBeGreaterThan(calls);
  });
});
