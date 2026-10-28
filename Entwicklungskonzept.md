# Entwicklungskonzept – Energiefluss-Card für Home Assistant

Basis: Entwürfe 3a, 3b und 4a.

**Mockups** (Ordner `mockups/`):
- `3a-card-mit-etagen.png`: Card mit Zuhause → Etage → Raum → Verbraucher
- `3b-card-ohne-etagen.png`: Card ohne Etagen, Räume direkt am Zuhause
- `4a-editor.png`: Visueller Editor mit allen Optionen
Repository: **`detailed-energy-card`** · Lovelace-Typ `custom:detailed-energy-card` · Installation über **HACS**.

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
| Build | Vite → ein ES-Modul `detailed-energy-card.js` |
| Grafik | Inline-SVG für Linien, HTML für Knoten und Liste |
| Animation | CSS `stroke-dashoffset`, keine JS-Loops |
| Icons | `ha-icon` mit MDI-Namen (in HA verfügbar). Die Phosphor-Icons im Entwurf werden auf MDI gemappt. |
| Verteilung | HACS (Typ „Dashboard“/Plugin) über GitHub Releases, siehe Abschnitt 13 |
| Tests | Vitest (Berechnung, Validierung, Registry), Playwright (E2E und Screenshots) |

---

## 3. Konfiguration (YAML)

```yaml
type: custom:detailed-energy-card
title: Energiefluss
home:
  total_entity: sensor.hausverbrauch_power   # optional, für "Nicht erfasst"
  total_energy_entity: sensor.hausverbrauch_energie   # optional, Zähler (kWh) für den Energie-Modus
sources:
  - entity: sensor.pv_leistung
    name: PV
    type: solar            # solar | battery | grid | generic
    energy_entity: sensor.pv_energie   # optional, Zähler (kWh) für den Energie-Modus
    color: "#f2c94c"       # optional, eigene Farbe je Quelle
  - entity: sensor.akku_leistung
    name: Batterie
    type: battery
    soc_entity: sensor.akku_soc   # optional, Anzeige "76 %"
    invert: false          # Vorzeichen drehen, falls Sensor anders zählt
  - entity: sensor.netz_leistung
    name: Netz
    type: grid
    energy_entity: sensor.netz_bezug             # optional, Bezug (kWh) für den Energie-Modus
    energy_entity_return: sensor.netz_einspeisung # optional, Gegenrichtung (kWh): Einspeisung, bei Batterie „geladen“; nicht bei solar
floors:                    # optional – weglassen = Räume direkt am Zuhause
  - floor_id: erdgeschoss   # Etage aus Home Assistant (Floor-Registry)
    color: ""              # optional, auch je Raum möglich
    entity: sensor.uv_eg_power          # optional, eigener Leistungszähler der Etage (z. B. Unterverteilung)
    energy_entity: sensor.uv_eg_energie # optional, eigener Energiezähler der Etage (kWh)
    rooms:
      - area_id: kueche      # Bereich aus Home Assistant (Area-Registry)
        entity: sensor.kueche_power          # optional, eigener Leistungszähler des Raums
        energy_entity: sensor.kueche_energie # optional, eigener Energiezähler des Raums
        consumers:
          - entity: sensor.backofen_power   # Leistungssensor; optional, wenn energy_entity gesetzt ist (mindestens eines von beiden)
            name: Backofen      # optional, sonst friendly_name
            energy_entity: sensor.backofen_energie   # optional, Energie-Modus
          - entity: sensor.kuehlschrank_power
            switch_entity: switch.kuehlschrank   # optional: Kippschalter am Zeilenende der Liste (switch, input_boolean, light, fan)
            confirm_switch: false                # true: vor dem Ausschalten nachfragen
          # Quellen, Etagen, Räume und Verbraucher: tap_action, hold_action, double_tap_action (HA-Standard, Abschnitt 7)
rooms: []                  # alternativ zu floors (Wohnung ohne Etagen)
consumers:                 # optional – Verbraucher direkt unter Zuhause, ohne Etage und Raum (z. B. Lampen außen am Haus)
  - entity: sensor.aussenlicht_power   # wie ein Verbraucher im Raum (entity und/oder energy_entity, name, switch_entity, Aktionen, thresholds)
    name: Außenlampen
    icon: mdi:lamp                     # nur hier: Icon des Knotens (Standard mdi:flash)
colors:                    # optional – leer = HA-Theme
  preset: theme            # theme | nocturne | custom
  accent: "#9184d9"        # Auswahl, Glow, Hervorhebung
  flow: "#b5abfc"          # aktive Fluss-Linien
  inactive: "#75798c"      # nicht gewählte Pfade
  bar: "#b5abfc"           # Verbraucher-Balken
  background: theme        # theme oder Hex
  text: theme
  thresholds:              # optional: Farbe von Linien und Balken nach Leistung (W)
    - { from: 0, color: "#4caf50" }
    - { from: 500, color: "#ff9800" }
    - { from: 2000, color: "#f44336" }   # optional je Eintrag: width (px, 0,5 bis 12)
  level_thresholds:        # optional: eigene Schwellwerte je Ebene (source, floor, room, consumer)
    floor:
      - { from: 0, color: "#4caf50", width: 2 }
      - { from: 1500, color: "#ff9800", width: 3.5 }
options:
  unit: W                  # W | kW | auto
  decimals: 2
  animation: true
  show_unassigned: true
  show_self_consumption: true # Badge „Eigenverbrauch“, wenn berechenbar
  show_consumers: true        # false: Verbraucher-Liste ausblenden
  only_active_consumers: false # true: nur Verbraucher ab 1 W listen
  show_entity_ids: true       # false: die Entity-ID unter dem Namen eines Verbrauchers in der Liste ausblenden (Warnungen bleiben)
  remember_selection: true
  storage_id: ""              # optional, trennt Karten mit gleicher Struktur (z. B. Leistung und Energie)
  mode: power                 # power | energy (Startansicht, Energie-Modus siehe Abschnitt 15)
  energy_periods: [today, week, month]   # optional, Zeiträume des Schalters (Standard alle)
  secondary_value: none       # none | auto | today | power: kleiner Zweitwert unter jedem Wert (Abschnitt 6)
  view: tree                  # tree | sankey | timeline: Startansicht des Diagramms (Verlauf braucht einen Energiesensor)
  views: [tree, sankey, timeline]  # optional, Ansichten im Schalter; ohne nur `view` und kein Schalter; muss `view` enthalten
  compact: false              # true: kompakte Ansicht (Abschnitt 6): nur Quellen, Haus und Etagen, keine Liste
  show_base_load: false       # true: Badge „Grundlast“ im Kopf (braucht die Statistik des Leistungssensors, Abschnitt 5)
  standby_watts: 5            # optional: Verbraucher, die 24 h lang nie darunter fielen, bekommen das Symbol „läuft dauerhaft“
  price: 0.32                 # optional, fester Strompreis pro kWh (schaltet die Kosten ein; braucht einen Energiezähler am Netz)
  price_entity: sensor.strompreis  # optional statt `price`: Preissensor (dynamischer Tarif, als Statistik erfasst)
  feed_in_price: 0.08         # optional, feste Einspeisevergütung pro kWh (oder `feed_in_price_entity`)
  currency: EUR               # optional, Standard: Währung von Home Assistant
```

**Regeln**

- **Etagen und Räume kommen aus Home Assistant** (Ausnahme: eigene Räume und Etagen, nächster Punkt). Die Config speichert nur `floor_id` und `area_id`. Name und Icon werden zur Laufzeit aus der Floor- bzw. Area-Registry gelesen: bevorzugt aus `hass.areas` und `hass.floors`, wenn beide vorhanden sind (so erscheinen Umbenennungen ohne Reload). Fehlen sie (ältere HA-Frontends), lädt die Card per WebSocket (`config/floor_registry/list`, `config/area_registry/list`); nach einem Fehler wird frühestens nach 30 s erneut versucht. Freie Namen sind nicht möglich; ein Eintrag ohne ID ist ein Validierungsfehler. Ist eine ID in HA nicht mehr vorhanden, zeigt die Card die ID.
- **Eigene Räume und Etagen:** Eine `area_id` oder `floor_id`, die es in der Registry nicht gibt (Beispiel `custom_1`), ist ein eigener Raum bzw. eine eigene Etage, z. B. für eine Inselanlage. Sie zeigen den `name` und das `icon` aus der Config statt der Registry-Werte (`resolveNames`: Registry-Name vor `name` vor ID, also gewinnt immer die Registry, wenn es den Eintrag gibt). Die Validierung prüft nur, dass die ID ein nicht leerer Text ist. Im Editor legen *+ Eigener Raum* und *+ Eigene Etage* sie mit erzeugter ID an. Ein gelöschter HA-Bereich verhält sich wie ein eigener Raum.
- **Verbraucher direkt unter Zuhause:** `consumers` auf oberster Ebene gilt neben `floors` und `rooms` (kein Entweder-oder) und nimmt dieselben Felder wie ein Verbraucher im Raum, dazu `icon`. Der Eintrag ist ein Knoten unter dem Zuhause (Abschnitt 6), kein virtueller Raum. Die Sensoren zählen für die Regel „ein Sensor, ein Platz“ mit.
- Ein Sensor kann nur einem einzigen Platz zugewiesen werden: einem Verbraucher oder dem Zähler einer Etage bzw. eines Raums (Validierungsfehler in YAML). Der Editor blendet bereits vergebene Sensoren in der Auswahl aus (`exclude_entities`) und lehnt eine doppelte Eingabe ab.
- Etagen und Räume können einen eigenen Zähler haben (`entity` für die Leistung, `energy_entity` für den Energie-Modus, beide optional). Mit Zähler zeigt der Knoten den gemessenen Wert, sonst die Summe seiner Kinder (Abschnitt 5). Ein Raum mit Zähler darf ganz ohne Verbraucher auskommen.
- Jede Etage und jeder Bereich kann nur einmal vorkommen. Unter einer Etage sind nur Bereiche wählbar, die in HA dieser Etage zugeordnet sind.

- Es gibt entweder `floors` oder `rooms` auf oberster Ebene. Sind beide gesetzt, gibt es einen Validierungsfehler.
- Räume sind nie leer: Ein Raum ohne Verbraucher und ohne Zähler wird mit einem Hinweis angezeigt, aber mit 0 gerechnet.
- Anzahl von Quellen, Etagen, Räumen und Verbrauchern ist nicht begrenzt.
- Die gesamte Config wird beim Laden geprüft (`validateConfig`) und meldet Fehler mit Pfad, z. B. `options.decimals`. `options.decimals` ist eine ganze Zahl von 0 bis 20, `options.unit` ist `auto`, `W` oder `kW`, Schalter sind Booleans. Jedes Farbfeld ist genau eine CSS-Farbe (Hex, `rgb()`/`hsl()`, benannte Farbe, `var(--…)` oder `theme`); alles andere ist ein Validierungsfehler, damit keine zusätzlichen CSS-Deklarationen eingeschleust werden können.
- Schaltet man im Editor Etagen ein, werden Räume ohne Etage ausgeblendet (mit Hinweis); schaltet man Etagen wieder aus, werden sie wiederhergestellt. Der Schalter ist gesperrt, solange die Registry nicht geladen ist.

---

### Heatmap-Karte (`custom:detailed-energy-heatmap-card`)

```yaml
type: custom:detailed-energy-heatmap-card
entity: sensor.haus_energie   # Energiezähler des Hauses (kWh), Pflicht
days: 14                      # 7 bis 28, Standard 7
title: Wann wird Strom verbraucht?
price: 0.32                   # optional, fester Preis pro kWh (oder `price_entity`: Preissensor, Stundenmittel)
currency: EUR                 # optional
```

Eigener Kartentyp im selben Bundle (`src/heatmap-card.ts`, eigener Editor `editor/heatmap-editor.ts`), Prüfung in `validateHeatmapConfig` (`model/heatmap.ts`). Zeilen = Tage (der jüngste unten, Mitternacht in der Zeitzone von Home Assistant), Spalten = Ortsstunden; Farbe = Anteil der größten Stunde an `--_accent`. Stunden ohne Statistikzeile sind „fehlend“ (schraffiert, nie 0), Stunden ab der laufenden „Zukunft“ (gestrichelt). Zeitumstellung: die ausfallende Stunde bleibt fehlend, die doppelte Stunde wird addiert. Kennzahlen: Grundlast (`baseLoad` aus `model/standby.ts` auf den Stundenwerten des Zählers), Summe der Tage und die teuerste Stunde (Verbrauch × Preis dieser Stunde, `costliestHour`; ohne Preis die Spitzenstunde). Daten: rollendes Fenster `days × 24 + 25` Stunden im `EnergyStore`, stündliche Zeilen.

---

## 4. Erlaubte Entitäten

Nur **Sensoren** sind zulässig. Die Validierung erfolgt im Editor und zur Laufzeit.

- Domain `sensor.*`
- `device_class: power`, Einheit `W`, `kW` oder `MW`
- `device_class: energy` (`Wh`/`kWh`/`MWh`) als `energy_entity` für den Energie-Modus (Abschnitt 15)
- Dieselben Regeln gelten für die Zähler von Etagen und Räumen: `entity` ist ein Leistungssensor, `energy_entity` ein Energiezähler. Ebenso für `consumers` auf oberster Ebene (Verbraucher direkt unter Zuhause).
- Ein Verbraucher braucht `entity`, `energy_entity` oder beide. Ohne beide ist es kein Konfigurationsfehler (der Editor legt neue Verbraucher leer an): die Karte zeigt ihn mit Warnsymbol, „Kein Sensor konfiguriert“ und ohne Wert, mit einem eigenen Schlüssel `nosensor:<Ort>` statt der Entität (`ConsumerNode.noSensor`). Nur mit Zähler zeigt er im Modus *Jetzt* „Kein Leistungssensor konfiguriert“ (ausgegraut, 0 W, kein Warnsymbol; mit `only_active_consumers` ausgeblendet), im Energiemodus zählt er. Schlüssel für Auswahl, Duplikatprüfung und Verlauf ist `entity ?? energy_entity`.
- `energy_entity_return` einer Quelle (Gegenrichtung) ist wie `energy_entity` ein Energiezähler; bei Quellen vom Typ `solar` ist er ein Validierungsfehler.

Nicht passende Entitäten werden im Editor ausgefiltert. Kommen sie per YAML trotzdem in die Konfiguration, zeigt die Card eine Warnung am Knoten statt abzustürzen. Eine unbekannte Einheit (z. B. `kWh`, `V`) wird nie als Watt gezählt, sondern gilt als ungültig; der SoC-Sensor einer Batterie wird getrennt gelesen und muss `%` liefern (Wert auf 0…100 begrenzt).

Alle Werte werden intern in **Watt** umgerechnet.

---

## 5. Berechnung

```
Verbraucher  = Sensorwert (W)
Raum         = eigener Zähler   falls gesetzt und lesbar
             = Σ Verbraucher    sonst
Etage        = eigener Zähler   falls gesetzt und lesbar
             = Σ Räume          sonst
Zuhause      = total_entity     falls gesetzt
             = Σ Etagen bzw. Räume + Σ Verbraucher unter Zuhause   sonst
Nicht erfasst (Haus)   = max(0, total_entity − Σ Etagen bzw. Räume − Σ Verbraucher unter Zuhause)
Nicht erfasst im Raum  = max(0, Raumzähler − Σ Verbraucher)
Nicht erfasst der Etage = max(0, Etagenzähler − Σ Räume)
```

**Zähler von Etagen und Räumen**

- Im Leistungsmodus gilt `entity`, im Energie-Modus `energy_entity`. Fehlt der Zähler des gezeigten Modus, rechnet der Knoten mit der Summe seiner Kinder.
- Ist ein Zähler nicht lesbar, zeigt der Knoten die Summe seiner Kinder und ein Warnsymbol („Zähler nicht verfügbar, angezeigt wird die Summe“).
- Messen die Kinder mehr als der Zähler (mehr als 5 % über dem Zählerwert **und** mindestens 10 W bzw. 50 Wh), bekommt der Knoten ein Warnsymbol, und die Liste zeigt statt „Nicht erfasst“ die Zeile „Verbraucher messen … mehr als der Zähler“ (bei einer Etage „Räume messen …“). „Nicht erfasst“ ist dann 0. Kleinere Abweichungen gelten als Messrauschen.
- Das Haus zählt die Etagen bzw. Räume mit ihrem gezeigten Wert, also gemessen oder als Summe; nichts wird doppelt gezählt.

**Quellen und Vorzeichen**

| Typ | positiv | negativ |
|---|---|---|
| solar | Erzeugung | – (auf 0 kappen) |
| battery | Entladen (Quelle) | Laden (wird als Verbraucher gezeigt, Pfeil umgekehrt) |
| grid | Bezug (Quelle) | Einspeisung (Pfeil vom Haus zum Netz) |

Mit `invert: true` wird das Vorzeichen eines Sensors gedreht.

**Kennzahlen**

- Anteil einer Quelle = Quelle / Σ positive Quellen
- Autarkie = 1 − Netzbezug / Zuhause, begrenzt auf 0…100 %. Das Badge erscheint nur, wenn mindestens eine Quelle vom Typ `grid` konfiguriert ist, alle Netz-Sensoren lesbar sind und das Zuhause Leistung verbraucht; ohne gemessenes Netz wäre der Wert immer 100 % und wird deshalb weggelassen.
- Eigenverbrauch = (PV − Einspeisung) / PV, begrenzt auf 0…100 %: der Teil der PV-Erzeugung, der nicht ins Netz ging. Im Leistungsmodus ist die Einspeisung die negative Netzleistung (alle Netz-Sensoren lesbar), im Energie-Modus der Rücklauf-Zähler `energy_entity_return` jeder Netz-Quelle. Ein zweites Badge „Eigenverbrauch“ erscheint neben der Autarkie, nur wenn der Wert berechenbar ist: mindestens eine PV-Quelle mit Erzeugung und eine bekannte Einspeisung. Sonst kein Badge, nie „0 %“. Abschaltbar mit `options.show_self_consumption: false`. Auf schmalen Karten brechen die Badges in eine zweite Zeile um.

**Kosten** (`options.price` oder `options.price_entity`, braucht einen Energiezähler am Netz; `src/model/costs.ts`)

- Nur Strom aus dem Netz kostet Geld, PV- und Batteriestrom kosten 0. Jede Stunde hat einen Netzanteil `netz_h = min(1, Netzbezug_h / Hausverbrauch_h)`; jeder Knoten zahlt `Σ_h kWh_Knoten,h × netz_h × Preis_h`. Hausverbrauch je Stunde: `home.total_energy_entity`, sonst die Summe der Etagen bzw. Räume.
- Preis je Stunde: fester Preis, oder der Stundenmittelwert des Preissensors aus der Statistik (`types: ["mean"]`). Stunden ohne Wert nehmen den letzten bekannten Preis; fehlt er länger als 3 Stunden am Stück, ist der Betrag „≈“. Viertelstundenpreise werden als Stundenmittel genommen.
- Netzkosten = gesamter Netzbezug × Preis. Was in einer Stunde über den Hausverbrauch hinaus bezogen wurde, hat die Batterie geladen („davon Batterie laden“ im Tooltip); der Rest verteilt sich auf die Knoten, Zuhause = Summe der Räume plus „Nicht erfasst“.
- Vergütung = Rücklauf des Netzes (`energy_entity_return`) × Einspeisepreis, getrennt, nicht in den Knotenkosten.
- Hält Home Assistant die Kostenstatistiken des Energie-Dashboards (`<Netzzähler>_cost`, `<Einspeisezähler>_compensation`, angelegt, wenn dort ein Preis eingetragen ist), nimmt das Badge diese Beträge; sie rechnen mit dem Preis zum Zeitpunkt jeder Zählerstandsänderung. Weichen sie von der Stundenrechnung ab, sagt der Tooltip das.

**Grundlast und Dauerlast (`model/standby.ts`)**

- Grundlast: Stundenmittel (`types: ["mean"]`, `period: "hour"`) der letzten 7 Tage von `home.total_entity`, sonst aller Quellen (Netz und Batterie mit Vorzeichen, `invert` dreht um, Solar und generic nie unter 0; fehlt einer Quelle eine Stunde, entfällt diese Stunde). Davon der niedrigste Wert der Stunden, die um 1, 2, 3 oder 4 Uhr Ortszeit beginnen. Ohne solche Stunde kein Badge, kein „0 W“.
- Dauerlast: Stundenmittel des Leistungssensors jedes Verbrauchers der letzten 24 Stunden; fiel kein Wert unter `options.standby_watts`, bekommt er das Symbol. Weniger als 20 Stunden mit Wert reichen nicht für ein Urteil (neuer Sensor, Lücke): kein Symbol.
- Die Abfragen sind rollende Fenster im `EnergyStore` (`EnergyQuery.hours`), werden nur gestellt, wenn die Option an ist, und stündlich (`WINDOW_REFRESH_MS`) statt alle 5 Minuten erneuert. Beides gilt in beiden Modi.

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
- **Linienstärke:** `1 + kW · 0.7`, bei erreichten Schwellwert-Stufen zusätzlich 0,75 je Stufe (höchstens 3).
- **Animationsdauer:** logarithmisch in der Leistung, von 3,2 s (bis 10 W) bis 0,35 s (ab 5 kW). Je mehr ein Knoten zieht, desto schneller bewegen sich seine Linien; der Unterschied zwischen 100 W und 1 kW ist so gut sichtbar wie der zwischen 1 kW und 10 kW. Ohne Leistung (< 1 W) gibt es keine Animation.
- **Ohne Verbrauch:** Verbraucher unter 1 W erscheinen ausgegraut in der Liste (gedämpfte Textfarbe und hellerer Balken statt Deckkraft, damit der Text lesbar bleibt), Räume und Etagen ohne Verbrauch abgeblendet im Diagramm.
- **Schwellwerte:** Ab dem jeweils erreichten `from`-Wert (W) bekommen Linien des gewählten Pfads und die Balken der Liste die zugehörige Farbe; unterhalb des ersten Wertes gilt die normale Farbe. Zusätzlich zeigen höhere Stufen dickere Linien und höhere Balken (+1 px je Stufe), damit die Stufen nicht nur an der Farbe hängen. Setzt eine Stufe `width` (px), ersetzt dieser Wert die berechnete Linienstärke (bei Balken die Höhe). Je Ebene (`source`, `floor`, `room`, `consumer`) sind eigene Listen unter `colors.level_thresholds` möglich; fehlt eine, gilt `colors.thresholds`. Eine Linie gehört zur Ebene ihres Ziels. Quellen, Etagen, Räume und Verbraucher können außerdem eine eigene `thresholds`-Liste haben, die für dieses Element die Liste der Ebene ersetzt (Rangfolge: Element, Ebene, `colors.thresholds`).
- **Hervorhebung:** Die gewählte Etage und der gewählte Raum bekommen Akzentfarbe und Glow. Die übrigen Linien sind gedämpft.
- **Eigener Zähler:** Eine Etage oder ein Raum mit eigenem Zähler bekommt ein kleines Zählersymbol (an der Etage nach dem Wert, am Raum oben rechts am Kreis), bei einem nicht lesbaren Zähler oder wenn die Kinder deutlich mehr messen ein Warnsymbol in der Warnfarbe. Der Tooltip des Symbols nennt den Grund.
- **Zweitwert (`options.secondary_value`, Standard `none`):** Unter dem Wert jeder Quelle, jeder Etage (zweite Zeile in der Pille) und jedes Raums steht klein ein zweiter Wert, beim Zuhause rechts neben dem Kreis; die Verbraucherliste bekommt eine vierte Spalte. `today`: im Modus *Jetzt* „heute 12,4 kWh“. `power`: im Energie-Modus „jetzt 3,2 kW“. `auto`: jeweils der andere Wert zum Modus, also beides. Im jeweils anderen Modus zeigen `today` und `power` nichts. Quellen, Etagen und Räume bekommen dafür eine Zeile (20 px) mehr. Ein Knoten ohne Wert (kein Sensor, bei Etage und Raum auch kein Zähler und kein Kind mit Wert) lässt die Zeile leer, nie „0 kWh“. Den Tageswert lädt die Card im Modus *Jetzt* im Hintergrund (Abschnitt 15). Ohne Energiesensor gibt es keinen Tageswert und keine zusätzliche Zeile.
- **Kosten:** drittes Badge „Kosten 3,84 €“, mit Vergütung „Kosten 3,84 € · Vergütung 1,20 €“, im Energie-Modus für den gezeigten Zeitraum, im Modus *Jetzt* für heute; Tooltip mit „davon Batterie laden …“, dem Hinweis bei „≈“ und einer Abweichung zur Kostenstatistik von Home Assistant. `secondary_value: cost` zeigt die Kosten jedes Knotens als Zweitwert (gleicher Zeitraum), der Tooltip dieser Zeile „2,1 kWh, davon 0,6 kWh aus dem Netz, 0,18 €“. Ohne Energiesensor kein Wert, nie „0,00 €“.
- **„Nicht erfasst“ in der Liste:** genau eine Zeile, passend zur Auswahl. Raum gewählt: „Nicht erfasst in <Raum>“, nur mit Raumzähler. Etage mit allen Räumen: „Nicht erfasst in <Etage>“ = Etagenwert minus alle Verbraucher der Etage, nur wenn die Etage oder einer ihrer Räume einen Zähler hat. Zuhause (alle Etagen bzw. alle Räume): „Nicht erfasst“ = Hauswert minus alle Verbraucher. Ohne Zähler erscheint die Zeile nur in der Ansicht des Hauses. Alle Zeilen folgen `options.show_unassigned`.
- **Auswahl in die Mitte (`options.focus_selected`, Standard aus):** Die Karte startet mit allen Etagen sichtbar und ohne Raumzeile (ohne die Option ist die größte Etage vorgewählt), damit die erste Ebene immer vollständig zu sehen ist. Wählt man eine Etage, gleiten alle Etagen mittig unter das Zuhause, nur die gewählte bleibt sichtbar, die übrigen blenden dahinter aus. Ihre Räume verteilen sich wie bisher, jetzt um die neue Mitte. Bei einem gewählten Raum gilt dasselbe eine Ebene tiefer. Ein Klick auf ein Element zeigt immer dessen Kinder: Das Zuhause zeigt alle Etagen, eine Etage (auch die gewählte) alle ihre Räume. Ausgeblendete Elemente sind nicht anklickbar und nicht per Tastatur erreichbar. Bei reduzierter Bewegung (`prefers-reduced-motion`) wird nur ein- und ausgeblendet, nichts gleitet. Die Bewegung dauert 380 ms.
- **Viele Räume:** Ab 7 Räumen in einer Ebene wird die Raumzeile horizontal scrollbar, mit fester Spaltenbreite von 64 px. Alternativ lässt sich per Option auf zwei Reihen umbrechen; das geschieht nur bei mehr als 6 Räumen und nur, wenn eine Reihe zu schmal wäre (unter 80 px je Raum). Auf einer breiten Karte bleiben alle Räume in einer Reihe. Namen werden an der Spaltenbreite mit einer Ellipse gekürzt, schmale Spalten (unter 90 px) nutzen eine kleinere Schrift.
- **Verbraucher direkt unter Zuhause (`consumers`):** Knoten wie die Etagen und Räume, aber nicht wählbar. Mit Etagen stehen sie als gestrichelte Pillen in der Etagenreihe hinter den Etagen (`floorXs` hat dann `Etagen + Verbraucher` Plätze, `directXs`/`directYs` die der Verbraucher), ohne Etagen als Kreise mit Icon (Standard `mdi:flash`) in der Raumreihe hinter den Räumen. Die Linie läuft vom Zuhause zum Knoten und hat die Ebene „consumer“ der Schwellwerte; sie ist nur aktiv, wenn nichts gewählt ist (alle Etagen bzw. alle Räume). Jeder Knoten braucht mindestens `DIRECT_SLOT_W` = 96 px Breite, sonst wird die Karte breiter und scrollt waagerecht wie bei vielen Räumen; zu lange Namen bekommen eine Ellipsis. Mit `focus_selected` blenden sie hinter einer gewählten Etage (ohne Etagen: gewähltem Raum) aus (`focusTargets`, Feld `direct`). Die Liste des ganzen Zuhauses enthält sie, die Liste einer gewählten Etage nicht; Sankey (erste Spalte) und Verlauf (Stapel des Zuhauses) zeigen sie auch.
- **Etagen-Pillen bei wenig Platz:** Passen die Etagen (und die Verbraucher unter Zuhause) nicht nebeneinander, steht der Wert unter dem Namen wie in der kompakten Ansicht und die Zeilen darunter rücken um 12 px nach unten. Entscheidung in `floorsStacked(width, names)`: geschätzte Pillenbreite `104 + 6,5 · längster Name` gegen die Breite je Platz (eine Schätzung, keine Messung).
- **Responsive:** Die SVG-Breite folgt der Kartenbreite (`ResizeObserver`). Knoten werden absolut über dem SVG positioniert.
- **Barrierefreiheit:** `prefers-reduced-motion` schaltet die Animation ab. Knoten sind `<button>` mit `aria-pressed` und `title`. Die Liste ist tastaturbedienbar. Icon-Buttons, Farbfelder und Farbwähler im Editor haben ein `aria-label`. Lighthouse (Barrierefreiheit) liegt in der Dev-Vorschau bei 100.

---

## 7. Interaktion

| Aktion | Ergebnis |
|---|---|
| Klick auf Etage | Räume dieser Etage einblenden, alle Räume sind ausgewählt. Erneuter Klick wählt alle Etagen. |
| Klick auf Raum | Die Liste zeigt die Verbraucher des Raums, absteigend nach Leistung. |
| Klick auf Verbraucher | Öffnet den HA-More-Info-Dialog (`hass-more-info`). |
| Klick auf Quelle | Öffnet ebenfalls den More-Info-Dialog. |
| Klick auf einen Verbraucher unter Zuhause (Baum) | Öffnet den More-Info-Dialog oder führt seine Aktionen aus; es wird nichts gewählt. |
| `tap_action`, `hold_action`, `double_tap_action` | An Quellen, Etagen, Räumen und Verbrauchern (Baum und Liste, nicht im Sankey): Aktionen des HA-Standards `more-info`, `toggle`, `navigate`, `url`, `perform-action` / `call-service`, `none`, mit `confirmation`. Ohne `tap_action` bleibt der Klick wie in den Zeilen darüber; `hold_action` und `double_tap_action` sind standardmäßig leer. Halten = 500 ms, Doppeltipp = zweiter Klick innerhalb von 250 ms (mit Doppeltipp-Aktion wartet der einfache Tipp so lange). `entity` der Aktion, sonst der Sensor des Elements (Verbraucher mit Schalter: der Schalter). |
| Kippschalter am Zeilenende eines Verbrauchers (`switch_entity`) | `homeassistant.turn_on` / `turn_off`, ohne den More-Info-Dialog der Zeile zu öffnen; mit `confirm_switch` fragt die Karte vor dem Ausschalten (Dialog des Browsers). Nicht verfügbar → ausgegraut. |
| Pfeile ‹ › (Energiemodus, neben den Zeiträumen) | Blättern um einen Zeitraum zurück bzw. vor; › endet beim laufenden Zeitraum. Der Kopf nennt den Zeitraum („Gestern“, „Mo 19.10.“, „KW 43“, „September“). Nicht gemerkt; Wechsel von Zeitraum oder Modus setzt zurück. |
| Ansichts-Schalter (Icons rechts neben *Jetzt \| Heute \| Woche \| Monat*) | Wechselt zwischen Baum, Sankey und Verlauf, nur mit `options.views` (mindestens zwei). |
| Sankey: Klick auf eine Etage | Zeigt nur die Räume dieser Etage; ein zweiter Klick zeigt die Räume aller Etagen. Pfad und Verbraucherliste folgen wie im Baum. |
| Sankey: Klick auf einen Raum | Zeigt dessen Verbraucher als letzte Spalte; ein zweiter Klick blendet sie aus. |
| Sankey: Klick auf eine Quelle oder einen Verbraucher | Öffnet den More-Info-Dialog. „Nicht erfasst“, Einspeisung und Batterie laden sind nicht klickbar. |
| Verlauf: Klick auf einen Legenden-Eintrag | Wählt diese Etage bzw. diesen Raum; die Balken zeigen dann eine Ebene tiefer (Räume, Verbraucher). Bei Verbrauchern öffnet der Klick den More-Info-Dialog. |
| Verlauf: Klick auf den Pfad („Zuhause › EG“) | Geht zurück zum Zuhause bzw. zur Etage. |

- Oben in der Card steht der Pfad, z. B. „Zuhause › EG › Küche“.
- Die Auswahl wird pro Card in `localStorage` gespeichert (Option `remember_selection`), als `floor_id` / `area_id`. Der Schlüssel entsteht nur aus den Struktur-IDs (im Klartext, ohne Hash) und der optionalen `options.storage_id`, die Karten mit gleicher Struktur trennt; Farben, Namen, Verbraucher und Umbenennungen in Home Assistant setzen sie nicht zurück. Ein beschädigter Wert wird ignoriert, Einträge älterer Formate (Auswahl nach Namen, gehashter Schlüssel) werden einmal pro Seitenladung entfernt.

---

## 8. Architektur

```
src/
  detailed-energy-card.ts   // Custom Element, hass-Setter, Auswahl, Modus und Ansicht, Energie-Store, Kopf, Schalter, Verbraucherliste
  register.ts               // customElements.define, customCards und Konsolenzeile nur einmal
  env.d.ts                  // __VERSION__ (Version aus package.json, per Vite-define)
  editor/
    card-editor.ts            // visueller Editor (Listen, Baum, Drag-and-drop)
    schema.ts                 // Feldschema je Konfigurationsschlüssel (Abnahmetest)
    validation.ts             // Live-Prüfung: Sensoren, Farben, Summenkonflikt
    config-utils.ts           // reine Funktionen: Etagen ein/aus, Verschieben, Duplikate
    hass-change.ts            // welche hass-Änderungen den Editor neu rendern
    import/collect.ts         // Assistent: energy/get_prefs und Registries lesen (defensiv)
    import/propose.ts         // Assistent: Vorschlag als Baum mit Auswahlzustand
    import/apply.ts           // Assistent: Auswahl → Quellen/Etagen/Räume, Ersetzen und Ergänzen
    import/wizard.ts          // Assistent: das Overlay (Lit-Element)
  model/
    config.ts                 // Typen + Validierung (validateConfig, Pfad-Fehlermeldungen)
    colors.ts                 // isValidColor: genau eine CSS-Farbe
    compute.ts                // Summen, Vorzeichen, Autarkie
    units.ts                  // W/kW/MW-Normalisierung, Formatierung (Format-Cache), SoC in %
    readers.ts                // powerReader / socReader über die hass-States
    thresholds.ts             // Schwellwerte: Farbe, Stufe, Idle-Grenze
    selection.ts              // gemerkte Auswahl: Key aus Struktur-IDs, typgeprüftes Laden
    registry.ts               // Floors/Areas aus hass, WebSocket-Fallback mit Backoff
    stub-config.ts            // Startkonfiguration für den Karten-Picker
    energy.ts                 // Zeiträume (periodRange mit offset), Statistik-Abfrage als Stunden-/Tageszeilen (loadEnergySeries), Summen
    browse.ts                 // Beschriftung des geblätterten Zeitraums (periodLabel, isoWeek)
    actions.ts                // Aktionen: Typen, Prüfung (actionError), Ausführung (runAction mit eingereichten Abhängigkeiten)
    timeline.ts               // Balken (Stunden/Tage), Werte je Etage/Raum/Verbraucher (treeSeries), Vergleich mit der Vorperiode
    heatmap.ts                // Config der Heatmap-Karte, Raster (heatmapGrid), Spitzen-/teuerste Stunde
    standby.ts                // Grundlast (baseLoad, homePowerRows) und Dauerlast (runsContinuously)
    sankey.ts                 // buildSankey: Knoten und Bänder aus dem Modell und der Auswahl (reine Funktion)
    costs.ts                  // Stundenpreise (hourlyPrices), Kosten je Knoten über den Netzanteil (computeCosts)
    energy-store.ts           // EnergyStore: lädt die gezeigten Abfragen, merkt sie 5 Minuten, Token gegen veraltete Antworten, Pause bei unsichtbarer Card
  view/
    layout.ts                 // Geometrie: Positionen, Kurven, Linienstärke, Animationsdauer, Verbraucher unter Zuhause (direct), floorsStacked
    focus.ts                  // Zielpositionen und Gleiten bei focus_selected
    gesture.ts                // Gesture: Tipp, Halten (500 ms) und Doppeltipp (250 ms) eines Elements
    tree.ts                   // TreeView: das Baum-Diagramm (Quellen, Haus, Etagen, Räume, Verbraucher unter Zuhause, Linien) samt Gleiten
    views.ts                  // Ansichten (tree, sankey, timeline), welche angeboten werden, gemerkter Modus/Zeitraum/Ansicht
    timeline.ts               // renderTimeline: gestapelte Balken, Vorperiode gestrichelt, Kennzahlen, Legende
    sankey-layout.ts          // layoutSankey: reine Layout-Funktion (Spalten, Skala, Bänder), bandPath
    sankey.ts                 // SankeyView: Zeichnung, Beschriftung, Gleiten der Bänder
  heatmap-card.ts           // zweite Karte `detailed-energy-heatmap-card`, im selben Bundle
  editor/heatmap-editor.ts  // Editor der Heatmap-Karte (Felder `HEATMAP` in schema.ts)
  styles/theme.ts           // CSS-Variablen und Styles
  localize/index.ts         // Texte der Card (DE/EN), Standardnamen der Quellen
  localize/editor.ts        // Texte des Editors (DE/EN, typisierte Schlüssel)
```

**Ansichten**

- Die Card zeichnet ihr Diagramm über eine Ansicht: den Baum (`TreeView` in `view/tree.ts`), das Sankey-Diagramm (`SankeyView` in `view/sankey.ts`, Graph aus `model/sankey.ts`) oder den Verlauf (`renderTimeline` in `view/timeline.ts`, Daten aus `model/timeline.ts`). Die Card behält Konfiguration, Modus, Auswahl, Energie-Store, Kopfzeile und Verbraucherliste und gibt der Ansicht pro Frame einen `TreeContext` bzw. `SankeyContext`. `prepare()` läuft in `willUpdate()`, `render()` liest nur.
- Der Ansichts-Schalter (Icon-Gruppe rechts neben *Jetzt | Heute | Woche | Monat*) erscheint erst, wenn mindestens zwei Ansichten angeboten werden; mit nur dem Baum bleibt die Card unverändert. Die gewählte Ansicht wird zusammen mit Modus und Zeitraum gemerkt (`remember_selection`, Schlüssel `…:mode`). Angeboten werden `options.views` (feste Reihenfolge), ohne diese Option nur `options.view`; der Verlauf nur mit Energiesensor, sonst bleibt der Baum; das Sankey-Diagramm braucht keinen (es zeigt im Modus *Jetzt* die Leistung).

**Kompakte Ansicht (`options.compact`)**

- Zeichnet nur Quellen, Haus und Etagen (ohne Etagen die Räume); Kreise 40 statt 56 px (`.compact`: 38 px plus Rand, Haus 48 px), Etagen-Pillen mit dem Wert unter dem Namen, Zeilenhöhen aus `COMPACT` in `view/layout.ts` (`computeLayout({ compact })`, neues Feld `homeH`). Zweitwert und Rücklaufzeile funktionieren weiter (je eine Zeile mehr).
- Keine Verbraucherliste, kein Ansichts-Schalter (die Karte zeichnet den Baum, auch wenn `view` / `views` etwas anderes sagen), keine Auswahl (`_resolve` liefert alle Etagen und keine Raumzeile, `focus_selected` wird ignoriert); der Zeitraum-Schalter und die Badges bleiben.
- Klick auf einen Knoten öffnet den More-Info-Dialog seines Sensors: Quelle den Leistungssensor, Etage und Raum den eigenen Zähler (`meterEntity`, Leistung vor Energie), ohne Zähler passiert nichts; das Haus ist nicht klickbar. Eigene Aktionen (P15) ersetzen den Tipp wie sonst.
- `getCardSize()` 4 statt 8, `getGridOptions()` mit `min_columns: 4` statt 6.

**Aktionen und Schalter**

- Das Konzept sah das Event `hass-action` vor; es gibt im Home-Assistant-Frontend keines (`handle-action.ts` führt die Aktionen selbst aus). Die Karte führt sie deshalb selbst aus (`model/actions.ts`, `runAction`): `more-info` über `hass-more-info`, `toggle` und `perform-action` über `hass.callService`, `navigate` über `history.pushState` und das Fenster-Event `location-changed`, `url` nur für http(s) und Pfade (nie `javascript:`), `confirmation` über `window.confirm`. Abweichung, beschlossen am 2026-10-27.
- `Gesture` (`view/gesture.ts`) unterscheidet Tipp, Halten und Doppeltipp je Element; die Karte hält eine Gesture je Schlüssel (`nodeKey`), die Optionen werden bei jedem Rendern ersetzt. Ohne Halten- und Doppeltipp-Aktion läuft der Tipp sofort.
- Die Aktionen stehen im Modell (`NodeActions` an Quelle, Etage, Raum, Verbraucher), der Baum und die Liste binden sie über `TreeContext.bind`. Der Schalter eines Verbrauchers liegt als `<span role="switch">` in der Zeile (ein Knopf im Knopf wäre ungültig), die Spalte kommt nur, wenn ein Verbraucher der Liste einen Schalter hat. Der Zustand des Schalters gehört zu den beobachteten Entitäten der Karte (`collectEntityIds`).
- Editor: die drei Aktionen mit dem Selektor `ui_action` von Home Assistant (der Dev-Editor zeichnet nur die Auswahl der Aktion), `switch_entity` mit Auswahl der Domains, `confirm_switch` sichtbar mit Schalter.

**Blättern**

- Zustand `_offset` (0 = laufender Zeitraum, −1 = der davor …) nur im Energiemodus (`_off`); alle Abfragen (Werte, Kosten, Verlauf) tragen den Offset (`EnergyQuery.offset`), der `EnergyStore` hält sie getrennt. Ein vergangener Zeitraum ist vollständig (`periodRange` mit negativem Offset), Kosten rechnen bis zu seinem Ende.
- Der Verlauf vergleicht einen beendeten Zeitraum ganz mit dem ganzen davor (`compareWithPrevious` mit `whole`), ohne „jetzt“-Linie und ohne Abfrage des Vergleichstags.
- Die Wochennummer ist die ISO-Woche des mittleren Tages der Woche (`isoWeek`).

**Sankey (`view: sankey`)**

- Spalten: Quellen → Etagen (ohne Etagen: Räume) und „Nicht erfasst“ → Räume → Verbraucher des gewählten Raums. Die Bandbreite ist die Energie, im Modus *Jetzt* die Leistung; alle Spalten haben dieselbe Skala. Knoten ohne Wert fehlen.
- Auswahl wie im Baum (größte Etage zu Beginn): nur die Räume der gewählten Etage, ohne gewählte Etage die Räume aller Etagen. „Nicht erfasst in <Etage/Raum>“ erscheint wie in der Liste bei Etagen und Räumen mit Zähler; `options.show_unassigned` schaltet alle ab.
- Das Modell weiß nicht, welche Quelle welche Etage versorgt: jede Quelle versorgt jeden Knoten der ersten Spalte im Verhältnis, in dem sie das Haus versorgt. Der Tooltip dieser Knoten sagt es.
- Einspeisung und Batterie-Laden (Energiemodus: Gegenzähler, Leistung: negative Netz- bzw. Batterieleistung) sind eigene Knoten unterhalb der ersten Spalte. Ihre Bänder kommen zuerst von PV und `generic`-Quellen, dann von den übrigen, nie von der eigenen Art (das Netz speist sich nicht selbst ein).
- Beschriftung mit Kontur (lesbar über Bändern); Knoten unter 3 % der Höhe bekommen nur einen Tooltip, passt Name samt Wert nicht, steht nur der Name. Im Modus *Jetzt* gleiten Knoten und Bänder in 420 ms zu ihren neuen Plätzen (nicht mit `options.animation: false` oder `prefers-reduced-motion`).
- Reine Funktionen: `layoutSankey` (keine Bibliothek, das Bundle bleibt klein) und `buildSankey`, beide ohne DOM getestet.

**Verlauf (`view: timeline`)**

- Gestapelte Balken je Stunde (Heute, auch im Modus *Jetzt*) bzw. je Tag (Woche, Monat), Tage mit Zeitumstellung haben 23 bzw. 25 Balken. Gestapelt wird die Ebene unter der Auswahl: Zuhause nach Etagen (ohne Etagen nach Räumen), Etage nach Räumen, Raum nach Verbrauchern. Elemente ohne Energiesensor darunter fehlen im Stapel.
- Werte: eigener Zähler eines Elements, sonst die Summe seiner Kinder, pro Balken (`treeSeries`).
- Vorperiode (gestern, Vorwoche, Vormonat) als gestrichelter Umriss des gezeigten Elements, Balken nach Position ausgerichtet.
- Kopf: Verbrauch bis jetzt, Abweichung zur Vorperiode bis zur gleichen Zeit (Heute: gleiche volle Stunde; Woche/Monat: volle Tage bis gestern plus heute bis zur gleichen vollen Stunde am Vergleichstag, Vormonat: gleicher Tag oder dessen letzter Tag) und der größte Balken.
- Farben aus `color` der Etage bzw. des Raums, sonst Abstufungen der Akzentfarbe. Achse in kWh, Beschriftung alle 6 Stunden, bei Wochen die Wochentage, bei Monaten jeder siebte Tag. Eine Linie „jetzt“ markiert den laufenden Balken.
- Die Legende wählt aus, der Pfad im Kopf führt zurück (Abschnitt 7).

**Texte und Sprachen**

- Card und Editor holen ihre Texte über Schlüssel aus je einer deutschen und einer englischen Tabelle (`const de = {...}`, `const en: typeof de = {...}`). Fehlt eine Übersetzung oder ist ein Schlüssel vertippt, schlägt der Typecheck fehl.
- Im Editor sind Feld-, Farb- und Ebenen-Beschriftungen in `schema.ts` und `card-editor.ts` Schlüssel vom Typ `EditorKey`; `makeTr(sprache)` liefert die Texte, Platzhalter `{0}`, `{1}` werden ersetzt. Sprachen, die mit `de` beginnen, bekommen Deutsch, alle anderen Englisch.
- Ein neuer Editor-Text bekommt einen Schlüssel in beiden Tabellen von `src/localize/editor.ts`, nie einen deutschen Text direkt im Code: ein Test prüft, dass `src/editor/` keine Umlaute und „“ enthält.

**Performance**

- Beim Laden der Konfiguration wird die Liste aller referenzierten Entity-IDs gebildet. Der `hass`-Setter rendert nur neu, wenn sich einer dieser States, die Etagen/Bereiche, die Sprache oder der Standortname ändern.
- Namen aus der Registry werden einmal pro Konfiguration und Registry aufgelöst (`Map`), Schwellwerte einmal in `setConfig` sortiert, `Intl.NumberFormat` je Sprache und Nachkommastellen gecacht, der `ResizeObserver` einmal am Element angehängt.
- Der Editor rendert bei `hass`-Änderungen nur neu, wenn Sprache, Theme, Etagen/Bereiche oder ein Sensor der Konfiguration betroffen sind (`shouldUpdate`).
- Ein `IntersectionObserver` pausiert die Linienanimation, solange die Card nicht sichtbar ist (Klasse am Host, kein Neu-Rendern).
- Etagen und Bereiche kommen aus `hass.areas` / `hass.floors`, ohne Anfrage. Fehlen sie, wird einmal per WebSocket geladen, nach einem Fehler frühestens nach 30 s erneut.

**HA-Schnittstellen**

- `setConfig()`
- `set hass()`
- `getCardSize()`
- `getGridOptions()` für den Sections-View, Mindestbreite 6 Spalten
- `static getConfigElement()`
- `static getStubConfig()`, das automatisch passende Power-Sensoren, einen Bereich (auf seiner Etage) und einen Titel in der Sprache des Nutzers vorschlägt

---

## 9. Visueller Editor

**Grundsatz: Die gesamte Konfiguration ist im visuellen Editor möglich.** Jede Option aus Abschnitt 3 hat ein Bedienelement. Nutzer müssen nie auf YAML wechseln. YAML bleibt nur als optionale Alternative.

**Assistent „Aus Energie-Dashboard übernehmen“** (`src/editor/import/`): Schaltfläche oben im Editor, Overlay `detailed-energy-import-wizard` in drei Schritten.
- `collect.ts` liest die Antwort von `energy/get_prefs` defensiv (unbekannte Felder werden ignoriert, fehlende toleriert; neue Form des Netzes mit beiden Zählern in einem Eintrag und die alte mit `flow_from` / `flow_to`; Gas und Wasser entfallen; ein Eintrag, der im Energie-Dashboard als Netz-Quelle und als Gerät steht, wird nur als Gerät angeboten, sonst nähme die Quelle dem Gerät den Zähler weg; der Leistungssensor kommt aus `stat_rate` oder `power_config.stat_rate`). Leistungssensor einer Quelle oder eines Geräts: `stat_rate`, sonst der einzige Sensor mit `device_class: power` am selben Gerät, bei mehreren eine Auswahl, bei keinem bleibt ein Gerät ein Verbraucher nur mit Zähler und eine Quelle wartet auf die Wahl des Users (die Karte braucht für Quellen einen Leistungssensor). Bereich eines Geräts: der eigene Bereich der Entität, sonst der des Geräts; Etage über `hass.areas`.
- `propose.ts` baut den Baum (Etagen nach `level`, Räume nach Name) mit Auswahlzustand und den Operationen `setFloor`, `setRoom`, `setConsumer`, `moveConsumer`. Geräte mit `included_in_stat` stehen unter ihrem Elterngerät: liegt die ganze Familie in einem Raum, wird das Elterngerät der Raumzähler (P4), sonst bleibt es ein Gerät und die Teile sind standardmäßig aus (nichts doppelt gezählt). Geräte ohne Bereich stehen unter „Ohne Raum“ und sind aus, Bereiche ohne Etage unter „Ohne Etage“ (nur ohne Etagen anzeigbar), externe Statistiken (keine Entität dieser Installation) sind sichtbar, aber nicht wählbar.
- `apply.ts`: `buildSections` macht aus der Auswahl Quellen, Etagen und Räume (ein Sensor nur einmal, der erste gewinnt); `applySections` ersetzt (Titel, Farben, Optionen, `home` bleiben) oder ergänzt (nur was fehlt; vorhandene Einträge bleiben unverändert, bekommen aber den Energiezähler, den das Energie-Dashboard für ihren Leistungssensor kennt); `checkedConfig` meldet, was `validateConfig` ablehnen würde. Ergänzen zweimal hintereinander ändert nichts.
- Vorschau: eine echte `detailed-energy-card` mit demselben `hass` (ohne gemerkte Auswahl), umschaltbar zwischen *Jetzt* und *Heute*. Ohne Energie-Dashboard (`No prefs.`) steht ein Hinweis mit Link zu `/config/energy`.

Die Heatmap-Karte hat einen eigenen kleinen Editor (`HEATMAP` in `schema.ts`, dieselbe Feld-Technik; ein Test prüft, dass jede ihrer Optionen ein Feld hat).

**Abnahmekriterium:** Ein Konfigurationsobjekt, das im Editor angelegt wurde, ist identisch mit dem entsprechenden YAML. Das wird durch einen automatischen Test sichergestellt, der für jeden Konfigurationsschlüssel prüft, ob ein Editor-Feld existiert (Schema → Feld-Mapping).

**Editor-Bereiche (Mockup `mockups/4a-editor.png`):**

| Bereich | Felder |
|---|---|
| Allgemein | Titel, Einheit (auto/W/kW), Nachkommastellen, Animation, Eigenverbrauch anzeigen, „Nicht erfasst“ anzeigen, Entity-IDs der Verbraucher anzeigen, Auswahl merken; mit Energiesensor zusätzlich Startansicht, Zeiträume, Zweitwert (Aus, Automatisch, Heute, Jetzt, Kosten), Diagramm-Ansichten, Strompreis (fest oder Sensor), Einspeisevergütung (fest oder Sensor) und Währung |
| Farben | Voreinstellung (HA-Theme / Nocturne / Eigene), Akzent, Fluss-Linien, inaktive Linien, Verbraucher-Balken, Hintergrund, Text |
| Zuhause | Gesamt-Sensor (optional). Der Name ist fest (Standortname der Instanz). |
| Stromquellen | Liste; je Quelle: Sensor, Energiesensor, Energiesensor Gegenrichtung (nicht bei PV), Typ, Name, Icon, Farbe, Invertieren, SoC-Sensor (nur Batterie) |
| Struktur | Umschalter „Etagen verwenden“; Baum Etage → Raum → Verbraucher; Etagen und Räume nur per Auswahl aus HA, je Knoten zusätzlich Leistungssensor und Energiesensor (beide optional, eigener Zähler) und Farbe; je Verbraucher: Sensor, Name |

**Details:**

- **Stromquellen:** Liste mit Hinzufügen, Entfernen und Sortieren. Pro Quelle: Entität, Typ, Name, Invertieren und optional SoC.
- **Struktur:** Baum Zuhause → (Etage) → Raum → Verbraucher.
  - Umschalter „Etagen verwenden“. Beim Ausschalten werden die Räume flach übernommen und die beim Einschalten ausgeblendeten Räume wiederhergestellt, beim Einschalten nach der HA-Etage ihres Bereichs gruppiert. Bereiche ohne Etage werden dabei ausgeblendet; ein Hinweis nennt sie. Der Schalter ist gesperrt, solange Etagen und Bereiche nicht geladen sind.
  - Drag-and-drop zum Sortieren und zum Verschieben von Räumen zwischen Etagen.
- **Eigene Räume und Etagen:** Unter den Listen stehen *+ Eigener Raum* und *+ Eigene Etage* (immer, auch wenn die Registry keine freien Einträge mehr hat). Sie legen `custom_N` mit dem nächsten freien N an. Für einen Eintrag, dessen ID nicht in der Registry steht (nur bei geladener Registry), zeigt das Formular *Name* und *Icon* statt der Auswahl von Etage bzw. Bereich (`roomFields(…, custom)`, `floorFields(…, custom)`). Unter einer eigenen Etage lassen sich nur eigene Räume anlegen.
- **Verbraucher direkt unter Zuhause:** Der Abschnitt steht am Ende der Struktur (*Verbraucher direkt unter Zuhause*, mit Hinweistext); die Einträge sind die Verbraucher aus Räumen (Name, Icon, Schalter, Sensoren, Aktionen, Schwellwerte), das Icon-Feld gibt es nur hier (`consumerFields(…, direct)`). Sensoren, Duplikat-Prüfung und Summenwarnung (`sumConflict`) beziehen sie ein.
- **Entitätsauswahl:** `ha-entity-picker` mit `include-domains: ["sensor"]` und einem `entity-filter` auf `device_class === "power"`. Bereits vergebene Sensoren (Verbraucher und Zähler von Etagen und Räumen, Verbraucher unter Zuhause) werden in der Auswahl ausgeblendet (`exclude_entities`; nicht jede HA-Version tut das) und am Feld als Fehler gemeldet („Schon vergeben bei: <Ort>“, `takenWhere`), eine doppelte Zuordnung wird abgelehnt (in YAML ein Validierungsfehler, siehe Abschnitt 3).
- **Validierung live im Editor:** ungültige Sensoren, ungültige Farben, doppelte Zuordnung und Summenkonflikte werden am Feld angezeigt, nicht erst in der Card.
- **Hinweis Energiemodus:** Ohne Energiesensor zeigt „Allgemein“ einen Hinweis, dass der Schalter *Jetzt | Heute | Woche | Monat* erst mit einem Energiesensor (Zuhause, Quelle oder Verbraucher) erscheint (Details in Abschnitt 15).
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
- Verbraucher messen mehr als der Zähler ihres Raums (bzw. Räume mehr als der Zähler ihrer Etage): Warnsymbol am Knoten und Hinweiszeile in der Liste, ab 5 % und mindestens 10 W / 50 Wh (Abschnitt 5).
- Verbraucher nur mit Energiezähler im Modus *Jetzt*: ausgegraut mit „Kein Leistungssensor konfiguriert“, 0 W, ohne Warnsymbol (anders als ein nicht lesbarer Sensor).
- Verbraucher ohne Sensor (neu im Editor angelegt oder in YAML ohne `entity`/`energy_entity`): Warnsymbol am Knoten (unter Zuhause) und in der Liste „Kein Sensor konfiguriert“, 0 W, kein Eintrag in Sankey, Verlauf und Zweitwerten, Klick ohne Wirkung. Dasselbe Warnsymbol bekommt ein Verbraucher unter Zuhause mit nicht lesbarem Sensor.
- Eine Etage oder ein Raum mit einer ID, die nicht in der Registry steht, Der Knoten zeigt die Summe seiner Kinder mit Warnsymbol.
- Netz speist ein und Batterie lädt gleichzeitig: Pfeile werden umgekehrt, die Werte korrekt gezeigt.
- Sehr kleine Werte (< 1 W): Anzeige „0 W“, keine Animation.
- Grundlast und Dauerlast ohne Statistik (Sensor ohne `state_class`, noch keine Nacht aufgezeichnet): kein Badge, kein Symbol, keine Warnung.
- Lange Namen werden mit Ellipsis gekürzt. Der volle Name steht im `title`.
- Vier oder mehr Etagen (oder lange Etagennamen) auf einer schmalen Karte: Wert unter dem Namen (Abschnitt 6, `floorsStacked`). Auch dann wird es bei sehr vielen Etagen (etwa 6 auf einem Handy) eng; einen Umbruch wie `wrap_rooms` gibt es für Etagen nicht.
- Viele Verbraucher unter Zuhause (etwa 10 und mehr): die Reihe scrollt waagerecht (mindestens 96 px je Knoten); es gibt kein Zusammenfassen und keinen Umbruch. In der Liste sind sie immer vollständig.
- Verbraucher unter Zuhause bei gewählter Etage: nur im Baum (blass, bei `focus_selected` ausgeblendet), nicht in der Liste dieser Etage. Die Heatmap-Karte und der Import-Assistent kennen sie nicht (der Assistent behält sie und vergibt ihre Sensoren nicht doppelt).
- Eine Etage oder ein Raum mit einer ID, die nicht in der Registry steht, zeigt `name`/`icon` aus der Config; fehlt `name`, steht die ID.

---

## 12. Roadmap

| Version | Inhalt |
|---|---|
| **0.1 MVP** | YAML-Konfiguration, Quellen, optionale Etagen, Räume, Verbraucherliste, Animation, More-Info |
| **0.2** | Vollständiger visueller Editor (alle Optionen), Baum, gefilterte Sensorauswahl |
| **0.3** | Einspeisung, Batterie laden, „Nicht erfasst“, Autarkie |
| **0.4** | Viele Räume (Scroll/Umbruch), Lokalisierung DE/EN, erstes HACS-Release (Custom Repository) |
| **0.7.2** | Bugfixes: strengere Config-Validierung, Einheitenprüfung, Autarkie nur mit gemessenem Netz, Etagen-Schalter ohne Datenverlust, Registry aus `hass`; gehärtete CI. Details in [CHANGELOG.md](CHANGELOG.md) |
| **0.8.0** | Robustheit und Performance: Auswahl über IDs gespeichert (einmal zurückgesetzt), Editor rendert nur bei relevanten Änderungen, Caches, Animation pausiert außerhalb des Sichtbereichs, doppeltes Laden des Skripts unschädlich. Details in [CHANGELOG.md](CHANGELOG.md) |
| **0.8.1** | Barrierefreiheit und Sprache: Schwellwert-Stufen auch über Strichstärke, lesbarer Kontrast ausgegrauter Zeilen, `aria-label` im Editor, Standardnamen der Quellen und Startkonfiguration je nach Sprache. Details in [CHANGELOG.md](CHANGELOG.md) |
| **0.9.0** | Schwellwerte: eigene Strichstärke je Stufe (`width`) und eigene Schwellwerte je Ebene (`colors.level_thresholds` für Quellen, Etagen, Räume, Verbraucher), Editor mit Ebenenauswahl. Details in [CHANGELOG.md](CHANGELOG.md) |
| **0.9.1** | Schwellwerte pro Element (Quelle, Etage, Raum, Verbraucher) und Editor-Button zum Skalieren der Grenzen. Details in [CHANGELOG.md](CHANGELOG.md) |
| **0.9.2** | Editor: Schwellwerte und einzelne Stufen sind einklappbar. Details in [CHANGELOG.md](CHANGELOG.md) |
| **0.9.3** | Raumnamen überlappen auf kleinen Displays nicht mehr, `wrap_rooms` bricht nur um, wenn eine Reihe zu schmal wäre. Details in [CHANGELOG.md](CHANGELOG.md) |
| **0.10.0** | Neue Option `focus_selected`: die gewählte Etage oder der gewählte Raum gleitet in die Mitte, die anderen blenden aus; ein Klick zeigt immer die Kinder. Details in [CHANGELOG.md](CHANGELOG.md) |
| **0.11.0** | Optionen `show_consumers` (Verbraucher-Liste ausblenden) und `only_active_consumers` (nur Verbraucher ab 1 W listen), mit Schaltern im Editor. Details in [CHANGELOG.md](CHANGELOG.md) |
| **1.0.0** | Energie-Modus (kWh heute, Woche, Monat) aus der Recorder-Statistik mit `energy_entity` und Schalter in der Karte. Details in [CHANGELOG.md](CHANGELOG.md) |
| **1.0.1** | Editor-Stil im dunklen Theme, doppelte `energy_entity` wird abgelehnt, neue Screenshots. Details in [CHANGELOG.md](CHANGELOG.md) |
| **1.0.2** | Interne Umstellung: Editor-Texte über typisierte Schlüssel statt deutscher Texte, keine sichtbare Änderung. Details in [CHANGELOG.md](CHANGELOG.md) |
| **1.1.0** | Neue Option `options.storage_id` (trennt Karten mit gleicher Struktur), Auswahl-Schlüssel ohne Hash (die gemerkte Auswahl wird einmal zurückgesetzt). Korrekturen: Energiewerte werden nach Wiederanhängen und Sichtbarwerden neu geladen, doppelte `energy_entity` im Editor, Wochenstart bei `first_weekday: language`, Hinweise zu Energiesensoren im Editor, Nachkommastellen-Feld ohne falschen Standardwert. `render()` ohne Seiteneffekte. Details in [CHANGELOG.md](CHANGELOG.md) |
| **HACS-Standard** | Aufnahme in den HACS-Standard-Store (`hacs/default`) mit Version 1.1.0: Installation direkt über die HACS-Suche, kein benutzerdefiniertes Repository mehr nötig |
| **1.1.1** | Doku: Installation über den HACS-Standard-Store statt Custom Repository, damit HACS die neue README anzeigt. Details in [CHANGELOG.md](CHANGELOG.md) |
| **1.1.2** | Hinweis im Editor, solange kein Energiesensor eingetragen ist (Schalter *Jetzt \| Heute \| Woche \| Monat*), Konsolenzeile mit Name, Version und Repo-Link, Abschnitt „Credits“ im README. Pakete P0 und P1 des Ausbaukonzepts. Details in [CHANGELOG.md](CHANGELOG.md) |
| **1.2.0** | Ausbau nach dem Konzept (Pakete P3 bis P16): Ansichten Baum, Sankey-Diagramm und Verlauf (`options.view` / `views`), Zähler für Etagen und Räume mit Warnung und „Nicht erfasst“ je Auswahl, Zweitwert (`secondary_value`), Einspeisung und Batterie-Laden mit Badge Eigenverbrauch, Kosten (`price` / `price_entity`), Zeitraum blättern, Grundlast und Standby-Hinweis, zweite Karte `detailed-energy-heatmap-card`, Verbraucher nur mit Energiezähler, Assistent „Aus Energie-Dashboard übernehmen“, Aktionen und Schalter (`tap_action` …, `switch_entity`) und kompakte Ansicht (`options.compact`). Details in [CHANGELOG.md](CHANGELOG.md) |
| **1.3.0** | Verbraucher direkt unter Zuhause (`consumers` auf oberster Ebene, eigene Knoten im Baum), eigene Räume und Etagen im Editor, `options.show_entity_ids`, Namen für Räume und Etagen ohne Home-Assistant-Bereich, Fix für sich überlagernde Etagen-Pillen. Details in [CHANGELOG.md](CHANGELOG.md) |
| **1.2.3** | Editor: Schalter des Verbrauchers wieder ein normales Feld unter dem Namen, Aktionen in einer einklappbaren Sektion bei Verbrauchern, Räumen und Etagen. Details in [CHANGELOG.md](CHANGELOG.md) |
| **1.2.2** | Editor: Name des Verbrauchers zuerst; Sensoren, Schalter und eigene Zähler von Etagen und Räumen in einklappbaren, anfangs geschlossenen Sektionen. Details in [CHANGELOG.md](CHANGELOG.md) |
| **1.2.1** | Editor: Hilfetexte unter vielen Feldern, „Kennung der Auswahl“ heißt „Name der gemerkten Auswahl“ und erklärt, wann man es braucht, kurze Bezeichnungen bei kompakter Ansicht, Grundlast, Dauerlast und Schalter. README: Abschnitt „Options“ mit Tabellen aller Optionen, Screenshots nach Themen. Details in [CHANGELOG.md](CHANGELOG.md) |

---

## 13. Repository und HACS-Installation

**Repository:** `github.com/<owner>/detailed-energy-card`, öffentlich.

```
detailed-energy-card/
  src/                       // siehe Abschnitt 8
  dist/detailed-energy-card.js        // Build-Artefakt (nicht eingecheckt, nur im Release)
  hacs.json
  README.md                  // wird in HACS als Beschreibung angezeigt
  LICENSE                    // z. B. MIT
  package.json
  vite.config.ts
  CHANGELOG.md
  .github/dependabot.yml     // wöchentliche Updates für npm und GitHub Actions
  .github/workflows/
    build.yml                // Typecheck, Tests, Build, E2E bei jedem Push/PR
    release.yml              // Build-Job (nur lesen) + Release-Job (schreiben) bei Tag v*
    validate.yml             // HACS-Validierung via hacs/action
```

**hacs.json**

```json
{
  "name": "Detailed Energy Card",
  "filename": "detailed-energy-card.js",
  "render_readme": true,
  "homeassistant": "2024.8.0"
}
```

**Anforderungen, damit HACS das Repo akzeptiert**

- Der Dateiname der JS-Datei muss zum Repo-Namen passen: `detailed-energy-card.js`. HACS findet sie dann im Release-Asset, in `dist/` oder im Root.
- Jede Version ist ein **GitHub Release** mit SemVer-Tag (`v0.1.0`), und `detailed-energy-card.js` hängt als Asset daran.
- Das Repository braucht eine Beschreibung und Topics, z. B. `home-assistant`, `hacs`, `lovelace`, `energy`.
- `hacs/action` (Kategorie `plugin`) muss im Workflow `validate.yml` grün laufen.

**Installation für Nutzer**

Die Karte ist im HACS-Standard-Store (`hacs/default`) aufgenommen, ein benutzerdefiniertes Repository ist nicht mehr nötig.

1. HACS öffnen und „Detailed Energy Card“ suchen (oder über den my.home-assistant-Link aus der README direkt öffnen).
2. Den Eintrag öffnen → Herunterladen.
3. HACS registriert die Ressource `/hacsfiles/detailed-energy-card/detailed-energy-card.js` automatisch als JavaScript-Modul.
4. Im Dashboard Karte hinzufügen → „Detailed Energy Card“, oder per YAML `type: custom:detailed-energy-card`.

**Registrierung im Card-Picker** (in `detailed-energy-card.ts`):

```ts
// register.ts: ein zweites Laden des Skripts darf nicht fehlschlagen
logBannerOnce(__VERSION__, window); // Name, Version, Repo-Link in der Konsole
defineOnce('detailed-energy-card', DetailedEnergyCard);
defineOnce('detailed-energy-card-editor', DetailedEnergyCardEditor);
window.customCards ??= [];
registerCardOnce(window.customCards, {
  type: 'detailed-energy-card',
  name: 'Detailed Energy Card',
  description: localize(navigator.language, 'picker_description'), // DE oder EN
  preview: true,
});
```

**Konsolenzeile:** Beim Laden schreibt die Karte einmal pro Seite Name, Version und den Link zum Repository in die Browser-Konsole (`console.info`, farbig wie andere HA-Karten). Die Version setzt Vite beim Build aus `package.json` ein (`define: { __VERSION__ }` in `vite.config.ts`). Die Lizenz bleibt MIT; die Zeile und der Abschnitt „Credits“ im README sind der Hinweis auf das Original.

**Release-Ablauf:** Version in `package.json` erhöhen und `CHANGELOG.md` ergänzen, mergen, dann Tag `vX.Y.Z` pushen. `release.yml` bricht ab, wenn der Tag nicht zur Version in `package.json` passt, führt Typecheck, Tests, Build und E2E aus, hängt dann `detailed-energy-card.js` an das Release (mit Build-Provenance-Attestation) und erzeugt die Release-Notes. Alle Actions sind auf Commit-SHAs gepinnt und die Jobs laufen mit minimalen Rechten. HACS bietet das neue Release dann über den Standard-Store als Update an.

---

## 14. Offene Fragen

1. Soll ein Verbraucher mehreren Räumen zugeordnet werden dürfen, z. B. anteilig?
2. Genügt eine feste Reihenfolge der Quellen, oder soll sie sich nach der Leistung sortieren?
3. Soll die Batterie beim Laden als eigener Verbraucherknoten erscheinen oder nur als umgekehrter Pfeil an der Quelle?
4. ~~Wird für den Energie-Modus die HA-Recorder-Statistik genutzt, oder werden Tageszähler (`utility_meter`) vorausgesetzt?~~ Entschieden: Recorder-Statistik, siehe Abschnitt 15.

---

## 15. Energie-Modus (kWh)

Die Karte zeigt neben der Leistung jetzt auch die Energie eines Zeitraums.

- **Konfiguration:** `energy_entity` an Quellen, Etagen, Räumen und Verbrauchern (Zähler mit `device_class: energy`, Wh/kWh/MWh), `energy_entity_return` an Netz-, Batterie- und allgemeinen Quellen für die Gegenrichtung (Einspeisung, geladen), `home.total_energy_entity` für „Nicht erfasst“ und die Autarkie, `options.mode` (`power` | `energy`, Startansicht) und `options.energy_periods` (Liste aus `today`, `week`, `month`, Standard alle).
- **Schalter:** *Jetzt | Heute | Woche | Monat* im Kopf der Karte, sichtbar, sobald ein Element einen Energiesensor hat. Modus und Zeitraum werden wie die Auswahl gemerkt (`remember_selection`).
- **Daten:** WebSocket `recorder/statistics_during_period` mit `types: ["change"]` und `units: { energy: "kWh" }` (Home Assistant rechnet jede Einheit um). Heute wird stündlich, Woche und Monat täglich summiert. Beginn von Tag, Woche und Monat liegt um Mitternacht in der Zeitzone von Home Assistant, die Woche beginnt am ersten Wochentag der Sprache (`locale.first_weekday`). Tage mit Zeitumstellung werden korrekt behandelt. Die Abfrage wiederholt sich alle 5 Minuten, solange die Karte sichtbar ist. Mit `secondary_value: auto` oder `today` lädt die Card den Wert von „Heute“ auch im Modus *Jetzt*, im selben Takt und nur solange sie sichtbar ist. Die Statistik kommt als Stunden- bzw. Tageszeilen (`loadEnergySeries`), die Card summiert sie; frühere Zeiträume (gestern, letzte Woche) lassen sich über `periodRange(…, offset)` abfragen. Laden, Merken und Aktualisieren übernimmt der `EnergyStore` (`model/energy-store.ts`), der mehrere Abfragen nebeneinander halten kann. Der Verlauf lädt zusätzlich die Vorperiode (Offset −1) und bei Woche und Monat die Stunden des Vergleichstags (Heute mit Offset −7 bzw. −Tage bis zum gleichen Tag des Vormonats); alle Abfragen laufen über den `EnergyStore` und teilen sich gleiche Abfragen.
- **Zustände:** Beim ersten Laden zählen alle Werte 0 und ein Hinweis „Lade Energiedaten …“ erscheint. Schlägt die Abfrage fehl, zeigt die Karte „Energiedaten nicht verfügbar“. Ein Element ohne `energy_entity` ist ausgegraut („Kein Energiesensor konfiguriert“), ein Sensor ohne Statistik gilt als nicht verfügbar.
- **Darstellung:** Werte in kWh (`decimals`, Standard 1). Linienstärke nach Anteil am Verbrauch des Hauses (1 bis 6 px), keine Fließanimation, keine Schwellwerte, normale Flussfarbe. Intern rechnet der Modus in Wh, damit die Ruhegrenze (unter 1 Wh) und die Verbraucherliste unverändert funktionieren.
- **Gegenrichtung:** Ein Energiezähler kennt nur eine Richtung. Deshalb hat eine Quelle optional einen zweiten Zähler `energy_entity_return`. Der Wert der Quelle bleibt das, was sie geliefert hat (Netz: Bezug, Batterie: entladen), die Beschriftung bleibt „Netz · Bezug“. Darunter steht klein „Einspeisung 3,8 kWh“ bzw. „geladen 2,4 kWh“ (allgemeine Quelle: „Rücklauf …“); ist der Zähler nicht lesbar, steht dort „–“. Die Quellenzeile wird dafür eine Zeile (20 px) höher, Quellen ohne Gegenrichtung lassen sie leer. Die Linie folgt dem Saldo (geliefert minus zurück), ihre Stärke dem Betrag. Die Autarkie rechnet weiter mit dem Bezug; der Eigenverbrauch nutzt die Einspeisung (Abschnitt 5).
- **Kosten-Daten:** Mit Preis lädt die Card für den Kosten-Zeitraum die Stundenzeilen aller Energiezähler und die Stundenmittel der Preissensoren, inkrementell: Eine Aktualisierung fragt nur ab der jüngsten Zeile neu und behält die älteren (`incremental` im `EnergyStore`). Dazu, falls vorhanden, die Kostenstatistiken von Home Assistant.
- **Grenzen:** Vergleiche gibt es im Verlauf (Abschnitt 8); die Kosten rechnen mit Stundenmitteln des Preises.
- **Editor:** `energy_entity` bei Quellen und Verbrauchern, `total_energy_entity` bei Zuhause, Startansicht, Zeiträume, Zweitwert sowie Startansicht und Ansichten des Diagramms und die Preise (fest oder Sensor, Vergütung, Währung) unter Allgemein (nur sichtbar, sobald ein Energiesensor eingetragen ist). Ein Preissensor ohne `state_class: measurement` bekommt einen Hinweis, Kosten ohne Energiezähler am Netz ebenfalls. Solange kein Energiesensor eingetragen ist, steht unter Allgemein stattdessen ein Hinweis, wo man einen einträgt, damit der Schalter *Jetzt | Heute | Woche | Monat* erscheint. Der Editor prüft live, ob der Sensor `device_class: energy` und eine passende Einheit hat.
