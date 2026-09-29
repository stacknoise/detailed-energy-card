import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { editorKeys, makeTr } from "../src/localize/editor";
import { COLORS, CONSUMER, GENERAL, HOME, PALETTE, SOURCE, THRESHOLD, floorFields, roomFields } from "../src/editor/schema";
import { checkSensor, contrastWarning } from "../src/editor/validation";

describe("editor translations", () => {
  const keys = new Set(editorKeys());

  it("translates every field label and palette entry", () => {
    const labels = [...GENERAL, ...COLORS, ...HOME, ...THRESHOLD, ...SOURCE, ...floorFields(), ...roomFields(), ...CONSUMER].map((f) => f.label);
    const missing = [...labels, ...PALETTE.map((c) => c.label)].filter((l) => l && l !== "Theme" && !keys.has(l));
    expect(missing).toEqual([]);
  });

  it("translates every string the editor passes to _tr()", () => {
    const src = readFileSync("src/editor/card-editor.ts", "utf8");
    const used = [...src.matchAll(/_tr\(\s*"([^"]*)"/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(15);
    expect(used.filter((u) => !keys.has(u))).toEqual([]);
  });

  it("translates the validation messages", () => {
    const en = makeTr("en");
    const states = { "sensor.t": { state: "1", attributes: { device_class: "temperature" } } };
    expect(checkSensor(states, "sensor.t", "power", en)).toBe("Not a power sensor (device_class: power)");
    expect(checkSensor(states, "sensor.gone", "power", en)).toBe("Entity not found");
    expect(contrastWarning({ text: "#777", background: "#888" }, undefined, undefined, en)).toMatch(/^Low contrast/);
  });

  it("uses German for de and English otherwise, and fills placeholders", () => {
    expect(makeTr("de")("Stromquellen ({0})", 3)).toBe("Stromquellen (3)");
    expect(makeTr("de-AT")("Farben")).toBe("Farben");
    expect(makeTr("en")("Stromquellen ({0})", 3)).toBe("Power sources (3)");
    expect(makeTr(undefined)("Farben")).toBe("Colors");
    expect(makeTr("fr")("Unbekannt")).toBe("Unbekannt");
  });
});
