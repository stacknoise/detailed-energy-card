import { describe, expect, it } from "vitest";
import { defineOnce, registerCardOnce } from "../src/register";

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
