import { expect, test } from "@playwright/test";

// Renders the images used in README.md. Run: npm run screenshots
// The language of the images: English (the README is English); SHOT_LANG=de renders them German.
const LANG = process.env.SHOT_LANG === "de" ? "de" : "en";
const EN: Record<string, string> = { Küche: "Kitchen", EG: "Ground", Zuhause: "Home", Heute: "Today", Räume: "Rooms", Struktur: "Structure", Weiter: "Next", "ab 800 W": "from 800 W" };
/** a German word of the dev page in the language of the images */
const t = (de: string): string => (LANG === "en" ? (EN[de] ?? de) : de);
const shots: Array<{ scenario: string; file: string; /** card width in px (the dev page `?width=`) */ width?: number; clock?: string; before?: (page: import("@playwright/test").Page) => Promise<void> }> = [
  {
    scenario: "floors",
    file: "card-with-floors",
    before: async (page) => {
      await page.locator(`detailed-energy-card button.node[title=${t("Küche")}]`).click();
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
      await page.locator(`detailed-energy-card button.node[title=${t("Küche")}]`).click();
    },
  },
  {
    scenario: "energy",
    file: "card-energy",
    // the statistics arrive after the first render
    before: async (page) => {
      await expect(page.locator("detailed-energy-card .pill small", { hasText: "kWh" }).first()).toBeVisible();
      await page.locator(`detailed-energy-card button.node[title=${t("Küche")}]`).click();
    },
  },
  {
    scenario: "meters",
    file: "card-meters",
    // own meters of EG, kitchen and hall; the kitchen list shows what its consumers miss
    before: async (page) => {
      await expect(page.locator("detailed-energy-card .pill small", { hasText: "kWh" }).first()).toBeVisible();
      await page.locator(`detailed-energy-card button.node[title=${t("Küche")}]`).click();
    },
  },
  {
    scenario: "secondary",
    file: "card-secondary",
    // the power now with the energy of today below it (options.secondary_value: auto)
    before: async (page) => {
      await expect(page.locator("detailed-energy-card .second", { hasText: "kWh" }).first()).toBeVisible();
      await page.locator(`detailed-energy-card button.node[title=${t("Küche")}]`).click();
    },
  },
  {
    scenario: "feedin",
    file: "card-feedin",
    // feed-in and charging in the energy mode, with the self-consumption badge
    before: async (page) => {
      await expect(page.locator("detailed-energy-card .back", { hasText: "kWh" }).first()).toBeVisible();
      await page.locator(`detailed-energy-card button.node[title=${t("Küche")}]`).click();
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
      await page.locator(`detailed-energy-card button.node[title=${t("Küche")}]`).click();
      await expect(page.locator("detailed-energy-card .standby")).toBeVisible();
    },
  },
  {
    scenario: "actions",
    file: "card-actions",
    // the toggles of two consumers at the end of their rows; the kitchen is selected
    before: async (page) => {
      await page.locator(`detailed-energy-card button.node[title=${t("Küche")}]`).click();
      await expect(page.locator("detailed-energy-card .switch").first()).toBeVisible();
    },
  },
  {
    scenario: "compact",
    file: "card-compact",
    width: 360,
    // sources, home and floors in small circles: the card at the width of a phone
    before: async (page) => {
      await expect(page.locator("detailed-energy-card .graph.compact")).toBeVisible();
    },
  },
  {
    scenario: "sankey",
    file: "card-sankey",
    // sources, floors and rooms with feed-in and charging below; the kitchen is selected, the hours do not matter
    before: async (page) => {
      await expect(page.locator("detailed-energy-card .sk-label", { hasText: "kWh" }).first()).toBeVisible();
      await page.locator(`detailed-energy-card .sk-node[aria-label^="${t("Küche")}:"]`).click();
    },
  },
  {
    scenario: "costs",
    file: "card-costs",
    // costs from a dynamic price: the badge and the costs of every node; a fixed clock gives the same amounts
    clock: "2026-10-13T17:30:00Z",
    before: async (page) => {
      await expect(page.locator("detailed-energy-card .badge.costs")).toBeVisible();
      await page.locator(`detailed-energy-card button.node[title=${t("Küche")}]`).click();
    },
  },
  { scenario: "floors", file: "card-all-rooms" },
  {
    scenario: "floors",
    file: "card-hero",
    before: async (page) => {
      await page.locator(`detailed-energy-card button.node[title=${t("Küche")}]`).click();
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
const CARD_IMAGE_HEIGHT = 910;
/** a little of the page around the card, so that it reads as a card and not as a cut-out */
const IMAGE_MARGIN = 12;
const natural = new Set(["card-hero"]);

for (const { scenario, file, clock, width, before } of shots) {
  test(`screenshot ${file}`, async ({ page }) => {
    if (clock) await fixClock(page, clock);
    await page.setViewportSize({ width: 512, height: CARD_IMAGE_HEIGHT + 100 });
    await page.goto(`/dev/index.html?scenario=${scenario}&lang=${LANG}${width ? `&width=${width}` : ""}`);
    await expect(page.locator("detailed-energy-card .path")).toContainText(t("Zuhause"));
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
  await page.goto(`/dev/index.html?card=heatmap&lang=${LANG}`);
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
    await page.goto(`/dev/index.html?editor=editor&lang=${LANG}`);
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
    await editor(page).locator(".levels button", { hasText: t("Räume") }).click();
    await editor(page).locator(".item .head button.title", { hasText: t("ab 800 W") }).click();
    await toTop(editor(page).locator("button.title.section"));
    await page.locator(`detailed-energy-card button.node[title="${t("EG")}"]`).click();
    await page.locator(`detailed-energy-card button.node[title="${t("Küche")}"]`).click();
    await page.waitForTimeout(700); // the other floors and rooms have faded out
    await shot(page, "editor-thresholds");
  });

  test("editor-energy", async ({ page }) => {
    await open(page);
    await editor(page).locator("h3", { hasText: t("Zuhause") }).first().scrollIntoViewIfNeeded();
    await editor(page).locator(".item .head button.title", { hasText: "PV" }).click();
    await toTop(editor(page).locator("h3", { hasText: t("Zuhause") }).first());
    await page.locator("detailed-energy-card .modes button", { hasText: t("Heute") }).click();
    await expect(page.locator("detailed-energy-card .pill small", { hasText: "kWh" }).first()).toBeVisible();
    await shot(page, "editor-energy");
  });

  test("editor-structure", async ({ page }) => {
    await open(page);
    await editor(page).locator(".item .head button.title", { hasText: t("EG") }).first().click();
    await editor(page).locator(".item .head button.title", { hasText: t("Küche") }).first().click();
    await toTop(editor(page).locator("h3", { hasText: t("Struktur") }));
    await page.locator("detailed-energy-card .modes button", { hasText: t("Heute") }).click();
    await page.locator(`detailed-energy-card button.node[title="${t("EG")}"]`).click();
    await page.locator(`detailed-energy-card button.node[title="${t("Küche")}"]`).click();
    await expect(page.locator("detailed-energy-card .pill small", { hasText: "kWh" }).first()).toBeVisible();
    await page.waitForTimeout(700); // the other floors and rooms have faded out
    await shot(page, "editor-structure");
  });

  // the wizard "import from the Energy dashboard": the structure step (the overlay covers the viewport, not the dialog)
  test("editor-import", async ({ page }) => {
    await open(page);
    await editor(page).locator("button.import").click();
    const wizard = editor(page).locator("detailed-energy-import-wizard");
    await wizard.getByRole("button", { name: t("Weiter") }).click();
    await expect(wizard.locator(".steps .on")).toHaveText(`2 ${t("Struktur")}`);
    await page.waitForTimeout(300);
    await wizard.locator(".panel").screenshot({ path: "docs/screenshots/editor-import.png" });
  });
});
