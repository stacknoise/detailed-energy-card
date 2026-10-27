<img src="https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/icon.png" alt="Detailed Energy Card icon" width="96" align="right">

# Detailed Energy Card

Home Assistant Lovelace card showing the power flow from sources (PV, battery, grid) through the home, optional floors and rooms down to individual consumers. See [Entwicklungskonzept.md](Entwicklungskonzept.md) for the full concept and roadmap.

Status: **1.1.2** (see the [changelog](CHANGELOG.md)). Configure it in the visual editor (German and English) or in YAML.

## Preview

Home → floor → room → consumers. Click a floor to show its rooms (all of them are selected), click a room to list just its consumers. Click the selected room again to see all rooms of the floor together, click the selected floor again (or the home) to select all floors and list every consumer.

| With floors | Without floors |
| --- | --- |
| ![Card with floors](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-with-floors.png) | ![Card without floors](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-without-floors.png) |

| All rooms of a floor selected | Many rooms wrapped into two rows |
| --- | --- |
| ![All rooms selected](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-all-rooms.png) | ![Many rooms wrapped](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-many-rooms-wrapped.png) |

| Thresholds per level | Energy mode |
| --- | --- |
| ![Card with thresholds per level](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-thresholds.png) | ![Card in the energy mode](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-energy.png) |

| Own meters of floors and rooms | Second value: power now, energy of today |
| --- | --- |
| ![Floors and rooms with their own meter](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-meters.png) | ![Power now with the energy of today below](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-secondary.png) |

| Feed-in, charging and self-consumption | Timeline of the day |
| --- | --- |
| ![Feed-in and battery charging in the energy mode](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-feedin.png) | ![Timeline of today stacked by room, yesterday dashed](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-timeline.png) |

| Costs from a dynamic price | Sankey diagram |
| --- | --- |
| ![Costs badge and the costs of every node](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-costs.png) | ![Sankey diagram of sources, floors, rooms and consumers with feed-in and charging below](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-sankey.png) |

| Base load and consumers that run all the time | Heatmap card |
| --- | --- |
| ![Base load badge and the infinity symbol at the fridge](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-standby.png) | ![Heatmap card: a row per day, a column per hour](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-heatmap.png) |

| Switches in the consumer list |
| --- |
| ![A toggle at the end of the row of a consumer with a switch](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-actions.png) |

Thresholds can differ per level, and a single element can have its own list: here the floor and room lines have their own limits and widths, and the oven (green until 1 kW) has its own thresholds instead of the consumer level's. The energy mode shows how much each part used today, this week or this month; the lines show the share of the consumption, and the coffee machine has no energy sensor. Floors and rooms can have their own meter (small meter icon): here EG (distribution board), the kitchen and the hall are metered, and the kitchen meter measures 0.4 kWh more than the kitchen's consumers. With `options.secondary_value: auto` every node shows the energy of today below its power (and the power now in the energy mode). With counters for both directions the grid and the battery show what went back (feed-in 3.8 kWh, charged 2.4 kWh), and the *Self-consumption* badge says how much of the solar energy stayed in the home.

The card screenshots are rendered from mock data with `npm run screenshots`.

### Visual editor

Everything can be configured without YAML. Floors and rooms are picked from the floors and areas of your Home Assistant; the editor has a German and an English UI.

| General and options | Thresholds per level |
| --- | --- |
| ![Editor: general](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/editor-general.png) | ![Editor: thresholds](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/editor-thresholds.png) |

| Energy sensors | Structure with energy sensors |
| --- | --- |
| ![Editor: energy sensors](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/editor-energy.png) | ![Editor: structure](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/editor-structure.png) |

**Import from the Energy dashboard:** the button *Import from Energy dashboard* at the top of the editor proposes the structure of the card from what you already set up in Home Assistant's Energy dashboard, in three steps: *Sources* (grid, solar and battery with their counters, and a power sensor each: the one of the dashboard, or the only one at the same device, otherwise you choose), *Structure* (floors, rooms and devices by their areas; tick or untick on every level, rename a device, put it into another room; devices without an area are off by default, external statistics are shown but cannot be taken over) and *Preview* (a live card, *Now* or *Today*). A device that is part of another one (`included_in_stat`) sits under its parent: the parent becomes the meter of the room when the whole family is in that room, otherwise its parts are off by default, so nothing is counted twice. Devices need no power sensor in the card any more: a consumer with only an energy counter shows in the energy mode and is greyed out in the mode *Now*. When the card already has a structure you choose: *Replace* (new sources, floors and rooms; title, colors and options stay) or *Add what is missing* (existing entries stay as they are, they only get the energy counter the dashboard knows for their power sensor). Gas and water are not electricity and are left out. Areas without a floor can only be shown when no floors are used.

![Import wizard: structure from the Energy dashboard](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/editor-import.png)

The editor screenshots are rendered from demo data with `npm run screenshots`. The form fields are drawn by a stand-in for Home Assistant's form (`dev/ha-form-stub.js`), so they look like the real ones but are not taken in a real Home Assistant.

## Install (HACS)

The card is part of the HACS default store, so no custom repository is needed.

[![Open your Home Assistant instance and open this repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=stacknoise&repository=detailed-energy-card&category=plugin)

Click the button above to open the card in HACS on your Home Assistant instance, or find it yourself:

1. Open HACS and search for *Detailed Energy Card*.
2. Open the entry and click **Download**.
3. Reload the browser. HACS registers the resource `/hacsfiles/detailed-energy-card/detailed-energy-card.js` automatically.
4. Add the card to a dashboard: **Add card → Detailed Energy Card**, or use `type: custom:detailed-energy-card` in YAML.

## Example

```yaml
type: custom:detailed-energy-card
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

The *Self-sufficiency* badge (share of the consumption not drawn from the grid) needs a source of type `grid`; without one, or while a grid sensor is unavailable, the badge is hidden. A second badge, *Self-consumption* (share of the solar production used in the home, not fed into the grid), appears next to it when it can be computed: a solar source that produces and a known feed-in (the negative grid power now, or the grid's `energy_entity_return` in the energy mode). Switch it off with `options.show_self_consumption: false`. On narrow cards the badges wrap. Floors and rooms are not free text: they are picked from the floors and areas that already exist in Home Assistant (`floor_id`, `area_id`); names and icons come from there, and the home name is your instance's location name. Options: `options.unit` (`W`, `kW`, `auto`; default `W`), `options.decimals` (0–20, for kW values), `options.animation`, `options.show_unassigned`, `options.show_consumers` (default `true`; `false` hides the list of consumers under the diagram), `options.only_active_consumers` (default `false`; list only consumers that draw 1 W or more, sensors that cannot be read stay listed as warnings), `options.remember_selection` (with `options.storage_id`, a short text, you tell two cards with the same floors and rooms apart, for example a power and an energy view; otherwise they share the selection and the view) and `options.focus_selected` (the selected floor or room slides to the middle under its parent and the others of its level fade out; a click on an element always shows its children, so the home brings all floors back, default off) and `options.wrap_rooms` (wrap more than 6 rooms into two rows instead of scrolling, but only when a single row would be too narrow: less than 80 px per room). **Meters of floors and rooms:** a floor or a room can have its own meter, for example a meter in the distribution board of a floor or a smart plug meter for a whole room: `entity` (power, W) and `energy_entity` (energy, kWh), both optional. With a meter the node shows the measured value and a small meter icon, and the list shows what its consumers miss ("Unassigned in Kitchen"); without one it shows the sum of its children as before. A room with a meter needs no consumers. A consumer needs a power sensor (`entity`), an energy counter (`energy_entity`) or both: with only a counter it is greyed out in the mode *Now* ("No power sensor configured", 0 W, no warning) and counts in the energy mode; with `only_active_consumers` it is hidden in the mode *Now*. When the consumers measure clearly more than the meter (more than 5 % and at least 10 W or 50 Wh), the node shows a warning and the list says by how much. "Unassigned" always belongs to what the list shows: the selected room (only with a room meter), the selected floor (when the floor or one of its rooms has a meter) or the whole home. A sensor can be assigned to one place only, a consumer or a meter (the editor hides sensors that are already taken; the same sensor twice in YAML is a configuration error). Use either `floors` or `rooms` on the top level.

**Negative values:** a consumer that reports a negative value (for example a bidirectional meter) counts as 0 W; only sources can be negative (battery charging, grid feed-in), solar and generic sources are clamped at 0. If a consumer feeds back and you want to see it, add that sensor as a source instead.

**Energy mode (kWh):** **The switch *Now | Today | Week | Month* appears in the card as soon as one element has an energy sensor** (an `energy_entity` on a source, floor, room or consumer, or `home.total_energy_entity`); until then the editor shows a hint under *General*. Besides the power now the card can show how much energy each part used today, this week or this month. Give sources, floors, rooms and consumers an `energy_entity` (a `sensor.*` energy counter with `device_class: energy`, in Wh, kWh or MWh) next to their power `entity`, and optionally `home.total_energy_entity` for "Unassigned" and the self-sufficiency badge. The values come from the long-term statistics of Home Assistant (the sensors need a `state_class` of `total` or `total_increasing`, and the recorder must keep them); the card needs no `utility_meter` helpers. Day, week and month start at midnight in the time zone of Home Assistant, the week on the first weekday of your locale. Lines show the share of the home's consumption instead of a flow, there are no thresholds and no animation in this mode. An element without `energy_entity` is shown as unavailable ("No energy sensor configured"). An energy counter only counts in one direction: give the grid its import counter as `energy_entity` and, optionally, its export counter as `energy_entity_return` (a battery: discharged and charged; also for `generic` sources, not for solar). The node keeps the import as its value and shows the other direction in a small line below ("feed-in 3.8 kWh", "charged 2.4 kWh"); the line follows the balance. Options: `options.mode` (`power` or `energy`, what the card shows when it loads), `options.energy_periods` (a list of `today`, `week`, `month` the switch offers; default all) and `options.secondary_value` (a second, smaller value under every node and in the consumer list: `today` shows the energy of today in the mode *Now*, `power` the power now in the energy mode, `auto` the other value of whichever mode is shown, `cost` the costs, see below; default `none`; a node without a value for the second line leaves it empty instead of showing 0 kWh), `options.view` (`tree`, `sankey` or `timeline`, the chart shown at start) and `options.views` (the charts the view switch offers, e.g. `[tree, sankey, timeline]`; without it there is no switch).

**Base load and standby:** `options.show_base_load: true` adds a badge *Base load 185 W*: the lowest hourly mean of the home's power between 1 and 5 o'clock in the last 7 nights (`home.total_entity`, else the sum of the sources). `options.standby_watts: 5` marks consumers whose hourly mean did not fall below 5 W in the last 24 hours with an infinity symbol ("runs all the time"). Both read the long-term statistics of the power sensors (they need a `state_class: measurement`), once an hour; without statistics, or with less than 20 hours of them for a consumer, nothing is shown. Both are off by default and work in both modes.

**Browsing:** in the energy mode the arrows ‹ › next to the period buttons go back to earlier days, weeks and months and forward again up to the running one; the card then names the period ("Yesterday", "Mon 19.10.", "KW 43", "September"). Values, costs and all views follow; the timeline compares a finished period with the whole period before it. The position is not remembered.

**Sankey diagram:** `view: sankey` draws the flow as bands: sources → floors (without floors: rooms) and *Unassigned* → rooms → the consumers of the selected room. The band width is the energy (in the mode *Now* the power, and the bands slide to their new places). A click on a floor shows only its rooms (a second click shows all floors again), a click on a room its consumers, a click on a source or consumer opens its dialog. The card only knows how much each source delivers and each part uses, not which source supplied which floor, so every source supplies every floor in the same share it supplies the home (the tooltip says so). Feed-in and battery charging are nodes of their own below the floors; the solar and generic sources feed them first. No energy sensor is needed. The selection and the list below follow the tree.

**Timeline:** stacked bars per hour of today (also in the mode *Now*) or per day of the week or month, with the previous day, week or month as a dashed outline. The bars are stacked by the level below the selection: the floors of the home, the rooms of a floor, the consumers of a room. Click a legend entry to go one level down and the path in the head to go back. Above the chart: what was used so far, the change against the previous period up to the same time, and the largest bar. It needs energy sensors; without them the card stays on the tree.

**Costs:** set `options.price` (a fixed price per kWh) or `options.price_entity` (a price sensor of a dynamic tariff such as Tibber; it must be recorded as statistics, `state_class: measurement`), optionally `options.feed_in_price` or `options.feed_in_price_entity` for the compensation of the feed-in and `options.currency` (default the currency of Home Assistant). The costs need an energy counter on the grid. Only energy from the grid costs money: for every hour the card takes the grid import over the consumption of the home as the grid share, and every node pays its energy of that hour times that share times the price of that hour; solar and battery energy cost nothing, the feed-in is paid separately. A badge shows "Costs 3.84 € · Compensation 1.20 €" for the shown period (in the mode *Now* for today). When Home Assistant keeps the cost statistics of the Energy dashboard (`<grid counter>_cost`, `<export counter>_compensation`) the badge takes those amounts. Its tooltip names what the battery charged from the grid, and "≈" marks an amount when the price was missing for more than 3 hours (missing hours use the last known price). With `options.secondary_value: cost` every node shows its costs; the tooltip of that line gives the energy and the part from the grid. Prices are hourly means: with quarter-hour prices the amounts are close, not exact.

```yaml
home:
  total_entity: sensor.house_power
  total_energy_entity: sensor.house_energy
sources:
  - { entity: sensor.pv_power, energy_entity: sensor.pv_energy, type: solar }
  - { entity: sensor.grid_power, energy_entity: sensor.grid_import_energy, type: grid }
floors:
  - floor_id: ground_floor
    rooms:
      - area_id: kitchen
        consumers:
          - { entity: sensor.oven_power, energy_entity: sensor.oven_energy }
options:
  mode: energy
  energy_periods: [today, week]
```

**Idle and thresholds:** consumers that draw no power (under 1 W) are shown faded in the list, and rooms and floors without consumption are faded in the diagram. To color lines and list bars by power, add thresholds (in watts); from each `from` value upwards the color applies, below the first one the normal color is used:

```yaml
colors:
  thresholds:
    - { from: 0, color: "#4caf50" }
    - { from: 500, color: "#ff9800" }
    - { from: 2000, color: "#f44336" }
```

A range can also set the line width (`width`, 0.5 to 12 px). It replaces the width that follows the power; without `width` the automatic width applies. Each level of the diagram (`source`, `floor`, `room`, `consumer`) can have its own thresholds, because a floor draws far more power than a single device. A level without its own list uses `colors.thresholds`. A line belongs to the level of the node it leads to; `consumer` is the bar in the list:

```yaml
colors:
  thresholds:                      # used by every level without its own list
    - { from: 0, color: "#4caf50", width: 1.5 }
    - { from: 500, color: "#ff9800", width: 3 }
    - { from: 2000, color: "#f44336", width: 5 }
  level_thresholds:
    floor:
      - { from: 0, color: "#4caf50", width: 2 }
      - { from: 1500, color: "#ff9800", width: 3.5 }
      - { from: 4000, color: "#f44336", width: 5.5 }
    consumer:
      - { from: 0, color: "#4caf50" }
      - { from: 300, color: "#ff9800" }
      - { from: 1500, color: "#f44336" }
```

A source, floor, room or consumer can also have its own `thresholds` list, which replaces the list of its level for that element only (for example a heat pump that normally draws 2 kW and should only turn red above 4 kW). The order of precedence is: element, level, `colors.thresholds`:

```yaml
rooms:
  - area_id: technikraum
    consumers:
      - entity: sensor.waermepumpe_power
        thresholds:
          - { from: 0, color: "#4caf50" }
          - { from: 4000, color: "#f44336" }
```

In the visual editor they are under *Colors → Thresholds* (with a traffic-light preset, a level selector and a "scale limits" button that multiplies the limits of the shown list by a factor); an element's own thresholds are in its entry under *Own thresholds*. Every color field takes a single CSS color: hex (`#9184d9`), `rgb()`/`hsl()`, a named color (`orange`) or a theme variable (`var(--primary-color)`); anything else is a configuration error. Only `sensor.*` power entities (W / kW / MW) are supported; a sensor with another unit (for example kWh or V) is not counted as watts and shows a warning on its node. A battery state-of-charge sensor (`soc_entity`) must report `%`. All options are documented in the concept, section 3.

**Actions and switches:** every source, floor, room and consumer takes the actions of the Home Assistant standard, `tap_action`, `hold_action` and `double_tap_action` (a press of 0.5 seconds is a hold, a second tap within a quarter of a second a double tap). Without them a click does what it always did: a source or consumer opens its dialog, a floor or room is selected; a `tap_action` replaces that. Supported are `more-info`, `toggle`, `navigate` (`navigation_path` starting with `/`), `url` (http, https or a path), `perform-action` (`perform_action: light.turn_on`, with `data` and `target`; `call-service` with `service` is the older form), `none`, and `confirmation` (`true` or `{ text: … }`). `entity` in an action names the entity it acts on, else the sensor of the element (a consumer with a switch: the switch). A consumer can also have `switch_entity` (a `switch`, `input_boolean`, `light` or `fan`): the list then shows a toggle at the end of its row, which turns it on or off without opening the dialog, and `confirm_switch: true` asks before it is turned off. The actions work on the tree and the consumer list; the Sankey diagram keeps its clicks. The card runs the actions itself (the Home Assistant frontend has no event for it), the questions of `confirmation` and `confirm_switch` are the browser's own dialog.

```yaml
sources:
  - entity: sensor.pv_power
    type: solar
    hold_action: { action: more-info, entity: sensor.pv_soc }
floors:
  - floor_id: eg
    double_tap_action: { action: navigate, navigation_path: /lovelace/energy }
    rooms:
      - area_id: kueche
        consumers:
          - entity: sensor.kaffeemaschine_power
            switch_entity: switch.kaffeemaschine
          - entity: sensor.heizung_power
            switch_entity: switch.heizung
            confirm_switch: true
```

## Heatmap card

The same file brings a second card, `custom:detailed-energy-heatmap-card` (**Add card → Detailed Energy Heatmap**, with its own visual editor, no second installation): *when is electricity used?* A row per day (the newest at the bottom), a column per hour, the color is the consumption of that hour. Hours without statistics are hatched, hours that have not begun yet are outlined.

```yaml
type: custom:detailed-energy-heatmap-card
entity: sensor.haus_energie   # energy counter of the home (kWh), required
days: 14                      # 7 to 28, default 7
title: When is electricity used?
price_entity: sensor.strompreis   # optional: a price sensor (hourly means) or `price: 0.32` per kWh
currency: EUR                 # optional, default the one of Home Assistant
```

Above the grid: the *base load* (the lowest hourly use between 1 and 5 o'clock in the days shown, like on the energy card), the total of the days, and the most expensive hour (consumption × the price of that hour; without a price the peak hour in kWh instead). The values come from the long-term statistics of the counter (`state_class` `total` or `total_increasing`), hourly rows, reloaded once an hour while the card is visible. Dev page: `?card=heatmap`.

## Credits

Detailed Energy Card is made by Anton Graichen-Hartl ([stacknoise](https://stacknoise.com/energy-card)). The original repository is [stacknoise/detailed-energy-card](https://github.com/stacknoise/detailed-energy-card). The card is MIT licensed: forks and reuse are welcome, keep the copyright notice and the [LICENSE](LICENSE), and a link back to this repository is appreciated. When the card loads it writes its name, version and this link to the browser console.

## Development

```bash
npm install
npm test            # unit tests (Vitest)
npm run build       # dist/detailed-energy-card.js
npm run test:e2e    # browser tests (Playwright) against dev/index.html
npm run screenshots # re-render docs/screenshots/*.png
npm run icon        # re-render docs/icon.png and docs/social-preview.png
```

Releases: raise `version` in `package.json`, merge, then push the tag `v<version>`; the release workflow refuses a tag that does not match. Add the changes to [CHANGELOG.md](CHANGELOG.md) first.

Texts: card and editor look up their texts by key in `src/localize/index.ts` and `src/localize/editor.ts`. Each file has a German table `de` and an English table `en: typeof de`, so a new text needs a key in both, and the type check fails when one is missing. Do not write German text directly in `src/editor/`; a test checks that.

`npx vite` serves `dev/index.html`, a mock-data preview. Pick a scenario with `?scenario=floors|flat|many|wrap|long|thresholds|focus|energy|meters|secondary|feedin|timeline|sankey|standby|costs|duplicate|invalid` (`meters`: own meters of floors and rooms, `secondary`: the second value, `feedin`: feed-in and charging, `timeline`: the timeline view, `sankey`: the Sankey diagram, `standby`: base load and always-on consumers, `costs`: costs from a dynamic price).

Locally the browser tests use the installed Microsoft Edge; in CI they use Chromium (`npx playwright install chromium`).
