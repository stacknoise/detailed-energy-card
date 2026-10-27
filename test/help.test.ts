import { describe, expect, it } from "vitest";
import { GENERAL, HEATMAP, HELP, SOURCE, consumerFields, floorFields, helperFor, roomFields, ENERGY_MODE } from "../src/editor/schema";
import { makeTr } from "../src/localize/editor";

const de = makeTr("de");
const en = makeTr("en");

describe("help texts under the editor fields", () => {
  it("gives a text in both languages for every field that has one, never the key itself", () => {
    const all = [...GENERAL, ...ENERGY_MODE, ...SOURCE, ...consumerFields(), ...floorFields(), ...roomFields(), ...HEATMAP];
    const keys = new Set<string>();
    for (const f of all) {
      const text = helperFor([f], f.path, de);
      if (!text) continue;
      expect(text).not.toMatch(/^help_/);
      expect(helperFor([f], f.path, en)).not.toBe(text);
      keys.add(f.path);
    }
    // every path of the table is a field that exists
    const paths = new Set(all.map((f) => f.path));
    for (const p of Object.keys(HELP)) expect(paths.has(p), p).toBe(true);
    expect(keys.size).toBeGreaterThan(15);
  });

  it("explains the name of the remembered selection instead of calling it an ID", () => {
    expect(de("field_storage_id")).toBe("Name der gemerkten Auswahl");
    expect(helperFor(GENERAL, "options.storage_id", de)).toMatch(/mehrere Karten.*leer lassen/);
    expect(helperFor(GENERAL, "options.storage_id", en)).toMatch(/several cards.*empty/);
  });

  it("tells fields of the same path apart: the sensor of a consumer and the meter of a floor", () => {
    expect(helperFor(consumerFields(), "entity", de)).toMatch(/Mindestens einer/);
    expect(helperFor(consumerFields(), "energy_entity", de)).toMatch(/ausgegraut/);
    expect(helperFor(floorFields(), "entity", de)).toMatch(/Unterverteilung/);
    // a source has no text for the same path
    expect(helperFor(SOURCE, "entity", de)).toBeUndefined();
  });

  it("has no text for a field that needs none, and none for an unknown field", () => {
    expect(helperFor(GENERAL, "title", de)).toBeUndefined();
    expect(helperFor(GENERAL, "options.unknown", de)).toBeUndefined();
  });

  it("helps in the heatmap editor too", () => {
    expect(helperFor(HEATMAP, "entity", de)).toMatch(/Energiezähler des ganzen Hauses/);
    expect(helperFor(HEATMAP, "price_entity", en)).toMatch(/state_class/);
  });
});
