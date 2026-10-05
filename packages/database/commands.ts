import type { Data, EntityType } from "../types";
import { Repository } from "./repository";
import { allocate, debtBalance, portfolioValue } from "../finance";
export function save<K extends EntityType>(
  r: Repository,
  type: K,
  data: Data[K],
  actor: string,
  device: string,
  id?: string,
) {
  const household = r.rows("household")[0];
  if (type === "household" && household && id !== household.id)
    throw Error("Only one household is allowed");
  if (household && !household.users.some((u) => u.id === actor))
    throw Error("Unknown household member");
  if (type === "rate" && (data as Data["rate"]).name === household.currency)
    throw Error("The base currency rate is always 1");
  if (type === "transaction") {
    const t = data as Data["transaction"];
    if (t.date > new Date().toLocaleDateString("en-CA"))
      throw Error(
        "Actual transactions cannot be future-dated. Use a recurring expectation instead",
      );
    const account = r.get("account", t.account);
    const externalInvestment =
      t.kind === "investment" && t.funding === "external";
    if (!account && !externalInvestment)
      throw Error("Choose an existing account");
    if (account && t.date < account.date)
      throw Error("Transaction predates the account opening date");
    if (account && account.currency !== t.currency)
      throw Error("Currency must match the account");
    if (t.owner !== "shared" && !household.users.some((u) => u.id === t.owner))
      throw Error("Unknown owner");
    if (!household.users.some((u) => u.id === t.person))
      throw Error("Unknown person");
    if (
      t.occurrence &&
      r
        .rows("transaction")
        .some((x) => x.id !== id && x.occurrence === t.occurrence)
    )
      throw Error("This expected payment is already recorded");
    if (
      t.kind === "savings" &&
      t.funding === "external" &&
      account?.kind !== "savings"
    )
      throw Error("Choose a savings account");
    if (
      t.kind === "transfer" ||
      (t.kind === "savings" && t.funding !== "external")
    ) {
      const destination = r.get("account", t.destination);
      if (!destination || destination.id === account?.id)
        throw Error("Choose a different destination account");
      if (
        destination.currency === t.currency &&
        t.destinationAmount !== 0 &&
        t.destinationAmount !== t.amount
      )
        throw Error(
          "A same-currency transfer must move the same amount into and out of the accounts",
        );
      if (destination.currency !== t.currency && t.destinationAmount <= 0)
        throw Error("Enter the actual amount received in destination currency");
      if (t.kind === "savings" && destination.kind !== "savings")
        throw Error("Savings contributions need a savings account");
    }
    if (t.kind === "debt") {
      const debt = r.get("debt", t.target);
      if (!debt || debt.currency !== t.currency)
        throw Error("Choose a debt in the account currency");
      const prior = r.rows("transaction").filter((x) => x.id !== id);
      if (
        id &&
        prior.some(
          (x) => x.kind === "debt" && x.target === t.target && x.date >= t.date,
        )
      )
        throw Error(
          "Later debt payments exist. Reverse and re-enter payments in order",
        );
      if (
        prior.some(
          (x) => x.kind === "debt" && x.target === t.target && x.date > t.date,
        )
      )
        throw Error("Debt payments must be entered chronologically");
      const allocation = allocate(
        debtBalance(debt, prior),
        debt.apr,
        t.amount,
        debt.interestType === "manual" ? t.interest : undefined,
      );
      t.interest = allocation.interest;
    }
    if (["investment", "withdrawal", "dividend"].includes(t.kind)) {
      const inv = r.get("investment", t.target);
      if (!inv || inv.currency !== t.currency)
        throw Error("Choose an investment in the account currency");
      if (
        inv.mode === "market" &&
        ["investment", "withdrawal"].includes(t.kind)
      )
        throw Error(
          "For market investments, use Update holding to enter your new total shares or units",
        );
      if (
        t.kind === "withdrawal" &&
        t.amount >
          portfolioValue(
            inv,
            r.rows("transaction").filter((x) => x.id !== id),
          )
      )
        throw Error("Withdrawal exceeds the recorded investment value");
    }
    if (t.kind === "bill") {
      const bill = r.get("bill", t.target);
      if (!bill || bill.currency !== t.currency)
        throw Error("Choose a bill in the account currency");
    }
    if (t.kind === "savings" && t.target) {
      const goal = r.get("goal", t.target);
      const destination = r.get(
        "account",
        t.funding === "external" ? t.account : t.destination,
      );
      if (
        !goal ||
        goal.currency !== destination?.currency ||
        (goal.account && goal.account !== destination.id)
      )
        throw Error("Goal must match the destination account and currency");
    }
  }
  if (
    type === "account" &&
    id &&
    r
      .rows("investment")
      .some(
        (i) =>
          i.account === id && i.currency !== (data as Data["account"]).currency,
      )
  )
    throw Error("This account holds investments in its current currency");
  if (type === "investment") {
    const i = data as Data["investment"];
    if (i.account) {
      const a = r.get("account", i.account);
      if (!a || a.currency !== i.currency)
        throw Error("Choose an account in the investment’s currency");
    }
    i.valuedTransactions = r
      .rows("transaction")
      .filter(
        (t) =>
          t.target === id &&
          t.date <= i.date &&
          ["investment", "withdrawal"].includes(t.kind),
      )
      .map((t) => t.id);
  }
  return r.write(type, data, actor, device, id);
}
export function remove(
  r: Repository,
  type: EntityType,
  id: string,
  actor: string,
  device: string,
) {
  const row = r.get(type, id);
  if (!row) throw Error("Record is missing or conflicted");
  if (type === "household") throw Error("Household cannot be deleted");
  if (
    ["account", "debt", "investment", "bill"].includes(type) &&
    r
      .rows("transaction")
      .some((t) => [t.account, t.destination, t.target].includes(id))
  )
    throw Error(
      "This record has transactions. Preserve it for financial history",
    );
  if (type === "account" && r.rows("investment").some((i) => i.account === id))
    throw Error(
      "This account holds investments. Move them to another account before deleting it",
    );
  if (type === "transaction") {
    const tx = r.get("transaction", id)!;
    if (
      tx.kind === "debt" &&
      r
        .rows("transaction")
        .some((t) => t.id !== id && t.target === tx.target && t.date >= tx.date)
    )
      throw Error("Remove later debt payments first");
  }
  return r.write(type, row, actor, device, id, true);
}
// Both offline devices paying the same expected occurrence create competing revisions
// of one deterministic record, rather than silently double-counting the payment.
export async function occurrenceRecordId(occurrence: string) {
  const hash = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("tandem:occurrence:" + occurrence),
    ),
  ).slice(0, 16);
  hash[6] = (hash[6] & 15) | 80;
  hash[8] = (hash[8] & 63) | 128;
  const h = Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
