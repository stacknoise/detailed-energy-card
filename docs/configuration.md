# Configuration reference

Everything about configuring the [Detailed Energy Card](https://github.com/stacknoise/detailed-energy-card): every option, every YAML key and how the features work in detail. For a quick start see the [README](https://github.com/stacknoise/detailed-energy-card#readme); you do not need any of this when you set up the card in the visual editor.

## Options

All options are optional unless marked *required*. Everything can be set in the visual editor; the first column of each table shows the text of the field in the editor, and a help text under many fields explains them there. The YAML key is for the code editor. The details of every option are in the sections below the example.

### Card

| Editor field | YAML key | Default | What it does |
| --- | --- | --- | --- |
| – | `type` | – | *Required.* `custom:detailed-energy-card` |
| Title | `title` | none | Heading of the card. |
| Total sensor (optional) | `home.total_entity` | none | Power sensor of the whole home. Gives the self-sufficiency and "Unassigned". |
| Total energy sensor (optional, kWh) | `home.total_energy_entity` | none | Energy counter (kWh) of the whole home, for the energy mode. |
| Power sources | `sources` | none | List of power sources, see *Sources*. |
| Structure | `floors` / `rooms` | none | Floors with their rooms, or rooms without floors, see *Floors and rooms*. Use `floors` **or** `rooms`. |
| Colors | `colors` | theme | Colors and thresholds, see *Colors and thresholds*. |

### `options`

| Editor field | YAML key | Default | What it does |
| --- | --- | --- | --- |
| Unit | `options.unit` | `W` | Unit of the power: `W`, `kW` or `auto`. |
| Decimals (empty: 2, energy: 1) | `options.decimals` | 2 (energy: 1) | Decimals of kW and kWh values, 0 to 20. |
| Animation | `options.animation` | `true` | Moving dashes on the lines (not in the energy mode). |
| Show the list of consumers | `options.show_consumers` | `true` | Show the list of consumers under the diagram. |
| Show only active consumers (1 W or more) | `options.only_active_consumers` | `false` | List only consumers that draw 1 W or more. |
| Show entity IDs | `options.show_entity_ids` | `true` | Show the entity id under the name of a consumer in the list. |
| Show "Unassigned" | `options.show_unassigned` | `true` | Show "Unassigned" (what the consumers do not explain). |
| Show self-consumption (when solar and feed-in are measured) | `options.show_self_consumption` | `true` | Badge *Self-consumption* when it can be computed. |
| Remember selection | `options.remember_selection` | `true` | Remember the selected floor, room, mode, period and view in the browser. |
| Name of the remembered selection | `options.storage_id` | none | Own name for the remembered selection. Only needed for several cards with the same floors and rooms. |
| Wrap many rooms into two rows (instead of scrolling) | `options.wrap_rooms` | `false` | Wrap more than 6 rooms into two rows instead of scrolling. |
| Move the selected floor or room to the middle (the others fade out) | `options.focus_selected` | `false` | The selected floor or room slides to the middle, the others fade out. |
| Compact view | `options.compact` | `false` | Compact view: only sources, home and floors in small circles, no list. |
| Chart shown at start | `options.view` | `tree` | View at start: `tree`, `sankey` or `timeline` (the timeline needs energy sensors). |
| Charts in the switch (a switch appears from two) | `options.views` | only `view` | Views the switch offers, for example `[tree, sankey, timeline]`. A switch appears from two. |
| Start view | `options.mode` | `power` | Start mode: `power` (now) or `energy` (needs an energy sensor). |
| Periods in the switch | `options.energy_periods` | all | Periods of the switch: `today`, `week`, `month`. |
| Second value under the values | `options.secondary_value` | `none` | Small second value under every node: `none`, `auto`, `today`, `power`, `cost`. |
| Savings next to the costs | `options.show_savings` | `false` | Shows what solar and battery saved next to the costs, in the badge and per node (see *Costs*). |
| Hints for implausible values | `options.show_hints` | `false` | A hint under the header when readings do not add up (see *Hints*). Mode *Now*. |
| Last year in the timeline | `options.compare_last_year` | `false` | Week and month: a marker per bar for the same day a year ago and the comparison in the head. |
| Yearly budget (kWh) | `options.year_budget_kwh` | – | A bar with the use since January against the budget (see *Yearly budget*). Mode *Now*. |
| Electricity price (fixed, per kWh) | `options.price` | none | Fixed price per kWh. Switches the costs on. Use `price` **or** `price_entity`. |
| Electricity price sensor (dynamic tariff, per kWh) | `options.price_entity` | none | Price sensor per kWh (dynamic tariff, recorded as statistics). |
| Feed-in compensation (fixed, per kWh) | `options.feed_in_price` | none | Fixed compensation per kWh fed in. Use it **or** `feed_in_price_entity`. |
| Feed-in compensation sensor (per kWh) | `options.feed_in_price_entity` | none | Sensor of the compensation per kWh. |
| Currency (empty: the one of Home Assistant) | `options.currency` | of Home Assistant | Three-letter currency code, for example `EUR`. |
| Show base load | `options.show_base_load` | `false` | Badge *Base load*: the lowest hourly mean of the home between 1 and 5 o'clock in the last 7 nights. |
| Always-on from (W) | `options.standby_watts` | none | Consumers that never fell below this power in the last 24 hours get a symbol. |
| Source mix as a ring around the home | `options.show_source_mix` | `false` | A ring around the home circle shows how much solar, battery and grid contribute to the power delivered, with a legend. |
| Home value in the color of the largest source | `options.home_color_by_source` | `false` | Icon, border and glow of the home circle take the color of the source with the largest share. |
| Battery forecast (full at / lasts until) | `options.show_battery_forecast` | `false` | Under a battery with a state of charge and a capacity: when it is full (charging) or empty (discharging). Mode *Now* only. |
| Split of the solar power | `options.show_solar_split` | `false` | Under the solar source: the percentage of the power that goes into the home, the battery and the grid. Mode *Now* only. |
| Charge bar at the battery | `options.show_battery_bar` | `false` | Under a battery with a state of charge: a bar with the charge; the zones below the discharge limit and above the charge limit are hatched. Mode *Now* only. |
| Origin of the power in the list | `options.show_origin` | `false` | In the consumer list: a ring with the origin of the selected node (solar, battery, grid), every bar split by origin, and the hours with the least grid import. Needs energy counters of at least two kinds of sources. |
| Solar forecast in the timeline | `options.show_pv_forecast` | `false` | A dashed orange line with the forecast of the solar production in the timeline of the running period. Needs a solar forecast in the Energy dashboard. |
| Lines in source colors | `options.lines_by_source` | `false` | The lines of the active paths take the color of the source instead of the threshold color; below the home they run as strands in the mix. Mode *Now* only. |
| Surplus banner | `options.show_surplus` | `false` | A banner while more than `surplus_min_w` watts go into the grid, with what using it at home would save per hour. Mode *Now* only. |
| Surplus from (W) | `options.surplus_min_w` | `500` | The feed-in from which the banner appears; it stays until 80 % of it. |
| Suggest devices in the banner | `options.surplus_devices` | `false` | The banner names up to three idle consumers with a `surplus_w` that the surplus could run. Only with `show_surplus`. |
| Today's values under the diagram | `options.show_day_values` | `false` | Tiles: solar, grid import, feed-in, battery ±, home and self-sufficiency of today. Needs energy counters. Mode *Now* only. |
| Heading "Today so far" | `options.show_day_title` | `true` | `false` hides the heading above the tiles of today; the tiles stay. |

### Sources (`sources[]`)

| Editor field | YAML key | Default | What it does |
| --- | --- | --- | --- |
| Sensor | `entity` | – | *Required.* Power sensor (W, kW or MW). |
| Type | `type` | `generic` | `solar`, `battery`, `grid` or `generic`. |
| Name | `name` | by type | Own name. |
| Icon | `icon` | by type | Own icon. |
| Color | `color` | accent | Own color. |
| Energy sensor (kWh, optional) | `energy_entity` | none | Energy counter (kWh) for the energy mode. |
| Energy sensor of the other direction (feed-in or charged, kWh, optional) | `energy_entity_return` | none | Counter of the other direction (grid feed-in, battery charged); not for `solar`. |
| State of charge (SoC) | `soc_entity` | none | State of charge of a battery, in %. |
| Capacity (kWh) | `capacity_kwh` | none | Usable capacity of a battery in kWh. Needed for `options.show_battery_forecast`. Only for the type `battery`. |
| Discharge limit (%) | `reserve_percent` | none | Battery only: the state of charge below which it does not discharge. A hatched zone in the charge bar, taken into account by the forecast. |
| Charge limit (%) | `max_percent` | 100 | Battery only: the state of charge up to which it charges. Must be above `reserve_percent`. |
| Invert sign | `invert` | `false` | Turn the sign of the sensor around. |
| Tap action (default: select, or details) | `tap_action`, `hold_action`, `double_tap_action` | none | Own actions of this source, see *Actions*; `thresholds` sets own thresholds. |

### Floors and rooms (`floors[]`, `rooms[]`)

| Editor field | YAML key | Default | What it does |
| --- | --- | --- | --- |
| Floor | `floor_id` | – | *Required for a floor.* A floor of Home Assistant; name and icon come from there. An id that is not in Home Assistant is a custom floor: it shows `name` and `icon`. |
| Area (room) | `area_id` | – | *Required for a room.* An area of Home Assistant. An id that is not in Home Assistant is a custom room (`name`, `icon`). |
| Name, Icon (custom floor or room) | `name`, `icon` | id | Only for an id that does not exist in Home Assistant, for example `custom_1`; the editor creates them with *+ Custom room* / *+ Custom floor*. |
| Structure | `rooms` | none | The rooms of a floor. |
| Power sensor (optional) | `entity` | none | Own power meter of the floor or room. Without it the node shows the sum of its children. |
| Energy sensor (optional) | `energy_entity` | none | Own energy counter (kWh) of the floor or room. |
| Color | `color` | accent | Own color. |
| Tap action (default: select, or details) | `tap_action`, `hold_action`, `double_tap_action` | none | Own actions, see *Actions*; `thresholds` sets own thresholds. |
| Consumers | `consumers` | none | The consumers of a room, see below. |

### Consumers (`consumers[]`)

| Editor field | YAML key | Default | What it does |
| --- | --- | --- | --- |
| Power sensor (optional when an energy sensor is set) | `entity` | – | Power sensor. A consumer wants `entity` **or** `energy_entity`, or both; one without any is shown with a warning symbol and "No sensor configured" until you choose a sensor. |
| Energy sensor (kWh, optional) | `energy_entity` | none | Energy counter (kWh). Without `entity` the consumer only shows in the energy mode. |
| Name (optional) | `name` | friendly name | Own name. |
| Icon (only directly under the home) | `icon` | `mdi:flash` | Icon of the node of a consumer that hangs directly under the home. |
| Switch of the consumer | `switch_entity` | none | A `switch`, `input_boolean`, `light` or `fan`: the list shows a toggle at the end of the row. |
| Ask before turning it off | `confirm_switch` | `false` | Ask before the switch is turned off. |
| Tap action (default: select, or details) | `tap_action`, `hold_action`, `double_tap_action` | none | Own actions, see *Actions*; `thresholds` sets own thresholds. |

**Consumers directly under the home.** A consumer that belongs to no floor and no room (lights outside the house, a wallbox) goes into `consumers` on the top level, next to `floors` and `rooms`. It uses the same fields as above, plus `icon` (default `mdi:flash`), and hangs under the home as a node of its own: a dashed pill in the row of the floors, a circle in the row of the rooms when there are no floors. A click opens its dialog (or runs its actions) and does not select anything. It counts in the home, in the Sankey diagram and in the timeline, and the list of the whole home shows it. With a floor selected the list shows that floor only, and with `options.focus_selected` the nodes under the home fade out behind a selected floor. When the row gets too full for the width of the card it scrolls sideways, like many rooms.

### Actions (`tap_action`, `hold_action`, `double_tap_action`)

| Editor field | YAML key | Default | What it does |
| --- | --- | --- | --- |
| Tap action (default: select, or details) | `tap_action` | select, or details | A tap. Without an entry a click selects a floor or room, a source or consumer opens its dialog. |
| Hold action | `hold_action` | none | Pressing for 0.5 seconds. |
| Double tap action | `double_tap_action` | none | Two taps within a quarter of a second. |

Home Assistant standard: `action` is `more-info`, `toggle`, `navigate` (`navigation_path`), `url` (`url_path`), `perform-action` (`perform_action`, `data`, `target`), `call-service` or `none`; `entity` names the entity it acts on; `confirmation: true` asks first. In the editor the action selector of Home Assistant sets all of this.

### Heatmap card (`custom:detailed-energy-heatmap-card`)

| Editor field | YAML key | Default | What it does |
| --- | --- | --- | --- |
| Energy counter of the home (kWh) | `entity` | – | *Required.* Energy counter (kWh) of the home. |
| Number of days (7 to 28) | `days` | 7 | Number of days, 7 to 28. |
| Title | `title` | none | Heading. |
| Electricity price (fixed, per kWh) | `price` | none | Fixed price per kWh for the most expensive hour (else the peak hour is shown). Use `price` **or** `price_entity`. |
| Electricity price sensor (dynamic tariff, per kWh) | `price_entity` | none | Price sensor per kWh. |
| Currency (empty: the one of Home Assistant) | `currency` | of Home Assistant | Three-letter currency code. |

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

The *Self-sufficiency* badge (share of the consumption not drawn from the grid) needs a source of type `grid`; without one, or while a grid sensor is unavailable, the badge is hidden. A second badge, *Self-consumption* (share of the solar production used in the home, not fed into the grid), appears next to it when it can be computed: a solar source that produces and a known feed-in (the negative grid power now, or the grid's `energy_entity_return` in the energy mode). Switch it off with `options.show_self_consumption: false`. On narrow cards the badges wrap. Floors and rooms are not free text: they are picked from the floors and areas that already exist in Home Assistant (`floor_id`, `area_id`); names and icons come from there (an id that does not exist in Home Assistant, e.g. for an off-grid system, is shown with the `name` and `icon` you set; the editor creates such a room or floor with *+ Custom room* / *+ Custom floor*), and the home name is your instance's location name. Options: `options.unit` (`W`, `kW`, `auto`; default `W`), `options.decimals` (0–20, for kW values), `options.animation`, `options.show_unassigned`, `options.show_consumers` (default `true`; `false` hides the list of consumers under the diagram), `options.only_active_consumers` (default `false`; list only consumers that draw 1 W or more, sensors that cannot be read stay listed as warnings), `options.remember_selection` (with `options.storage_id`, a short text, you tell two cards with the same floors and rooms apart, for example a power and an energy view; otherwise they share the selection and the view) and `options.focus_selected` (the selected floor or room slides to the middle under its parent and the others of its level fade out; a click on an element always shows its children, so the home brings all floors back, default off) and `options.wrap_rooms` (wrap more than 6 rooms into two rows instead of scrolling, but only when a single row would be too narrow: less than 80 px per room). **Meters of floors and rooms:** a floor or a room can have its own meter, for example a meter in the distribution board of a floor or a smart plug meter for a whole room: `entity` (power, W) and `energy_entity` (energy, kWh), both optional. With a meter the node shows the measured value and a small meter icon, and the list shows what its consumers miss ("Unassigned in Kitchen"); without one it shows the sum of its children as before. A room with a meter needs no consumers. A consumer needs a power sensor (`entity`), an energy counter (`energy_entity`) or both: with only a counter it is greyed out in the mode *Now* ("No power sensor configured", 0 W, no warning) and counts in the energy mode; with `only_active_consumers` it is hidden in the mode *Now*. When the consumers measure clearly more than the meter (more than 5 % and at least 10 W or 50 Wh), the node shows a warning and the list says by how much. "Unassigned" always belongs to what the list shows: the selected room (only with a room meter), the selected floor (when the floor or one of its rooms has a meter) or the whole home. A sensor can be assigned to one place only, a consumer or a meter (the editor hides sensors that are already taken; the same sensor twice in YAML is a configuration error). Use either `floors` or `rooms` on the top level.

**Negative values:** a consumer that reports a negative value (for example a bidirectional meter) counts as 0 W; only sources can be negative (battery charging, grid feed-in), solar and generic sources are clamped at 0. If a consumer feeds back and you want to see it, add that sensor as a source instead.

**Energy mode (kWh):** **The switch *Now | Today | Week | Month* appears in the card as soon as one element has an energy sensor** (an `energy_entity` on a source, floor, room or consumer, or `home.total_energy_entity`); until then the editor shows a hint under *General*. Besides the power now the card can show how much energy each part used today, this week or this month. Give sources, floors, rooms and consumers an `energy_entity` (a `sensor.*` energy counter with `device_class: energy`, in Wh, kWh or MWh) next to their power `entity`, and optionally `home.total_energy_entity` for "Unassigned" and the self-sufficiency badge. The values come from the long-term statistics of Home Assistant (the sensors need a `state_class` of `total` or `total_increasing`, and the recorder must keep them); the card needs no `utility_meter` helpers. Day, week and month start at midnight in the time zone of Home Assistant, the week on the first weekday of your locale. Lines show the share of the home's consumption instead of a flow, there are no thresholds and no animation in this mode. An element without `energy_entity` is shown as unavailable ("No energy sensor configured"). An energy counter only counts in one direction: give the grid its import counter as `energy_entity` and, optionally, its export counter as `energy_entity_return` (a battery: discharged and charged; also for `generic` sources, not for solar). The node keeps the import as its value and shows the other direction in a small line below ("feed-in 3.8 kWh", "charged 2.4 kWh"); the line follows the balance. Options: `options.mode` (`power` or `energy`, what the card shows when it loads), `options.energy_periods` (a list of `today`, `week`, `month` the switch offers; default all) and `options.secondary_value` (a second, smaller value under every node and in the consumer list: `today` shows the energy of today in the mode *Now*, `power` the power now in the energy mode, `auto` the other value of whichever mode is shown, `cost` the costs, see below; default `none`; a node without a value for the second line leaves it empty instead of showing 0 kWh), `options.view` (`tree`, `sankey` or `timeline`, the chart shown at start) and `options.views` (the charts the view switch offers, e.g. `[tree, sankey, timeline]`; without it there is no switch).

**Base load and standby:** `options.show_base_load: true` adds a badge *Base load 185 W*: the lowest hourly mean of the home's power between 1 and 5 o'clock in the last 7 nights (`home.total_entity`, else the sum of the sources). `options.standby_watts: 5` marks consumers whose hourly mean did not fall below 5 W in the last 24 hours with an infinity symbol ("runs all the time"). Both read the long-term statistics of the power sensors (they need a `state_class: measurement`), once an hour; without statistics, or with less than 20 hours of them for a consumer, nothing is shown. Both are off by default and work in both modes.

**Sources at a glance.** Four options, all off by default and independent of each other. The colors are solar orange, battery pink and grid blue, as in the Energy dashboard of Home Assistant; an own `color` of a source comes first.

- `options.show_source_mix: true` draws a ring around the home circle: each source gets a segment as wide as its share of the power delivered (solar, a discharging battery, grid import; in the energy mode the energy of the period). A legend with the names and percentages sits to the left of the circle. A charging battery and feed-in deliver nothing and are left out. In the compact view only the ring is drawn.
- `options.home_color_by_source: true` colors the home circle (icon, border, glow) like the source with the largest share. The color changes only when another source is at least 5 percentage points ahead, so it does not flicker when two sources are close.
- `options.show_battery_forecast: true` adds a line under a battery: *Full at 17:06* while it charges, *Lasts until 06:06* while it discharges (with the weekday when it is not today; the tooltip says how long). It needs the state of charge (`soc_entity`) and the usable capacity (`capacity_kwh`, in kWh) of that battery and calculates with the power of the moment: the time is a guess that changes with the load. It stays out while the battery is idle (under 20 W), full or empty, and when the time is more than 48 hours away. With `reserve_percent` and `max_percent` it counts only the usable part: down to the discharge limit, up to the charge limit.
- `options.show_solar_split: true` adds a line under the solar source with three percentages and symbols: how much of the power goes into the home, the battery and the grid right now. The tooltip names the powers. The measured flows come first (charging power of the batteries, feed-in), the rest goes into the home, so it works without a sensor for the home. Parts of 0 % and a production under 50 W are left out.

The battery forecast and the split show only in the mode *Now* and not in the compact view. As soon as a source can have such a line, all sources get one line more (also while it is empty), so the diagram does not jump.

```yaml
sources:
  - { entity: sensor.pv_power, type: solar }
  - { entity: sensor.battery_power, type: battery, soc_entity: sensor.battery_soc, capacity_kwh: 10 }
  - { entity: sensor.grid_power, type: grid }
options:
  show_source_mix: true
  home_color_by_source: true
  show_battery_forecast: true
  show_solar_split: true
```

**Origin of the power.** `options.show_origin: true` adds to the list of consumers a ring with legend for the selected room, floor or the home (solar, battery, grid, with percentages and kWh), colors every consumer bar by origin, and a green hint with the three hours of the day in which the home drew the least from the grid (*You draw the least from the grid between 12 and 15 o'clock (on average 9 %). Big loads are best then.*). It works from the hourly statistics of the energy counters (`energy_entity`) of the sources: solar produced, battery discharged, grid drawn; at least two of the three kinds must have a counter. Every hour the home takes its energy from the sources in the share they delivered in that hour, and a node gets that share of its own energy of the hour, so a consumer that runs at noon is mostly solar. The period is today (in the energy mode the chosen period; the best hours are then added up by time of day). Nodes without energy counters have no origin and keep the normal bar. Not in the compact view and not without the list.

**Solar forecast.** `options.show_pv_forecast: true` draws a dashed orange line in the timeline (running period, not in earlier ones): the forecast of the solar production per hour (per day in the week and month view, for the days the forecast reaches). The card asks Home Assistant for the solar forecast of the Energy dashboard (`energy/solar_forecast`: Forecast.Solar, Solcast and others, the forecasts of several entries are added up) and refreshes it every 30 minutes. Without a solar forecast in the Energy dashboard nothing is drawn and the timeline stays as it is. The line has its own scale with the bars, so it shows when a lot of solar power is coming in comparison with what the rooms use; a legend entry names it.

**Charge bar.** `options.show_battery_bar: true` draws a small bar under a battery with a readable state of charge (`soc_entity`): the filled part is the charge, the tooltip says the percentage. `reserve_percent` (discharge limit) and `max_percent` (charge limit) of the battery source mark the zones it does not use as hatched areas at the start and at the end of the bar. The bar sits in the line under the battery, next to the forecast when that is on, and uses the same extra line as the other notes. Mode *Now* only, not in the compact view.

**Overview.** Three more options, all off by default and independent of each other. They work in the mode *Now* and not in the compact view (the colored lines also work there).

- `options.lines_by_source: true` colors the lines of the active paths like the sources: the line from a source has its color, and below the home the lines run as thin strands side by side, one per source, as wide as its share in the mix. With only one source delivering, the lines below the home have its color. Idle and unselected lines stay muted, and thresholds apply as before while the option is off.
- `options.show_surplus: true` shows a banner while more than `options.surplus_min_w` watts (default 500) go into the grid: *3.40 kW surplus. Goes into the grid.* With `price` or `price_entity` it adds what using the power at home saves per hour: the price per kWh minus the feed-in compensation (`feed_in_price` or `feed_in_price_entity`, if set), times the power. The banner stays until the feed-in falls below 80 % of the limit, so it does not flicker.
- `options.surplus_devices: true` adds a line *Start now?* to the surplus banner with up to three consumers that are idle (under 10 W) and whose typical power fits into the surplus, the biggest first. A consumer needs `surplus_w`, the power in watts it draws while running (for example `2000` for a dishwasher). A consumer with a `switch_entity` shows as a button that turns it on.
- `options.show_day_values: true` adds tiles with the values of today under the diagram: solar produced, drawn from the grid, fed in (with `energy_entity_return` on the grid), battery charged and discharged (with `energy_entity_return` on the battery), home consumption and self-sufficiency. A tile whose counter is missing is left out. It needs energy counters (`energy_entity`) and loads the statistics of today every 5 minutes, like the second value.

```yaml
options:
  lines_by_source: true
  show_surplus: true
  surplus_min_w: 800
  surplus_devices: true   # optional: suggest idle consumers that have surplus_w
  show_day_values: true
  show_day_title: false   # optional: hide the heading "Today so far"
  price: 0.31
  feed_in_price: 0.08
```

**Browsing:** in the energy mode the arrows ‹ › next to the period buttons go back to earlier days, weeks and months and forward again up to the running one; the card then names the period ("Yesterday", "Mon 19.10.", "KW 43", "September"). Values, costs and all views follow; the timeline compares a finished period with the whole period before it. The position is not remembered.

**Sankey diagram:** `view: sankey` draws the flow as bands: sources → floors (without floors: rooms) and *Unassigned* → rooms → the consumers of the selected room. The band width is the energy (in the mode *Now* the power, and the bands slide to their new places). A click on a floor shows only its rooms (a second click shows all floors again), a click on a room its consumers, a click on a source or consumer opens its dialog. The card only knows how much each source delivers and each part uses, not which source supplied which floor, so every source supplies every floor in the same share it supplies the home (the tooltip says so). Feed-in and battery charging are nodes of their own below the floors; the solar and generic sources feed them first. No energy sensor is needed. The selection and the list below follow the tree.

**Timeline:** stacked bars per hour of today (also in the mode *Now*) or per day of the week or month, with the previous day, week or month as a dashed outline. The bars are stacked by the level below the selection: the floors of the home, the rooms of a floor, the consumers of a room. Click a legend entry to go one level down and the path in the head to go back. Above the chart: what was used so far, the change against the previous period up to the same time, and the largest bar. It needs energy sensors; without them the card stays on the tree.

**Costs:** set `options.price` (a fixed price per kWh) or `options.price_entity` (a price sensor of a dynamic tariff such as Tibber; it must be recorded as statistics, `state_class: measurement`), optionally `options.feed_in_price` or `options.feed_in_price_entity` for the compensation of the feed-in and `options.currency` (default the currency of Home Assistant). The costs need an energy counter on the grid. Only energy from the grid costs money: for every hour the card takes the grid import over the consumption of the home as the grid share, and every node pays its energy of that hour times that share times the price of that hour; solar and battery energy cost nothing, the feed-in is paid separately. A badge shows "Costs 3.84 € · Compensation 1.20 €" for the shown period (in the mode *Now* for today). When Home Assistant keeps the cost statistics of the Energy dashboard (`<grid counter>_cost`, `<export counter>_compensation`) the badge takes those amounts. Its tooltip names what the battery charged from the grid, and "≈" marks an amount when the price was missing for more than 3 hours (missing hours use the last known price). With `options.secondary_value: cost` every node shows its costs; the tooltip of that line gives the energy and the part from the grid. Prices are hourly means: with quarter-hour prices the amounts are close, not exact.

**Savings:** `options.show_savings: true` adds, next to the costs, what solar and battery saved: the energy of a node that did not come from the grid, times the price of the hour. It shows in the cost badge (*Costs 3.84 € · Saved 2.10 €*) and, with `secondary_value: cost`, under every floor, room and consumer (*0.18 € · saved 0.32 €*); the tooltip explains it. Needs a price and a grid energy counter like the costs.

**Own tariff per grid meter:** a grid source can have its own price, `price` (per kWh) or `price_entity` (a price sensor), for example a heat pump meter with a cheaper tariff. It replaces `options.price` for the energy of that meter; with a tariff on every grid meter the general price can be left out. The costs of a node use the mean price of an hour weighted by what each meter delivered in it, and the badge adds up the meters. Only for `type: grid`.

```yaml
sources:
  - { entity: sensor.grid_power, energy_entity: sensor.grid_energy, type: grid, price_entity: sensor.tariff_household }
  - { entity: sensor.hp_power, energy_entity: sensor.hp_energy, type: grid, price: 0.22 }   # heat pump tariff
```

**Difference consumers:** `minus_entities` (power sensors, W) and `minus_energy_entities` (energy counters, kWh) on a consumer take the listed sensors off its value: a power strip minus the devices on it, or a room meter minus the rooms with their own meter. The value is never below 0, a sensor that cannot be read is left out. The energy counters are taken off hour by hour in the timeline and in the costs.

```yaml
consumers:
  - name: Rest of the workshop
    entity: sensor.workshop_power
    energy_entity: sensor.workshop_energy
    minus_entities: [sensor.saw_power]
    minus_energy_entities: [sensor.saw_energy]
```

**Hints:** `options.show_hints: true` shows a line under the header in the mode *Now* when readings do not add up: the sources deliver much more or less than the home uses (more than 400 W and 30 % off: a wrong sign or a missing source), rooms and consumers measure clearly more than the home meter (a device counted twice), or a source cannot be read.

**Yearly budget:** `options.year_budget_kwh: 4000` shows under the diagram (mode *Now*, needs energy counters) a bar with the use since the first of January against the budget, a mark for the straight pace through the year, and a projection for the whole year. The bar turns orange when the use is more than 5 % above the pace.

**Last year:** `options.compare_last_year: true` adds in the timeline of a week and a month a marker per bar for the same day a year ago (the same week or month), a legend entry and, in the head, the change of the days that are over against the same days of the last year. It needs statistics that reach back a year; without them it stays out.

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

**Compact view:** `options.compact: true` shows only the diagram of sources, home and floors (without floors: the rooms) in smaller circles (40 instead of 56 px) and floor pills with the value under the name, so it fits a narrow card or the corner of a dashboard. There is no consumer list, no view switch (the card draws the tree) and no selection (`focus_selected` is ignored); the mode switch *Now | Today | Week | Month*, the badges and the second value stay. A click on a node opens the dialog of its sensor: a source its power sensor, a floor or room its own meter (a floor or room without a meter does nothing); `tap_action`, `hold_action` and `double_tap_action` still replace that. The card reports less height to the dashboard (`getCardSize` 4 instead of 8, a minimum of 4 columns instead of 6).

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

## 3D card

The same file brings a third card, `custom:detailed-energy-3d-card` (**Add card → Detailed Energy 3D**, with its own visual editor, no second installation): the home as floors in an isometric view. It is opt-in: nothing changes on the energy card, and the 3D card only exists where you add it.

```yaml
type: custom:detailed-energy-3d-card
title: Haus
house:
  cols: 12          # grid of the house, default 12 x 6, the same for all floors
  rows: 6
sources:
  - { entity: sensor.pv_leistung, type: solar }
  - { entity: sensor.akku_leistung, type: battery }
  - { entity: sensor.netz_leistung, type: grid }
floors:
  - floor_id: erdgeschoss
    rooms:
      - area_id: kueche
        layout: { x: 0, y: 0, w: 6, h: 3 }   # column, row, width, height in cells
        consumers:
          - entity: sensor.backofen_power
      - area_id: wohnzimmer
        layout: { x: 6, y: 0, w: 6, h: 3 }
options:
  lines_by_source: true
```

### What it reads

The configuration is that of the energy card (`sources`, `floors` or `rooms`, `consumers`, `colors`, `options`, actions) plus two keys. The numbers are the same as in the energy card (same readers, units and thresholds), and the structure comes from your floors and areas. You can copy `sources`, `floors`, `rooms` and `consumers` from an energy card and add only the layout.

| Editor field | YAML key | Default | What it does |
| --- | --- | --- | --- |
| – | `type` | – | *Required.* `custom:detailed-energy-3d-card` |
| Columns, Rows (grid of the house) | `house.cols`, `house.rows` | 12, 6 | Size of the grid in cells (up to 40). One cell is 12.5 units wide in the picture; all floors have the same grid. The editor does not let you make it smaller than the rooms need. |
| Column, Row, Width, Height (of a room) | `layout.x`, `layout.y`, `layout.w`, `layout.h` on a room | automatic | Position and size of a room on the grid, in whole cells, counted from the top left (`x` from 0 to `cols - 1`, `y` from 0 to `rows - 1`). Rooms must not overlap within a floor; a room that does not fit on the grid is left out of the picture. Without `layout` the card places the room by itself; three rooms on a floor give the layout of the mock. The energy card ignores `layout`. |

Floors are stacked from the bottom up by the `level` of the floors in Home Assistant; when a floor has no level, the order of the configuration decides (the first floor is the lowest). A floor-less configuration (`rooms` only) is drawn as one floor.

Of `options` the card reads `unit`, `decimals`, `animation`, `lines_by_source`, `show_consumers`, `only_active_consumers`, `show_entity_ids`, `show_unassigned`, `remember_selection` and `storage_id`; the editor shows exactly these under *General*. The other options of the energy card (energy mode, costs, views, compact and so on) have no effect here. Colors and thresholds work as on the energy card: `colors.thresholds` and `colors.level_thresholds` set the color and width of a flow line, and with `options.lines_by_source` the lines take the colors of their sources instead. A configuration with an overlapping layout, a layout outside the grid or fractions is reported with the path of the field, like any other configuration error.

### Reading the picture

- Solar sits on the roof, the grid is the pole in front, the battery and other sources are a box on the ground. A riser to the right of the house feeds the floors. The card does not know which source feeds which floor, so the split is proportional, like in the Sankey diagram.
- Each floor and each room shows its name and power. Below 500 px of card width the room labels are left out and the list below carries the values; the floor values stay.
- A tap on a floor or room selects it and fades the rest out; a tap on the selection clears it. Hold and double tap run the `hold_action` and `double_tap_action` of the element (see *Actions*); with a double tap action the tap waits a moment to tell the two apart. The selection is remembered under its own prefix, so the energy card keeps its own.
- Floors and rooms are buttons for the keyboard (Tab, Enter or Space) with an `aria-label` of name and value. The list below the picture is the text alternative.
- The flow lines move only with `options.animation` (on by default), not with *reduce motion* set in the system, and not while the card is out of view.

### Editor

The editor of the 3D card has, from the top: the floor plan with a tab per floor, the form for the selected room, the grid size, a live preview of the card, and below it the editor of the energy card with the sections the 3D card has (*General*, *Colors*, *Home*, *Sources*, *Structure*; the import wizard is left out).

- **Add a room:** drag on a free area of the floor plan. The editor asks for the Home Assistant area (areas of the floor come first), or you make a custom room with a name.
- **Move or resize:** drag a room, or drag the dot at its bottom right corner. A position that would overlap another room or leave the grid is refused and the last valid state stays.
- **Keyboard and form:** Tab selects a room, the arrow keys move it, Shift plus arrow keys resize it, Delete removes it. The form has fields for column, row, width and height and, for custom rooms, the name.
- **Rooms without a position** are listed under *Not on the grid yet*; one click puts a room on the first free spot.
- Deleting a room that has consumers asks you to click a second time.

Dev page: `?card=house` with the scenarios `house` (own layouts), `house-auto` (automatic layout), `house-actions` and `house-invalid`; add `&editor=1` for the editor.

## Navigating the card



## Import from the Energy dashboard

The button *Import from Energy dashboard* at the top of the editor proposes the structure of the card from what you already set up in Home Assistant's Energy dashboard, in three steps: *Sources* (grid, solar and battery with their counters, and a power sensor each: the one of the dashboard, or the only one at the same device, otherwise you choose), *Structure* (floors, rooms and devices by their areas; tick or untick on every level, rename a device, put it into another room; devices without an area are off by default, external statistics are shown but cannot be taken over) and *Preview* (a live card, *Now* or *Today*). A device that is part of another one (`included_in_stat`) sits under its parent: the parent becomes the meter of the room when the whole family is in that room, otherwise its parts are off by default, so nothing is counted twice. Devices need no power sensor in the card any more: a consumer with only an energy counter shows in the energy mode and is greyed out in the mode *Now*. When the card already has a structure you choose: *Replace* (new sources, floors and rooms; title, colors and options stay) or *Add what is missing* (existing entries stay as they are, they only get the energy counter the dashboard knows for their power sensor). Gas and water are not electricity and are left out. A device that the dashboard also lists as a "grid" source (a common way to give a plug a price) is offered as a device only, so it is not counted twice. Areas without a floor can only be shown when no floors are used.
