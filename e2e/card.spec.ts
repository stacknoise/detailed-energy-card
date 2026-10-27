import { expect, test, type Page } from "@playwright/test";

const open = async (page: Page, scenario: string) => {
  await page.goto(`/dev/index.html?scenario=${scenario}`);
  // registries are loaded asynchronously; names replace the ids once they arrive
  await expect(page.locator("detailed-energy-card .path")).not.toHaveText("");
};
const node = (page: Page, title: string) => page.locator(`detailed-energy-card button.node[title="${title}"]`);

test("floors: shows sources, floors, rooms and the consumer list", async ({ page }) => {
  await open(page, "floors");
  await expect(page.locator("detailed-energy-card h2")).toHaveText("Energiefluss");
  await expect(page.locator("detailed-energy-card .badge:not(.self)")).toContainText("Autarkie 92 %");
  await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause › EG");
  for (const t of ["PV", "Batterie", "Netz", "EG", "OG", "Keller", "Küche", "Wohnzimmer", "Flur"]) {
    await expect(node(page, t)).toBeVisible();
  }
  await expect(page.locator("detailed-energy-card .detail .row").first()).toContainText("Backofen");
  await expect(page.locator("detailed-energy-card .detail-head")).toContainText("6 Verbraucher");
});

test("floors: choosing a floor swaps the room row", async ({ page }) => {
  await open(page, "floors");
  await node(page, "OG").click();
  await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause › OG");
  await expect(node(page, "Bad")).toBeVisible();
  await expect(page.locator("detailed-energy-card .circle.room.selected")).toHaveCount(1); // OG has one room
  await expect(node(page, "Küche")).toHaveCount(0);
});

test("opening a floor selects all of its rooms", async ({ page }) => {
  await open(page, "floors");
  await expect(page.locator("detailed-energy-card .circle.room.selected")).toHaveCount(3);
  await node(page, "Küche").click(); // narrow down to one room ...
  await node(page, "OG").click();
  await node(page, "EG").click(); // ... opening a floor again selects all of its rooms
  await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause › EG");
  await expect(page.locator("detailed-energy-card .circle.room.selected")).toHaveCount(3);
  await expect(page.locator("detailed-energy-card .detail-head")).toContainText("6 Verbraucher");
});

test("choosing a room selects just that room, clicking it again selects all again", async ({ page }) => {
  await open(page, "floors");
  await node(page, "Küche").click();
  await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause › EG › Küche");
  await expect(page.locator("detailed-energy-card .circle.room.selected")).toHaveCount(1);
  await expect(page.locator("detailed-energy-card .detail-head")).toContainText("4 Verbraucher");
  await node(page, "Flur").click();
  await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause › EG › Flur");
  await node(page, "Flur").click();
  await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause › EG");
  await expect(page.locator("detailed-energy-card .circle.room.selected")).toHaveCount(3);
  await expect(page.locator("detailed-energy-card .detail-head")).toContainText("6 Verbraucher");
});

test("flat without floors: rooms hang directly under the home", async ({ page }) => {
  await open(page, "flat");
  await expect(page.locator("detailed-energy-card button.node[title=EG]")).toHaveCount(0);
  await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause");
  await expect(page.locator("detailed-energy-card .circle.room")).toHaveCount(5);
  await expect(page.locator("detailed-energy-card .circle.room.selected")).toHaveCount(5);
  await expect(node(page, "Balkon-PV")).toBeVisible();
});

test("many rooms scroll horizontally by default", async ({ page }) => {
  await open(page, "many");
  const scroll = page.locator("detailed-energy-card .scroll");
  const [sw, cw] = await scroll.evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(sw).toBeGreaterThan(cw);
});

test("many rooms wrap into two rows when enabled", async ({ page }) => {
  await open(page, "wrap");
  const scroll = page.locator("detailed-energy-card .scroll");
  const [sw, cw] = await scroll.evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw);
  const tops = await page.locator("detailed-energy-card .circle.room").evaluateAll((els) =>
    [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))],
  );
  expect(tops).toHaveLength(2);
});

test("wrapping rooms is skipped when a single row has enough room", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/dev/index.html?scenario=wrap&width=1200");
  await expect(page.locator("detailed-energy-card .circle.room").first()).toBeVisible();
  const tops = await page.locator("detailed-energy-card .circle.room").evaluateAll((els) =>
    [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))],
  );
  expect(tops).toHaveLength(1);
});

test.describe("energy mode", () => {
  // a fixed clock keeps the length of "week" and "month" (and so the numbers of the dev stub) the same on every day
  const fixClock = (page: Page) =>
    page.addInitScript(() => {
      const Real = Date;
      const fixed = new Real("2026-10-13T12:00:00Z").getTime();
      class Fake extends Real {
        constructor(...args: unknown[]) {
          if (args.length) super(...(args as [string]));
          else super(fixed);
        }
        static now() {
          return fixed;
        }
      }
      (window as unknown as { Date: unknown }).Date = Fake;
    });
  const mode = (page: Page, label: string) => page.locator("detailed-energy-card .modes button", { hasText: label });
  const value = (page: Page, title: string) => node(page, title).locator(".value, .pill small").first();

  test("shows the energy of the period in kWh and the switch for the views", async ({ page }) => {
    await fixClock(page);
    await open(page, "energy");
    await expect(mode(page, "Jetzt")).toBeVisible();
    await expect(mode(page, "Heute")).toHaveAttribute("aria-pressed", "true");
    await expect(value(page, "PV")).toHaveText("12,4 kWh");
    await expect(page.locator("detailed-energy-card .badge:not(.self)")).toContainText("Autarkie 74 %");
    await expect(node(page, "EG").locator("small")).toHaveText("11,8 kWh");
    // no animation and no threshold colors in the energy mode
    await expect(page.locator("detailed-energy-card path.line.flowing")).toHaveCount(0);
    // the coffee machine has no energy sensor
    await expect(page.locator("detailed-energy-card .detail .row", { hasText: "Kaffeemaschine" })).toContainText("Kein Energiesensor konfiguriert");
  });

  test("switches between now, today, week and month", async ({ page }) => {
    await fixClock(page);
    await open(page, "energy");
    await expect(value(page, "PV")).toHaveText("12,4 kWh");
    await mode(page, "Woche").click();
    await expect(mode(page, "Woche")).toHaveAttribute("aria-pressed", "true");
    await expect(value(page, "PV")).toHaveText("24,8 kWh");
    await mode(page, "Monat").click();
    await expect(value(page, "PV")).toHaveText("161,2 kWh");
    await mode(page, "Jetzt").click();
    await expect(mode(page, "Jetzt")).toHaveAttribute("aria-pressed", "true");
    await expect(value(page, "PV")).toHaveText("3,42 kW");
    await expect(page.locator("detailed-energy-card path.line.flowing").first()).toBeAttached();
  });

  test("remembers the view", async ({ page }) => {
    await fixClock(page);
    await open(page, "energy");
    await mode(page, "Woche").click();
    await expect(value(page, "PV")).toHaveText("24,8 kWh");
    await page.reload();
    await expect(mode(page, "Woche")).toHaveAttribute("aria-pressed", "true");
    await expect(value(page, "PV")).toHaveText("24,8 kWh");
  });

  test("loads again when the card is detached while the statistics are on their way", async ({ page }) => {
    await open(page, "energy");
    await page.evaluate(() => {
      const el = document.querySelector("detailed-energy-card") as unknown as {
        _hass: { callWS(m: { type: string }): Promise<unknown> };
        _config: object;
        setConfig(c: object): void;
      };
      const w = window as unknown as { __stat: number };
      w.__stat = 0;
      const orig = el._hass.callWS.bind(el._hass);
      // the first request never answers, like one that was cut off by moving the card
      el._hass.callWS = (m) => (m.type.startsWith("recorder") && ++w.__stat === 1 ? new Promise(() => {}) : orig(m));
      el.setConfig(el._config);
      const host = el as unknown as HTMLElement;
      host.remove();
      document.body.appendChild(host);
    });
    await expect(page.locator("detailed-energy-card .modes .status")).toHaveCount(0);
    await expect(value(page, "PV")).toHaveText("12,4 kWh");
    expect(await page.evaluate(() => (window as unknown as { __stat: number }).__stat)).toBe(2);
  });

  test("says so when the statistics cannot be loaded", async ({ page }) => {
    await page.goto("/dev/index.html?scenario=energy&energyError=1");
    await expect(page.locator("detailed-energy-card .modes .status.warn")).toHaveText("Energiedaten nicht verfügbar");
  });

  test("the view switch only appears with two views or more, and the view is remembered", async ({ page }) => {
    await fixClock(page);
    await open(page, "energy");
    // only the tree by default: no view switch, the mode switch looks as before
    await expect(page.locator("detailed-energy-card .views")).toHaveCount(0);
    await expect(page.locator("detailed-energy-card .switches")).toHaveCount(0);
    const offerTimeline = () =>
      page.evaluate(() => {
        const el = document.querySelector("detailed-energy-card") as unknown as { _config: { options?: object }; setConfig(c: object): void };
        el.setConfig({ ...el._config, options: { ...el._config.options, views: ["tree", "timeline"] } });
      });
    await offerTimeline();
    // options.views offers both: the switch shows them, the tree first
    const view = (label: string) => page.locator(`detailed-energy-card .views button[aria-label="${label}"]`);
    await expect(view("Baum")).toHaveAttribute("aria-pressed", "true");
    await view("Verlauf").click();
    await expect(view("Verlauf")).toHaveAttribute("aria-pressed", "true");
    await expect(mode(page, "Heute")).toHaveAttribute("aria-pressed", "true");
    // the view is stored with mode and period and comes back with the next configuration
    await offerTimeline();
    await expect(view("Verlauf")).toHaveAttribute("aria-pressed", "true");
  });

  test("floors and rooms with their own meter show the metered value and what their consumers miss", async ({ page }) => {
    await fixClock(page);
    await open(page, "meters");
    const row = (text: string) => page.locator("detailed-energy-card .detail .row", { hasText: text });
    // EG: the meter of the distribution board, its list shows what all consumers of the floor miss
    await expect(node(page, "EG").locator("small")).toHaveText("12,6 kWh");
    await expect(row("Nicht erfasst in EG")).toContainText("0,8 kWh");
    await expect(node(page, "EG").locator(".meter")).toHaveCount(1);
    // the kitchen meter: 9,1 kWh against 8,7 kWh of consumers
    await expect(value(page, "Küche")).toHaveText("9,1 kWh");
    await expect(node(page, "Küche").locator(".meter")).toHaveCount(1);
    await expect(node(page, "Flur").locator(".meter")).toHaveCount(1);
    await node(page, "Küche").click();
    await expect(row("Nicht erfasst in Küche")).toContainText("0,4 kWh");
    // a room without a meter has no "Unassigned" row (and no longer the one of the home)
    await node(page, "Wohnzimmer").click();
    await expect(row("Nicht erfasst")).toHaveCount(0);
    await expect(node(page, "Wohnzimmer").locator(".meter")).toHaveCount(0);
    // the power mode uses the power meters: the hall has none, so it shows its sum without a mark
    await mode(page, "Jetzt").click();
    await expect(value(page, "Küche")).toHaveText("1,40 kW");
    await expect(node(page, "Flur").locator(".meter")).toHaveCount(0);
    await node(page, "Küche").click();
    await expect(row("Nicht erfasst in Küche")).toContainText("0,15 kW");
  });

  test("a meter that measures less than its consumers is marked and explained", async ({ page }) => {
    await fixClock(page);
    await open(page, "meters");
    await page.evaluate(() => {
      const el = document.querySelector("detailed-energy-card") as unknown as { hass: { states: Record<string, unknown> } & object };
      const hass = el.hass ?? (el as unknown as { _hass: { states: Record<string, unknown> } })._hass;
      const states = { ...hass.states, "sensor.kueche_zaehler": { state: "1000", attributes: { unit_of_measurement: "W", device_class: "power" } } };
      el.hass = { ...hass, states };
    });
    await mode(page, "Jetzt").click();
    await node(page, "Küche").click();
    await expect(node(page, "Küche").locator(".meter.warn")).toHaveCount(1);
    await expect(page.locator("detailed-energy-card .detail .row.excess")).toContainText("Verbraucher messen 0,25 kW mehr als der Zähler");
  });

  test("the second value shows the energy of today in the power mode and the power now in the energy mode", async ({ page }) => {
    await fixClock(page);
    await open(page, "secondary");
    const second = (title: string) => node(page, title).locator(".second");
    await expect(mode(page, "Jetzt")).toHaveAttribute("aria-pressed", "true");
    // power mode: the energy of today below the power
    await expect(value(page, "PV")).toHaveText("3,42 kW");
    await expect(second("PV")).toHaveText("heute 12,4 kWh");
    await expect(second("EG")).toHaveText("heute 11,8 kWh");
    await expect(second("Küche")).toHaveText("heute 8,7 kWh");
    await expect(page.locator("detailed-energy-card .home-second")).toHaveText("heute 19,5 kWh");
    await node(page, "Küche").click();
    const row = (text: string) => page.locator("detailed-energy-card .detail .row", { hasText: text });
    await expect(row("Backofen").locator(".val2")).toHaveText("heute 4,2 kWh");
    // no energy sensor: the line stays empty instead of 0 kWh
    await expect(row("Kaffeemaschine").locator(".val2")).toHaveText("");
    // energy mode: the other way round, with the decimals of the options
    await mode(page, "Heute").click();
    await expect(value(page, "PV")).toHaveText("12,4 kWh");
    await expect(second("PV")).toHaveText("jetzt 3,42 kW");
    await expect(row("Backofen").locator(".val2")).toHaveText("jetzt 0,82 kW");
    await expect(row("Kaffeemaschine").locator(".val2")).toHaveText("jetzt 0 W");
  });

  test("without the option there is no second line", async ({ page }) => {
    await fixClock(page);
    await open(page, "energy");
    await expect(value(page, "PV")).toHaveText("12,4 kWh");
    await expect(page.locator("detailed-energy-card .second")).toHaveCount(0);
    await expect(page.locator("detailed-energy-card .list.second")).toHaveCount(0);
  });

  test("grid and battery show the other direction, and the self-consumption appears", async ({ page }) => {
    await fixClock(page);
    await open(page, "feedin");
    await expect(value(page, "Netz")).toHaveText("5,1 kWh");
    await expect(node(page, "Netz").locator(".back")).toHaveText("Einspeisung 3,8 kWh");
    await expect(node(page, "Netz").locator(".label")).toHaveText("Netz · Bezug");
    await expect(node(page, "Batterie").locator(".back")).toHaveText("geladen 2,4 kWh");
    // solar has no other direction: an empty line keeps the row aligned
    await expect(node(page, "PV").locator(".back")).toHaveText("");
    await expect(page.locator("detailed-energy-card .badge:not(.self)")).toHaveText("Autarkie 74 %");
    // (12,4 - 3,8) / 12,4 = 69 %
    await expect(page.locator("detailed-energy-card .badge.self")).toHaveText("Eigenverbrauch 69 %");
    // the power mode has no line for the other direction
    await mode(page, "Jetzt").click();
    await expect(page.locator("detailed-energy-card .back")).toHaveCount(0);
  });

  test("the self-consumption badge can be switched off and wraps on a narrow card", async ({ page }) => {
    await fixClock(page);
    await page.setViewportSize({ width: 360, height: 900 });
    await open(page, "feedin");
    const [a, b] = [page.locator("detailed-energy-card .badge:not(.self)"), page.locator("detailed-energy-card .badge.self")];
    await expect(b).toBeVisible();
    const boxA = (await a.boundingBox())!;
    const boxB = (await b.boundingBox())!;
    expect(boxB.y).toBeGreaterThan(boxA.y + boxA.height - 1);
    await page.evaluate(() => {
      const el = document.querySelector("detailed-energy-card") as unknown as { _config: { options?: object }; setConfig(c: object): void };
      el.setConfig({ ...el._config, options: { ...el._config.options, show_self_consumption: false } });
    });
    await expect(b).toHaveCount(0);
    await expect(a).toBeVisible();
  });

  test("the timeline stacks the hours of today by the level below the selection, yesterday dashed", async ({ page }) => {
    await fixClock(page);
    await open(page, "timeline");
    const views = (label: string) => page.locator(`detailed-energy-card .views button[aria-label="${label}"]`);
    await expect(views("Verlauf")).toHaveAttribute("aria-pressed", "true");
    const legend = page.locator("detailed-energy-card .legend-item");
    const kpis = page.locator("detailed-energy-card .kpi span");
    // the largest floor is selected: its rooms are stacked (the hall has no energy counter of its own but a consumer with one)
    await expect(legend).toHaveText(["Küche", "Wohnzimmer", "Flur", "gestern"]);
    await expect(kpis.nth(0)).toHaveText(/^heute bis \d\d Uhr$/);
    await expect(kpis.nth(1)).toHaveText(/^ggü\. gestern bis \d\d Uhr$/);
    await expect(kpis.nth(2)).toHaveText(/^Spitze \d\d–\d\d Uhr$/);
    await expect(page.locator("detailed-energy-card .chart rect.part").first()).toBeVisible();
    await expect(page.locator("detailed-energy-card .chart rect.prev").first()).toBeAttached();
    // a day has 24 hours (or 23 / 25): one bar per hour so far, the rest of the day is empty
    await expect(page.locator("detailed-energy-card .chart .now")).toHaveCount(1);
    // one level down: the consumers of the kitchen, the coffee machine has no counter
    await legend.filter({ hasText: "Küche" }).click();
    await expect(legend).toHaveText(["Backofen", "Spülmaschine", "Kühlschrank", "gestern"]);
    await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause › EG › Küche");
    // the path goes back up
    await page.locator("detailed-energy-card .path .crumb", { hasText: "EG" }).click();
    await expect(legend).toHaveText(["Küche", "Wohnzimmer", "Flur", "gestern"]);
    await page.locator("detailed-energy-card .path .crumb", { hasText: "Zuhause" }).click();
    await expect(legend).toHaveText(["EG", "OG", "Keller", "gestern"]);
  });

  test("the timeline of a week has a bar per day and compares with last week", async ({ page }) => {
    await fixClock(page);
    await open(page, "timeline");
    await mode(page, "Woche").click();
    const kpis = page.locator("detailed-energy-card .kpi span");
    await expect(kpis.nth(0)).toHaveText("diese Woche bis jetzt");
    await expect(kpis.nth(1)).toHaveText("ggü. Vorwoche bis jetzt");
    await expect(page.locator("detailed-energy-card .chart text.axis", { hasText: /^(Mo|Di|Mi|Do|Fr|Sa|So)\.?$/ })).toHaveCount(7);
    // the mode Now has no live timeline: it shows today
    await mode(page, "Jetzt").click();
    await expect(kpis.nth(0)).toHaveText(/^heute bis/);
    // back to the tree
    await page.locator('detailed-energy-card .views button[aria-label="Baum"]').click();
    await expect(page.locator("detailed-energy-card .graph")).toBeVisible();
    await expect(page.locator("detailed-energy-card .timeline")).toHaveCount(0);
  });

  test("without energy sensors the timeline is not offered and the card shows the tree", async ({ page }) => {
    await open(page, "floors");
    await page.evaluate(() => {
      const el = document.querySelector("detailed-energy-card") as unknown as { _config: { options?: object }; setConfig(c: object): void };
      el.setConfig({ ...el._config, options: { ...el._config.options, view: "timeline", views: ["tree", "timeline"] } });
    });
    await expect(page.locator("detailed-energy-card .graph")).toBeVisible();
    await expect(page.locator("detailed-energy-card .views")).toHaveCount(0);
  });

  test("the base load shows as a badge and consumers that run all the time get a symbol", async ({ page }) => {
    await fixClock(page);
    await open(page, "standby");
    await expect(page.locator("detailed-energy-card .badge.base")).toHaveText(/^Grundlast 185\sW$/);
    await expect(page.locator("detailed-energy-card .badge.base")).toHaveAttribute("title", /1 und 5 Uhr/);
    await node(page, "Küche").click();
    // only the fridge never fell below 5 W
    await expect(page.locator("detailed-energy-card .detail .row .standby")).toHaveCount(1);
    await expect(page.locator("detailed-energy-card .detail .row", { hasText: "Kühlschrank" }).locator(".standby")).toHaveAttribute("title", /^läuft dauerhaft \(mindestens 5\sW/);
  });

  test("without the options there is no base load and no symbol", async ({ page }) => {
    await open(page, "floors");
    await expect(page.locator("detailed-energy-card .badge.base")).toHaveCount(0);
    await expect(page.locator("detailed-energy-card .standby")).toHaveCount(0);
  });

  test.describe("actions and switches", () => {
    type Win = { __calls: Array<{ domain: string; service: string; data?: { entity_id?: string }; target?: unknown }>; __info?: string[] };
    const calls = (page: Page) => page.evaluate(() => (window as unknown as Win).__calls);
    const opened = (page: Page) => page.evaluate(() => (window as unknown as Win).__info ?? []);
    const start = async (page: Page) => {
      await page.goto("/dev/index.html?scenario=actions");
      await expect(page.locator("detailed-energy-card .path")).not.toHaveText("");
      await page.evaluate(() => {
        const w = window as unknown as Win;
        document.addEventListener("hass-more-info", (e) => (w.__info ??= []).push((e as CustomEvent).detail.entityId));
      });
    };

    test("a tap does what the element's tap action says, and the default stays for the others", async ({ page }) => {
      await start(page);
      await node(page, "PV").click();
      await expect.poll(() => page.evaluate(() => location.pathname)).toBe("/dev-target");
      expect(await opened(page)).toEqual([]);
      // the battery has no action: its click still opens the dialog
      await node(page, "Batterie").click();
      expect(await opened(page)).toEqual(["sensor.akku"]);
    });

    test("holding runs the hold action and not the tap", async ({ page }) => {
      await start(page);
      const box = (await node(page, "PV").boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(650);
      await page.mouse.up();
      expect(await opened(page)).toEqual(["sensor.soc"]);
      expect(await page.evaluate(() => location.pathname)).not.toBe("/dev-target");
      // a short press afterwards is a tap again
      await page.mouse.down();
      await page.mouse.up();
      await expect.poll(() => page.evaluate(() => location.pathname)).toBe("/dev-target");
    });

    test("a double tap runs its action; a single tap waits for it and then does the default", async ({ page }) => {
      await start(page);
      await node(page, "OG").dblclick();
      await expect.poll(() => calls(page)).toEqual([{ domain: "script", service: "turn_on", target: { entity_id: "script.demo" } }]);
      // two clicks are a double tap, not two taps: OG is not selected by them
      await expect(page.locator("detailed-energy-card .path")).not.toHaveText("Zuhause › OG");
      await node(page, "OG").click();
      await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause › OG");
      expect((await calls(page)).length).toBe(1);
    });

    test("a consumer with a switch has a toggle that turns it on and off without opening the dialog", async ({ page }) => {
      await start(page);
      const toggle = page.locator('detailed-energy-card .detail .row .switch[aria-label="Kaffeemaschine"]');
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      expect(await calls(page)).toEqual([{ domain: "homeassistant", service: "turn_on", data: { entity_id: "switch.kaffee" } }]);
      expect(await opened(page)).toEqual([]);
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      expect((await calls(page)).map((x) => x.service)).toEqual(["turn_on", "turn_off"]);
      // a row without a switch leaves its cell empty and opens the dialog as before
      await page.locator("detailed-energy-card .detail .row", { hasText: "Backofen" }).click();
      expect(await opened(page)).toEqual(["sensor.backofen"]);
    });

    test("confirm_switch asks before the switch is turned off, not before it is turned on", async ({ page }) => {
      await start(page);
      await node(page, "OG").click();
      await node(page, "Bad").click();
      const toggle = page.locator('detailed-energy-card .detail .row .switch[aria-label="Heizung"]');
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      const questions: string[] = [];
      let answer = false;
      page.on("dialog", (d) => {
        questions.push(d.message());
        return answer ? d.accept() : d.dismiss();
      });
      await toggle.click();
      expect(questions).toEqual(["Diesen Verbraucher ausschalten?"]);
      expect(await calls(page)).toEqual([]);
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      answer = true;
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      expect((await calls(page)).map((x) => x.service)).toEqual(["turn_off"]);
      // turning it on needs no question
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      expect(questions).toHaveLength(2);
    });

    test("a configuration with a faulty action is refused with the field named", async ({ page }) => {
      await start(page);
      await page.evaluate(() =>
        (document.querySelector("detailed-energy-card") as unknown as { setConfig(c: object): void }).setConfig({
          type: "x",
          sources: [{ entity: "sensor.pv", tap_action: { action: "navigate" } }],
        }),
      );
      await expect(page.locator("detailed-energy-card .error")).toContainText("sources[0].tap_action.navigation_path");
    });
  });

  test("a consumer with only an energy counter is greyed out in the mode Now and counts in the energy mode", async ({ page }) => {
    await fixClock(page);
    await open(page, "energy");
    await page.evaluate(() => {
      const el = document.querySelector("detailed-energy-card") as unknown as { _config: { floors: Array<{ rooms: Array<{ consumers: object[] }> }> }; setConfig(c: object): void };
      el._config.floors[0].rooms[0].consumers.push({ energy_entity: "sensor.e_nur_zaehler", name: "Nur Zähler" });
      el.setConfig(el._config);
    });
    await mode(page, "Jetzt").click();
    await node(page, "Küche").click();
    const row = page.locator("detailed-energy-card .detail .row", { hasText: "Nur Zähler" });
    await expect(row).toHaveClass(/idle/);
    await expect(row).not.toHaveClass(/warn/);
    await expect(row.locator("small")).toHaveText("Kein Leistungssensor konfiguriert");
    await mode(page, "Heute").click();
    await expect(row.locator(".val")).toHaveText(/kWh$/);
    await expect(row).not.toHaveClass(/idle/);
  });

  test("the heatmap card shows a row per day and a column per hour, gaps in gray and the figures of the days", async ({ page }) => {
    await fixClock(page);
    await page.goto("/dev/index.html?card=heatmap&days=10");
    const card = page.locator("detailed-energy-heatmap-card");
    await expect(card.locator("h2")).toHaveText("Wann wird Strom verbraucht?");
    await expect(card.locator(".day")).toHaveCount(10);
    await expect(card.locator(".cell")).toHaveCount(240);
    // the hours after now have not begun, the hours without statistics are gaps
    await expect(card.locator(".cell.future").first()).toBeAttached();
    await expect(card.locator(".cell.missing").first()).toBeAttached();
    const kpis = card.locator(".kpi span");
    await expect(kpis.nth(0)).toHaveText("Grundlast");
    await expect(kpis.nth(1)).toHaveText("10 Tage gesamt");
    // with a price sensor the card names the most expensive hour with its cost, without one the peak
    await expect(card.locator(".kpi b").nth(2)).toHaveText(/\d+,\d\d\s€/);
    await expect(kpis.nth(2)).toHaveText(/^Teuerste Stunde \S+ \d+\.\d+\. \d\d–\d\d Uhr$/);
    await page.goto("/dev/index.html?card=heatmap&days=10&price=0");
    await expect(kpis.nth(2)).toHaveText(/^Spitze /);
    await expect(card.locator(".cell:not(.missing):not(.future)").first()).toHaveAttribute("title", /kWh$/);
  });

  test("the heatmap card says so when its configuration is wrong", async ({ page }) => {
    await page.goto("/dev/index.html?card=heatmap");
    await expect(page.locator("detailed-energy-heatmap-card .cell").first()).toBeVisible();
    await page.evaluate(() => (document.querySelector("detailed-energy-heatmap-card") as unknown as { setConfig(c: object): void }).setConfig({ type: "x", entity: "sensor.a", days: 3 }));
    await expect(page.locator("detailed-energy-heatmap-card .error")).toContainText("days must be a whole number from 7 to 28");
  });

  test("arrows browse back through the periods of the energy mode and stop at the running one", async ({ page }) => {
    await fixClock(page);
    await open(page, "energy");
    const label = page.locator("detailed-energy-card .browse-label");
    const back = page.locator('detailed-energy-card .browse button[aria-label="Früherer Zeitraum"]');
    const forward = page.locator('detailed-energy-card .browse button[aria-label="Späterer Zeitraum"]');
    await mode(page, "Heute").click();
    await expect(label).toHaveCount(0);
    await expect(forward).toBeDisabled();
    const valueOf = () => node(page, "Küche").innerText();
    await expect(node(page, "Küche")).toBeVisible();
    const today = await valueOf();
    await back.click();
    await expect(label).toHaveText("Gestern");
    await expect(forward).toBeEnabled();
    await expect.poll(valueOf).not.toBe(today);
    await back.click();
    await expect(label).toHaveText(/^(Mo|Di|Mi|Do|Fr|Sa|So)\.?,? \d+\.\d+\.$/);
    await forward.click();
    await forward.click();
    await expect(label).toHaveCount(0);
    await expect(forward).toBeDisabled();
    // another period starts at the running one again; the mode Now has no arrows
    await back.click();
    await mode(page, "Woche").click();
    await expect(label).toHaveCount(0);
    await back.click();
    await expect(label).toHaveText(/^KW \d+$/);
    await mode(page, "Monat").click();
    await back.click();
    await expect(label).toHaveText(/^[A-ZÄÖÜ][a-zäöü]+$/);
    await mode(page, "Jetzt").click();
    await expect(page.locator("detailed-energy-card .browse")).toHaveCount(0);
  });

  test("the timeline of an earlier period is compared with the whole period before it", async ({ page }) => {
    await fixClock(page);
    await open(page, "timeline");
    await page.locator('detailed-energy-card .browse button[aria-label="Früherer Zeitraum"]').click();
    const kpis = page.locator("detailed-energy-card .kpi span");
    await expect(kpis.nth(0)).toHaveText("gesamt");
    await expect(kpis.nth(1)).toHaveText("ggü. Vortag");
    await expect(page.locator("detailed-energy-card .chart .now")).toHaveCount(0);
    await expect(page.locator("detailed-energy-card .legend-item.prev-key")).toHaveText("Vortag");
  });

  test("the Sankey diagram draws sources, floors and rooms; floors and rooms are selected by clicking them", async ({ page }) => {
    await fixClock(page);
    await open(page, "sankey");
    const sk = (label: string) => page.locator(`detailed-energy-card .sk-node[aria-label^="${label}:"]`);
    const labels = page.locator("detailed-energy-card .sk-label");
    await expect(page.locator('detailed-energy-card .views button[aria-label="Sankey-Diagramm"]')).toHaveAttribute("aria-pressed", "true");
    // the largest floor is selected like in the tree: its rooms are drawn, the other floors stay without rooms
    await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause › EG");
    for (const t of ["PV", "Netz", "EG", "OG", "Keller", "Küche", "Wohnzimmer"]) await expect(sk(t)).toBeVisible();
    await expect(sk("Bad")).toHaveCount(0);
    // feed-in and charging sit below the floors as nodes of their own (no click: nothing to select there)
    await expect(labels.filter({ hasText: "Einspeisung" })).toBeVisible();
    await expect(labels.filter({ hasText: "Batterie laden" })).toBeVisible();
    await expect(page.locator('detailed-energy-card .sk-node[aria-label^="Einspeisung"]')).toHaveCount(0);
    // a floor shows its rooms only; a second click on it shows the rooms of all floors again
    await sk("OG").click();
    await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause › OG");
    await expect(sk("Bad")).toBeVisible();
    await expect(sk("Küche")).toHaveCount(0);
    await sk("OG").click();
    await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause");
    await expect(sk("Küche")).toBeVisible();
    await expect(sk("Bad")).toBeVisible();
    // a room shows its consumers as the last column, a second click hides them
    await sk("EG").click();
    await sk("Küche").click();
    await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause › EG › Küche");
    await expect(sk("Backofen")).toBeVisible();
    await expect(sk("Kühlschrank")).toBeVisible();
    await sk("Küche").click();
    await expect(sk("Backofen")).toHaveCount(0);
    // the tooltip of a node that takes its energy in proportion says so
    await expect(sk("EG").locator("title")).toContainText("proportional");
  });

  test("the Sankey diagram shows the power in the mode Now and works without energy sensors", async ({ page }) => {
    await fixClock(page);
    await open(page, "sankey");
    await mode(page, "Jetzt").click();
    await expect(page.locator('detailed-energy-card .sk-node[aria-label^="PV:"] title')).toContainText(/kW$/);
    await page.goto("/dev/index.html?scenario=floors");
    await page.evaluate(() => {
      const el = document.querySelector("detailed-energy-card") as unknown as { _config: { options?: object }; setConfig(c: object): void };
      el.setConfig({ ...el._config, options: { ...el._config.options, view: "sankey", views: ["tree", "sankey", "timeline"] } });
    });
    // the timeline needs energy sensors, the Sankey diagram does not
    await expect(page.locator("detailed-energy-card .sk-label", { hasText: "PV" })).toBeVisible();
    await expect(page.locator("detailed-energy-card .views button")).toHaveCount(2);
  });

  test("the costs show as a badge and as the second value, from hourly prices", async ({ page }) => {
    await fixClock(page);
    await open(page, "costs");
    const badge = page.locator("detailed-energy-card .badge.costs");
    // the feed-in: 3,8 kWh x 0,08 €
    await expect(badge).toHaveText(/^Kosten \d+,\d\d\s€ · Vergütung 0,30\s€$/);
    await expect(node(page, "Küche").locator(".second")).toHaveText(/^\d+,\d\d\s€$/);
    await expect(node(page, "Küche").locator(".second")).toHaveAttribute("title", /^8,7 kWh, davon \d+,\d kWh aus dem Netz, \d+,\d\d\s€$/);
    await node(page, "Küche").click();
    await expect(page.locator("detailed-energy-card .detail .row", { hasText: "Backofen" }).locator(".val2")).toHaveText(/^\d+,\d\d\s€$/);
    // the coffee machine has no energy counter: no costs
    await expect(page.locator("detailed-energy-card .detail .row", { hasText: "Kaffeemaschine" }).locator(".val2")).toHaveText("");
    // the mode Now shows the costs of today
    await mode(page, "Jetzt").click();
    await expect(badge).toHaveText(/^Kosten \d+,\d\d\s€/);
  });

  test("the costs take the amount of the cost statistics of Home Assistant when they exist", async ({ page }) => {
    await fixClock(page);
    await open(page, "costs");
    await page.evaluate(() => {
      const el = document.querySelector("detailed-energy-card") as unknown as { _hass: { states: Record<string, unknown> }; hass: unknown; _config: object; setConfig(c: object): void };
      const money = { state: "0", attributes: { device_class: "monetary", state_class: "total", unit_of_measurement: "EUR" } };
      el.hass = { ...el._hass, states: { ...el._hass.states, "sensor.e_netz_cost": money, "sensor.e_netz_einspeisung_compensation": money } };
      // in Home Assistant the cost entities exist from the start; here the configuration is loaded again
      el.setConfig(el._config);
    });
    await expect(page.locator("detailed-energy-card .badge.costs")).toHaveText(/^Kosten 1,62\s€ · Vergütung 0,30\s€$/);
  });

  test("without a price there is no cost badge", async ({ page }) => {
    await fixClock(page);
    await open(page, "feedin");
    await expect(page.locator("detailed-energy-card .badge.self")).toBeVisible();
    await expect(page.locator("detailed-energy-card .badge.costs")).toHaveCount(0);
  });

  test("a card without energy sensors has no switch", async ({ page }) => {
    await open(page, "floors");
    await expect(page.locator("detailed-energy-card .modes")).toHaveCount(0);
  });
});

test.describe("consumer list options", () => {
  const configure = (page: Page, options: object) =>
    page.evaluate((o) => {
      const el = document.querySelector("detailed-energy-card") as unknown as { _config: { options?: object }; setConfig(c: object): void };
      el.setConfig({ ...el._config, options: { ...el._config.options, ...o } });
    }, options);

  test("the list can be hidden", async ({ page }) => {
    await open(page, "floors");
    await expect(page.locator("detailed-energy-card .detail")).toBeVisible();
    await configure(page, { show_consumers: false });
    await expect(page.locator("detailed-energy-card .detail")).toHaveCount(0);
    // the diagram is still there
    await expect(node(page, "Küche")).toBeVisible();
  });

  test("only active consumers can be listed", async ({ page }) => {
    await open(page, "floors");
    await expect(page.locator("detailed-energy-card .detail .row.idle")).not.toHaveCount(0);
    await expect(page.locator("detailed-energy-card .detail-head")).toContainText("6 Verbraucher");
    await configure(page, { only_active_consumers: true });
    await expect(page.locator("detailed-energy-card .detail .row.idle")).toHaveCount(0);
    await expect(page.locator("detailed-energy-card .detail-head")).toContainText("4 / 6 Verbraucher");
    await expect(page.locator("detailed-energy-card .detail .row")).toContainText(["Backofen"]);
  });

  test("a room with nothing active says so", async ({ page }) => {
    await open(page, "floors");
    await configure(page, { only_active_consumers: true });
    await node(page, "Flur").click();
    await expect(page.locator("detailed-energy-card .detail .empty")).toHaveText("Keine aktiven Verbraucher");
  });
});

test.describe("focus_selected", () => {
  const home = (page: Page) => page.locator("detailed-energy-card button.node:has(.circle.home)");
  const left = async (page: Page, title: string) => Math.round(await node(page, title).evaluate((el) => el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2));
  const hidden = (page: Page, title: string) => expect(node(page, title)).toHaveCSS("opacity", "0");
  const shown = (page: Page, title: string) => expect(node(page, title)).not.toHaveClass(/ghost/);

  test("a click on an element always shows its children, the selected one slides to the middle", async ({ page }) => {
    await open(page, "focus");
    // it starts with the first level fully visible: all floors, spread out, and no room row
    await shown(page, "EG");
    await shown(page, "OG");
    await shown(page, "Keller");
    await expect(node(page, "Küche")).toHaveCount(0);
    await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause");

    // a floor slides to the middle and the other floors fade out behind it
    await node(page, "EG").click();
    await hidden(page, "OG");
    await expect(node(page, "Küche")).toBeVisible();

    // the home shows all floors again, spread out
    await home(page).click();
    await shown(page, "OG");
    await expect(node(page, "OG")).toHaveCSS("opacity", "1");
    await expect(node(page, "Küche")).toHaveCount(0);
    expect(await left(page, "EG")).toBeLessThan(await left(page, "OG"));
    expect(await left(page, "OG")).toBeLessThan(await left(page, "Keller"));

    // a floor slides to the middle and the other floors fade out behind it
    await node(page, "OG").click();
    await hidden(page, "EG");
    await hidden(page, "Keller");
    await expect(node(page, "OG")).toHaveCSS("opacity", "1");
    await expect(node(page, "Bad")).toBeVisible();
    expect(await left(page, "EG")).toBe(await left(page, "OG"));

    // a room slides to the middle, the other rooms fade out
    await home(page).click();
    await node(page, "EG").click();
    await expect(node(page, "Wohnzimmer")).toHaveCSS("opacity", "1");
    await node(page, "Küche").click();
    await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause › EG › Küche");
    await hidden(page, "Wohnzimmer");
    await hidden(page, "Flur");
    await expect(node(page, "Küche")).toHaveCSS("opacity", "1");
    expect(await left(page, "Küche")).toBe(await left(page, "EG"));

    // the floor shows all its rooms again, also when it is already selected
    await node(page, "EG").click();
    await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause › EG");
    await expect(node(page, "Wohnzimmer")).toHaveCSS("opacity", "1");
    await expect(node(page, "Küche")).toHaveCSS("opacity", "1");
  });

  test("without floors the rooms hang directly under the home and work the same way", async ({ page }) => {
    await open(page, "flat");
    // the scenario has no focus option of its own: turn it on
    await page.evaluate(() => {
      const el = document.querySelector("detailed-energy-card") as unknown as { _config: { options?: object }; setConfig(c: object): void };
      el.setConfig({ ...el._config, options: { ...el._config.options, focus_selected: true } });
    });
    const rooms = page.locator("detailed-energy-card button.node:has(.circle.room)");
    const centers = () => rooms.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left + e.getBoundingClientRect().width / 2)));
    // all rooms are visible and spread out, none is selected
    await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause");
    await expect(rooms).toHaveCount(5);
    const spread = await centers();
    expect(new Set(spread).size).toBe(5);

    // a room slides to the middle, the others fade out behind it
    await node(page, "Küche").click();
    await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause › Küche");
    await hidden(page, "Bad");
    await expect(node(page, "Küche")).toHaveCSS("opacity", "1");
    expect(new Set(await centers()).size).toBe(1);

    // clicking the selected room again keeps it, the home shows all rooms again
    await node(page, "Küche").click();
    await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause › Küche");
    await home(page).click();
    await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause");
    await expect(node(page, "Bad")).toHaveCSS("opacity", "1");
    expect(await centers()).toEqual(spread);
  });

  test("hidden elements cannot be reached or clicked", async ({ page }) => {
    await open(page, "focus");
    await node(page, "EG").click();
    await hidden(page, "OG");
    await expect(node(page, "OG")).toHaveAttribute("aria-hidden", "true");
    await expect(node(page, "OG")).toHaveAttribute("tabindex", "-1");
    await expect(node(page, "OG")).toHaveCSS("pointer-events", "none");
  });

  test("without the option the selected floor stays where it is and a second click deselects it", async ({ page }) => {
    await open(page, "floors");
    await expect(node(page, "OG")).toHaveCSS("opacity", "1");
    await node(page, "EG").click();
    await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause");
  });
});

test("an invalid configuration shows a readable error", async ({ page }) => {
  await page.goto("/dev/index.html?scenario=invalid");
  await expect(page.locator("detailed-energy-card .error")).toContainText("area_id");
});

test("lines with more power animate faster", async ({ page }) => {
  await open(page, "floors");
  const durations = await page.locator("detailed-energy-card path.line.flowing").evaluateAll((els) =>
    els.map((e) => ({ w: Number(e.getAttribute("stroke-width")), d: parseFloat(getComputedStyle(e).getPropertyValue("--dur")) })),
  );
  expect(durations.length).toBeGreaterThan(3);
  // thicker line = more power = shorter cycle
  const sorted = [...durations].sort((a, b) => a.w - b.w);
  expect(sorted[0].d).toBeGreaterThan(sorted[sorted.length - 1].d);
  expect(new Set(durations.map((x) => x.d)).size).toBeGreaterThan(3);
});

test("clicking the selected floor selects all floors", async ({ page }) => {
  await open(page, "floors");
  await node(page, "EG").click();
  await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause");
  await expect(page.locator("detailed-energy-card .pill.selected")).toHaveCount(3);
  await expect(page.locator("detailed-energy-card .circle.room")).toHaveCount(0);
  await expect(page.locator("detailed-energy-card .detail-head")).toContainText("8 Verbraucher");
  await node(page, "OG").click();
  await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause › OG");
  await expect(page.locator("detailed-energy-card .pill.selected")).toHaveCount(1);
});

test("clicking the home selects everything again", async ({ page }) => {
  await open(page, "floors");
  await node(page, "OG").click();
  await node(page, "Zuhause").click();
  await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause");
  await expect(page.locator("detailed-energy-card .pill.selected")).toHaveCount(3);
  await expect(page.locator("detailed-energy-card .detail-head")).toContainText("8 Verbraucher");
});

test("flat: clicking the home selects all rooms", async ({ page }) => {
  await open(page, "flat");
  await node(page, "Zuhause").click();
  await expect(page.locator("detailed-energy-card .circle.room.selected")).toHaveCount(5);
  await expect(page.locator("detailed-energy-card .path")).toHaveText("Zuhause");
  await node(page, "Bad").click();
  await expect(page.locator("detailed-energy-card .circle.room.selected")).toHaveCount(1);
});

test.describe("consumer list on small screens", () => {
  for (const width of [420, 340, 280]) {
    test(`values stay visible and aligned at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, "long");
      const card = await page.locator("detailed-energy-card ha-card").boundingBox();
      const vals = await page.locator("detailed-energy-card .row .val").evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { right: r.right, left: r.left, width: r.width };
        }),
      );
      expect(vals.length).toBeGreaterThanOrEqual(3);
      for (const v of vals) {
        expect(v.width).toBeGreaterThan(20);
        expect(v.right).toBeLessThanOrEqual(card!.x + card!.width + 0.5);
      }
      // all values end at the same x, so the numbers stand exactly below each other
      expect(new Set(vals.map((v) => Math.round(v.right))).size).toBe(1);
    });
  }

  test("the bar is shown when there is room and hidden when there is not", async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 900 });
    await open(page, "long");
    await expect(page.locator("detailed-energy-card .row .bar").first()).toBeVisible();
    await page.setViewportSize({ width: 300, height: 900 });
    await expect(page.locator("detailed-energy-card .row .bar").first()).toBeHidden();
    await expect(page.locator("detailed-energy-card .row .val").first()).toBeVisible();
  });

  test("long names are cut off with an ellipsis instead of pushing the values", async ({ page }) => {
    await page.setViewportSize({ width: 340, height: 900 });
    await open(page, "long");
    const cut = await page.locator("detailed-energy-card .row .name").evaluateAll((els) =>
      els.map((e) => e.scrollWidth > e.clientWidth),
    );
    expect(cut.some(Boolean)).toBe(true);
  });
});

test("floors are fully visible when no rooms are shown", async ({ page }) => {
  await open(page, "floors");
  await node(page, "Zuhause").click();
  const scroll = await page.locator("detailed-energy-card .scroll").boundingBox();
  const pills = await page.locator("detailed-energy-card .pill").evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().bottom),
  );
  expect(pills).toHaveLength(3);
  for (const bottom of pills) expect(bottom).toBeLessThanOrEqual(scroll!.y + scroll!.height);
});

test("on wide screens the bar uses the free space next to the name", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/dev/index.html?scenario=floors&width=900");
  await expect(page.locator("detailed-energy-card .path")).not.toHaveText("");
  const box = await page.locator("detailed-energy-card .detail").boundingBox();
  const bar = await page.locator("detailed-energy-card .row .bar").first().boundingBox();
  // the bar starts in the left half and stretches over at least 40 % of the list
  expect(bar!.x - box!.x).toBeLessThan(box!.width * 0.5);
  expect(bar!.width).toBeGreaterThan(box!.width * 0.4);
});

test.describe("idle nodes and color thresholds", () => {
  test("consumers without power are faded in the list", async ({ page }) => {
    await open(page, "floors");
    const idle = page.locator("detailed-energy-card .row.idle");
    await expect(idle).toHaveCount(2); // coffee machine and the hallway light (room Flur is off)
    await expect(idle.first().locator(".bar")).toHaveCSS("opacity", "0.45");
    await expect(idle.first().locator(".val")).not.toHaveCSS("color", await page.locator("detailed-energy-card .row:not(.idle) .val").first().evaluate((e) => getComputedStyle(e).color));
    await expect(page.locator("detailed-energy-card .row", { hasText: "Kaffeemaschine" })).toHaveClass(/idle/);
    await expect(page.locator("detailed-energy-card .row", { hasText: "Backofen" })).not.toHaveClass(/idle/);
  });

  test("rooms and floors without power are faded in the diagram", async ({ page }) => {
    await open(page, "floors");
    await expect(node(page, "Flur")).toHaveClass(/idle/);
    await expect(node(page, "Küche")).not.toHaveClass(/idle/);
    await expect(node(page, "EG")).not.toHaveClass(/idle/);
  });

  test("bars in the list take the color of their power range", async ({ page }) => {
    await open(page, "floors");
    const bg = (name: string) =>
      page
        .locator("detailed-energy-card .row", { hasText: name })
        .locator(".bar > div")
        .evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(await bg("Backofen")).toBe("rgb(255, 152, 0)"); // 820 W -> orange
    expect(await bg("Spülmaschine")).toBe("rgb(76, 175, 80)"); // 310 W -> green
  });

  test("higher power ranges also draw thicker bars, not only another color", async ({ page }) => {
    await open(page, "floors");
    const height = (name: string) =>
      page
        .locator("detailed-energy-card .row", { hasText: name })
        .locator(".bar")
        .evaluate((e) => parseFloat(getComputedStyle(e).height));
    expect(await height("Backofen")).toBeGreaterThan(await height("Spülmaschine")); // orange range vs green range
  });

  test("active lines take the color of their power range", async ({ page }) => {
    await open(page, "floors");
    const strokes = await page
      .locator("detailed-energy-card path.line.active")
      .evaluateAll((els) => els.map((e) => getComputedStyle(e).stroke));
    expect(strokes).toContain("rgb(244, 67, 54)"); // PV 3.42 kW -> red
    expect(strokes).toContain("rgb(255, 152, 0)"); // e.g. battery / floor lines in the orange range
  });

  test("without thresholds the normal colors stay", async ({ page }) => {
    await open(page, "many");
    const bg = await page.locator("detailed-energy-card .bar > div").first().evaluate((e) => (e as HTMLElement).style.background);
    expect(bg).toBe("");
  });
});

test("a sensor assigned to two consumers is reported as a configuration error", async ({ page }) => {
  await page.goto("/dev/index.html?scenario=duplicate");
  await expect(page.locator("detailed-energy-card .error")).toContainText("already assigned");
  await expect(page.locator("detailed-energy-card .error")).toContainText("sensor.backofen");
});

test("the card picker suggests a complete starting configuration from the areas of Home Assistant", async ({ page }) => {
  await open(page, "floors");
  const stub = await page.evaluate(() => {
    const card = customElements.get("detailed-energy-card") as unknown as { getStubConfig(h: unknown): unknown };
    const power = { attributes: { device_class: "power" } };
    return card.getStubConfig({
      states: { "sensor.a": power, "sensor.b": power, "sensor.c": power },
      floors: { eg: { floor_id: "eg", level: 0 } },
      areas: { kueche: { area_id: "kueche", floor_id: "eg" } },
    });
  });
  expect(stub).toMatchObject({
    sources: [{ entity: "sensor.a" }],
    floors: [{ floor_id: "eg", rooms: [{ area_id: "kueche", consumers: [{ entity: "sensor.b" }, { entity: "sensor.c" }] }] }],
  });
});

test("line animation pauses while the card is scrolled out of view", async ({ page }) => {
  await open(page, "floors");
  const card = page.locator("detailed-energy-card");
  const line = page.locator("detailed-energy-card path.line.flowing").first();
  await expect(line).toHaveCSS("animation-play-state", "running");
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "5000px";
    document.body.append(spacer);
    window.scrollTo(0, document.body.scrollHeight);
  });
  await expect(card).toHaveClass(/offscreen/);
  await expect(line).toHaveCSS("animation-play-state", "paused");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(card).not.toHaveClass(/offscreen/);
  await expect(line).toHaveCSS("animation-play-state", "running");
});

test("sources without a name are called after their type in the language of the user", async ({ page }) => {
  await open(page, "floors");
  for (const t of ["PV", "Batterie", "Netz"]) await expect(node(page, t)).toBeVisible();
  await page.goto("/dev/index.html?scenario=floors&lang=en");
  await expect(page.locator("detailed-energy-card .path")).not.toHaveText("");
  for (const t of ["Solar", "Battery", "Grid"]) await expect(node(page, t)).toBeVisible();
  await expect(page.locator("detailed-energy-card .badge:not(.self)")).toContainText("Self-sufficiency");
});

test.describe("editor", () => {
  const hint = (page: Page) => page.locator("detailed-energy-card-editor .energy-hint");

  test("explains how to get the energy switch until an energy sensor is entered", async ({ page }) => {
    await page.goto("/dev/index.html?editor=floors");
    await expect(hint(page)).toHaveText(/Energiesensor \(kWh\).*Jetzt \| Heute \| Woche \| Monat/);
    await page.evaluate(() => {
      const ed = document.querySelector("detailed-energy-card-editor") as unknown as { _config: { home?: object }; setConfig(c: object): void };
      ed.setConfig({ ...ed._config, home: { ...ed._config.home, total_energy_entity: "sensor.e_total" } });
    });
    await expect(hint(page)).toHaveCount(0);
  });

  test("shows no hint when the card has an energy sensor", async ({ page }) => {
    await page.goto("/dev/index.html?editor=energy");
    await expect(page.locator("detailed-energy-card-editor h3").first()).toBeVisible();
    await expect(hint(page)).toHaveCount(0);
  });

  test.describe("import from the Energy dashboard", () => {
    const wizard = (page: Page) => page.locator("detailed-energy-card-editor detailed-energy-import-wizard");
    // the room selects list every area, so rooms and groups are found by their head line, not by their text
    const roomOf = (page: Page, name: string) => wizard(page).locator(".room").filter({ has: page.locator(".row.head", { hasText: new RegExp(String.raw`^\s*${name}\s*$`) }) });
    const open = async (page: Page, query = "") => {
      await page.goto(`/dev/index.html?editor=floors${query}`);
      await page.locator("detailed-energy-card-editor button.import").click();
    };

    test("proposes sources, then floors, rooms and devices, shows a preview and replaces the structure", async ({ page }) => {
      await open(page);
      await expect(wizard(page).locator(".steps .on")).toHaveText("1 Quellen");
      // grid, solar and battery with the power sensor of the dashboard, all taken over
      await expect(wizard(page).locator(".group")).toHaveCount(3);
      await expect(wizard(page).locator('input[type="checkbox"]:checked')).toHaveCount(3);
      await wizard(page).getByRole("button", { name: "Weiter" }).click();
      await expect(wizard(page).locator(".steps .on")).toHaveText("2 Struktur");
      // floors by level, rooms by the areas Home Assistant assigns, devices without an area off
      await expect(wizard(page).locator(".group > .row.head").filter({ hasText: /^\s*EG\s*$/ })).toBeVisible();
      await expect(roomOf(page, "Küche")).toBeVisible();
      const noRoom = wizard(page).locator(".group").filter({ has: page.locator(".row.head", { hasText: /^\s*Ohne Raum\s*$/ }) });
      await expect(noRoom.locator('input[type="checkbox"]')).toHaveCount(2);
      await expect(noRoom.locator('input[type="checkbox"]:checked')).toHaveCount(0);
      // the external statistic cannot be taken over
      await expect(wizard(page).locator(".warn", { hasText: "externe Statistik" })).toHaveCount(1);
      await wizard(page).getByRole("button", { name: "Weiter" }).click();
      await expect(wizard(page).locator(".steps .on")).toHaveText("3 Vorschau");
      await expect(wizard(page)).toContainText(/3 Quellen, 3 Etagen, 5 Räume, 7 Verbraucher, 2 ausgelassen/);
      // the preview is a card of its own with the proposed structure
      const preview = wizard(page).locator("detailed-energy-card");
      await expect(preview.locator(".path")).toContainText("Zuhause");
      await wizard(page).locator(".toggle button").nth(1).click();
      await expect(preview.locator(".modes button.on")).toHaveText("Heute");
      // the editor of the card has the scenario's structure; this card has the dashboard's: replace it
      await wizard(page).locator('input[name="mode"]').first().check();
      await wizard(page).getByRole("button", { name: "Übernehmen" }).click();
      await expect(wizard(page)).toHaveCount(0);
      const cfg = await page.evaluate(() => (document.querySelector("detailed-energy-card") as unknown as { _config: { sources: Array<{ energy_entity?: string }>; floors: Array<{ floor_id: string }> } })._config);
      expect(cfg.sources.map((x) => x.energy_entity)).toEqual(["sensor.e_netz", "sensor.e_pv", "sensor.e_akku"]);
      expect(cfg.floors.map((f) => f.floor_id).sort()).toEqual(["eg", "keller", "og"]);
    });

    test("switching a floor off takes its devices out of the result, and cancel changes nothing", async ({ page }) => {
      await open(page);
      const before = await page.evaluate(() => JSON.stringify((document.querySelector("detailed-energy-card") as unknown as { _config: object })._config));
      await wizard(page).getByRole("button", { name: "Weiter" }).click();
      await wizard(page).locator(".group > .row.head", { hasText: /^\s*EG\s*$/ }).locator("input").uncheck();
      await wizard(page).getByRole("button", { name: "Weiter" }).click();
      await expect(wizard(page)).toContainText(/2 Etagen, 2 Räume/);
      await wizard(page).getByRole("button", { name: "Abbrechen" }).click();
      await expect(wizard(page)).toHaveCount(0);
      const after = await page.evaluate(() => JSON.stringify((document.querySelector("detailed-energy-card") as unknown as { _config: object })._config));
      expect(after).toBe(before);
    });

    test("moves a device to another room", async ({ page }) => {
      await open(page);
      await wizard(page).getByRole("button", { name: "Weiter" }).click();
      // the first device of the kitchen is the oven
      const row = roomOf(page, "Küche").locator(".row:not(.head)").first();
      await row.locator("select.pick").selectOption("wohnzimmer");
      await expect(roomOf(page, "Wohnzimmer").locator(".row:not(.head)")).toHaveCount(2);
      await expect(roomOf(page, "Küche").locator(".row:not(.head)")).toHaveCount(2);
    });

    test("says so when the Energy dashboard was never set up or cannot be read", async ({ page }) => {
      await open(page, "&prefs=empty");
      await expect(wizard(page)).toContainText("Im Energie-Dashboard ist noch nichts eingerichtet.");
      await expect(wizard(page).locator('a[href="/config/energy"]')).toBeVisible();
      await open(page, "&prefs=error");
      await expect(wizard(page).locator(".warn")).toContainText("boom");
    });
  });
});
