# Energy Card

Home Assistant Lovelace card showing the power flow from sources (PV, battery, grid) through the home, optional floors and rooms down to individual consumers. See [Entwicklungskonzept.md](Entwicklungskonzept.md) for the full concept and roadmap.

Status: **0.1 MVP** (YAML configuration). The visual editor follows in 0.2.

## Preview

![Card with floors](https://raw.githubusercontent.com/stacknoise/energy-card/main/docs/mockups/3a-card-mit-etagen.png)
![Card without floors](https://raw.githubusercontent.com/stacknoise/energy-card/main/docs/mockups/3b-card-ohne-etagen.png)

These are design mockups; the visual editor (mockup below) is planned for 0.2.

![Editor mockup](https://raw.githubusercontent.com/stacknoise/energy-card/main/docs/mockups/4a-editor.png)

## Install (HACS)

HACS → ⋮ → Custom repositories → add this repository as type *Dashboard* → download *Energy Card*.

## Example

```yaml
type: custom:energy-card
title: Energiefluss
home:
  name: Zuhause
  total_entity: sensor.hausverbrauch_power
sources:
  - { entity: sensor.pv_leistung, type: solar, name: PV }
  - { entity: sensor.akku_leistung, type: battery, soc_entity: sensor.akku_soc }
  - { entity: sensor.netz_leistung, type: grid }
floors:
  - name: EG
    rooms:
      - name: Küche
        icon: mdi:stove
        consumers:
          - entity: sensor.backofen_power
            name: Backofen
```

Use either `floors` or `rooms` on the top level. Only `sensor.*` power entities (W / kW / MW) are supported. All options are documented in the concept, section 3.

## Development

```bash
npm install
npm test
npm run build      # dist/energy-card.js
```

Open `dev/index.html` through a static server (e.g. `npx vite`) for a mock-data preview.
