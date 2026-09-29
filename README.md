# Energy Card

Home Assistant Lovelace card showing the power flow from sources (PV, battery, grid) through the home, optional floors and rooms down to individual consumers. See [Entwicklungskonzept.md](Entwicklungskonzept.md) for the full concept and roadmap.

Status: **0.1 MVP** (YAML configuration). The visual editor follows in 0.2.

## Preview

![Card with floors](https://raw.githubusercontent.com/stacknoise/energy-card/main/docs/mockups/3a-card-mit-etagen.png)
![Card without floors](https://raw.githubusercontent.com/stacknoise/energy-card/main/docs/mockups/3b-card-ohne-etagen.png)

These are design mockups; the visual editor (mockup below) is planned for 0.2.

![Editor mockup](https://raw.githubusercontent.com/stacknoise/energy-card/main/docs/mockups/4a-editor.png)

## Install (HACS)

[![Open your Home Assistant instance and open this repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=stacknoise&repository=energy-card&category=plugin)

Click the button above to add the repository to HACS on your Home Assistant instance, or do it manually:

1. Open HACS → ⋮ → **Custom repositories**.
2. Enter `https://github.com/stacknoise/energy-card` and choose the type **Dashboard**.
3. Search for *Energy Card* in HACS and click **Download**.
4. Reload the browser. HACS registers the resource `/hacsfiles/energy-card/energy-card.js` automatically.
5. Add the card to a dashboard: **Add card → Energy Card**, or use `type: custom:energy-card` in YAML.

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
