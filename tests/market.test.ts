import { beforeAll, afterEach, it, expect, vi } from "vitest";
import {
  fetchQuote,
  unitsForValue,
  holdingValue,
  interestProjection,
  positiveQuantity,
} from "../packages/market";
import { updateMarketValues } from "../packages/market/update";
import { Vault } from "../packages/database/vault";
import { initSQL } from "../packages/database/repository";
import { schemas } from "../packages/types";
beforeAll(() => initSQL());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const reply = (extra = {}) =>
  Response.json({
    symbol: "AAPL",
    name: "Apple Inc.",
    currency: "USD",
    close: "123.45678901",
    datetime: "2026-10-01",
    exchange: "NASDAQ",
    ...extra,
  });
it("value times fractional units rounds only once, including tiny crypto units", () => {
  expect(holdingValue("10.25", "123.45678901")).toBe(126543);
  expect(holdingValue("0.00000001", "100000")).toBe(0);
  expect(positiveQuantity("0.00000001")).toBe(true);
  expect(positiveQuantity("0")).toBe(false);
  expect(() => holdingValue("-1", "100")).toThrow();
});
it("annual interest is an estimate and monthly amounts use exact rounding", () => {
  expect(interestProjection(1000000, 500)).toEqual({
    annual: 50000,
    monthly: 4167,
    oneYear: 1050000,
  });
  expect(interestProjection(10000, 0).annual).toBe(0);
});
it("validates provider quotes and transmits no holding amount or units", async () => {
  const fetch = vi.fn(async (_url: string | URL | Request) => reply());
  vi.stubGlobal("fetch", fetch);
  const q = await fetchQuote("AAPL", "private-key", "NASDAQ");
  expect(q.price).toBe("123.45678901");
  const url = String(fetch.mock.calls[0][0]);
  expect(url).toContain("symbol=AAPL");
  expect(url).not.toMatch(/quantity|amount|household/);
});
it("rejects missing key, unsupported currency, wrong symbol and quota errors", async () => {
  await expect(fetchQuote("AAPL", "")).rejects.toThrow("Connect");
  vi.stubGlobal("fetch", async () => reply({ currency: "JPY" }));
  await expect(fetchQuote("AAPL", "key")).rejects.toThrow(
    "unsupported currency",
  );
  vi.stubGlobal("fetch", async () => reply({ symbol: "MSFT" }));
  await expect(fetchQuote("AAPL", "key")).rejects.toThrow(
    "different investment",
  );
  vi.stubGlobal("fetch", async () =>
    Response.json({ code: 429, status: "error" }),
  );
  await expect(fetchQuote("AAPL", "key")).rejects.toThrow("limit");
});
it("online updates append history and failed updates keep saved values", async () => {
  const actor = crypto.randomUUID(),
    device = crypto.randomUUID();
  const v = await Vault.create("market test passphrase", {
    read: async () => null,
    write: async () => {},
  });
  await v.mutate((r) =>
    r.write(
      "investment",
      schemas.investment.parse({
        name: "Apple",
        kind: "Stocks",
        mode: "market",
        symbol: "AAPL",
        exchange: "NASDAQ",
        quantity: "10",
        value: 100000,
        contributed: 100000,
        date: "2026-10-01",
        currency: "USD",
        autoUpdate: true,
      }),
      actor,
      device,
    ),
  );
  vi.stubGlobal("fetch", async () => reply());
  expect(
    (await updateMarketValues(v, "update-key", actor, device)).updated,
  ).toBe(1);
  expect(v.repo.rows("investment")[0].value).toBe(123457);
  expect(v.repo.events()).toHaveLength(2);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 16 * 60_000);
  vi.stubGlobal("fetch", async () => {
    throw Error("Offline");
  });
  expect(
    (await updateMarketValues(v, "update-key", actor, device)).errors,
  ).toHaveLength(1);
  expect(v.repo.rows("investment")[0].value).toBe(123457);
  expect(v.repo.events()).toHaveLength(2);
});

it("estimates units from current amounts without losing cents", () => {
  expect(unitsForValue(60000, "60")).toBe("10");
  expect(unitsForValue(0, "60")).toBe("0");
  expect(holdingValue(unitsForValue(12345, "63.217"), "63.217")).toBe(12345);
  expect(() => unitsForValue(100, "0")).toThrow();
});

it("refresh repairs a legacy ticker-only fund name without changing its manual value", async () => {
  const v = await Vault.create("legacy name test", {
    read: async () => null,
    write: async () => {},
  });
  const actor = crypto.randomUUID(),
    device = crypto.randomUUID();
  await v.mutate((r) =>
    r.write(
      "investment",
      schemas.investment.parse({
        name: "VOO",
        kind: "ETF",
        mode: "manual",
        value: 100000,
        contributed: 100000,
        date: "2026-01-01",
        currency: "USD",
      }),
      actor,
      device,
    ),
  );
  vi.stubGlobal("fetch", async () =>
    reply({
      symbol: "VOO",
      name: "Vanguard S&P 500 ETF",
      close: "600.00",
      exchange: "NYSE",
    }),
  );
  await updateMarketValues(v, "legacy-key", actor, device);
  expect(v.repo.rows("investment")[0]).toMatchObject({
    name: "Vanguard S&P 500 ETF",
    value: 100000,
    mode: "market",
    autoUpdate: true,
    quantity: "1.666666666667",
    date: "2026-10-05",
  });
});
