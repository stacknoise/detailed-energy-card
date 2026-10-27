import { expect, test } from "@playwright/test";

// Renders the images used in README.md. Run: npm run screenshots
const shots: Array<{ scenario: string; file: string; clock?: string; before?: (page: import("@playwright/test").Page) => Promise<void> }> = [
  {
    scenario: "floors",
    file: "card-with-floors",
    before: async (page) => {
      await page.locator("detailed-energy-card button.node[title=Küche]").click();
    },
  },
  { scenario: "flat", file: "card-without-floors" }, // all rooms are selected by default
  {
    scenario: "wrap",
    file: "card-many-rooms-wrapped",
    before: async (page) => {
      await page.locator("detailed-energy-card button.node[title=Garage]").click();
    },
  },
  {
    scenario: "thresholds",
    file: "card-thresholds",
    before: async (page) => {
      await page.locator("detailed-energy-card button.node[title=Küche]").click();
    },
  },
  {
    scenario: "energy",
    file: "card-energy",
    // the statistics arrive after the first render
    before: async (page) => {
      await expect(page.locator("detailed-energy-card .pill small", { hasText: "kWh" }).first()).toBeVisible();
      await page.locator("detailed-energy-card button.node[title=Küche]").click();
    },
  },
  {
    scenario: "meters",
    file: "card-meters",
    // own meters of EG, kitchen and hall; the kitchen list shows what its consumers miss
    before: async (page) => {
      await expect(page.locator("detailed-energy-card .pill small", { hasText: "kWh" }).first()).toBeVisible();
      await page.locator("detailed-energy-card button.node[title=Küche]").click();
    },
  },
  {
    scenario: "secondary",
    file: "card-secondary",
    // the power now with the energy of today below it (options.secondary_value: auto)
    before: async (page) => {
      await expect(page.locator("detailed-energy-card .second", { hasText: "kWh" }).first()).toBeVisible();
      await page.locator("detailed-energy-card button.node[title=Küche]").click();
    },
  },
  {
    scenario: "feedin",
    file: "card-feedin",
    // feed-in and charging in the energy mode, with the self-consumption badge
    before: async (page) => {
      await expect(page.locator("detailed-energy-card .back", { hasText: "kWh" }).first()).toBeVisible();
      await page.locator("detailed-energy-card button.node[title=Küche]").click();
    },
  },
  {
    scenario: "timeline",
    file: "card-timeline",
    // the hours of today stacked by room, yesterday dashed; a fixed clock gives the same picture on every day
    clock: "2026-10-13T17:30:00Z",
    before: async (page) => {
      await expect(page.locator("detailed-energy-card .chart rect.part").first()).toBeVisible();
    },
  },
  {
    scenario: "standby",
    file: "card-standby",
    // the base load in the head, the fridge runs all the time; a fixed clock gives the same picture on every day
    clock: "2026-10-13T17:30:00Z",
    before: async (page) => {
      await expect(page.locator("detailed-energy-card .badge.base")).toBeVisible();
      await page.locator("detailed-energy-card button.node[title=Küche]").click();
      await expect(page.locator("detailed-energy-card .standby")).toBeVisible();
    },
  },
  {
    scenario: "sankey",
    file: "card-sankey",
    // sources, floors and rooms with feed-in and charging below; the kitchen is selected, the hours do not matter
    before: async (page) => {
      await expect(page.locator("detailed-energy-card .sk-label", { hasText: "kWh" }).first()).toBeVisible();
      await page.locator('detailed-energy-card .sk-node[aria-label^="Küche:"]').click();
    },
  },
  {
    scenario: "costs",
    file: "card-costs",
    // costs from a dynamic price: the badge and the costs of every node; a fixed clock gives the same amounts
    clock: "2026-10-13T17:30:00Z",
    before: async (page) => {
      await expect(page.locator("detailed-energy-card .badge.costs")).toBeVisible();
      await page.locator("detailed-energy-card button.node[title=Küche]").click();
    },
  },
  { scenario: "floors", file: "card-all-rooms" },
  {
    scenario: "floors",
    file: "card-hero",
    before: async (page) => {
      await page.locator("detailed-energy-card button.node[title=Küche]").click();
    },
  }, // all rooms of the floor are selected by default
];

/** A fixed clock, so that a picture shows the same hours and amounts on every day. */
async function fixClock(page: import("@playwright/test").Page, at: string): Promise<void> {
  await page.addInitScript((at) => {
    const Real = Date;
    const fixed = new Real(at).getTime();
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
  }, at);
}

// Every card image has the same size, so that they line up in tables and galleries. A card is shorter or longer
// depending on its content; the picture always shows the same height and the rest is the dark background of the card.
// card-hero keeps the height of the card (the product page uses it next to the headline).
const CARD_IMAGE_HEIGHT = 890;
/** a little of the page around the card, so that it reads as a card and not as a cut-out */
const IMAGE_MARGIN = 12;
const natural = new Set(["card-hero"]);

for (const { scenario, file, clock, before } of shots) {
  test(`screenshot ${file}`, async ({ page }) => {
    if (clock) await fixClock(page, clock);
    await page.setViewportSize({ width: 512, height: CARD_IMAGE_HEIGHT + 100 });
    await page.goto(`/dev/index.html?scenario=${scenario}`);
    await expect(page.locator("detailed-energy-card .path")).toContainText("Zuhause");
    await expect(page.locator("detailed-energy-card .path")).not.toContainText("eg");
    await before?.(page);
    const card = page.locator("detailed-energy-card");
    if (natural.has(file)) {
      await card.screenshot({ path: `docs/screenshots/${file}.png` });
      return;
    }
    const box = await card.boundingBox();
    if (!box || box.height > CARD_IMAGE_HEIGHT) throw new Error(`${file}: the card is taller than the image (${box?.height} px)`);
    await page.screenshot({
      path: `docs/screenshots/${file}.png`,
      clip: { x: box.x - IMAGE_MARGIN, y: box.y - IMAGE_MARGIN, width: box.width + 2 * IMAGE_MARGIN, height: CARD_IMAGE_HEIGHT + 2 * IMAGE_MARGIN },
    });
  });
}

// The heatmap card (dev/index.html?card=heatmap), 14 days
test("screenshot card-heatmap", async ({ page }) => {
  await fixClock(page, "2026-10-13T17:30:00Z");
  await page.setViewportSize({ width: 512, height: CARD_IMAGE_HEIGHT + 100 });
  await page.goto("/dev/index.html?card=heatmap");
  const card = page.locator("detailed-energy-heatmap-card");
  await expect(card.locator(".cell").first()).toBeVisible();
  const box = await card.boundingBox();
  if (!box) throw new Error("card-heatmap: no card");
  await page.screenshot({
    path: "docs/screenshots/card-heatmap.png",
    clip: { x: box.x - IMAGE_MARGIN, y: box.y - IMAGE_MARGIN, width: box.width + 2 * IMAGE_MARGIN, height: box.height + 2 * IMAGE_MARGIN },
  });
});

// The editor, rendered in a dialog like the one of Home Assistant with demo data (dev/index.html?editor=editor).
// The form fields are drawn by a stand-in for <ha-form> (dev/ha-form-stub.js).
test.describe("editor screenshots", () => {
  const dialog = (page: import("@playwright/test").Page) => page.locator(".dlg");
  const editor = (page: import("@playwright/test").Page) => page.locator("detailed-energy-card-editor");
  const open = async (page: import("@playwright/test").Page) => {
    await page.setViewportSize({ width: 1000, height: 1080 });
    await page.goto("/dev/index.html?editor=editor");
    await expect(editor(page)).toBeVisible();
    await expect(page.locator("detailed-energy-card .path")).not.toHaveText("");
    await page.waitForTimeout(600); // the card measures its width after the first render
  };
  const toTop = (locator: import("@playwright/test").Locator) => locator.evaluate((el) => el.scrollIntoView({ block: "start" }));
  const shot = (page: import("@playwright/test").Page, file: string) => dialog(page).screenshot({ path: `docs/screenshots/${file}.png` });

  test("editor-general", async ({ page }) => {
    await open(page);
    await page.locator(".pane-l").evaluate((el) => (el.scrollTop = 150));
    await shot(page, "editor-general");
  });

  test("editor-thresholds", async ({ page }) => {
    await open(page);
    await editor(page).locator("button.title.section").click();
    await editor(page).locator(".levels button", { hasText: "Räume" }).click();
    await editor(page).locator(".item .head button.title", { hasText: "ab 800 W" }).click();
    await toTop(editor(page).locator("button.title.section"));
    await page.locator('detailed-energy-card button.node[title="EG"]').click();
    await page.locator('detailed-energy-card button.node[title="Küche"]').click();
    await page.waitForTimeout(700); // the other floors and rooms have faded out
    await shot(page, "editor-thresholds");
  });

  test("editor-energy", async ({ page }) => {
    await open(page);
    await editor(page).locator("h3", { hasText: "Zuhause" }).first().scrollIntoViewIfNeeded();
    await editor(page).locator(".item .head button.title", { hasText: "PV" }).click();
    await toTop(editor(page).locator("h3", { hasText: "Zuhause" }).first());
    await page.locator("detailed-energy-card .modes button", { hasText: "Heute" }).click();
    await expect(page.locator("detailed-energy-card .pill small", { hasText: "kWh" }).first()).toBeVisible();
    await shot(page, "editor-energy");
  });

  test("editor-structure", async ({ page }) => {
    await open(page);
    await editor(page).locator(".item .head button.title", { hasText: "EG" }).first().click();
    await editor(page).locator(".item .head button.title", { hasText: "Küche" }).first().click();
    await toTop(editor(page).locator("h3", { hasText: "Struktur" }));
    await page.locator("detailed-energy-card .modes button", { hasText: "Heute" }).click();
    await page.locator('detailed-energy-card button.node[title="EG"]').click();
    await page.locator('detailed-energy-card button.node[title="Küche"]').click();
    await expect(page.locator("detailed-energy-card .pill small", { hasText: "kWh" }).first()).toBeVisible();
    await page.waitForTimeout(700); // the other floors and rooms have faded out
    await shot(page, "editor-structure");
  });

  // the wizard "import from the Energy dashboard": the structure step (the overlay covers the viewport, not the dialog)
  test("editor-import", async ({ page }) => {
    await open(page);
    await editor(page).locator("button.import").click();
    const wizard = editor(page).locator("detailed-energy-import-wizard");
    await wizard.getByRole("button", { name: "Weiter" }).click();
    await expect(wizard.locator(".steps .on")).toHaveText("2 Struktur");
    await page.waitForTimeout(300);
    await wizard.locator(".panel").screenshot({ path: "docs/screenshots/editor-import.png" });
  });
});
