import { test, expect } from "@playwright/test";

test.use({ browserName: "chromium", serviceWorkers: "block" });

test("Chrome reads the PWA manifest through a cookie-protected login gate", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "CF_Authorization",
      value: "test-session",
      url: "http://127.0.0.1:1420",
      httpOnly: true,
    },
  ]);
  let authenticated = false;
  await page.route("**/manifest.webmanifest", async (route) => {
    const headers = await route.request().allHeaders();
    authenticated = (headers.cookie ?? "").includes(
      "CF_Authorization=test-session",
    );
    if (!authenticated)
      return route.fulfill({
        status: 401,
        contentType: "text/html",
        body: "Sign in required",
      });
    await route.continue();
  });
  await page.goto("/");
  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send("Page.getAppManifest");
  expect(authenticated).toBe(true);
  expect(manifest.errors).toEqual([]);
  const data = JSON.parse(manifest.data!);
  expect(data.name).toBe("Tandem Household Wealth");
  expect(data.display).toBe("standalone");
  expect(data.start_url).toBe("/");
  for (const icon of data.icons) {
    const response = await page.request.get(icon.src);
    expect(response.ok()).toBe(true);
    const png = await response.body();
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
  }
});
