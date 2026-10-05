import { it, expect, vi, afterEach } from "vitest";
import {
  marketRequest,
  reserveBudget,
  type Budget,
} from "../packages/market/requests";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("reserves rolling minute and UTC daily limits without resetting on reloading", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  let b: Budget | undefined;
  for (let i = 0; i < 3; i++) b = reserveBudget(b, now + i);
  expect(() => reserveBudget(b, now + 10)).toThrow("minute");
  b = reserveBudget(b, now + 60_004);
  expect(b.count).toBe(4);
  b = { ...b, count: 300 };
  expect(() => reserveBudget(b, now + 120_000)).toThrow("daily");
  expect(reserveBudget(b, Date.parse("2026-10-06T00:00:00Z")).count).toBe(1);
});
it("deduplicates concurrent requests and caches repeated refreshes", async () => {
  const fetch = vi.fn(async () => Response.json({ name: "A fund" }));
  vi.stubGlobal("fetch", fetch);
  const url = new URL(
    "https://api.twelvedata.com/quote?symbol=VOO&apikey=cache-test",
  );
  await Promise.all([
    marketRequest(url),
    marketRequest(url),
    marketRequest(url),
  ]);
  await marketRequest(url);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("failed requests consume budget, and the fourth is blocked before network", async () => {
  const fetch = vi.fn(async () => {
    throw Error("Offline");
  });
  vi.stubGlobal("fetch", fetch);
  const url = new URL(
    "https://api.twelvedata.com/quote?symbol=VOO&apikey=failure-budget",
  );
  for (let i = 0; i < 3; i++)
    await expect(marketRequest(url)).rejects.toThrow("saved value");
  await expect(marketRequest(url)).rejects.toThrow("minute");
  expect(fetch).toHaveBeenCalledTimes(3);
});
it("quota responses stop later calls and premium/batch endpoints cannot run", async () => {
  const fetch = vi.fn(async () =>
    Response.json({ status: "error", code: 429 }),
  );
  vi.stubGlobal("fetch", fetch);
  const url = new URL(
    "https://api.twelvedata.com/quote?symbol=VOO&apikey=stop-test",
  );
  await expect(marketRequest(url)).rejects.toThrow("midnight UTC");
  await expect(marketRequest(url)).rejects.toThrow("paused");
  await expect(
    marketRequest(
      new URL("https://api.twelvedata.com/income_statement?symbol=VOO"),
    ),
  ).rejects.toThrow("not permitted");
  await expect(
    marketRequest(new URL("https://api.twelvedata.com/quote?symbol=VOO,O")),
  ).rejects.toThrow("one ticker");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("accounts for provider-reported weighted credit usage", async () => {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ ok: true }), {
        headers: {
          "content-type": "application/json",
          "api-credits-used": "3",
        },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const url = new URL(
    "https://api.twelvedata.com/quote?symbol=VOO&apikey=weighted-test",
  );
  await marketRequest(url);
  await expect(
    marketRequest(new URL(url.toString() + "&variant=second")),
  ).rejects.toThrow("minute");
  expect(fetch).toHaveBeenCalledTimes(1);
});
