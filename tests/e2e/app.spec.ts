import { test, expect, type Page } from "@playwright/test";
const pass = "a private household test passphrase";
async function setup(page: Page) {
  await page.goto("/");
  await page.getByLabel("Household name").fill("The Willow House");
  await page.getByLabel("Your name", { exact: true }).fill("Alex");
  await page.getByLabel("Your partner’s name").fill("Sam");
  await page.getByLabel("Vault passphrase").fill(pass);
  await page.getByRole("button", { name: "Create our household" }).click();
  await expect(
    page.getByRole("heading", { name: "A clear view of your together." }),
  ).toBeVisible();
}
async function navigate(page: Page, name: string) {
  await page.locator("nav").getByRole("button", { name, exact: true }).click();
}
async function entity(
  page: Page,
  section: string,
  button: string,
  values: Record<string, string>,
) {
  await navigate(page, section);
  await page.getByRole("button", { name: button, exact: true }).click();
  const dialog = page.getByRole("dialog");
  for (const [label, value] of Object.entries(values)) {
    const el = dialog.getByLabel(label, { exact: true });
    if ((await el.evaluate((e) => e.tagName)) === "SELECT")
      await el.selectOption({ label: value });
    else await el.fill(value);
  }
  await dialog.getByRole("button", { name: /^Save / }).click();
  await expect(dialog).not.toBeVisible();
}
async function transaction(
  page: Page,
  kind: string,
  amount: string,
  extra: Record<string, string> = {},
) {
  if (kind === "Investment") {
    await navigate(page, "Investments");
    await page
      .locator(".investment-card")
      .filter({ hasText: extra.target })
      .getByRole("button", { name: "Add money", exact: true })
      .click();
  } else
    await page.getByRole("button", { name: "Quick add", exact: true }).click();
  const d = page.getByRole("dialog");
  await d.getByRole("button", { name: kind, exact: true }).click();
  await d.locator('input[name="amount"]').fill(amount);
  if (
    Object.keys(extra).some((k) =>
      ["name", "notes", "date", "person"].includes(k),
    )
  )
    await d.locator("summary").click();
  for (const [name, value] of Object.entries(extra)) {
    const el = d.locator(`[name="${name}"]`);
    if ((await el.evaluate((e) => e.tagName)) === "SELECT")
      await el.selectOption({ label: value });
    else await el.fill(value);
  }
  await d
    .getByRole("button", { name: "Save " + kind.toLowerCase(), exact: true })
    .click();
  await expect(d).not.toBeVisible();
}
test("real household workflows persist offline, restore, and fit mobile", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("PAGE ERROR", e.message);
  });
  page.on("requestfailed", (req) =>
    console.log("FAILED REQUEST", req.url(), req.failure()?.errorText),
  );
  await setup(page);
  await entity(page, "Accounts", "Add account", {
    Name: "Everyday bank",
    "Opening balance": "1000",
    "Opening date": "2026-01-01",
  });
  await entity(page, "Accounts", "Add account", {
    Name: "Emergency savings",
    "Account type": "Savings",
    "Opening balance": "5000",
    "Opening date": "2026-01-01",
  });
  await entity(page, "Investments", "Add investment", {
    Amount: "10000",
    "Investment name": "Global ETF",
    "Investment type": "ETF",
    Account: "Everyday bank · USD",
  });
  await entity(page, "Debts", "Add debt", {
    "Amount owed": "4000",
    "Who it’s owed to": "Home loan",
    "Interest rate (%)": "18",
    "Monthly repayment": "400",
  });
  await navigate(page, "Overview");
  await expect(page.locator(".wealth-number")).toHaveText("$12,000.00");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.getByLabel("Vault passphrase").fill(pass);
  await page.getByRole("button", { name: "Unlock Tandem" }).click();
  await context.setOffline(true);
  await transaction(page, "Income", "2000", { name: "Monthly salary" });
  await transaction(page, "Expense", "100", {
    name: "Groceries",
    category: "Groceries",
    merchant: "Neighbourhood market",
  });
  await transaction(page, "Debt", "400", { target: "Home loan" });
  await transaction(page, "Savings", "500", {
    account: "Emergency savings · USD",
  });
  await transaction(page, "Investment", "250", { target: "Global ETF" });
  await navigate(page, "Debts");
  await expect(page.locator(".big-number").first()).toHaveText("$3,660.00");
  await page
    .getByRole("button", { name: "Edit Home loan", exact: true })
    .click();
  const debtForm = page.getByRole("dialog");
  await expect(
    debtForm.locator("form input, form select, form textarea"),
  ).toHaveCount(5);
  await expect(debtForm.getByLabel("Monthly payment date")).toHaveValue("1");
  await expect(debtForm.getByLabel("Amount owed", { exact: true })).toHaveValue(
    "3660.00",
  );
  await expect(
    debtForm.getByLabel("Original principal", { exact: true }),
  ).toHaveCount(0);
  await expect(
    debtForm.getByLabel("Opening outstanding principal", { exact: true }),
  ).toHaveCount(0);
  await debtForm
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(debtForm).not.toBeVisible();
  await expect(page.locator(".big-number").first()).toHaveText("$3,660.00");

  await navigate(page, "Accounts");
  await expect(
    page
      .locator(".account-card")
      .filter({ hasText: "Everyday bank" })
      .locator(".big-number"),
  ).toHaveText("$2,500.00");
  await expect(
    page
      .locator(".account-card")
      .filter({ hasText: "Emergency savings" })
      .locator(".big-number"),
  ).toHaveText("$5,500.00");
  await navigate(page, "Investments");
  await expect(page.locator(".big-number").first()).toHaveText("$10,250.00");
  await page.getByRole("button", { name: "Update value" }).click();
  let d = page.getByRole("dialog");
  await d.getByLabel("Amount", { exact: true }).fill("11000");
  await d.getByRole("button", { name: "Save changes" }).click();
  await expect(d).not.toBeVisible();
  await expect(page.locator(".big-number").first()).toHaveText("$11,000.00");
  await page.reload();
  await page.getByLabel("Vault passphrase").fill(pass);
  await page.getByRole("button", { name: "Unlock Tandem" }).click();
  await expect(page.locator(".wealth-number")).toHaveText("$15,340.00");
  await navigate(page, "Transactions");
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await navigate(page, "Settings");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export encrypted backup", exact: true })
    .click();
  const backup = await downloadPromise;
  await backup.saveAs("/private/tmp/tandem-e2e-backup.tandem");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({
    path: "test-results/tandem-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigate(page, "Overview");
  await page.screenshot({
    path: "test-results/tandem-overview.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await context.setOffline(false);
  const second = await context.browser()!.newContext();
  const p2 = await second.newPage();
  await p2.goto("/");
  await p2.getByText("Joining your partner? Restore a backup").click();
  await p2.getByLabel("Backup passphrase", { exact: true }).fill(pass);
  await p2
    .locator("input[type=file]")
    .setInputFiles("/private/tmp/tandem-e2e-backup.tandem");
  await expect(p2.locator(".wealth-number")).toHaveText("$15,340.00");
  await second.close();
});
test("bill expectations, recurring calendar and audit edits", async ({
  page,
}) => {
  await setup(page);
  await entity(page, "Accounts", "Add account", {
    Name: "Bank",
    "Opening balance": "5000",
  });
  await entity(page, "Bills", "Add bill", {
    Name: "Internet",
    "Expected amount": "60",
    "Payment account": "Bank · USD",
    "First due date": new Date().toLocaleDateString("en-CA"),
  });
  await expect(
    page.getByRole("button", { name: "Record payment", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d.locator("input[name=amount]").fill("55");
  await d.getByRole("button", { name: "Save bill", exact: true }).click();
  await expect(d).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record payment", exact: true }),
  ).toHaveCount(0);
  await navigate(page, "Transactions");
  await page.getByRole("button", { name: "Edit Internet" }).click();
  await page.getByRole("dialog").locator("input[name=amount]").fill("57");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "History Internet" }).click();
  await expect(page.locator(".audit")).toHaveCount(2);
});
test("simple savings use one account and background sync never navigates to Settings", async ({
  page,
}) => {
  await setup(page);
  await entity(page, "Accounts", "Add account", {
    Name: "Savings pot",
    "Account type": "Savings",
    "Opening balance": "0",
  });
  await navigate(page, "Overview");
  await page.getByRole("button", { name: "Quick add", exact: true }).click();
  const d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Savings", exact: true }).click();
  await expect(d.getByLabel("Savings account", { exact: true })).toBeVisible();
  await expect(d.locator("[name=destination]")).toHaveCount(0);
  await d.locator("[name=amount]").fill("500");
  await d.getByRole("button", { name: "Save savings", exact: true }).click();
  await expect(d).not.toBeVisible();
  await expect(page.locator(".wealth-number")).toHaveText("$500.00");
  await page.clock.install();
  await page.clock.fastForward(46000);
  await expect(
    page.getByRole("heading", { name: "A clear view of your together." }),
  ).toBeVisible();
});
test("concurrent tabs cannot overwrite saved data", async ({
  page,
  context,
}) => {
  await setup(page);
  await entity(page, "Accounts", "Add account", {
    Name: "Bank",
    "Opening balance": "1000",
  });
  const other = await context.newPage();
  await other.goto("/");
  await other.getByLabel("Vault passphrase").fill(pass);
  await other.getByRole("button", { name: "Unlock Tandem" }).click();
  await transaction(page, "Expense", "50");
  await other.getByRole("button", { name: "Quick add", exact: true }).click();
  await other.getByRole("dialog").locator("[name=amount]").fill("70");
  await other
    .getByRole("dialog")
    .getByRole("button", { name: "Save expense", exact: true })
    .click();
  await expect(other.getByRole("dialog").getByRole("alert")).toContainText(
    "Another tab changed this vault",
  );
  await other.close();
  await navigate(page, "Accounts");
  await expect(page.locator(".big-number")).toHaveText("$950.00");
});

test("named investments group by account without moving cash, and safe sharing", async ({
  page,
  context,
}) => {
  await setup(page);
  await entity(page, "Accounts", "Add account", {
    Name: "Broker",
    "Opening balance": "0",
    "Opening date": "2026-01-01",
  });
  await entity(page, "Accounts", "Add account", {
    Name: "Other broker",
    "Opening balance": "0",
    "Opening date": "2026-01-01",
  });
  await page.getByRole("button", { name: "Quick add", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Investment", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").locator("form input, form select"),
  ).toHaveCount(4);
  await expect(
    page.getByRole("dialog").getByLabel("Investment type", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await entity(page, "Investments", "Add investment", {
    Amount: "1000",
    "Investment name": "Global ETF",
    "Investment type": "ETF",
    Account: "Broker · USD",
  });
  await entity(page, "Investments", "Add investment", {
    Amount: "500",
    "Investment name": "Local ETF",
    "Investment type": "ETF",
    Account: "Broker · USD",
  });
  await expect(page.locator(".investment-account-totals")).toContainText(
    "$1,500.00",
  );
  const card = page
    .locator(".investment-card")
    .filter({ hasText: "Local ETF" });
  await card.getByRole("button", { name: "Update value", exact: true }).click();
  const d = page.getByRole("dialog");
  await expect(d.locator("form input, form select")).toHaveCount(4);
  await expect(d.getByLabel("Investment name", { exact: true })).toHaveValue(
    "Local ETF",
  );
  await d
    .getByLabel("Investment name", { exact: true })
    .fill("Local ETF renamed");
  await d.getByLabel("Amount", { exact: true }).fill("750");
  await d
    .getByLabel("Account", { exact: true })
    .selectOption({ label: "Other broker · USD" });
  await d.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(d).not.toBeVisible();
  await expect(page.locator(".investment-account-totals")).toContainText(
    "$1,000.00",
  );
  await expect(page.locator(".investment-account-totals")).toContainText(
    "$750.00",
  );
  await navigate(page, "Accounts");
  for (const c of await page.locator(".account-card .big-number").all())
    await expect(c).toHaveText("$0.00");
  await navigate(page, "Overview");
  await expect(page.locator(".wealth-number")).toHaveText("$1,750.00");
  await navigate(page, "Investments");
  await context.setOffline(true);
  await page.locator(".share-app-button").click();
  const sharing = page.getByRole("dialog", { name: "Share Tandem" });
  await expect(sharing).toContainText("Your money stays private");
  await sharing
    .getByLabel("Your app’s HTTPS address", { exact: true })
    .fill("http://localhost:1420");
  await sharing.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(sharing.getByRole("status")).toContainText("private HTTPS");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await sharing
    .getByLabel("Your app’s HTTPS address", { exact: true })
    .fill("https://tandem.internal");
  await sharing.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(sharing.getByRole("status")).toContainText("App link copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "https://tandem.internal/",
  );
  await sharing.getByRole("button", { name: "Close sharing" }).click();
  await context.setOffline(false);
  await page.screenshot({
    path: "test-results/tandem-simple-investments.png",
    fullPage: true,
  });
});
test("ticker lookup resolves Realty Income and tracks units as prices change", async ({
  page,
  context,
}) => {
  await setup(page);
  await entity(page, "Accounts", "Add account", {
    Name: "Broker",
    "Opening balance": "0",
    "Opening date": "2026-01-01",
  });
  await navigate(page, "Investments");
  await page.locator(".online-prices summary").click();
  await page
    .getByLabel("Twelve Data API key", { exact: true })
    .fill("test-key");
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  let price = "60.00";
  await page.route("https://api.twelvedata.com/**", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      json:
        url.pathname === "/symbol_search"
          ? {
              data: [
                {
                  symbol: "O",
                  instrument_name: "Realty Income Corporation",
                  exchange: "NYSE",
                  currency: "USD",
                  instrument_type: "Common Stock",
                },
              ],
            }
          : {
              symbol: "O",
              name: "Realty Income Corporation",
              exchange: "NYSE",
              currency: "USD",
              close: price,
              datetime: "2026-10-05",
            },
    });
  });
  await page.getByRole("button", { name: "Quick add", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Investment", exact: true })
    .click();
  let d = page.getByRole("dialog");
  await d.getByLabel("Amount", { exact: true }).fill("600");
  await d.getByLabel("Investment name", { exact: true }).fill("O");
  await expect(d.getByLabel("Investment name", { exact: true })).toHaveValue(
    "Realty Income Corporation",
  );
  await expect(d.getByLabel("Investment type", { exact: true })).toHaveValue(
    "Equity",
  );
  await expect(d.locator(".quote-preview")).toContainText(
    "10 shares / units estimated",
  );
  await d.getByRole("button", { name: "Save investment", exact: true }).click();
  await expect(d).not.toBeVisible();
  const card = page
    .locator(".investment-card")
    .filter({ hasText: "Realty Income Corporation" });
  await expect(card.locator(".big-number")).toHaveText("$600.00");
  await page.clock.setFixedTime(new Date(Date.now() + 16 * 60_000));
  price = "66.00";
  await card
    .getByRole("button", { name: "Refresh price", exact: true })
    .click();
  await expect(card.locator(".big-number")).toHaveText("$660.00");
  await expect(page.locator(".investment-account-totals")).toContainText(
    "$660.00",
  );
  await card
    .getByRole("button", { name: "Update holding", exact: true })
    .click();
  await d.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.clock.setFixedTime(new Date(Date.now() + 32 * 60_000));
  price = "72.00";
  await card
    .getByRole("button", { name: "Refresh price", exact: true })
    .click();
  await expect(card.locator(".big-number")).toHaveText("$720.00");
  await card
    .getByRole("button", { name: "Update holding", exact: true })
    .click();
  await d.getByText("Set exact shares / units", { exact: true }).click();
  await d.getByLabel("Shares / units", { exact: true }).fill("12");
  await d.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(card.locator(".big-number")).toHaveText("$864.00");
  await page.clock.setFixedTime(new Date(Date.now() + 48 * 60_000));
  await page.unroute("https://api.twelvedata.com/**");
  await context.setOffline(true);
  await card
    .getByRole("button", { name: "Refresh price", exact: true })
    .click();
  await expect(page.locator(".price-toolbar")).toContainText(
    "saved value has been kept",
  );
  await expect(card.locator(".big-number")).toHaveText("$864.00");
});
test("page refresh repairs VOO names and free-plan counters survive reloads", async ({
  page,
}) => {
  await setup(page);
  await entity(page, "Accounts", "Add account", {
    Name: "Easy Equities",
    "Opening balance": "0",
    "Opening date": "2026-01-01",
  });
  await entity(page, "Investments", "Add investment", {
    Amount: "1000",
    "Investment type": "ETF",
    "Investment name": "VOO",
    Account: "Easy Equities · USD",
  });
  let requests = 0;
  await page.route("https://api.twelvedata.com/**", async (route) => {
    requests++;
    const u = new URL(route.request().url()),
      symbol = u.searchParams.get("symbol");
    await route.fulfill({
      json:
        u.pathname === "/symbol_search"
          ? {
              data: [
                {
                  symbol,
                  instrument_name:
                    symbol === "VOO" ? "Vanguard S&P 500 ETF" : "Other Fund",
                  exchange: "NYSE",
                  currency: "USD",
                  instrument_type: "ETF",
                },
              ],
            }
          : {
              symbol,
              name: symbol,
              exchange: "NYSE",
              currency: "USD",
              close: "500.00",
              datetime: "2026-10-05",
            },
    });
  });
  await page.locator(".online-prices summary").click();
  await page
    .getByLabel("Twelve Data API key", { exact: true })
    .fill("persisted-budget-test");
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await expect(page.locator(".investment-card h3")).toHaveText(
    "Vanguard S&P 500 ETF",
  );
  await expect(page.locator(".investment-card .big-number")).toHaveText(
    "$1,000.00",
  );
  expect(requests).toBe(2);
  await page.getByRole("button", { name: "Refresh page", exact: true }).click();
  await page.getByRole("button", { name: "Refresh page", exact: true }).click();
  expect(requests).toBe(2);
  await page.reload();
  await page.getByLabel("Vault passphrase").fill(pass);
  await page
    .getByRole("button", { name: "Unlock Tandem", exact: true })
    .click();
  await navigate(page, "Investments");
  await page
    .getByRole("button", { name: "Add investment", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Amount", { exact: true }).fill("100");
  await d.getByLabel("Investment name", { exact: true }).fill("ABC");
  await expect(d.getByRole("alert")).toContainText("minute safety limit");
  expect(requests).toBe(3);
});
