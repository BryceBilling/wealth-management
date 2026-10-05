import { test, expect } from "@playwright/test";
import { createServer } from "../../apps/server/app";
import { resolve } from "node:path";
import type { Pool } from "pg";
let server: Awaited<ReturnType<typeof createServer>>;
let origin: string;
test.beforeEach(async () => {
  server = await createServer({} as Pool, { staticDir: resolve("dist") });
  origin = await server.listen({ host: "127.0.0.1", port: 0 });
});
test.afterEach(async () => {
  await server.close();
});
const engine = "webkit";
test.use({
  browserName: engine,
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
test("phone navigation, installation guidance and offline vault restart", async ({
  page,
}) => {
  await page.goto(origin + "/");
  await page
    .getByRole("button", { name: "Install on your phone", exact: true })
    .click();
  await expect(page.locator(".install-instructions")).toContainText("iPhone");
  await expect(page.locator(".install-instructions")).toContainText("Android");
  const manifest = await (
    await page.request.get(origin + "/manifest.webmanifest")
  ).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.map((i: any) => i.sizes)).toEqual([
    "192x192",
    "512x512",
  ]);
  expect((await page.request.get(origin + "/apple-touch-icon.png")).ok()).toBe(
    true,
  );
  await page.getByLabel("Household name").fill("Mobile household");
  await page.getByLabel("Your name", { exact: true }).fill("Alex");
  await page.getByLabel("Your partner’s name").fill("Sam");
  await page.getByLabel("Vault passphrase").fill("mobile test passphrase");
  await page.getByRole("button", { name: "Create our household" }).click();
  await page.getByRole("button", { name: "Menu", exact: true }).tap();
  await page
    .locator("nav")
    .getByRole("button", { name: "Accounts", exact: true })
    .tap();
  await page.getByRole("button", { name: "Add account", exact: true }).tap();
  const a = page.getByRole("dialog");
  await a.getByLabel("Name", { exact: true }).fill("Phone broker");
  await a.getByLabel("Opening balance", { exact: true }).fill("0");
  await a.getByRole("button", { name: /^Save / }).tap();
  await expect(a).not.toBeVisible();
  await page.getByRole("button", { name: "Menu", exact: true }).tap();
  if (
    await page.getByRole("button", { name: "Close menu", exact: true }).count()
  )
    await page
      .getByRole("button", { name: "Close menu", exact: true })
      .tap({ position: { x: 375, y: 20 } });
  const bar = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Invest", exact: true }).tap();
  await page.getByRole("button", { name: "Add investment", exact: true }).tap();
  let d = page.getByRole("dialog");
  await d.getByLabel("Amount", { exact: true }).fill("1000");
  await d.getByLabel("Investment type", { exact: true }).selectOption("ETF");
  await d.getByLabel("Investment name", { exact: true }).fill("Mobile ETF");
  await d.getByRole("button", { name: "Save investment", exact: true }).tap();
  await expect(d).not.toBeVisible();
  await expect(page.locator(".investment-card")).toContainText("$1,000.00");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({
    path: `test-results/tandem-mobile-${engine}.png`,
    fullPage: true,
  });
  await bar.getByRole("button", { name: "More", exact: true }).tap();
  await page.getByRole("button", { name: "Share Tandem", exact: true }).tap();
  await expect(
    page.getByRole("dialog", { name: "Share Tandem" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close sharing", exact: true }).tap();
  await page
    .getByRole("button", { name: "Close menu", exact: true })
    .tap({ position: { x: 375, y: 20 } });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  // Stop the origin entirely: the next navigation must come from the offline cache.
  await server.close();
  await page.goto(origin + "/");
  await page.getByLabel("Vault passphrase").fill("mobile test passphrase");
  await page.getByRole("button", { name: "Unlock Tandem", exact: true }).tap();
  await expect(page.locator(".wealth-number")).toHaveText("$1,000.00");
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Invest", exact: true })
    .tap();
  await expect(page.locator(".investment-card")).toContainText("Phone broker");
  await expect(page.locator(".investment-card")).toContainText("Mobile ETF");
});
