import { schemas, type Event, type EntityType, type Row } from "../types";
import {
  balances,
  convert,
  debtBalance,
  netWorth,
  portfolioValue,
  sum,
} from "./index";
/** Replays effective-dated revisions, preserving old valuations and exchange rates. */
export function historicalPosition(
  events: Event[],
  date: string,
  base: string,
  scope = "household",
) {
  const eligible = events.filter((e) => {
    const data = e.data as { date?: string; startDate?: string };
    const effective =
      e.type === "debt" ? (data.startDate ?? data.date) : data.date;
    return !effective || effective <= date;
  });
  const parents = new Set(eligible.flatMap((e) => e.parents));
  const groups = new Map<string, Event[]>();
  for (const e of eligible)
    if (!parents.has(e.id))
      groups.set(e.recordId, [...(groups.get(e.recordId) ?? []), e]);
  const heads = [...groups.values()]
    .filter((h) => h.length === 1 && !h[0].deleted)
    .map((h) => h[0]);
  const rows = <K extends EntityType>(type: K) =>
    heads
      .filter((e) => e.type === type)
      .map(
        (e) =>
          ({ ...schemas[type].parse(e.data), id: e.recordId, type }) as Row<K>,
      );
  const visible = (a: { owner: string }) =>
    scope === "household" || a.owner === scope;
  const rates: Record<string, number> = { [base]: 1000000 };
  for (const rate of rows("rate").sort((a, b) => a.date.localeCompare(b.date)))
    if (rate.name !== base) rates[rate.name] = rate.value;
  const missing = new Set<string>();
  const cv = (amount: number, currency: string) => {
    if (!rates[currency]) {
      missing.add(currency);
      return 0;
    }
    return convert(amount, rates[currency]);
  };
  const tx = rows("transaction"),
    accounts = rows("account").filter(visible),
    bal = balances(accounts, tx, date);
  const cash = sum(
    accounts
      .filter((a) => a.kind !== "savings")
      .map((a) => cv(bal[a.id], a.currency)),
  );
  const savings = sum(
    accounts
      .filter((a) => a.kind === "savings")
      .map((a) => cv(bal[a.id], a.currency)),
  );
  const investments = sum(
    rows("investment")
      .filter(visible)
      .map((i) => cv(portfolioValue(i, tx), i.currency)),
  );
  const debt = sum(
    rows("debt")
      .filter(visible)
      .map((d) => cv(debtBalance(d, tx), d.currency)),
  );
  return {
    cash,
    savings,
    investments,
    debt,
    net: netWorth([cash, savings, investments], [debt]),
    missing: [...missing],
  };
}
