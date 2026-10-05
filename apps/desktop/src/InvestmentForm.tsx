import { useState, useEffect, useRef, type FormEvent } from "react";
import { Check, LockKeyhole } from "lucide-react";
import { schemas, type Row } from "../../../packages/types";
import { Repository } from "../../../packages/database/repository";
import { portfolioValue, parseMoney } from "../../../packages/finance";
import {
  fetchQuote,
  searchInvestments,
  holdingValue,
  unitsForValue,
  type Quote,
} from "../../../packages/market";
export function InvestmentForm({
  row,
  r,
  busy,
  onSave,
  onAddAccount,
}: {
  row?: Row<"investment">;
  r: Repository;
  base: string;
  busy: boolean;
  onSave: (type: "investment", data: any, id?: string) => Promise<void>;
  onAddAccount: () => void;
}) {
  const accounts = r.rows("account");
  const [value, setValue] = useState(
    row ? (portfolioValue(row, r.rows("transaction")) / 100).toFixed(2) : "",
  );
  const [kind, setKind] = useState(
    row?.kind === "Stocks" ? "Equity" : (row?.kind ?? "ETF"),
  );
  const [name, setName] = useState(row?.name ?? "");
  const [account, setAccount] = useState(
    row?.account ?? (accounts.length === 1 ? accounts[0].id : ""),
  );
  const [error, setError] = useState("");
  const key = r.meta("marketKey", "");
  const marketKind = [
    "ETF",
    "Equity",
    "Mutual fund",
    "Crypto",
    "Bonds",
  ].includes(kind);
  const [quote, setQuote] = useState<Quote | null>(
    row?.mode === "market" && row.priceDecimal
      ? {
          symbol: row.symbol ?? "",
          name: row.name,
          exchange: row.exchange ?? "",
          currency: row.currency,
          price: row.priceDecimal,
          asOf: row.quoteAsOf ?? row.date,
          fetchedAt: row.quoteFetchedAt ?? "",
        }
      : null,
  );
  const [results, setResults] = useState<
    Awaited<ReturnType<typeof searchInvestments>>
  >([]);
  const [loading, setLoading] = useState(false);
  const [units, setUnits] = useState("");
  const generation = useRef(0);
  const initialValue = row
    ? (portfolioValue(row, r.rows("transaction")) / 100).toFixed(2)
    : "";
  const sameHolding =
    !!row &&
    row.mode === "market" &&
    quote?.symbol === row.symbol &&
    quote?.exchange === (row.exchange ?? "");
  function quantity() {
    if (units.trim()) return units.trim();
    if (sameHolding && value === initialValue) return row!.quantity;
    return quote ? unitsForValue(parseMoney(value), quote.price) : "";
  }
  async function choose(
    x: Awaited<ReturnType<typeof searchInvestments>>[number],
    ticket: number,
  ) {
    setLoading(true);
    try {
      const q = await fetchQuote(x.symbol, key, x.exchange);
      if (ticket !== generation.current) return;
      setQuote(q);
      setName(q.name);
      setResults([]);
      setError("");
      if (x.instrument_type === "Common Stock" || x.instrument_type === "REIT")
        setKind("Equity");
      else if (x.instrument_type === "ETF") setKind("ETF");
    } catch (e) {
      if (ticket === generation.current) setError((e as Error).message);
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    const ticket = ++generation.current;
    if (!marketKind || !key || !name.trim() || quote?.name === name) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchInvestments(name, key);
        if (ticket !== generation.current) return;
        setResults(found);
        const exact = found.filter(
          (x) => x.symbol.toUpperCase() === name.trim().toUpperCase(),
        );
        if (exact.length === 1) await choose(exact[0], ticket);
        else {
          setLoading(false);
          if (!found.length)
            setError("No matching investment found. Check the ticker or name.");
        }
      } catch (e) {
        if (ticket === generation.current) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    }, 650);
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [name, key, marketKind]);
  let estimatedUnits = "";
  try {
    estimatedUnits = quantity();
  } catch {}
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const a = r.get("account", account);
      if (!a) throw Error("Choose the account holding this investment");
      let current = parseMoney(value);
      const q = marketKind ? quote : null;
      const qty = q ? quantity() : "";
      if (q && q.currency !== a.currency)
        throw Error(
          `This investment is priced in ${q.currency}. Choose an account in ${q.currency}.`,
        );
      if (q) current = holdingValue(qty, q.price);
      if (current < 0) throw Error("Amount cannot be negative");
      if (row && row.currency !== a.currency)
        throw Error("Choose an account in the investment’s currency");
      if (!name.trim()) throw Error("Enter the investment’s name or ticker");
      const data = schemas.investment.parse({
        ...row,
        name: name.trim(),
        kind,
        account,
        currency: a.currency,
        owner: row?.owner ?? a.owner,
        value: current,
        contributed: row?.contributed ?? current,
        date: new Date().toLocaleDateString("en-CA"),
        mode: q ? "market" : "manual",
        autoUpdate: !!q,
        symbol: q?.symbol ?? "",
        exchange: q?.exchange ?? "",
        quantity: qty,
        price: q ? holdingValue("1", q.price) : 0,
        quoteAsOf: q?.asOf,
        quoteFetchedAt: q?.fetchedAt,
        priceDecimal: q?.price,
      });
      await onSave("investment", data, row?.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form onSubmit={submit}>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <label>
        Amount
        <input
          name="investmentValue"
          inputMode="decimal"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0.00"
        />
      </label>
      <label>
        Investment type
        <select
          aria-label="Investment type"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          {[
            "ETF",
            "Equity",
            "Mutual fund",
            "Bonds",
            "Fixed deposit",
            "Crypto",
            "Property",
            "Business",
            "Other",
          ].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label>
        Investment name
        <input
          aria-label="Investment name"
          name="investmentName"
          required
          maxLength={200}
          value={name}
          onChange={(e) => {
            generation.current++;
            setName(e.target.value);
            setQuote(null);
            setResults([]);
            setError("");
            setUnits("");
          }}
          placeholder={
            kind === "ETF"
              ? "ETF name or ticker"
              : kind === "Equity"
                ? "Company name or ticker"
                : "Fund or investment name"
          }
        />
      </label>
      {marketKind && (
        <>
          {loading && <small role="status">Looking up investment…</small>}
          {results.length > 0 && (
            <div className="investment-results">
              {results.map((x) => (
                <button
                  type="button"
                  key={x.symbol + x.exchange}
                  onClick={() => void choose(x, ++generation.current)}
                >
                  <span>
                    <b>{x.instrument_name}</b>
                    <small>
                      {x.symbol} · {x.exchange} · {x.currency}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
          {quote ? (
            <div className="quote-preview">
              <b>{quote.name}</b>
              <p>
                {quote.symbol} · {quote.exchange} · {quote.currency}{" "}
                {quote.price} per unit
              </p>
              <small>
                Price as of {quote.asOf}. Values update from market prices while
                Investments is open.
              </small>
              <p>
                {estimatedUnits || "—"} shares / units
                {!units && !(sameHolding && value === initialValue)
                  ? " estimated from your amount at this price"
                  : " tracked"}
                .
              </p>
              <details>
                <summary>Set exact shares / units</summary>
                <label>
                  Shares / units
                  <input
                    aria-label="Shares / units"
                    inputMode="decimal"
                    value={units}
                    onChange={(e) => setUnits(e.target.value)}
                    placeholder={estimatedUnits}
                  />
                </label>
                <small>
                  Use your broker’s actual quantity for accurate tracking. The
                  amount above is treated as today’s value, not your original
                  purchase cost.
                </small>
              </details>
            </div>
          ) : (
            <small>
              {key
                ? "Type a ticker (e.g. O) or company/fund name. Select a match to turn on market updates. Saving without a match keeps a manual value."
                : "Connect your Twelve Data key under Investments → Online prices to look up names and update prices. Without a connection this saves a manual value."}
            </small>
          )}
        </>
      )}
      <label>
        Account
        <select
          aria-label="Account"
          required
          value={account}
          onChange={(e) => setAccount(e.target.value)}
        >
          <option value="">Choose an account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.currency}
            </option>
          ))}
        </select>
      </label>
      {!accounts.length && (
        <p>
          Add the account where you hold your investments first.{" "}
          <button type="button" onClick={onAddAccount}>
            Add account
          </button>
        </p>
      )}
      <small>
        This records the investment held in this account. It doesn’t move cash.
      </small>
      <div className="form-footer">
        <small>
          <LockKeyhole size={13} /> Saved encrypted on this device
        </small>
        <button
          className="primary"
          disabled={busy || loading || !accounts.length}
        >
          {busy ? "Saving…" : row ? "Save changes" : "Save investment"}
          <Check size={16} />
        </button>
      </div>
    </form>
  );
}
