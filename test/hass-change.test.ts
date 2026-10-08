import { describe, expect, it } from "vitest";
import { hassChangedForEditor, type EditorHass } from "../src/editor/hass-change";

const st = (state: string) => ({ state });
const base = (): EditorHass => ({
  states: { "sensor.a": st("1"), "sensor.other": st("5") },
  language: "de",
  areas: {},
  floors: {},
  themes: {},
});

describe("hassChangedForEditor", () => {
  it("ignores state changes of sensors that are not in the config", () => {
    const old = base();
    const next = { ...old, states: { ...old.states, "sensor.other": st("6") } };
    expect(hassChangedForEditor(old, next, ["sensor.a"])).toBe(false);
  });

  it("reacts to a configured sensor", () => {
    const old = base();
    const next = { ...old, states: { ...old.states, "sensor.a": st("2") } };
    expect(hassChangedForEditor(old, next, ["sensor.a"])).toBe(true);
  });

  it("reacts to a configured sensor that appeared or vanished", () => {
    const old = base();
    const gone = { ...old, states: { "sensor.other": old.states["sensor.other"] } };
    expect(hassChangedForEditor(old, gone, ["sensor.a"])).toBe(true);
    expect(hassChangedForEditor(gone, old, ["sensor.a"])).toBe(true);
  });

  it("reacts to language, areas, floors and themes", () => {
    const old = base();
    expect(hassChangedForEditor(old, { ...old, language: "en" }, [])).toBe(true);
    expect(hassChangedForEditor(old, { ...old, locale: { language: "en" } }, [])).toBe(true);
    expect(hassChangedForEditor(old, { ...old, areas: {} }, [])).toBe(true);
    expect(hassChangedForEditor(old, { ...old, floors: {} }, [])).toBe(true);
    expect(hassChangedForEditor(old, { ...old, themes: {} }, [])).toBe(true);
  });

  it("renders when there is no previous or no current hass", () => {
    expect(hassChangedForEditor(undefined, base(), [])).toBe(true);
    expect(hassChangedForEditor(base(), undefined, [])).toBe(true);
  });
});
