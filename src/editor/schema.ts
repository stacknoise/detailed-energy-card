/**
 * Declarative description of every editor field. Each field maps 1:1 to a config path,
 * so the form data is simply { [path]: value } and no per-field mapping code is needed.
 */
export interface Field {
  /** dotted path relative to the edited object, e.g. "options.unit" */
  path: string;
  selector: Record<string, unknown>;
  label: string;
  required?: boolean;
  /** show only when the edited object matches */
  when?: (obj: any) => boolean;
}

const power = { entity: { domain: "sensor", device_class: "power" } };
const text = { text: {} };
const icon = { icon: {} };
const opts = (values: string[]) => ({ select: { mode: "box", options: values.map((v) => ({ value: v, label: v })) } });

export const GENERAL: Field[] = [
  { path: "title", selector: text, label: "Titel" },
  { path: "options.unit", selector: opts(["auto", "W", "kW"]), label: "Einheit" },
  { path: "options.decimals", selector: { number: { min: 0, max: 4, mode: "box" } }, label: "Nachkommastellen" },
  { path: "options.animation", selector: { boolean: {} }, label: "Animation" },
  { path: "options.show_unassigned", selector: { boolean: {} }, label: "„Nicht erfasst“ anzeigen" },
  { path: "options.remember_selection", selector: { boolean: {} }, label: "Auswahl merken" },
];

export const COLORS: Field[] = [
  { path: "colors.preset", selector: opts(["theme", "nocturne", "custom"]), label: "Voreinstellung" },
  { path: "colors.accent", selector: text, label: "Akzent / Auswahl (Hex)" },
  { path: "colors.flow", selector: text, label: "Fluss-Linien (Hex)" },
  { path: "colors.inactive", selector: text, label: "Inaktive Linien (Hex)" },
  { path: "colors.bar", selector: text, label: "Verbraucher-Balken (Hex)" },
  { path: "colors.background", selector: text, label: "Hintergrund (Hex oder theme)" },
  { path: "colors.text", selector: text, label: "Text (Hex oder theme)" },
];

export const HOME: Field[] = [
  { path: "home.name", selector: text, label: "Name" },
  { path: "home.total_entity", selector: power, label: "Gesamt-Sensor (optional)" },
];

export const SOURCE: Field[] = [
  { path: "entity", selector: power, label: "Sensor", required: true },
  { path: "type", selector: opts(["solar", "battery", "grid", "generic"]), label: "Typ" },
  { path: "name", selector: text, label: "Name" },
  { path: "icon", selector: icon, label: "Icon" },
  { path: "color", selector: text, label: "Farbe (Hex)" },
  {
    path: "soc_entity",
    selector: { entity: { domain: "sensor", device_class: "battery" } },
    label: "Ladezustand (SoC)",
    when: (s) => s?.type === "battery",
  },
  { path: "invert", selector: { boolean: {} }, label: "Vorzeichen invertieren" },
];

export const NODE: Field[] = [
  { path: "name", selector: text, label: "Name", required: true },
  { path: "icon", selector: icon, label: "Icon" },
  { path: "color", selector: text, label: "Farbe (Hex)" },
];

export const CONSUMER: Field[] = [
  { path: "entity", selector: power, label: "Sensor", required: true },
  { path: "name", selector: text, label: "Name (optional)" },
];

/** Builds the ha-form schema for the fields visible for `obj`. */
export function toSchema(fields: Field[], obj: unknown) {
  return fields
    .filter((f) => !f.when || f.when(obj))
    .map((f) => ({ name: f.path, selector: f.selector, required: f.required }));
}

/** Translates a field-path -> label lookup for ha-form's computeLabel. */
export function labelFor(fields: Field[], name: string): string {
  return fields.find((f) => f.path === name)?.label ?? name;
}

/**
 * Config keys the editor can edit, in the same notation as configPaths() below.
 * Used by the tests to prove that every config option has an editor field.
 */
export function coveredPaths(): string[] {
  const prefix = (p: string, fields: Field[]) => fields.map((f) => `${p}${f.path}`);
  return [
    ...prefix("", GENERAL),
    ...prefix("", COLORS),
    ...prefix("", HOME),
    ...prefix("sources[].", SOURCE),
    ...prefix("floors[].", NODE),
    ...prefix("floors[].rooms[].", NODE),
    ...prefix("floors[].rooms[].consumers[].", CONSUMER),
    ...prefix("rooms[].", NODE),
    ...prefix("rooms[].consumers[].", CONSUMER),
  ];
}

/** Flattens a config object into leaf paths, arrays written as "[]". */
export function configPaths(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return [...new Set(value.flatMap((v) => configPaths(v, `${path}[]`)))];
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([k, v]) => configPaths(v, path ? `${path}.${k}` : k));
  }
  return [path];
}
