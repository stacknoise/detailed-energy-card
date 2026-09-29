import { describe, expect, it } from "vitest";
import { resolveNames } from "../src/model/registry";

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
