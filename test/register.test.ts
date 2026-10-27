import { describe, expect, it } from "vitest";
import { REPO_URL, defineOnce, logBannerOnce, registerCardOnce } from "../src/register";

describe("defineOnce", () => {
  it("defines an element only the first time", () => {
    const defined = new Map<string, unknown>();
    const registry = {
      get: (n: string) => defined.get(n),
      define: (n: string, c: unknown) => {
        if (defined.has(n)) throw new Error("already defined");
        defined.set(n, c);
      },
    };
    class A {}
    class B {}
    defineOnce("x-card", A as unknown as CustomElementConstructor, registry);
    expect(() => defineOnce("x-card", B as unknown as CustomElementConstructor, registry)).not.toThrow();
    expect(defined.get("x-card")).toBe(A);
  });
});

describe("registerCardOnce", () => {
  it("does not add a second picker entry for the same type", () => {
    const list: Array<Record<string, unknown>> = [{ type: "other-card" }];
    registerCardOnce(list, { type: "detailed-energy-card", name: "A" });
    registerCardOnce(list, { type: "detailed-energy-card", name: "B" });
    expect(list.map((c) => c.type)).toEqual(["other-card", "detailed-energy-card"]);
    expect(list[1].name).toBe("A");
  });
});

describe("logBannerOnce", () => {
  it("logs name, version and repository once, even when the script is loaded twice", () => {
    const page = {};
    const calls: unknown[][] = [];
    const log = (...args: unknown[]) => calls.push(args);
    logBannerOnce("1.2.3", page, log);
    logBannerOnce("1.2.3", page, log);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toContain("DETAILED-ENERGY-CARD");
    expect(calls[0][0]).toContain("1.2.3");
    expect(calls[0][0]).toContain(REPO_URL);
  });

  it("gets the version of package.json from the build", async () => {
    const { readFileSync } = await import("node:fs");
    expect(__VERSION__).toBe(JSON.parse(readFileSync("package.json", "utf8")).version);
  });
});
