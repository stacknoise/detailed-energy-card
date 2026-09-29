import { describe, expect, it } from "vitest";
import { getPath } from "../src/editor/config-utils";
import { HOME, SOURCE, COLORS } from "../src/editor/schema";
import { checkSensor, fieldErrors, isValidColor, sumConflict } from "../src/editor/validation";
import type { EnergyCardConfig } from "../src/model/config";

const st = (state: string, attributes: Record<string, unknown> = {}) => ({ state, attributes });
const states = {
  "sensor.power": st("100", { device_class: "power", unit_of_measurement: "W" }),
  "sensor.temp": st("21", { device_class: "temperature", unit_of_measurement: "°C" }),
  "sensor.wrongunit": st("1", { device_class: "power", unit_of_measurement: "V" }),
  "sensor.soc": st("76", { device_class: "battery", unit_of_measurement: "%" }),
  "sensor.pct": st("50", { unit_of_measurement: "%" }),
};

describe("checkSensor", () => {
  it("accepts power sensors and ignores empty values", () => {
    expect(checkSensor(states, "sensor.power", "power")).toBeUndefined();
    expect(checkSensor(states, "", "power")).toBeUndefined();
    expect(checkSensor(states, undefined, "power")).toBeUndefined();
  });
  it("flags missing, wrong class, wrong unit and wrong domain", () => {
    expect(checkSensor(states, "sensor.gone", "power")).toMatch(/nicht gefunden/);
    expect(checkSensor(states, "sensor.temp", "power")).toMatch(/Leistungssensor/);
    expect(checkSensor(states, "sensor.wrongunit", "power")).toMatch(/Einheit/);
    expect(checkSensor(states, "light.kitchen", "power")).toMatch(/sensor/);
  });
  it("accepts battery or percent sensors as SoC", () => {
    expect(checkSensor(states, "sensor.soc", "battery")).toBeUndefined();
    expect(checkSensor(states, "sensor.pct", "battery")).toBeUndefined();
    expect(checkSensor(states, "sensor.temp", "battery")).toBeDefined();
  });
});

describe("fieldErrors", () => {
  it("reports errors keyed by field path", () => {
    expect(fieldErrors({ entity: "sensor.temp" }, SOURCE, states, getPath)).toEqual({
      entity: expect.stringMatching(/Leistungssensor/),
    });
    expect(fieldErrors({ home: { total_entity: "sensor.power" } }, HOME, states, getPath)).toEqual({});
  });
  it("validates colors", () => {
    expect(fieldErrors({ colors: { accent: "red" } }, COLORS, states, getPath)).toHaveProperty(["colors.accent"]);
    expect(fieldErrors({ colors: { accent: "#9184d9" } }, COLORS, states, getPath)).toEqual({});
  });
});

describe("isValidColor", () => {
  it.each(["", undefined, "theme", "#fff", "#9184d9", "#9184D9cc"])("accepts %s", (v) => expect(isValidColor(v)).toBe(true));
  it.each(["red", "#12", "9184d9", "#gggggg"])("rejects %s", (v) => expect(isValidColor(v)).toBe(false));
});

describe("sumConflict", () => {
  const cfg: EnergyCardConfig = {
    type: "x",
    home: { total_entity: "sensor.power" },
    rooms: [{ area_id: "a", consumers: [{ entity: "sensor.soc" }] }],
  };
  it("detects rooms above the total", () => {
    const s = { ...states, "sensor.big": st("500", { unit_of_measurement: "W" }) };
    const c = { ...cfg, rooms: [{ area_id: "a", consumers: [{ entity: "sensor.big" }] }] };
    expect(sumConflict(c, s)).toEqual({ rooms: 500, total: 100 });
  });
  it("is silent without total sensor or when the sum fits", () => {
    expect(sumConflict({ type: "x", rooms: [] }, states)).toBeUndefined();
    const c = { ...cfg, rooms: [{ area_id: "a", consumers: [{ entity: "sensor.power" }] }] };
    expect(sumConflict(c, states)).toBeUndefined();
  });
});

import { contrastRatio, contrastWarning, parseColor } from "../src/editor/validation";
import { reorder } from "../src/editor/config-utils";

describe("contrast", () => {
  it("parses hex and rgb colors", () => {
    expect(parseColor("#fff")).toEqual([255, 255, 255]);
    expect(parseColor("#9184d9")).toEqual([145, 132, 217]);
    expect(parseColor("#9184d9cc")).toEqual([145, 132, 217]);
    expect(parseColor("rgb(10, 20, 30)")).toEqual([10, 20, 30]);
    expect(parseColor("red")).toBeUndefined();
  });
  it("computes WCAG ratios", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1);
  });
  it("warns below 4.5 : 1 and uses theme values for unset colors", () => {
    expect(contrastWarning({ text: "#777", background: "#888" }, undefined, undefined)).toMatch(/Kontrast/);
    expect(contrastWarning({ text: "#000", background: "#fff" }, undefined, undefined)).toBeUndefined();
    expect(contrastWarning({ text: "#eee" }, "#111", "#fff")).toMatch(/Kontrast/);
    expect(contrastWarning({ background: "#000" }, "#fff", "#fff")).toBeUndefined();
  });
  it("stays silent when nothing is customized or values are unparsable", () => {
    expect(contrastWarning({}, "#fff", "#fff")).toBeUndefined();
    expect(contrastWarning({ text: "banana" }, "#fff", "#fff")).toBeUndefined();
  });
});

describe("reorder", () => {
  it("moves an item to a new index", () => {
    expect(reorder([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(reorder([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3]);
  });
  it("ignores no-ops and out-of-range indices", () => {
    const l = [1, 2, 3];
    expect(reorder(l, 1, 1)).toBe(l);
    expect(reorder(l, 0, 5)).toBe(l);
    expect(reorder(l, -1, 1)).toBe(l);
  });
});
