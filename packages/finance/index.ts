import type { Row } from "../types";
export function safe(n: bigint): number {
  const v = Number(n);
  if (!Number.isSafeInteger(v))
    throw Error("Amount exceeds supported precision");
  return v;
}
export function parseMoney(s: string): number {
  if (!/^-?\d+(\.\d{1,2})?$/.test(s.trim()))
    throw Error("Enter an amount with at most two decimal places");
  const negative = s.startsWith("-");
  const [a, b = ""] = s.replace("-", "").split(".");
  return safe(
    (BigInt(a) * 100n + BigInt(b.padEnd(2, "0"))) * (negative ? -1n : 1n),
  );
}
export function add(...ns: number[]): number {
  return safe(ns.reduce((a, n) => a + BigInt(n), 0n));
}
export function ratio(
  n: number,
  numerator: number,
  denominator: number,
): number {
  if (denominator <= 0) throw Error("Invalid denominator");
  const a = BigInt(n) * BigInt(numerator);
  const d = BigInt(denominator);
  return safe((a < 0n ? -1n : 1n) * (((a < 0n ? -a : a) + d / 2n) / d));
}
export const convert = (n: number, rate: number) => ratio(n, rate, 1000000);
export const sum = (ns: number[]) => add(...ns);
export function interest(balance: number, aprBasisPoints: number): number {
  return ratio(balance, aprBasisPoints, 120000);
}
export function allocate(
  balance: number,
  apr: number,
  payment: number,
  manualInterest?: number,
) {
  const i = manualInterest ?? interest(balance, apr);
  if (payment < i)
    throw Error(
      "Payment is less than interest; enter accrued interest explicitly",
    );
  const principal = payment - i;
  if (principal > balance)
    throw Error("Payment exceeds principal plus interest");
  return { interest: i, principal, balance: balance - principal };
}
export function payoff(balance: number, apr: number, payment: number) {
  let remaining = balance,
    totalInterest = 0,
    months = 0;
  while (remaining > 0 && months < 1200) {
    const i = interest(remaining, apr);
    if (payment <= i) return { months: null, interest: null, cost: null };
    const paid = Math.min(payment, add(remaining, i));
    remaining = add(remaining, i, -paid);
    totalInterest = add(totalInterest, i);
    months++;
  }
  return remaining
    ? { months: null, interest: null, cost: null }
    : { months, interest: totalInterest, cost: add(balance, totalInterest) };
}
export function investmentGain(
  value: number,
  contributed: number,
  fees = 0,
  income = 0,
) {
  const gain = add(value, income, -contributed, -fees);
  return {
    gain,
    percent: contributed > 0 ? ratio(gain, 10000, contributed) / 100 : 0,
  };
}
export function savingsProgress(
  current: number,
  target: number,
  date: string,
  today: string,
) {
  const a = new Date(today + "T00:00:00Z"),
    b = new Date(date + "T00:00:00Z");
  const months = Math.max(
    1,
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
      b.getUTCMonth() -
      a.getUTCMonth(),
  );
  const remaining = Math.max(0, target - current);
  return {
    remaining,
    percent: target ? ratio(current, 10000, target) / 100 : 0,
    monthly: safe((BigInt(remaining) + BigInt(months) - 1n) / BigInt(months)),
  };
}
export function addMonths(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  const result = new Date(Date.UTC(y, m - 1 + n, 1));
  result.setUTCDate(
    Math.min(
      d,
      new Date(
        Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    ),
  );
  return result.toISOString().slice(0, 10);
}
export function occurrences(
  start: string,
  frequency: string,
  interval: number,
  from: string,
  to: string,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < 40000; i++) {
    let date = start;
    if (frequency === "monthly" || frequency === "yearly")
      date = addMonths(start, i * interval * (frequency === "yearly" ? 12 : 1));
    else if (frequency !== "once") {
      const dt = new Date(start + "T00:00:00Z");
      dt.setUTCDate(
        dt.getUTCDate() + i * interval * (frequency === "weekly" ? 7 : 1),
      );
      date = dt.toISOString().slice(0, 10);
    }
    if (date > to) break;
    if (date >= from) out.push(date);
    if (frequency === "once") break;
  }
  return out;
}
export const day = () => new Date().toLocaleDateString("en-CA");
export function balances(
  accounts: Row<"account">[],
  transactions: Row<"transaction">[],
  asOf = "9999-12-31",
) {
  const result: Record<string, number> = {};
  for (const a of accounts) result[a.id] = a.date <= asOf ? a.opening : 0;
  for (const t of transactions.filter((t) => t.date <= asOf)) {
    if (t.kind === "investment" && t.funding === "external") continue;
    const incoming =
      ["income", "withdrawal", "dividend"].includes(t.kind) ||
      (t.kind === "savings" && t.funding === "external");
    result[t.account] = add(
      result[t.account] ?? 0,
      incoming ? t.amount : -t.amount,
    );
    if (
      t.kind === "transfer" ||
      (t.kind === "savings" && t.funding !== "external")
    )
      result[t.destination] = add(
        result[t.destination] ?? 0,
        t.destinationAmount || t.amount,
      );
  }
  return result;
}
export function debtBalance(d: Row<"debt">, tx: Row<"transaction">[]) {
  return add(
    d.balance,
    -sum(
      tx
        .filter((t) => t.kind === "debt" && t.target === d.id)
        .map((t) => t.amount - t.interest),
    ),
  );
}
export function portfolioValue(i: Row<"investment">, tx: Row<"transaction">[]) {
  return add(
    i.value,
    ...tx
      .filter(
        (t) =>
          t.target === i.id &&
          !(i.valuedTransactions ?? []).includes(t.id) &&
          ["investment", "withdrawal"].includes(t.kind),
      )
      .map((t) => (t.kind === "withdrawal" ? -t.amount : t.amount)),
  );
}
export function contributions(i: Row<"investment">, tx: Row<"transaction">[]) {
  return add(
    i.contributed,
    ...tx
      .filter(
        (t) =>
          t.target === i.id && ["investment", "withdrawal"].includes(t.kind),
      )
      .map((t) => (t.kind === "withdrawal" ? -t.amount : t.amount)),
  );
}
export function budget(tx: Row<"transaction">[], month: string) {
  const rows = tx.filter((t) => t.date.startsWith(month));
  const total = (k: string[]) =>
    sum(
      rows
        .filter((t) => k.includes(t.kind))
        .map((t) => convert(t.amount, t.rate)),
    );
  const income = total(["income", "dividend"]),
    expenses = total(["expense", "bill"]),
    debt = total(["debt"]),
    savings = total(["savings"]),
    investment = total(["investment"]) - total(["withdrawal"]);
  return {
    income,
    expenses,
    debt,
    savings,
    investment,
    available: add(
      income,
      -expenses,
      -debt,
      -sum(
        rows
          .filter(
            (t) =>
              ["savings", "investment"].includes(t.kind) &&
              t.funding !== "external",
          )
          .map((t) => convert(t.amount, t.rate)),
      ),
      total(["withdrawal"]),
    ),
  };
}
export function netWorth(assets: number[], liabilities: number[]) {
  return add(sum(assets), -sum(liabilities));
}
export type Expected = {
  funding?: "account" | "external";
  id: string;
  name: string;
  date: string;
  amount: number;
  currency: string;
  kind: string;
  target: string;
  account: string;
  destination: string;
};
export function expected(
  bills: Row<"bill">[],
  rules: Row<"recurring">[],
  tx: Row<"transaction">[],
  from: string,
  to: string,
): Expected[] {
  const entries: Expected[] = [];
  for (const r of [...bills, ...rules])
    for (const date of occurrences(r.date, r.frequency, r.interval, from, to)) {
      const id = r.id + ":" + date;
      if (tx.some((t) => t.occurrence === id)) continue;
      entries.push({
        funding: r.type === "bill" ? undefined : r.funding,
        id,
        name: r.name,
        date,
        amount: r.amount,
        currency: r.currency,
        kind: r.type === "bill" ? "bill" : r.kind,
        target: r.type === "bill" ? r.id : r.target,
        account: r.account,
        destination: r.type === "bill" ? "" : r.destination,
      });
    }
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}
export function forecast(
  cash: number,
  events: Expected[],
  rates: Record<string, number>,
) {
  return events.reduce(
    (a, e) =>
      add(
        a,
        e.funding === "external" && ["savings", "investment"].includes(e.kind)
          ? 0
          : convert(e.amount, rates[e.currency]) *
              (e.kind === "income" ? 1 : -1),
      ),
    cash,
  );
}
