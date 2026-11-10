import { describe, expect, it } from "vitest";
import { ConfigError, validateConfig } from "../src/model/config";
import { buildHouseScene } from "../src/model/house-scene";
import {
  CELL,
  COS30,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  HOUSE_CARD_TYPE,
  HOUSE_STORAGE_PREFIX,
  PITCH,
  emptyScene,
  gridOf,
  project,
  validateHouseConfig,
} from "../src/model/house";
import { MOCK_FLOORS, MOCK_SLOTS, mockConfig, mockScene } from "./fixtures/house-scene";
import { houseDe, houseEn } from "../src/localize/house";
import { houseViewDe, houseViewEn } from "../src/localize/house-view";
import { houseEditorDe, houseEditorEn } from "../src/localize/house-editor";
import { localize } from "../src/localize";
import { makeTr } from "../src/localize/editor";

describe("3D card contracts (AP0)", () => {
  it("projects like the mock", () => {
    expect(project([0, 0, 0])).toEqual([0, 0]);
    const [sx, sy] = project([150, 75, 10]);
    expect(sx).toBeCloseTo(75 * COS30);
    expect(sy).toBeCloseTo(112.5 - 10);
    // up is up on the screen, right along x goes right and down
    expect(project([10, 0, 0])).toEqual([10 * COS30, 5]);
    expect(project([0, 0, 5])[1]).toBe(-5);
  });

  it("keeps the measures of the mock", () => {
    expect(DEFAULT_COLS * CELL).toBe(150);
    expect(DEFAULT_ROWS * CELL).toBe(75);
    expect(PITCH).toBe(86);
    expect(gridOf({})).toEqual({ cols: 12, rows: 6 });
    expect(gridOf({ house: { cols: 8, rows: 5 } })).toEqual({ cols: 8, rows: 5 });
  });

  it("does not collide with the storage keys the energy card cleans up", () => {
    expect(HOUSE_STORAGE_PREFIX.startsWith("detailed-energy-card:")).toBe(false);
    expect(HOUSE_CARD_TYPE).toBe("detailed-energy-3d-card");
  });

  it("accepts a layout on rooms, and the energy card ignores it", () => {
    const cfg = mockConfig();
    expect(validateHouseConfig(cfg).floors?.[0].rooms?.[0].layout).toEqual(MOCK_SLOTS[0]);
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  it("rejects what the energy card rejects", () => {
    expect(() => validateHouseConfig({ type: "x", floors: [{}] })).toThrow(ConfigError);
    expect(() => validateHouseConfig(null)).toThrow(ConfigError);
  });

  it("returns an empty scene with the grid for now", () => {
    const scene = buildHouseScene({ model: undefined as never, config: { type: "x", house: { cols: 8, rows: 4 } }, selection: {}, format: String });
    expect(scene).toEqual(emptyScene(8, 4));
  });

  it("has a fixture scene with the example values of the mock", () => {
    const scene = mockScene();
    expect(scene.boxes.filter((b) => b.kind === "slab" && b.floor_id)).toHaveLength(3);
    expect(scene.boxes.filter((b) => b.kind === "solar")).toHaveLength(6);
    expect(scene.boxes.filter((b) => b.area_id)).toHaveLength(MOCK_FLOORS.flatMap((f) => f.rooms).length);
    expect(scene.labels.find((l) => l.key === "label:akku")?.value).toBe("lädt 1,1 kW");
    expect(scene.labels.find((l) => l.key === "label:solar")?.value).toBe("4,2 kW");
    expect(scene.flows.map((f) => f.color)).toContain("#f06292");
    expect(new Set(scene.boxes.map((b) => b.key)).size).toBe(scene.boxes.length);
  });

  it("has equal keys in German and English, with the house_ prefix", () => {
    for (const [de, en] of [[houseDe, houseEn], [houseViewDe, houseViewEn], [houseEditorDe, houseEditorEn]]) {
      expect(Object.keys(de)).toEqual(Object.keys(en));
      expect(Object.keys(de).every((k) => k.startsWith("house_"))).toBe(true);
    }
    expect(localize("de", "house_placeholder")).toBe(houseDe.house_placeholder);
    expect(localize("en", "house_aria_graphic")).toBe(houseViewEn.house_aria_graphic);
    expect(makeTr("en")("house_ed_section_plan")).toBe(houseEditorEn.house_ed_section_plan);
  });
});
