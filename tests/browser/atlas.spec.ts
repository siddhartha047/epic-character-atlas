import { test, expect } from "@playwright/test";
import sample from "../../data/epics/mahabharata/graph.json" with { type: "json" };
test("search alias, inspect source, switch family mode and restore a shared hash", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Mahabharata", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search characters and aliases" })
    .fill("Pritha");
  await page
    .locator(".character-row")
    .filter({ hasText: "Kunti" })
    .first()
    .click();
  await expect(page.locator(".detail-content h2")).toHaveText("Kunti");
  await page.getByRole("button", { name: "Family view", exact: true }).click();
  await expect(page).toHaveURL(/view=family/);
  await expect(page.locator(".sigma-container canvas").first()).toBeVisible();
  await expect(page.locator(".graph-notice")).toHaveCount(0);
  await page.locator(".evidence-list summary").first().click();
  await expect(page.locator(".evidence-list blockquote").first()).toBeVisible();
  const url = page.url();
  await page.reload();
  await expect(page.locator(".detail-content h2")).toHaveText("Kunti");
  expect(page.url()).toBe(url);
  await page.screenshot({
    path: "test-results/desktop-family.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("namesakes, isolates, filter exclusion and honest progress", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("textbox", { name: "Search characters and aliases" })
    .fill("Janamejaya");
  await expect
    .poll(() =>
      page
        .locator(".character-row strong")
        .filter({ hasText: /^Janamejaya$/ })
        .count(),
    )
    .toBeGreaterThanOrEqual(2);
  await page
    .getByRole("textbox", { name: "Search characters and aliases" })
    .fill("Saunaka");
  await page.locator(".character-row").first().click();
  await expect(page.locator(".detail-content h2")).toHaveText("Saunaka");
  await page.getByRole("button", { name: "Family view", exact: true }).click();
  await expect(page.locator(".map-heading")).toContainText("1 character");
  await page.getByRole("button", { name: "Expanding atlas" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "current release is partial",
  );
  await page.getByRole("button", { name: "Close coverage" }).click();
});
test("mobile browsing, details, source and graph without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.getByRole("button", { name: "Browse", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search characters and aliases" })
    .fill("Arjuna");
  await page
    .locator(".character-row")
    .filter({ hasText: "Arjuna" })
    .first()
    .click();
  await expect(page.locator(".detail-content h2")).toHaveText("Arjuna");
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await expect(page.locator(".sigma-container canvas").first()).toBeVisible();
  await expect(page.locator(".graph-notice")).toHaveCount(0);
  await page.getByRole("button", { name: "Family view", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".sigma-container canvas").first()).toBeVisible();
  await expect(page.locator(".graph-notice")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/mobile-family.png",
    fullPage: true,
  });
});
test("renders and searches a synthetic 10,000-character, 30,000-edge network", async ({
  page,
}) => {
  const stress = {
    ...sample,
    characters: Array.from({ length: 10000 }, (_, i) => ({
      ...sample.characters[0],
      id: `mahabharata:stress:${i}`,
      name: `Stress character ${i}`,
      aliases: [],
      gender: [],
      description: "",
    })),
    relationships: Array.from({ length: 30000 }, (_, i) => ({
      ...sample.relationships[0],
      id: `stress:${i}`,
      from: `mahabharata:stress:${i % 10000}`,
      to: `mahabharata:stress:${(i + 1 + Math.floor(i / 10000)) % 10000}`,
      type: "parent_of",
      parenthood: "biological",
    })),
  };
  await page.route("**/data/mahabharata/graph.json", (route) =>
    route.fulfill({ json: stress }),
  );
  await page.goto("./");
  await expect(page.locator(".graph-counts")).toContainText(
    "10,000 characters",
  );
  await expect(page.locator(".sigma-container canvas").first()).toBeVisible();
  await expect(page.locator(".graph-notice")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Search characters and aliases" })
    .fill("Stress character 9999");
  await page.locator(".character-row").first().click();
  await expect(page.locator(".detail-content h2")).toHaveText(
    "Stress character 9999",
  );
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
});
