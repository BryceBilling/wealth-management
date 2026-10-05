import { describe, it, expect } from "vitest";
import {
  parseMoney,
  add,
  ratio,
  convert,
  allocate,
  payoff,
  savingsProgress,
  investmentGain,
  netWorth,
  occurrences,
  budget,
  balances,
  forecast,
} from "../packages/finance";
import type { Row } from "../packages/types";
describe("exact money and financial calculations", () => {
  it("decimal accuracy, signed money and overflow", () => {
    expect(add(parseMoney("0.10"), parseMoney("0.20"))).toBe(30);
    expect(parseMoney("-10.25")).toBe(-1025);
    expect(() => parseMoney("1.005")).toThrow();
    expect(() => add(Number.MAX_SAFE_INTEGER, 1)).toThrow();
  });
  it("rounds currency once with symmetric negative handling", () => {
    expect(convert(17500, 57143)).toBe(1000);
    expect(ratio(-5, 1, 2)).toBe(-3);
  });
  it("loan 10,000 at 18 percent payment 500", () => {
    expect(allocate(1000000, 1800, 50000)).toEqual({
      interest: 15000,
      principal: 35000,
      balance: 965000,
    });
    expect(allocate(965000, 1800, 50000)).toEqual({
      interest: 14475,
      principal: 35525,
      balance: 929475,
    });
    expect(payoff(1000000, 1800, 50000).months).toBe(24);
    expect(payoff(1000000, 1800, 10000).months).toBeNull();
    expect(() => allocate(100, 1800, 10000)).toThrow();
  });
  it("zero interest and manual allocations", () => {
    expect(payoff(10000, 0, 1000)).toEqual({
      months: 10,
      interest: 0,
      cost: 10000,
    });
    expect(allocate(10000, 0, 1000, 100).balance).toBe(9100);
  });
  it("acceptance net worth", () =>
    expect(netWorth([100000, 500000, 1000000], [400000])).toBe(1200000));
  it("investment gains and savings", () => {
    expect(investmentGain(2150000, 2000000)).toEqual({
      gain: 150000,
      percent: 7.5,
    });
    expect(
      savingsProgress(400000, 1000000, "2027-04-01", "2026-10-01"),
    ).toEqual({ remaining: 600000, percent: 40, monthly: 100000 });
  });
  it("month end recurrence stays anchored and leap years clamp", () => {
    expect(
      occurrences("2026-01-31", "monthly", 1, "2026-01-01", "2026-03-31"),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(
      occurrences("2024-02-29", "yearly", 1, "2025-01-01", "2025-12-31"),
    ).toEqual(["2025-02-28"]);
  });
  it("transfers conserve household money and do not become spending", () => {
    const accounts = [
      { id: "a", opening: 100000, date: "2026-01-01" },
      { id: "b", opening: 500000, date: "2026-01-01" },
    ] as Row<"account">[];
    const tx = [
      {
        kind: "transfer",
        amount: 50000,
        account: "a",
        destination: "b",
        date: "2026-10-01",
        rate: 1000000,
      },
    ] as Row<"transaction">[];
    expect(balances(accounts, tx)).toEqual({ a: 50000, b: 550000 });
    expect(budget(tx, "2026-10").available).toBe(0);
  });
  it("budget deducts debt savings investments once", () => {
    const tx = [
      ["income", 200000],
      ["expense", 10000],
      ["debt", 40000],
      ["savings", 50000],
      ["investment", 25000],
    ].map(([kind, amount]) => ({
      kind,
      amount,
      date: "2026-10-02",
      rate: 1000000,
    })) as Row<"transaction">[];
    expect(budget(tx, "2026-10").available).toBe(75000);
  });
  it("forecasts expected events without writing actuals", () =>
    expect(
      forecast(
        450000,
        [
          { kind: "income", amount: 200000, currency: "USD" },
          { kind: "bill", amount: 70000, currency: "USD" },
        ] as any,
        { USD: 1000000 },
      ),
    ).toBe(580000));
});
it("direct savings and investment additions need no source and do not reduce cash", () => {
  const accounts = [
    { id: "bank", opening: 100000, date: "2026-01-01" },
    { id: "savings", opening: 0, date: "2026-01-01" },
  ] as Row<"account">[];
  const tx = [
    {
      kind: "savings",
      funding: "external",
      amount: 50000,
      account: "savings",
      date: "2026-10-02",
      rate: 1000000,
    },
    {
      kind: "investment",
      funding: "external",
      amount: 25000,
      account: "",
      date: "2026-10-02",
      rate: 1000000,
    },
  ] as Row<"transaction">[];
  expect(balances(accounts, tx)).toEqual({ bank: 100000, savings: 50000 });
  expect(budget(tx, "2026-10")).toMatchObject({
    savings: 50000,
    investment: 25000,
    available: 0,
  });
});
it("a fully recovered investment cost basis does not divide by a negative denominator", () => {
  expect(investmentGain(10000, -5000)).toEqual({ gain: 15000, percent: 0 });
});
