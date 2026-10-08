import { afterEach, describe, expect, it, vi } from "vitest";
import { formatPower } from "../src/model/units";

describe("formatPower number format cache", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates one Intl.NumberFormat per locale and decimals", () => {
    const spy = vi.spyOn(Intl, "NumberFormat");
    for (let i = 0; i < 50; i++) formatPower(1500 + i, "kW", 3, "de-AT");
    for (let i = 0; i < 50; i++) formatPower(1500 + i, "kW", 3, "de-AT");
    expect(spy.mock.calls.filter((c) => c[0] === "de-AT").length).toBeLessThanOrEqual(1);
  });

  it("keeps locales and decimals apart", () => {
    expect(formatPower(1234.5, "kW", 2, "de")).toBe("1,23 kW");
    expect(formatPower(1234.5, "kW", 2, "en")).toBe("1.23 kW");
    expect(formatPower(1234.5, "kW", 0, "en")).toBe("1 kW");
    expect(formatPower(1234.5, "W", 2, "en")).toBe("1,235 W");
  });
});
