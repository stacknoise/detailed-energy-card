import { describe, expect, it } from "vitest";
import { computeModel, type Reader } from "../src/model/compute";
import { validateConfig, type EnergyCardConfig } from "../src/model/config";
import { DOMINANT_MARGIN, SOURCE_COLORS, batteryForecast, dominantSource, mixGradient, solarSplit, sourceMix } from "../src/model/mix";
import { SECONDARY_H, computeLayout } from "../src/view/layout";

const reader = (values: Record<string, number>): Reader => (id) => (id in values ? { watts: values[id], valid: true } : { watts: 0, valid: false });

const cfg: EnergyCardConfig = {
  type: "x",
  sources: [
    { entity: "sensor.pv", type: "solar" },
    { entity: "sensor.bat", type: "battery", soc_entity: "sensor.soc", capacity_kwh: 10 },
    { entity: "sensor.grid", type: "grid" },
  ],
};
const model = (pv: number, bat: number, grid: number, soc = 50) => computeModel(cfg, reader({ "sensor.pv": pv, "sensor.bat": bat, "sensor.grid": grid, "sensor.soc": soc }));

describe("sourceMix", () => {
  it("takes the shares of the sources that deliver, with the default colors", () => {
    const mix = sourceMix(model(3000, 500, 500));
    expect(mix.map((m) => [m.name, Math.round(m.share * 100), m.color])).toEqual([
      ["PV", 75, SOURCE_COLORS.solar],
      ["Batterie", 13, SOURCE_COLORS.battery],
      ["Netz", 13, SOURCE_COLORS.grid],
    ]);
  });
  it("leaves out sources that do not deliver: a charging battery, feed-in", () => {
    const mix = sourceMix(model(6200, -1800, -3400));
    expect(mix.map((m) => m.name)).toEqual(["PV"]);
    expect(mix[0].share).toBe(1);
  });
  it("is empty when nothing delivers", () => {
    expect(sourceMix(model(0, 0, 0))).toEqual([]);
  });
  it("lets a color of the source win", () => {
    const own = computeModel({ ...cfg, sources: [{ entity: "sensor.pv", type: "solar", color: "#123456" }] }, reader({ "sensor.pv": 100 }));
    expect(sourceMix(own)[0].color).toBe("#123456");
  });
});

describe("mixGradient", () => {
  it("is a conic gradient from the top with one stop per source", () => {
    const g = mixGradient(sourceMix(model(3000, 500, 500)))!;
    expect(g).toMatch(/^conic-gradient\(from 0deg, /);
    expect(g).toContain(`${SOURCE_COLORS.solar} 0.00% 75.00%`);
    expect(g).toContain(`${SOURCE_COLORS.grid} 87.50% 100.00%`);
  });
  it("is undefined without a source that delivers", () => {
    expect(mixGradient([])).toBeUndefined();
  });
});

describe("dominantSource", () => {
  const mix = (a: number, b: number) => [
    { entity: "a", name: "A", color: "#a", share: a },
    { entity: "b", name: "B", color: "#b", share: b },
  ];
  it("is the largest source at first", () => {
    expect(dominantSource(mix(0.6, 0.4))).toBe("a");
    expect(dominantSource(mix(0.4, 0.6))).toBe("b");
  });
  it("keeps the previous leader until another is ahead by the margin", () => {
    expect(dominantSource(mix(0.48, 0.52), "a")).toBe("a");
    expect(dominantSource(mix(0.5 - DOMINANT_MARGIN / 2, 0.5 + DOMINANT_MARGIN / 2), "a")).toBe("b");
    expect(dominantSource(mix(0.3, 0.7), "a")).toBe("b");
  });
  it("starts over when the previous leader no longer delivers, and is undefined when nothing does", () => {
    expect(dominantSource([{ entity: "b", name: "B", color: "#b", share: 1 }], "a")).toBe("b");
    expect(dominantSource([], "a")).toBeUndefined();
  });
});

describe("batteryForecast", () => {
  const now = Date.UTC(2026, 10, 9, 12, 0);
  const bat = (watts: number, soc?: number) => model(0, watts, 0, soc ?? 50).sources[1];
  it("says when a charging battery is full", () => {
    // 10 kWh, 50 %: 5 kWh to go at 2 kW is 2.5 hours
    const f = batteryForecast(bat(-2000), 10, now)!;
    expect(f.kind).toBe("full");
    expect(f.minutes).toBeCloseTo(150);
    expect(f.at).toBe(now + 150 * 60_000);
  });
  it("says when a discharging battery is empty", () => {
    const f = batteryForecast(bat(1000, 20), 10, now)!;
    expect(f.kind).toBe("empty");
    expect(f.minutes).toBeCloseTo(120);
  });
  it("has nothing for an idle, full or empty battery, or one without capacity or state of charge", () => {
    expect(batteryForecast(bat(10), 10, now)).toBeUndefined();
    expect(batteryForecast(bat(-2000, 100), 10, now)).toBeUndefined();
    expect(batteryForecast(bat(2000, 0), 10, now)).toBeUndefined();
    expect(batteryForecast(bat(-2000), undefined, now)).toBeUndefined();
    expect(batteryForecast(bat(-2000), 0, now)).toBeUndefined();
    const noSoc = computeModel({ type: "x", sources: [{ entity: "sensor.bat", type: "battery" }] }, reader({ "sensor.bat": -2000 })).sources[0];
    expect(batteryForecast(noSoc, 10, now)).toBeUndefined();
  });
  it("leaves out a forecast further away than two days", () => {
    expect(batteryForecast(bat(-60), 10, now)).toBeUndefined();
  });
  it("is only for batteries", () => {
    expect(batteryForecast(model(3000, 0, 0).sources[0], 10, now)).toBeUndefined();
  });
});

describe("solarSplit", () => {
  it("sends measured flows first and the rest into the home", () => {
    expect(solarSplit(model(6200, -1800, -3400))).toEqual({ produced: 6200, home: 1000, battery: 1800, grid: 3400 });
  });
  it("is all home without charging and feed-in", () => {
    expect(solarSplit(model(3000, 300, 400))).toEqual({ produced: 3000, home: 3000, battery: 0, grid: 0 });
  });
  it("never sends more than the solar power produces", () => {
    expect(solarSplit(model(1000, -1800, -3400))).toEqual({ produced: 1000, home: 0, battery: 1000, grid: 0 });
  });
  it("is undefined without production or without a solar source", () => {
    expect(solarSplit(model(20, -100, 0))).toBeUndefined();
    expect(solarSplit(computeModel({ type: "x", sources: [{ entity: "sensor.grid", type: "grid" }] }, reader({ "sensor.grid": 500 })))).toBeUndefined();
  });
});

describe("options of the package", () => {
  const base = { type: "x", sources: [{ entity: "sensor.a", type: "battery" }] };
  it("want true or false", () => {
    for (const key of ["show_source_mix", "home_color_by_source", "show_battery_forecast", "show_solar_split"]) {
      expect(() => validateConfig({ ...base, options: { [key]: true } })).not.toThrow();
      expect(() => validateConfig({ ...base, options: { [key]: "yes" } })).toThrow(new RegExp(`options\\.${key} must be true or false`));
    }
  });
  it("want a capacity above 0 on a battery", () => {
    expect(() => validateConfig({ type: "x", sources: [{ entity: "sensor.a", type: "battery", capacity_kwh: 7.5 }] })).not.toThrow();
    for (const bad of [0, -1, "10", NaN]) {
      expect(() => validateConfig({ type: "x", sources: [{ entity: "sensor.a", type: "battery", capacity_kwh: bad }] })).toThrow(/capacity_kwh must be a number greater than 0/);
    }
    expect(() => validateConfig({ type: "x", sources: [{ entity: "sensor.a", type: "solar", capacity_kwh: 5 }] })).toThrow(/capacity_kwh: only for the type battery/);
  });
});

describe("layout with a note line", () => {
  const base = { width: 400, sources: 3, floors: 3, rooms: 0 };
  it("is the same as before without it", () => {
    expect(computeLayout({ ...base, noteLine: false })).toEqual(computeLayout(base));
  });
  it("gives the sources one line more and moves everything below down", () => {
    const plain = computeLayout(base);
    const note = computeLayout({ ...base, noteLine: true });
    expect(note.sourceH).toBe(plain.sourceH + SECONDARY_H);
    expect(note.yHome).toBe(plain.yHome + SECONDARY_H);
    expect(note.height).toBe(plain.height + SECONDARY_H);
  });
  it("shares the line with the line of the other direction", () => {
    expect(computeLayout({ ...base, noteLine: true, returnLine: true }).sourceH).toBe(computeLayout({ ...base, returnLine: true }).sourceH);
  });
});
