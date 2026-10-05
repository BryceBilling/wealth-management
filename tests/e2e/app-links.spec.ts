import { test, expect } from "@playwright/test";
const token = "b".repeat(43);
test("installed-app launch delivery and pasted links keep the transfer fragment", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "launchQueue", {
      value: {
        setConsumer: (fn: any) => {
          (window as any).launchTransfer = fn;
        },
      },
    });
  });
  await page.goto("/");
  await page.getByText("Open a transfer link", { exact: true }).click();
  await page
    .getByLabel("Paste transfer link")
    .fill("https://other.example/#transfer=" + token);
  await page
    .getByRole("button", { name: "Open transfer", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("valid transfer link");
  await page.evaluate(
    (t) =>
      (window as any).launchTransfer({
        targetURL: location.origin + "/#transfer=" + t,
      }),
    token,
  );
  await expect(
    page.getByRole("heading", { name: "Import your household" }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp("#transfer=" + token));
  await page.getByRole("button", { name: "Cancel transfer" }).click();
  await page.getByText("Open a transfer link", { exact: true }).click();
  await page
    .getByLabel("Paste transfer link")
    .fill("http://127.0.0.1:1420/#transfer=" + token);
  await page
    .getByRole("button", { name: "Open transfer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Import your household" }),
  ).toBeVisible();
});
test("Android share-target POST is handled locally and opens a transfer", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.share_target.method).toBe("POST");
  expect(manifest.launch_handler.client_mode).toBe("focus-existing");
  await page.evaluate((t) => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/share-transfer";
    form.enctype = "multipart/form-data";
    const input = document.createElement("input");
    input.name = "text";
    input.value = "Our transfer: " + location.origin + "/#transfer=" + t;
    form.append(input);
    document.body.append(form);
    form.submit();
  }, token);
  await expect(
    page.getByRole("heading", { name: "Import your household" }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp("#transfer=" + token));
});
