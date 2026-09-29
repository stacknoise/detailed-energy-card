const de = {
  autarky: "Autarkie",
  import: "Bezug",
  export: "Einspeisung",
  charging: "lädt",
  consumers: "Verbraucher",
  unassigned: "Nicht erfasst",
  no_consumers: "Keine Verbraucher in diesem Raum",
  no_rooms: "Keine Räume konfiguriert",
  unavailable: "Sensor nicht verfügbar",
  home: "Zuhause",
};
const en: typeof de = {
  autarky: "Self-sufficiency",
  import: "Import",
  export: "Export",
  charging: "charging",
  consumers: "consumers",
  unassigned: "Unassigned",
  no_consumers: "No consumers in this room",
  no_rooms: "No rooms configured",
  unavailable: "Sensor unavailable",
  home: "Home",
};

export type Key = keyof typeof de;

export function localize(lang: string | undefined, key: Key): string {
  return (lang?.startsWith("de") ? de : en)[key];
}
