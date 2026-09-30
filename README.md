# Energy Card

Home Assistant Lovelace card showing the power flow from sources (PV, battery, grid) through the home, optional floors and rooms down to individual consumers. See [Entwicklungskonzept.md](Entwicklungskonzept.md) for the full concept and roadmap.

Status: **0.3**. Configure it in the visual editor (German and English) or in YAML.

## Preview

Home → floor → room → consumers. Click a floor to show its rooms (all of them are selected), click a room to list just its consumers. Click the selected room again to see all rooms of the floor together, click the selected floor again (or the home) to select all floors and list every consumer.

| With floors | Without floors |
| --- | --- |
| ![Card with floors](https://raw.githubusercontent.com/stacknoise/energy-card/main/docs/screenshots/card-with-floors.png) | ![Card without floors](https://raw.githubusercontent.com/stacknoise/energy-card/main/docs/screenshots/card-without-floors.png) |

| All rooms of a floor selected | Many rooms wrapped into two rows |
| --- | --- |
| ![All rooms selected](https://raw.githubusercontent.com/stacknoise/energy-card/main/docs/screenshots/card-all-rooms.png) | ![Many rooms wrapped](https://raw.githubusercontent.com/stacknoise/energy-card/main/docs/screenshots/card-many-rooms-wrapped.png) |

The card screenshots are rendered from mock data with `npm run screenshots`.

### Visual editor

Everything can be configured without YAML. Floors and rooms are picked from the floors and areas of your Home Assistant; the editor has a German and an English UI.

| General and colors | Sources and structure |
| --- | --- |
| ![Editor: general and colors](https://raw.githubusercontent.com/stacknoise/energy-card/main/docs/screenshots/editor-general.png) | ![Editor: sources and structure](https://raw.githubusercontent.com/stacknoise/energy-card/main/docs/screenshots/editor-structure.png) |

The editor screenshots are taken in a real Home Assistant.

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
  total_entity: sensor.hausverbrauch_power
sources:
  - { entity: sensor.pv_leistung, type: solar, name: PV }
  - { entity: sensor.akku_leistung, type: battery, soc_entity: sensor.akku_soc }
  - { entity: sensor.netz_leistung, type: grid }
floors:
  - floor_id: erdgeschoss   # a floor from Home Assistant
    rooms:
      - area_id: kueche   # an area from Home Assistant
        consumers:
          - entity: sensor.backofen_power
            name: Backofen
```

Floors and rooms are not free text: they are picked from the floors and areas that already exist in Home Assistant (`floor_id`, `area_id`); names and icons come from there, and the home name is your instance's location name. Options: `options.unit` (`W`, `kW`, `auto`; default `W`), `options.decimals`, `options.animation`, `options.show_unassigned`, `options.remember_selection` and `options.wrap_rooms` (wrap more than 6 rooms into two rows instead of scrolling). A sensor can be assigned to one consumer only (the editor hides sensors that are already taken; the same sensor twice in YAML is a configuration error). Use either `floors` or `rooms` on the top level.

**Idle and thresholds:** consumers that draw no power (under 1 W) are shown faded in the list, and rooms and floors without consumption are faded in the diagram. To color lines and list bars by power, add thresholds (in watts); from each `from` value upwards the color applies, below the first one the normal color is used:

```yaml
colors:
  thresholds:
    - { from: 0, color: "#4caf50" }
    - { from: 500, color: "#ff9800" }
    - { from: 2000, color: "#f44336" }
```

In the visual editor they are under *Colors → Thresholds* (with a traffic-light preset). Only `sensor.*` power entities (W / kW / MW) are supported. All options are documented in the concept, section 3.

## Development

```bash
npm install
npm test            # unit tests (Vitest)
npm run build       # dist/energy-card.js
npm run test:e2e    # browser tests (Playwright) against dev/index.html
npm run screenshots # re-render docs/screenshots/*.png
```

`npx vite` serves `dev/index.html`, a mock-data preview. Pick a scenario with `?scenario=floors|flat|many|wrap|invalid`.

Locally the browser tests use the installed Microsoft Edge; in CI they use Chromium (`npx playwright install chromium`).
