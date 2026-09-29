import { expect, test } from "@playwright/test";

// Renders the images used in README.md. Run: npm run screenshots
const shots: Array<{ scenario: string; file: string; before?: (page: import("@playwright/test").Page) => Promise<void> }> = [
  { scenario: "floors", file: "card-with-floors" },
  { scenario: "flat", file: "card-without-floors" },
  { scenario: "wrap", file: "card-many-rooms-wrapped" },
  {
    scenario: "floors",
    file: "card-all-rooms",
    before: async (page) => {
      await page.locator("energy-card button.node[title=Küche]").click();
    },
  },
];

for (const { scenario, file, before } of shots) {
  test(`screenshot ${file}`, async ({ page }) => {
    await page.goto(`/dev/index.html?scenario=${scenario}`);
    await expect(page.locator("energy-card .path")).toContainText("Zuhause");
    await expect(page.locator("energy-card .path")).not.toContainText("eg");
    await before?.(page);
    await page.locator("energy-card").screenshot({ path: `docs/screenshots/${file}.png` });
  });
}
