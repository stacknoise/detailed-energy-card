import { describe, expect, it } from "vitest";
import { computeModel } from "../src/model/compute";
import { powerReader, socReader } from "../src/model/readers";
import { validateConfig } from "../src/model/config";
import { stateToPercent } from "../src/model/units";

const st = (state: string, unit?: string) => ({ state, attributes: unit === undefined ? {} : { unit_of_measurement: unit } });

describe("stateToPercent", () => {
  it("accepts percentages and a missing unit, clamped to 0..100", () => {
    expect(stateToPercent(st("76", "%"))).toBe(76);
    expect(stateToPercent(st("76"))).toBe(76);
    expect(stateToPercent(st("104", "%"))).toBe(100);
    expect(stateToPercent(st("-3", "%"))).toBe(0);
  });
  it("rejects other units, unavailable states and missing entities", () => {
    expect(stateToPercent(st("76", "W"))).toBeNull();
    expect(stateToPercent(st("unavailable", "%"))).toBeNull();
    expect(stateToPercent(st("", "%"))).toBeNull();
    expect(stateToPercent(undefined)).toBeNull();
  });
});

describe("powerReader (U-2)", () => {
  const read = powerReader({
    "sensor.w": st("120", "W"),
    "sensor.kw": st("1.5", "kW"),
    "sensor.kwh": st("5000", "kWh"),
    "sensor.volt": st("230", "V"),
    "sensor.off": st("unavailable", "W"),
  });
  it("converts power units", () => {
    expect(read("sensor.w")).toEqual({ watts: 120, valid: true });
    expect(read("sensor.kw")).toEqual({ watts: 1500, valid: true });
  });
  it("does not show energy counters or other units as watts", () => {
    expect(read("sensor.kwh")).toEqual({ watts: 0, valid: false });
    expect(read("sensor.volt")).toEqual({ watts: 0, valid: false });
    expect(read("sensor.off")).toEqual({ watts: 0, valid: false });
    expect(read("sensor.gone")).toEqual({ watts: 0, valid: false });
  });
});

describe("computeModel with separate readers", () => {
  const cfg = validateConfig({
    type: "x",
    home: { total_entity: "sensor.total" },
    sources: [{ entity: "sensor.bat", type: "battery", soc_entity: "sensor.soc" }],
    rooms: [{ area_id: "k", consumers: [{ entity: "sensor.a" }, { entity: "sensor.energy" }] }],
  });
  const states = {
    "sensor.bat": st("-300", "W"),
    "sensor.soc": st("76", "%"),
    "sensor.total": st("1.2", "kW"),
    "sensor.a": st("800", "W"),
    "sensor.energy": st("5000", "kWh"), // a counter picked by mistake
  };
  it("reads power and state of charge with their own rules", () => {
    const m = computeModel(cfg, powerReader(states), socReader(states));
    expect(m.sources[0]).toMatchObject({ watts: -300, reverse: true, soc: 76 });
    expect(m.homeWatts).toBe(1200);
  });
  it("marks the energy counter invalid instead of adding 5000 W", () => {
    const m = computeModel(cfg, powerReader(states), socReader(states));
    const [a, energy] = m.rooms[0].consumers;
    expect(a).toMatchObject({ watts: 800, valid: true });
    expect(energy).toMatchObject({ watts: 0, valid: false });
    expect(m.rooms[0].watts).toBe(800);
    expect(m.unassigned).toBe(400);
  });
  it("hides the state of charge when the sensor has the wrong unit", () => {
    const wrong = { ...states, "sensor.soc": st("76", "W") };
    expect(computeModel(cfg, powerReader(wrong), socReader(wrong)).sources[0].soc).toBeUndefined();
  });
  it("a power sensor is not accepted as state of charge, and a percentage not as power", () => {
    const m = computeModel(cfg, powerReader({ ...states, "sensor.a": st("50", "%") }), socReader(states));
    expect(m.rooms[0].consumers[0]).toMatchObject({ watts: 0, valid: false });
  });
});
