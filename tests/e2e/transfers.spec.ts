import { test, expect } from "@playwright/test";
test.use({ serviceWorkers: "block" });
test("create an encrypted link, retry a wrong passphrase on a phone, import once, and revoke", async ({
  page,
  browser,
}) => {
  const pass = "a private transfer passphrase";
  const token = "a".repeat(43);
  let envelope: unknown,
    complete = false,
    revoked = false;
  const item = {
    id: "test-transfer",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  };
  await page.route("**/web-transfers", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      envelope = body.envelope;
      expect(body.hours).toBe(1);
      expect(JSON.stringify(envelope)).not.toContain("Transfer home");
      return route.fulfill({
        json: { id: item.id, token, expiresAt: item.expires_at },
      });
    }
    return route.fulfill({
      json: {
        transfers: envelope
          ? [
              {
                ...item,
                completed_at: complete ? new Date().toISOString() : null,
                revoked_at: revoked ? new Date().toISOString() : null,
              },
            ]
          : [],
      },
    });
  });
  await page.route("**/web-transfers/revoke", (route) => {
    revoked = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await page.getByLabel("Household name").fill("Transfer home");
  await page.getByLabel("Your name", { exact: true }).fill("Alex");
  await page.getByLabel("Your partner’s name").fill("Sam");
  await page.getByLabel("Vault passphrase").fill(pass);
  await page.getByRole("button", { name: "Create our household" }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Create transfer link", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Link expires after").selectOption("1");
  await page
    .getByRole("button", { name: "Create transfer link", exact: true })
    .click();
  const link = await page
    .getByLabel("Private transfer link", { exact: true })
    .inputValue();
  expect(link).toContain("/#transfer=");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const recipient = await context.newPage();
  await recipient.route("**/transfers/claim", (route) => {
    expect(route.request().postDataJSON().token).toBe(token);
    return route.fulfill({ json: { envelope } });
  });
  let completionAttempts = 0;
  await recipient.route("**/transfers/complete", (route) => {
    if (++completionAttempts === 1)
      return route.fulfill({
        status: 503,
        json: { error: "Temporary connection failure" },
      });
    complete = true;
    return route.fulfill({ json: { ok: true } });
  });
  await recipient.goto(link);
  await recipient
    .getByLabel("Sender’s vault passphrase")
    .fill("a wrong transfer passphrase");
  await recipient
    .getByRole("button", { name: "Import encrypted backup" })
    .click();
  await expect(recipient.getByRole("alert")).toBeVisible();
  expect(complete).toBe(false);
  await recipient.getByLabel("Sender’s vault passphrase").fill(pass);
  await recipient
    .getByRole("button", { name: "Import encrypted backup" })
    .click();
  await expect(
    recipient.getByRole("heading", { name: "Your household is saved" }),
  ).toBeVisible();
  await expect(recipient.getByRole("alert")).toContainText(
    "Temporary connection failure",
  );
  await recipient
    .getByRole("button", { name: "Retry closing transfer link" })
    .click();
  await expect(recipient.getByRole("status")).toContainText("Import complete");
  expect(complete).toBe(true);
  await expect(recipient.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await recipient.screenshot({
    path: "test-results/tandem-transfer-import.png",
    fullPage: true,
  });
  await recipient
    .getByRole("button", { name: "Open Tandem", exact: true })
    .click();
  await recipient.reload();
  await recipient.getByLabel("Vault passphrase").fill(pass);
  await recipient
    .getByRole("button", { name: "Unlock Tandem", exact: true })
    .click();
  await expect(recipient.locator("body")).toContainText("Transfer home");
  await context.close();
  await page.getByRole("button", { name: "Refresh link status" }).click();
  await expect(page.locator(".transfer-row")).toContainText("Imported");
  complete = false;
  await page
    .getByRole("button", { name: "Create transfer link", exact: true })
    .click();
  await page.getByRole("button", { name: "Revoke link", exact: true }).click();
  await expect(page.locator(".transfer-row")).toContainText("Revoked");
  await expect(
    page.getByLabel("Private transfer link", { exact: true }),
  ).not.toBeVisible();
});
