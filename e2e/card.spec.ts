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
  await expect(page.locator("energy-card .path")).toHaveText("Zuhause › EG › Küche");
  for (const t of ["PV", "Batterie", "Netz", "EG", "OG", "Keller", "Küche", "Wohnzimmer", "Flur"]) {
    await expect(node(page, t)).toBeVisible();
  }
  await expect(page.locator("energy-card .detail .row").first()).toContainText("Backofen");
  await expect(page.locator("energy-card .detail-head")).toContainText("4 Verbraucher");
});

test("floors: choosing a floor swaps the room row", async ({ page }) => {
  await open(page, "floors");
  await node(page, "OG").click();
  await expect(page.locator("energy-card .path")).toHaveText("Zuhause › OG › Bad");
  await expect(node(page, "Bad")).toBeVisible();
  await expect(node(page, "Küche")).toHaveCount(0);
});

test("clicking the selected room selects all rooms of the floor", async ({ page }) => {
  await open(page, "floors");
  await node(page, "Küche").click();
  await expect(page.locator("energy-card .path")).toHaveText("Zuhause › EG");
  await expect(page.locator("energy-card .circle.room.selected")).toHaveCount(3);
  await expect(page.locator("energy-card .detail-head")).toContainText("EG");
  await expect(page.locator("energy-card .detail-head")).toContainText("6 Verbraucher");
  await node(page, "Flur").click();
  await expect(page.locator("energy-card .path")).toHaveText("Zuhause › EG › Flur");
  await expect(page.locator("energy-card .circle.room.selected")).toHaveCount(1);
});

test("flat without floors: rooms hang directly under the home", async ({ page }) => {
  await open(page, "flat");
  await expect(page.locator("energy-card button.node[title=EG]")).toHaveCount(0);
  await expect(page.locator("energy-card .path")).toHaveText("Zuhause › Küche");
  await expect(page.locator("energy-card .circle.room")).toHaveCount(5);
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
  await expect(page.locator("energy-card .path")).toHaveText("Zuhause › OG › Bad");
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
