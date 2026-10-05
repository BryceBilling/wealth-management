import { test, expect } from "@playwright/test";
test.use({ browserName: "chromium" });
const pass = "a private biometric test passphrase";
async function setup(page: any) {
  await page.goto("http://localhost:1420");
  await page.getByLabel("Household name").fill("Biometric home");
  await page.getByLabel("Your name", { exact: true }).fill("Alex");
  await page.getByLabel("Your partner’s name").fill("Sam");
  await page.getByLabel("Vault passphrase").fill(pass);
  await page.getByRole("button", { name: "Create our household" }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
}
test("real WebAuthn PRF unlock, encrypted storage, tamper rejection and passphrase fallback", async ({
  page,
  context,
}) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf: true,
    },
  });
  await setup(page);
  await page.getByLabel("Confirm vault passphrase").fill(pass);
  await page
    .getByRole("button", { name: "Enable biometric unlock", exact: true })
    .click();
  await expect(
    page.getByText("Biometric unlock is enabled here."),
  ).toBeVisible();
  const record = await page.evaluate(() =>
    localStorage.getItem("tandem-biometric-v1"),
  );
  expect(record).not.toContain(pass);
  expect(JSON.parse(record!).sealed).toBeTruthy();
  await page.getByRole("button", { name: "Lock vault now" }).click();
  await page
    .getByRole("button", { name: "Unlock with biometrics", exact: true })
    .click();
  await expect(page.locator("body")).toContainText("Biometric home");
  await page.evaluate(() => {
    const r = JSON.parse(localStorage.getItem("tandem-biometric-v1")!);
    r.sealed = "AAAA";
    localStorage.setItem("tandem-biometric-v1", JSON.stringify(r));
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Unlock with biometrics", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not unlock securely",
  );
  await page.getByLabel("Vault passphrase").fill(pass);
  await page
    .getByRole("button", { name: "Unlock Tandem", exact: true })
    .click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Disable biometric unlock" }).click();
  await page.getByRole("button", { name: "Lock vault now" }).click();
  await expect(
    page.getByRole("button", { name: "Unlock with biometrics", exact: true }),
  ).not.toBeVisible();
});
test("unsupported PRF never stores an unprotected unlock secret", async ({
  page,
  context,
}) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await setup(page);
  await page.getByLabel("Confirm vault passphrase").fill(pass);
  await page
    .getByRole("button", { name: "Enable biometric unlock", exact: true })
    .click();
  await expect(
    page.getByText(
      "Your passkey provider does not support encrypted biometric unlock (PRF). Your passphrase still works.",
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("tandem-biometric-v1")),
  ).toBeNull();
});
