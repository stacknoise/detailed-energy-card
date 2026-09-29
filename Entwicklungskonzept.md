# Entwicklungskonzept – Energiefluss-Card für Home Assistant

Basis: Entwürfe 3a, 3b und 4a.

**Mockups** (Ordner `mockups/`):
- `3a-card-mit-etagen.png`: Card mit Zuhause → Etage → Raum → Verbraucher
- `3b-card-ohne-etagen.png`: Card ohne Etagen, Räume direkt am Zuhause
- `4a-editor.png`: Visueller Editor mit allen Optionen
Repository: **`energy-card`** · Lovelace-Typ `custom:energy-card` · Installation über **HACS**.

---

## 1. Ziel und Umfang

Eine Lovelace-Card, die den aktuellen Leistungsfluss im Haus zeigt:

- **Quellen** (1…n): z. B. PV, Batterie, Netz, Generator.
- **Zuhause** als zentraler Knoten. Der Name ist der Standortname der HA-Instanz (`location_name`).
- **Etagen** (optional, 0…n).
- **Räume** (1…n), direkt am Zuhause oder unter einer Etage.
- **Verbraucher** (unbegrenzt) je Raum. Jeder Verbraucher ist genau ein Sensor.

Interaktion: Etage wählen → Räume dieser Etage werden gezeigt. Raum wählen → die Liste zeigt dessen Verbraucher.

**Nicht im MVP:** historische Auswertung (kWh über einen Zeitraum), Kosten, Steuerung von Geräten.

---

## 2. Technik

| Thema | Entscheidung |
|---|---|
| Sprache | TypeScript |
| UI | Lit 3 (`LitElement`), wie HA-Frontend |
| Build | Vite oder Rollup → ein ES-Modul `energy-card.js` |
| Grafik | Inline-SVG für Linien, HTML für Knoten und Liste |
| Animation | CSS `stroke-dashoffset`, keine JS-Loops |
| Icons | `ha-icon` mit MDI-Namen (in HA verfügbar). Die Phosphor-Icons im Entwurf werden auf MDI gemappt. |
| Verteilung | HACS (Typ „Dashboard“/Plugin) über GitHub Releases, siehe Abschnitt 13 |
| Tests | Vitest (Berechnung, Layout), Playwright (visuelle Snapshots) |

---

## 3. Konfiguration (YAML)

```yaml
type: custom:energy-card
title: Energiefluss
home:
  total_entity: sensor.hausverbrauch_power   # optional, für "Nicht erfasst"
sources:
  - entity: sensor.pv_leistung
    name: PV
    type: solar            # solar | battery | grid | generic
    color: "#f2c94c"       # optional, eigene Farbe je Quelle
  - entity: sensor.akku_leistung
    name: Batterie
    type: battery
    soc_entity: sensor.akku_soc   # optional, Anzeige "76 %"
    invert: false          # Vorzeichen drehen, falls Sensor anders zählt
  - entity: sensor.netz_leistung
    name: Netz
    type: grid
floors:                    # optional – weglassen = Räume direkt am Zuhause
  - floor_id: erdgeschoss   # Etage aus Home Assistant (Floor-Registry)
    color: ""              # optional, auch je Raum möglich
    rooms:
      - area_id: kueche      # Bereich aus Home Assistant (Area-Registry)
        consumers:
          - entity: sensor.backofen_power
            name: Backofen      # optional, sonst friendly_name
          - entity: sensor.kuehlschrank_power
rooms: []                  # alternativ zu floors (Wohnung ohne Etagen)
colors:                    # optional – leer = HA-Theme
  preset: theme            # theme | nocturne | custom
  accent: "#9184d9"        # Auswahl, Glow, Hervorhebung
  flow: "#b5abfc"          # aktive Fluss-Linien
  inactive: "#75798c"      # nicht gewählte Pfade
  bar: "#b5abfc"           # Verbraucher-Balken
  background: theme        # theme oder Hex
  text: theme
options:
  unit: auto               # auto | W | kW
  decimals: 2
  animation: true
  show_unassigned: true
  remember_selection: true
```

**Regeln**

- **Etagen und Räume kommen ausschließlich aus Home Assistant.** Die Config speichert nur `floor_id` und `area_id`. Name und Icon werden zur Laufzeit aus der Floor- bzw. Area-Registry gelesen (WebSocket `config/floor_registry/list`, `config/area_registry/list`). Freie Namen sind nicht möglich; ein Eintrag ohne ID ist ein Validierungsfehler. Ist eine ID in HA nicht mehr vorhanden, zeigt die Card die ID.
- Jede Etage und jeder Bereich kann nur einmal vorkommen. Unter einer Etage sind nur Bereiche wählbar, die in HA dieser Etage zugeordnet sind.

- Es gibt entweder `floors` oder `rooms` auf oberster Ebene. Sind beide gesetzt, gibt es einen Validierungsfehler.
- Räume sind nie leer: Ein Raum ohne Verbraucher wird mit einem Hinweis angezeigt, aber mit 0 gerechnet.
- Anzahl von Quellen, Etagen, Räumen und Verbrauchern ist nicht begrenzt.

---

## 4. Erlaubte Entitäten

Nur **Sensoren** sind zulässig. Die Validierung erfolgt im Editor und zur Laufzeit.

- Domain `sensor.*`
- `device_class: power`, Einheit `W`, `kW` oder `MW`
- *(Phase 2)* `device_class: energy` (`Wh`/`kWh`) für einen Modus „Tagesverbrauch“

Nicht passende Entitäten werden im Editor ausgefiltert. Kommen sie per YAML trotzdem in die Konfiguration, zeigt die Card eine Warnung am Knoten statt abzustürzen.

Alle Werte werden intern in **Watt** umgerechnet.

---

## 5. Berechnung

```
Verbraucher  = Sensorwert (W)
Raum         = Σ Verbraucher
Etage        = Σ Räume
Zuhause      = total_entity   falls gesetzt
             = Σ Räume        sonst
Nicht erfasst = max(0, total_entity − Σ Räume)
```

**Quellen und Vorzeichen**

| Typ | positiv | negativ |
|---|---|---|
| solar | Erzeugung | – (auf 0 kappen) |
| battery | Entladen (Quelle) | Laden (wird als Verbraucher gezeigt, Pfeil umgekehrt) |
| grid | Bezug (Quelle) | Einspeisung (Pfeil vom Haus zum Netz) |

Mit `invert: true` wird das Vorzeichen eines Sensors gedreht.

**Kennzahlen**

- Anteil einer Quelle = Quelle / Σ positive Quellen
- Autarkie = 1 − Netzbezug / Zuhause, begrenzt auf 0…100 %

**Ungültige Werte:** `unavailable`, `unknown` und nicht numerische Werte zählen als 0. Der Knoten wird dann gedimmt und mit einem Warn-Icon versehen.

Die Berechnung liegt als reine Funktion in `src/model/compute.ts`, ohne DOM. So lässt sie sich vollständig mit Unit-Tests abdecken.

---

## 6. Layout und Darstellung

**Ebenen (y-Positionen, Kartenbreite W):**

| Ebene | mit Etagen | ohne Etagen |
|---|---|---|
| Quellen | 0 | 0 |
| Zuhause | 124 | 124 |
| Etagen | 226 | – |
| Räume | 300 | 226 |

- **x-Position:** Knoten einer Ebene werden gleichmäßig verteilt: `x = W · (i + 0.5) / n`.
- **Linien:** kubische Bézier-Kurven von Knoten zu Knoten, `M x0 y0 C x0 m x1 m x1 y1`.
- **Linienstärke:** `1 + kW · 0.7`.
- **Animationsdauer:** `clamp(2.2 − kW · 0.5, 0.5 s, 2.2 s)`. Ohne Leistung gibt es keine Animation.
- **Hervorhebung:** Die gewählte Etage und der gewählte Raum bekommen Akzentfarbe und Glow. Die übrigen Linien sind gedämpft.
- **Viele Räume:** Ab 7 Räumen in einer Ebene wird die Raumzeile horizontal scrollbar, mit fester Spaltenbreite von 64 px. Alternativ lässt sich per Option auf zwei Reihen umbrechen.
- **Responsive:** Die SVG-Breite folgt der Kartenbreite (`ResizeObserver`). Knoten werden absolut über dem SVG positioniert.
- **Barrierefreiheit:** `prefers-reduced-motion` schaltet die Animation ab. Knoten sind `<button>` mit `aria-pressed`. Die Liste ist tastaturbedienbar.

---

## 7. Interaktion

| Aktion | Ergebnis |
|---|---|
| Klick auf Etage | Räume dieser Etage einblenden. Der größte Raum wird vorgewählt. |
| Klick auf Raum | Die Liste zeigt die Verbraucher des Raums, absteigend nach Leistung. |
| Klick auf Verbraucher | Öffnet den HA-More-Info-Dialog (`hass-more-info`). |
| Klick auf Quelle | Öffnet ebenfalls den More-Info-Dialog. |

- Oben in der Card steht der Pfad, z. B. „Zuhause › EG › Küche“.
- Die Auswahl wird pro Card in `localStorage` gespeichert (Option `remember_selection`).

---

## 8. Architektur

```
src/
  energy-card.ts   // Custom Element, hass-Setter, Auswahlzustand
  editor/
    card-editor.ts            // visueller Editor
    tree-editor.ts            // Zuhause / Etagen / Räume / Verbraucher
  model/
    config.ts                 // Typen + Validierung (superstruct o. ä.)
    compute.ts                // Summen, Vorzeichen, Autarkie
    units.ts                  // W/kW/MW-Normalisierung, Formatierung
  view/
    flow-graph.ts             // SVG-Linien + Knoten-Layout
    node.ts                   // Quelle / Zuhause / Etage / Raum
    consumer-list.ts          // Liste unter dem Graphen
  styles/theme.ts             // CSS-Variablen
  localize/de.json, en.json
```

**Performance**

- Beim Laden der Konfiguration wird die Liste aller referenzierten Entity-IDs gebildet.
- `shouldUpdate()` rendert nur neu, wenn sich eine dieser States ändert.
- Die Geometrie wird nur neu berechnet, wenn sich die Konfiguration oder die Breite ändert. Bei Wertänderungen werden nur Linienstärke, Dauer und Text aktualisiert.

**HA-Schnittstellen**

- `setConfig()`
- `set hass()`
- `getCardSize()`
- `getGridOptions()` für den Sections-View, Mindestbreite 6 Spalten
- `static getConfigElement()`
- `static getStubConfig()`, das automatisch passende Power-Sensoren vorschlägt

---

## 9. Visueller Editor

**Grundsatz: Die gesamte Konfiguration ist im visuellen Editor möglich.** Jede Option aus Abschnitt 3 hat ein Bedienelement. Nutzer müssen nie auf YAML wechseln. YAML bleibt nur als optionale Alternative.

**Abnahmekriterium:** Ein Konfigurationsobjekt, das im Editor angelegt wurde, ist identisch mit dem entsprechenden YAML. Das wird durch einen automatischen Test sichergestellt, der für jeden Konfigurationsschlüssel prüft, ob ein Editor-Feld existiert (Schema → Feld-Mapping).

**Editor-Bereiche (Mockup `mockups/4a-editor.png`):**

| Bereich | Felder |
|---|---|
| Allgemein | Titel, Einheit (auto/W/kW), Nachkommastellen, Animation, „Nicht erfasst“ anzeigen, Auswahl merken |
| Farben | Voreinstellung (HA-Theme / Nocturne / Eigene), Akzent, Fluss-Linien, inaktive Linien, Verbraucher-Balken, Hintergrund, Text |
| Zuhause | Gesamt-Sensor (optional). Der Name ist fest (Standortname der Instanz). |
| Stromquellen | Liste; je Quelle: Sensor, Typ, Name, Icon, Farbe, Invertieren, SoC-Sensor (nur Batterie) |
| Struktur | Umschalter „Etagen verwenden“; Baum Etage → Raum → Verbraucher; Etagen und Räume nur per Auswahl aus HA, je Knoten zusätzlich Farbe; je Verbraucher: Sensor, Name |

**Details:**

- **Stromquellen:** Liste mit Hinzufügen, Entfernen und Sortieren. Pro Quelle: Entität, Typ, Name, Invertieren und optional SoC.
- **Struktur:** Baum Zuhause → (Etage) → Raum → Verbraucher.
  - Umschalter „Etagen verwenden“. Beim Ausschalten werden die Räume flach übernommen, beim Einschalten nach der HA-Etage ihres Bereichs gruppiert (Bereiche ohne Etage entfallen).
  - Drag-and-drop zum Sortieren und zum Verschieben von Räumen zwischen Etagen.
- **Entitätsauswahl:** `ha-entity-picker` mit `include-domains: ["sensor"]` und einem `entity-filter` auf `device_class === "power"`. Bereits vergebene Sensoren werden markiert, Doppelbelegung ist möglich, erzeugt aber eine Warnung.
- **Validierung live im Editor:** ungültige Sensoren, doppelte Zuordnung und Summenkonflikte werden am Feld angezeigt, nicht erst in der Card.
- **Vorschau:** Die Card-Vorschau von HA aktualisiert sich bei jeder Änderung (`config-changed`-Event).
- **Umsetzung:** Einfache Felder nutzen `ha-form` mit Selektoren (`entity`, `icon`, `select`, `boolean`, `number`, `text`, `color_rgb`). Die Listen und der Baum sind eigene Lit-Komponenten, die intern ebenfalls `ha-form` pro Eintrag verwenden.
- **YAML-Modus:** Standard-Umschalter von HA, optional.

---

## 10. Farben und Theming

Alle Farben sind anpassbar, im visuellen Editor (Bereich „Farben“) und per YAML (`colors:`).

**Rangfolge (höchste zuerst):**
1. Farbe am Element (`color` bei Quelle, Etage oder Raum)
2. `colors.*` in der Card-Konfiguration
3. Voreinstellung (`preset`)
4. HA-Theme-Variablen
5. Nocturne-Fallback

**Voreinstellungen**
- `theme` übernimmt die Farben des aktiven HA-Themes und passt sich damit automatisch an Hell- und Dunkelmodus an.
- `nocturne` verwendet die Farben der Mockups.
- `custom` gibt alle Felder frei.

**Umsetzung:** Jede Farbe wird als CSS-Variable am Host-Element gesetzt. Karten-Mod und eigene Themes können sie ebenfalls überschreiben.

| Card-Variable | Config-Schlüssel | HA-Variable | Fallback |
|---|---|---|---|
| `--efc-accent` | `accent` | `--primary-color` | `#9184d9` |
| `--efc-flow` | `flow` | `--primary-color` | `#b5abfc` |
| `--efc-inactive` | `inactive` | `--disabled-text-color` | `#75798c` |
| `--efc-bar` | `bar` | `--primary-color` | `#b5abfc` |
| `--efc-bg` | `background` | – | `transparent` |
| `--efc-ground` | – | – | `transparent` |
| `--efc-text` | `text` | `--primary-text-color` | `#e9e9ed` |
| `--efc-muted` | – | `--secondary-text-color` | `#9397ab` |
| `--efc-line` | – | `--divider-color` | `#3f424d` |

- **Glow und Tönungen** (gewählter Knoten, Flächen) werden per `color-mix()` aus `--efc-accent` abgeleitet. Eine einzige Akzentfarbe reicht damit für ein stimmiges Ergebnis.
- **Kontrast:** Der Editor warnt, wenn Text und Hintergrund unter 4.5 : 1 liegen.
- **Editor-Bedienung:** `ha-form` mit `color_rgb`-Selektor plus Hex-Eingabe. „Zurücksetzen“ leert das Feld, dann gilt wieder das Theme.

---

## 11. Randfälle

- Nur eine Quelle oder gar keine: Die Quellenzeile wird ausgeblendet, das Zuhause rückt nach oben.
- Summe der Räume ist größer als `total_entity`: „Nicht erfasst“ wird nicht angezeigt, dafür eine Hinweis-Warnung im Editor.
- Netz speist ein und Batterie lädt gleichzeitig: Pfeile werden umgekehrt, die Werte korrekt gezeigt.
- Sehr kleine Werte (< 1 W): Anzeige „0 W“, keine Animation.
- Lange Namen werden mit Ellipsis gekürzt. Der volle Name steht im `title`.

---

## 12. Roadmap

| Version | Inhalt |
|---|---|
| **0.1 MVP** | YAML-Konfiguration, Quellen, optionale Etagen, Räume, Verbraucherliste, Animation, More-Info |
| **0.2** | Vollständiger visueller Editor (alle Optionen), Baum, gefilterte Sensorauswahl |
| **0.3** | Einspeisung, Batterie laden, „Nicht erfasst“, Autarkie |
| **0.4** | Viele Räume (Scroll/Umbruch), Lokalisierung DE/EN, erstes HACS-Release (Custom Repository) |
| **1.0** | Energie-Modus (kWh heute/Woche) mit `device_class: energy`, Stabilisierung, Aufnahme in HACS-Standard |

---

## 13. Repository und HACS-Installation

**Repository:** `github.com/<owner>/energy-card`, öffentlich.

```
energy-card/
  src/                       // siehe Abschnitt 8
  dist/energy-card.js        // Build-Artefakt (nicht eingecheckt, nur im Release)
  hacs.json
  README.md                  // wird in HACS als Beschreibung angezeigt
  LICENSE                    // z. B. MIT
  package.json
  vite.config.ts
  .github/workflows/
    build.yml                // Lint, Tests, Build bei jedem Push/PR
    release.yml              // Build + Asset-Upload bei Tag v*
    validate.yml             // HACS-Validierung via hacs/action
```

**hacs.json**

```json
{
  "name": "Energy Card",
  "filename": "energy-card.js",
  "render_readme": true,
  "homeassistant": "2024.8.0"
}
```

**Anforderungen, damit HACS das Repo akzeptiert**

- Der Dateiname der JS-Datei muss zum Repo-Namen passen: `energy-card.js`. HACS findet sie dann im Release-Asset, in `dist/` oder im Root.
- Jede Version ist ein **GitHub Release** mit SemVer-Tag (`v0.1.0`), und `energy-card.js` hängt als Asset daran.
- Das Repository braucht eine Beschreibung und Topics, z. B. `home-assistant`, `hacs`, `lovelace`, `energy`.
- `hacs/action` (Kategorie `plugin`) muss im Workflow `validate.yml` grün laufen.

**Installation für Nutzer**

1. *Vor Aufnahme in den HACS-Standard:* HACS → ⋮ → Benutzerdefinierte Repositories → URL eintragen, Typ „Dashboard“.
2. „Energy Card“ suchen → Herunterladen.
3. HACS registriert die Ressource `/hacsfiles/energy-card/energy-card.js` automatisch als JavaScript-Modul.
4. Im Dashboard Karte hinzufügen → „Energy Card“, oder per YAML `type: custom:energy-card`.

**Registrierung im Card-Picker** (in `energy-card.ts`):

```ts
customElements.define('energy-card', EnergyCard);
customElements.define('energy-card-editor', EnergyCardEditor);
(window as any).customCards ??= [];
(window as any).customCards.push({
  type: 'energy-card',
  name: 'Energy Card',
  description: 'Energiefluss von Quellen über Etagen und Räume bis zu den Verbrauchern',
  preview: true,
});
```

**Release-Ablauf:** Version in `package.json` erhöhen, Tag `vX.Y.Z` pushen. `release.yml` baut dann die Datei, hängt `energy-card.js` an das Release und erzeugt die Release-Notes. Optional folgt danach der PR zur Aufnahme in `hacs/default`.

---

## 14. Offene Fragen

1. Soll ein Verbraucher mehreren Räumen zugeordnet werden dürfen, z. B. anteilig?
2. Genügt eine feste Reihenfolge der Quellen, oder soll sie sich nach der Leistung sortieren?
3. Soll die Batterie beim Laden als eigener Verbraucherknoten erscheinen oder nur als umgekehrter Pfeil an der Quelle?
4. Wird für den Energie-Modus die HA-Recorder-Statistik genutzt, oder werden Tageszähler (`utility_meter`) vorausgesetzt?
