import { describe, expect, it } from "vitest";
import { NARROW_PX, project, type SceneBox, type SceneLabel } from "../src/model/house";
import { HOUSE_CSS } from "../src/view/house-styles";
import { labelVisible, pickTarget, sceneViewBox, VIEW_PAD } from "../src/view/house";
import { mockScene } from "./fixtures/house-scene";

describe("3D graphic (AP3)", () => {
  it("fits the view box around the whole mock scene", () => {
    const scene = mockScene();
    const [x, y, w, h] = sceneViewBox(scene, false);
    for (const b of scene.boxes) {
      for (const p of [[b.x, b.y, b.z + b.h], [b.x + b.w, b.y + b.d, b.z], [b.x + b.w, b.y, b.z], [b.x, b.y + b.d, b.z]] as const) {
        const [sx, sy] = project([...p]);
        expect(sx).toBeGreaterThanOrEqual(x + VIEW_PAD - 1e-6);
        expect(sx).toBeLessThanOrEqual(x + w - VIEW_PAD + 1e-6);
        expect(sy).toBeGreaterThanOrEqual(y + VIEW_PAD - 1e-6);
        expect(sy).toBeLessThanOrEqual(y + h - VIEW_PAD + 1e-6);
      }
    }
    // the floor label sits left of the slab, so the box reaches further left than the ground plate
    const [gx] = project([0, 75 + 30, -6]);
    expect(x).toBeLessThan(gx);
  });

  it("gives an empty scene a small view box", () => {
    expect(sceneViewBox({ cols: 12, rows: 6, boxes: [], labels: [], flows: [] }, false)).toEqual([-VIEW_PAD, -VIEW_PAD, 2 * VIEW_PAD, 2 * VIEW_PAD]);
  });

  it("drops room labels on a narrow card and keeps floor and source labels", () => {
    const scene = mockScene();
    const shown = (narrow: boolean): string[] => scene.labels.filter((l) => labelVisible(l, narrow)).map((l) => l.kind);
    expect(shown(true).filter((k) => k === "room")).toHaveLength(0);
    expect(shown(true).filter((k) => k === "floor")).toHaveLength(3);
    expect(shown(false).filter((k) => k === "room")).toHaveLength(9);
    expect(NARROW_PX).toBe(500);
    const room = { kind: "room" } as SceneLabel;
    expect(labelVisible(room, true)).toBe(false);
  });

  it("does not shrink the drawing when the room labels are left out", () => {
    const scene = mockScene();
    const [, , wide] = sceneViewBox(scene, false);
    const [, , narrow] = sceneViewBox(scene, true);
    expect(narrow).toBeLessThanOrEqual(wide);
    expect(narrow).toBeGreaterThan(100);
  });

  it("picks floors and rooms, not decoration", () => {
    const boxes = mockScene().boxes;
    const target = (key: string): ReturnType<typeof pickTarget> => pickTarget(boxes.find((b) => b.key === key) as SceneBox);
    expect(target("slab:eg")).toEqual({ floor_id: "eg" });
    expect(target("room:kueche")).toEqual({ floor_id: "eg", area_id: "kueche" });
    expect(target("room:akku")).toEqual({ floor_id: "keller", area_id: "akku" });
    for (const key of ["ground", "roof", "mast", "solar:0:0"]) expect(target(key)).toBeUndefined();
  });

  it("styles the faces and flows like the mock", () => {
    expect(HOUSE_CSS).toContain("stroke-dasharray:5 7");
    expect(HOUSE_CSS).toContain("animation:house-dash 1s linear infinite");
    expect(HOUSE_CSS).toContain("prefers-reduced-motion:reduce");
    expect(HOUSE_CSS).toContain("--h-solar:#ff9800");
    expect(HOUSE_CSS).toContain("--h-batt:#f06292");
    expect(HOUSE_CSS).toContain("--h-grid:#488fc2");
    expect(HOUSE_CSS).toContain("#fff 25%");
    expect(HOUSE_CSS).toContain("#000 22%");
    expect(HOUSE_CSS).toContain("stroke-width:3px");
  });
});
