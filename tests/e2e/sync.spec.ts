import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { createServer, provision } from "../../apps/server/app";
const pass = "browser household vault passphrase";
const schema = "tandem_browser_" + crypto.randomUUID().replaceAll("-", "");
let pool: Pool, server: Awaited<ReturnType<typeof createServer>>, url: string;
test.beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) return;
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.query("CREATE SCHEMA " + schema);
  await admin.end();
  pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: "-c search_path=" + schema,
  });
  await pool.query(
    await readFile(
      new URL("../../apps/server/schema.sql", import.meta.url),
      "utf8",
    ),
  );
  await provision(pool, [
    "browser member one password",
    "browser member two password",
  ]);
  server = await createServer(pool);
  url = await server.listen({ host: "127.0.0.1", port: 0 });
});
test.afterAll(async () => {
  if (!pool) return;
  await server.close();
  await pool.query("DROP SCHEMA " + schema + " CASCADE");
  await pool.end();
});
async function nav(p: Page, name: string) {
  await p.locator("nav").getByRole("button", { name, exact: true }).click();
}
async function add(p: Page, kind: string, amount: string) {
  await p.getByRole("button", { name: "Quick add", exact: true }).click();
  const d = p.getByRole("dialog");
  await d.getByRole("button", { name: kind, exact: true }).click();
  await d.locator("[name=amount]").fill(amount);
  await d
    .getByRole("button", { name: "Save " + kind.toLowerCase(), exact: true })
    .click();
  await expect(d).not.toBeVisible();
}
async function connect(p: Page, password: string) {
  await nav(p, "Settings");
  await p.getByLabel("Private relay URL", { exact: true }).fill(url);
  await p.getByLabel("Server password", { exact: true }).fill(password);
  await p.getByRole("button", { name: "Connect device", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("Device connected");
}
async function synchronize(p: Page) {
  await nav(p, "Settings");
  await p.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(p.getByText(/Up to date ·/)).toBeVisible();
}
test("two real browser devices create offline transactions and converge through private PostgreSQL relay", async ({
  browser,
}) => {
  test.skip(
    !process.env.TEST_DATABASE_URL,
    "Set TEST_DATABASE_URL for the real relay E2E test",
  );
  const a = await browser.newContext(),
    b = await browser.newContext();
  const pa = await a.newPage(),
    pb = await b.newPage();
  await pa.goto("/");
  await pa.getByLabel("Household name").fill("Browser household");
  await pa.getByLabel("Your name", { exact: true }).fill("Alex");
  await pa.getByLabel("Your partner’s name").fill("Sam");
  await pa.getByLabel("Vault passphrase").fill(pass);
  await pa.getByRole("button", { name: "Create our household" }).click();
  await nav(pa, "Accounts");
  await pa.getByRole("button", { name: "Add account", exact: true }).click();
  const d = pa.getByRole("dialog");
  await d.getByLabel("Name", { exact: true }).fill("Bank");
  await d.getByLabel("Opening balance", { exact: true }).fill("1000");
  await d.getByRole("button", { name: "Save account", exact: true }).click();
  await expect(d).not.toBeVisible();
  await nav(pa, "Settings");
  const download = pa.waitForEvent("download");
  await pa
    .getByRole("button", { name: "Export encrypted backup", exact: true })
    .click();
  await (await download).saveAs("/private/tmp/tandem-pairing-test.tandem");
  await pb.goto("/");
  await pb.getByText("Joining your partner? Restore a backup").click();
  await pb.getByLabel("Backup passphrase", { exact: true }).fill(pass);
  await pb
    .locator("input[type=file]")
    .setInputFiles("/private/tmp/tandem-pairing-test.tandem");
  await expect(pb.locator(".wealth-number")).toHaveText("$1,000.00");
  await a.setOffline(true);
  await b.setOffline(true);
  await add(pa, "Expense", "100");
  await add(pa, "Income", "2000");
  await add(pb, "Expense", "75");
  await add(pb, "Income", "100");
  await a.setOffline(false);
  await b.setOffline(false);
  await connect(pa, "browser member one password");
  await connect(pb, "browser member two password");
  await synchronize(pa);
  await synchronize(pb);
  await synchronize(pa);
  for (const p of [pa, pb]) {
    await nav(p, "Overview");
    await expect(p.locator(".wealth-number")).toHaveText("$2,925.00");
    await nav(p, "Transactions");
    await expect(p.locator("tbody tr")).toHaveCount(4);
  }
  await a.close();
  await b.close();
});
