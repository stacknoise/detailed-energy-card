import { describe, expect, it } from "vitest";
import { computeModel, type Reader } from "../src/model/compute";
import { validateConfig } from "../src/model/config";
import { plausibilityHints } from "../src/model/hints";

const reader = (values: Record<string, number>): Reader => (id) => (id in values ? { watts: values[id], valid: true } : { watts: 0, valid: false });
const cfg = validateConfig({
  type: "x",
  home: { total_entity: "sensor.home" },
  sources: [
    { entity: "sensor.pv", type: "solar" },
    { entity: "sensor.grid", type: "grid" },
  ],
  consumers: [{ entity: "sensor.a" }, { entity: "sensor.b" }],
});
const model = (v: Record<string, number>) => computeModel(cfg, reader({ "sensor.home": 2000, "sensor.pv": 1000, "sensor.grid": 1000, "sensor.a": 800, "sensor.b": 700, ...v }));

describe("plausibilityHints", () => {
  it("has nothing to say when everything adds up", () => {
    expect(plausibilityHints(model({}))).toEqual([]);
  });
  it("notices sources that deliver much more or less than the home uses", () => {
    expect(plausibilityHints(model({ "sensor.grid": 2600 }))).toEqual([{ kind: "balance", value: 1600 }]);
    expect(plausibilityHints(model({ "sensor.grid": -500 }))).toEqual([{ kind: "balance", value: -1500 }]);
    // a small gap is no hint
    expect(plausibilityHints(model({ "sensor.grid": 1200 }))).toEqual([]);
  });
  it("notices rooms and consumers above the home meter", () => {
    expect(plausibilityHints(model({ "sensor.a": 1500, "sensor.b": 1500 }))).toEqual([{ kind: "rooms", value: 1000 }]);
  });
  it("counts sources that cannot be read and gives no balance then", () => {
    const m = computeModel(cfg, reader({ "sensor.home": 2000, "sensor.pv": 1000, "sensor.a": 800, "sensor.b": 700 }));
    expect(plausibilityHints(m)).toEqual([{ kind: "unavailable", value: 1 }]);
  });
});
