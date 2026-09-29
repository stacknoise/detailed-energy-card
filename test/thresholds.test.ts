import { describe, expect, it } from "vitest";
import { validateConfig, ConfigError } from "../src/model/config";
import {
  DEFAULT_THRESHOLDS,
  duplicateThresholds,
  isIdle,
  sortThresholds,
  thresholdColor,
} from "../src/model/thresholds";

const T = sortThresholds(DEFAULT_THRESHOLDS); // 0 green, 500 orange, 2000 red

describe("thresholdColor", () => {
  it("picks the highest range that is reached", () => {
    expect(thresholdColor(T, 0)).toBe("#4caf50");
    expect(thresholdColor(T, 499)).toBe("#4caf50");
    expect(thresholdColor(T, 500)).toBe("#ff9800");
    expect(thresholdColor(T, 1999)).toBe("#ff9800");
    expect(thresholdColor(T, 2000)).toBe("#f44336");
    expect(thresholdColor(T, 50_000)).toBe("#f44336");
  });
  it("uses the absolute value (export / charging)", () => {
    expect(thresholdColor(T, -2500)).toBe("#f44336");
  });
  it("has no color below the first range or without thresholds", () => {
    expect(thresholdColor([{ from: 100, color: "#111" }], 50)).toBeUndefined();
    expect(thresholdColor([], 1000)).toBeUndefined();
  });
});

describe("sortThresholds", () => {
  it("sorts ascending and drops unusable entries", () => {
    const sorted = sortThresholds([
      { from: 2000, color: "#c" },
      { from: 0, color: "#a" },
      { from: -5, color: "#x" },
      { from: 500, color: "" },
      { from: Number.NaN, color: "#n" },
      { from: 500, color: "#b" },
    ]);
    expect(sorted.map((t) => t.color)).toEqual(["#a", "#b", "#c"]);
    expect(sortThresholds(undefined)).toEqual([]);
  });
  it("finds duplicate ranges", () => {
    expect(duplicateThresholds([{ from: 1, color: "a" }, { from: 1, color: "b" }, { from: 2, color: "c" }])).toEqual([1]);
    expect(duplicateThresholds(DEFAULT_THRESHOLDS)).toEqual([]);
  });
});

describe("isIdle", () => {
  it("treats under 1 W as idle", () => {
    expect(isIdle(0)).toBe(true);
    expect(isIdle(0.4)).toBe(true);
    expect(isIdle(-0.4)).toBe(true);
    expect(isIdle(1)).toBe(false);
    expect(isIdle(-30)).toBe(false);
  });
});

describe("threshold configuration", () => {
  const cfg = (thresholds: unknown) => ({ type: "x", colors: { thresholds } });
  it("accepts a valid list", () => {
    expect(() => validateConfig(cfg([{ from: 0, color: "#fff" }, { from: 800, color: "red" }]))).not.toThrow();
  });
  it("rejects a bad shape with a readable message", () => {
    expect(() => validateConfig(cfg("nope"))).toThrow(ConfigError);
    expect(() => validateConfig(cfg([{ from: "500", color: "#fff" }]))).toThrow(/thresholds\[0\]\.from/);
    expect(() => validateConfig(cfg([{ from: -1, color: "#fff" }]))).toThrow(/thresholds\[0\]\.from/);
    expect(() => validateConfig(cfg([{ from: 5 }]))).toThrow(/thresholds\[0\]\.color/);
  });
});
