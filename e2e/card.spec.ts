import { expect, test, type Page } from "@playwright/test";

const open = async (page: Page, scenario: string) => {
  await page.goto(`/dev/index.html?scenario=${scenario}`);
  // registries are loaded asynchronously; names replace the ids once they arrive
  await expect(page.locator("energy-card .path")).not.toHaveText("");
};
const node = (page: Page, title: string) => page.locator(`energy-card button.node[title="${title}"]`);

test("floors: shows sources, floors, rooms and the consumer list", async ({ page }) => {
  await open(page, "floors");
  await expect(page.locator("energy-card h2")).toHaveText("Energiefluss");
  await expect(page.locator("energy-card .badge")).toContainText("Autarkie 92 %");
  await expect(page.locator("energy-card .path")).toHaveText("Zuhause › EG");
  for (const t of ["PV", "Batterie", "Netz", "EG", "OG", "Keller", "Küche", "Wohnzimmer", "Flur"]) {
    await expect(node(page, t)).toBeVisible();
  }
  await expect(page.locator("energy-card .detail .row").first()).toContainText("Backofen");
  await expect(page.locator("energy-card .detail-head")).toContainText("6 Verbraucher");
});

test("floors: choosing a floor swaps the room row", async ({ page }) => {
  await open(page, "floors");
  await node(page, "OG").click();
  await expect(page.locator("energy-card .path")).toHaveText("Zuhause › OG");
  await expect(node(page, "Bad")).toBeVisible();
  await expect(page.locator("energy-card .circle.room.selected")).toHaveCount(1); // OG has one room
  await expect(node(page, "Küche")).toHaveCount(0);
});

test("opening a floor selects all of its rooms", async ({ page }) => {
  await open(page, "floors");
  await expect(page.locator("energy-card .circle.room.selected")).toHaveCount(3);
  await node(page, "Küche").click(); // narrow down to one room ...
  await node(page, "OG").click();
  await node(page, "EG").click(); // ... opening a floor again selects all of its rooms
  await expect(page.locator("energy-card .path")).toHaveText("Zuhause › EG");
  await expect(page.locator("energy-card .circle.room.selected")).toHaveCount(3);
  await expect(page.locator("energy-card .detail-head")).toContainText("6 Verbraucher");
});

test("choosing a room selects just that room, clicking it again selects all again", async ({ page }) => {
  await open(page, "floors");
  await node(page, "Küche").click();
  await expect(page.locator("energy-card .path")).toHaveText("Zuhause › EG › Küche");
  await expect(page.locator("energy-card .circle.room.selected")).toHaveCount(1);
  await expect(page.locator("energy-card .detail-head")).toContainText("4 Verbraucher");
  await node(page, "Flur").click();
  await expect(page.locator("energy-card .path")).toHaveText("Zuhause › EG › Flur");
  await node(page, "Flur").click();
  await expect(page.locator("energy-card .path")).toHaveText("Zuhause › EG");
  await expect(page.locator("energy-card .circle.room.selected")).toHaveCount(3);
  await expect(page.locator("energy-card .detail-head")).toContainText("6 Verbraucher");
});

test("flat without floors: rooms hang directly under the home", async ({ page }) => {
  await open(page, "flat");
  await expect(page.locator("energy-card button.node[title=EG]")).toHaveCount(0);
  await expect(page.locator("energy-card .path")).toHaveText("Zuhause");
  await expect(page.locator("energy-card .circle.room")).toHaveCount(5);
  await expect(page.locator("energy-card .circle.room.selected")).toHaveCount(5);
  await expect(node(page, "Balkon-PV")).toBeVisible();
});

test("many rooms scroll horizontally by default", async ({ page }) => {
  await open(page, "many");
  const scroll = page.locator("energy-card .scroll");
  const [sw, cw] = await scroll.evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(sw).toBeGreaterThan(cw);
});

test("many rooms wrap into two rows when enabled", async ({ page }) => {
  await open(page, "wrap");
  const scroll = page.locator("energy-card .scroll");
  const [sw, cw] = await scroll.evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw);
  const tops = await page.locator("energy-card .circle.room").evaluateAll((els) =>
    [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))],
  );
  expect(tops).toHaveLength(2);
});

test("an invalid configuration shows a readable error", async ({ page }) => {
  await page.goto("/dev/index.html?scenario=invalid");
  await expect(page.locator("energy-card .error")).toContainText("area_id");
});

test("lines with more power animate faster", async ({ page }) => {
  await open(page, "floors");
  const durations = await page.locator("energy-card path.line.flowing").evaluateAll((els) =>
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
  await expect(page.locator("energy-card .path")).toHaveText("Zuhause");
  await expect(page.locator("energy-card .pill.selected")).toHaveCount(3);
  await expect(page.locator("energy-card .circle.room")).toHaveCount(0);
  await expect(page.locator("energy-card .detail-head")).toContainText("8 Verbraucher");
  await node(page, "OG").click();
  await expect(page.locator("energy-card .path")).toHaveText("Zuhause › OG");
  await expect(page.locator("energy-card .pill.selected")).toHaveCount(1);
});

test("clicking the home selects everything again", async ({ page }) => {
  await open(page, "floors");
  await node(page, "OG").click();
  await node(page, "Zuhause").click();
  await expect(page.locator("energy-card .path")).toHaveText("Zuhause");
  await expect(page.locator("energy-card .pill.selected")).toHaveCount(3);
  await expect(page.locator("energy-card .detail-head")).toContainText("8 Verbraucher");
});

test("flat: clicking the home selects all rooms", async ({ page }) => {
  await open(page, "flat");
  await node(page, "Zuhause").click();
  await expect(page.locator("energy-card .circle.room.selected")).toHaveCount(5);
  await expect(page.locator("energy-card .path")).toHaveText("Zuhause");
  await node(page, "Bad").click();
  await expect(page.locator("energy-card .circle.room.selected")).toHaveCount(1);
});

test.describe("consumer list on small screens", () => {
  for (const width of [420, 340, 280]) {
    test(`values stay visible and aligned at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, "long");
      const card = await page.locator("energy-card ha-card").boundingBox();
      const vals = await page.locator("energy-card .row .val").evaluateAll((els) =>
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
    await expect(page.locator("energy-card .row .bar").first()).toBeVisible();
    await page.setViewportSize({ width: 300, height: 900 });
    await expect(page.locator("energy-card .row .bar").first()).toBeHidden();
    await expect(page.locator("energy-card .row .val").first()).toBeVisible();
  });

  test("long names are cut off with an ellipsis instead of pushing the values", async ({ page }) => {
    await page.setViewportSize({ width: 340, height: 900 });
    await open(page, "long");
    const cut = await page.locator("energy-card .row .name").evaluateAll((els) =>
      els.map((e) => e.scrollWidth > e.clientWidth),
    );
    expect(cut.some(Boolean)).toBe(true);
  });
});

test("floors are fully visible when no rooms are shown", async ({ page }) => {
  await open(page, "floors");
  await node(page, "Zuhause").click();
  const scroll = await page.locator("energy-card .scroll").boundingBox();
  const pills = await page.locator("energy-card .pill").evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().bottom),
  );
  expect(pills).toHaveLength(3);
  for (const bottom of pills) expect(bottom).toBeLessThanOrEqual(scroll!.y + scroll!.height);
});

test("on wide screens the bar uses the free space next to the name", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/dev/index.html?scenario=floors&width=900");
  await expect(page.locator("energy-card .path")).not.toHaveText("");
  const box = await page.locator("energy-card .detail").boundingBox();
  const bar = await page.locator("energy-card .row .bar").first().boundingBox();
  // the bar starts in the left half and stretches over at least 40 % of the list
  expect(bar!.x - box!.x).toBeLessThan(box!.width * 0.5);
  expect(bar!.width).toBeGreaterThan(box!.width * 0.4);
});
