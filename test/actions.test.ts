import { describe, expect, it } from "vitest";
import { actionError, actionsOf, runAction, safeUrl, splitService, type ActionDeps } from "../src/model/actions";
import { Gesture, DOUBLE_MS, HOLD_MS, type GestureTimers } from "../src/view/gesture";

function deps(answer = true) {
  const log: Array<[string, ...unknown[]]> = [];
  const d: ActionDeps = {
    callService: (domain, service, data, target) => void log.push(["service", domain, service, data, target]),
    moreInfo: (id) => void log.push(["more-info", id]),
    navigate: (p) => void log.push(["navigate", p]),
    open: (u) => void log.push(["open", u]),
    confirm: (t) => (log.push(["confirm", t]), answer),
    confirmText: "Sure?",
  };
  return { d, log };
}

describe("actions: configuration", () => {
  it("accepts the actions of the standard and names the field that is wrong", () => {
    expect(actionError(undefined, "x")).toBeUndefined();
    expect(actionError({ action: "more-info" }, "x")).toBeUndefined();
    expect(actionError({ action: "navigate", navigation_path: "/lovelace/energy" }, "x")).toBeUndefined();
    expect(actionError({ action: "perform-action", perform_action: "light.turn_on", data: { brightness: 10 }, target: { entity_id: "light.a" } }, "x")).toBeUndefined();
    expect(actionError({ action: "call-service", service: "light.turn_on" }, "x")).toBeUndefined();
    expect(actionError({ action: "toggle", confirmation: { text: "Really?" } }, "x")).toBeUndefined();
    expect(actionError({ action: "fire" }, "a.tap_action")).toMatch(/^a\.tap_action\.action: "fire" must be one of/);
    expect(actionError("toggle", "a.tap_action")).toMatch(/must be a mapping/);
    expect(actionError({ action: "navigate" }, "x")).toMatch(/navigation_path/);
    expect(actionError({ action: "navigate", navigation_path: "lovelace" }, "x")).toMatch(/navigation_path/);
    expect(actionError({ action: "url", url_path: "javascript:alert(1)" }, "x")).toMatch(/url_path/);
    expect(actionError({ action: "perform-action", perform_action: "turn_on" }, "x")).toMatch(/perform_action/);
    expect(actionError({ action: "toggle", entity: "nonsense" }, "x")).toMatch(/entity/);
    expect(actionError({ action: "toggle", data: [] }, "x")).toMatch(/data/);
    expect(actionError({ action: "toggle", confirmation: "yes" }, "x")).toMatch(/confirmation/);
  });

  it("opens only http(s) addresses and paths of the frontend", () => {
    expect(safeUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeUrl("/lovelace/0")).toBe("/lovelace/0");
    for (const bad of ["javascript:alert(1)", "//evil.example", "data:text/html,x", "", undefined, 3]) expect(safeUrl(bad)).toBeUndefined();
    expect(splitService("light.turn_on")).toEqual(["light", "turn_on"]);
    expect(splitService("light")).toBeUndefined();
    expect(splitService("Light.Turn_on")).toBeUndefined();
  });

  it("collects the three actions of an element, none without any", () => {
    expect(actionsOf({})).toBeUndefined();
    expect(actionsOf({ hold_action: { action: "toggle" } }, "sensor.a")).toEqual({ tap: undefined, hold: { action: "toggle" }, double: undefined, entity: "sensor.a" });
  });
});

describe("actions: running", () => {
  it("more-info opens the dialog of the entity of the element or the one the action names", async () => {
    const { d, log } = deps();
    expect(await runAction({ action: "more-info" }, "sensor.a", d)).toBe(true);
    expect(await runAction({ action: "more-info", entity: "light.b" }, "sensor.a", d)).toBe(true);
    expect(log).toEqual([["more-info", "sensor.a"], ["more-info", "light.b"]]);
    expect(await runAction({ action: "more-info" }, undefined, d)).toBe(false);
  });

  it("toggle calls homeassistant.toggle", async () => {
    const { d, log } = deps();
    await runAction({ action: "toggle" }, "switch.a", d);
    expect(log).toEqual([["service", "homeassistant", "toggle", { entity_id: "switch.a" }, undefined]]);
    expect(await runAction({ action: "toggle" }, undefined, d)).toBe(false);
  });

  it("navigate, url and perform-action do what they say, and nothing for what is not allowed", async () => {
    const { d, log } = deps();
    await runAction({ action: "navigate", navigation_path: "/config/energy" }, "x.y", d);
    await runAction({ action: "url", url_path: "https://example.com" }, "x.y", d);
    await runAction({ action: "perform-action", perform_action: "script.turn_on", data: { a: 1 }, target: { entity_id: "script.s" } }, "x.y", d);
    await runAction({ action: "call-service", service: "light.turn_off" }, "x.y", d);
    expect(log).toEqual([
      ["navigate", "/config/energy"],
      ["open", "https://example.com"],
      ["service", "script", "turn_on", { a: 1 }, { entity_id: "script.s" }],
      ["service", "light", "turn_off", undefined, undefined],
    ]);
    const second = deps();
    expect(await runAction({ action: "url", url_path: "javascript:1" }, undefined, second.d)).toBe(false);
    expect(await runAction({ action: "navigate", navigation_path: "evil" }, undefined, second.d)).toBe(false);
    expect(await runAction({ action: "perform-action", perform_action: "bad" }, undefined, second.d)).toBe(false);
    expect(second.log).toEqual([]);
  });

  it("none does nothing", async () => {
    const { d, log } = deps();
    expect(await runAction({ action: "none" }, "sensor.a", d)).toBe(false);
    expect(await runAction(undefined, "sensor.a", d)).toBe(false);
    expect(log).toEqual([]);
  });

  it("asks first when a confirmation is set, with the own text or the standard one, and stops on no", async () => {
    const yes = deps(true);
    await runAction({ action: "toggle", confirmation: true }, "switch.a", yes.d);
    await runAction({ action: "toggle", confirmation: { text: "Heizung aus?" } }, "switch.a", yes.d);
    expect(yes.log.filter((l) => l[0] === "confirm")).toEqual([["confirm", "Sure?"], ["confirm", "Heizung aus?"]]);
    expect(yes.log.filter((l) => l[0] === "service")).toHaveLength(2);
    const no = deps(false);
    expect(await runAction({ action: "toggle", confirmation: true }, "switch.a", no.d)).toBe(false);
    expect(no.log.map((l) => l[0])).toEqual(["confirm"]);
  });
});

describe("gesture: tap, hold and double tap", () => {
  function fake() {
    let t = 0;
    let next = 1;
    const timers = new Map<number, { at: number; fn: () => void }>();
    const api: GestureTimers = {
      set: (fn, ms) => (timers.set(next, { at: t + ms, fn }), next++),
      clear: (id) => void timers.delete(id),
    };
    const advance = (ms: number) => {
      t += ms;
      for (const [id, x] of [...timers]) if (x.at <= t) (timers.delete(id), x.fn());
    };
    return { api, advance };
  }
  const setup = (hold: boolean, double: boolean) => {
    const { api, advance } = fake();
    const log: string[] = [];
    const g = new Gesture(api);
    g.update({ hold, double, onTap: () => log.push("tap"), onHold: () => log.push("hold"), onDouble: () => log.push("double") });
    return { g, advance, log };
  };

  it("runs a tap at once when there is neither a hold nor a double tap action", () => {
    const { g, log } = setup(false, false);
    g.down();
    g.up();
    g.click();
    expect(log).toEqual(["tap"]);
  });

  it("runs the hold after 500 ms and not the tap that follows", () => {
    const { g, advance, log } = setup(true, false);
    g.down();
    advance(HOLD_MS);
    g.up();
    g.click();
    expect(log).toEqual(["hold"]);
    // the next short click is a tap again
    g.down();
    advance(100);
    g.up();
    g.click();
    expect(log).toEqual(["hold", "tap"]);
  });

  it("a short press with a hold action is a tap, and leaving the element ends the hold", () => {
    const { g, advance, log } = setup(true, false);
    g.down();
    advance(HOLD_MS - 1);
    g.up();
    advance(1000);
    g.click();
    expect(log).toEqual(["tap"]);
  });

  it("waits for a second tap when a double tap action exists: two taps are a double, one is a tap after 250 ms", () => {
    const { g, advance, log } = setup(false, true);
    g.click();
    advance(DOUBLE_MS - 1);
    g.click();
    expect(log).toEqual(["double"]);
    advance(1000);
    expect(log).toEqual(["double"]);
    g.click();
    expect(log).toEqual(["double"]);
    advance(DOUBLE_MS);
    expect(log).toEqual(["double", "tap"]);
  });

  it("takes the options of the latest render", () => {
    const { g, log } = setup(false, false);
    g.update({ hold: false, double: false, onTap: () => log.push("tap 2"), onHold: () => {}, onDouble: () => {} });
    g.click();
    expect(log).toEqual(["tap 2"]);
  });
});
