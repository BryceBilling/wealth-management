import { InstallApp } from "./InstallApp";
import { ShareApp } from "./ShareApp";
import { TransferLinks, TransferImport, transferToken } from "./Transfer";
import { InvestmentForm } from "./InvestmentForm";
import { interestProjection } from "../../../packages/market";
import { updateMarketValues } from "../../../packages/market/update";
import { historicalPosition } from "../../../packages/finance/history";
import { download, saveBytes } from "./files";
import { bytes } from "../../../packages/database/crypto";
import { useEffect, useState, useRef, type FormEvent } from "react";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  Receipt,
  Landmark,
  ChartNoAxesCombined,
  PiggyBank,
  CalendarDays,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ShoppingBag,
  ChevronRight,
  LockKeyhole,
  Cloud,
  Check,
  X,
  Menu,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  Pencil,
  History,
  Target,
  SlidersHorizontal,
  Repeat,
  TrendingUp,
  Share2,
} from "lucide-react";
import { initSQL, Repository } from "../../../packages/database/repository";
import { BrowserStorage } from "../../../packages/database/storage";
import { Vault } from "../../../packages/database/vault";
import {
  save,
  remove,
  occurrenceRecordId,
} from "../../../packages/database/commands";
import { sync, request, type SyncConfig } from "../../../packages/sync/client";
import {
  currencies,
  schemas,
  type EntityType,
  type Row,
  type Data,
} from "../../../packages/types";
import * as F from "../../../packages/finance";
import { fields, expenseCategories, type Field } from "./forms";
const storage = new BrowserStorage();
const today = () => new Date().toLocaleDateString("en-CA");
const device = localStorage.getItem("tandem-device") ?? crypto.randomUUID();
localStorage.setItem("tandem-device", device);
const money = (n: number, c = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: c,
    maximumFractionDigits: 2,
  }).format(n / 100);
const inputMoney = (n: number) =>
  `${n < 0 ? "-" : ""}${Math.floor(Math.abs(n) / 100)}.${String(Math.abs(n) % 100).padStart(2, "0")}`;
const nice = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const nav = [
  ["Overview", LayoutDashboard],
  ["Transactions", ArrowLeftRight],
  ["Accounts", Wallet],
  ["Bills", Receipt],
  ["Debts", Landmark],
  ["Investments", ChartNoAxesCombined],
  ["Savings & goals", PiggyBank],
  ["Budget", SlidersHorizontal],
  ["Calendar", CalendarDays],
  ["Reports", TrendingUp],
  ["Recurring", Repeat],
  ["Settings", Settings],
] as const;
export function App() {
  const [transfer, setTransfer] = useState(transferToken);
  useEffect(() => {
    const changed = () => setTransfer(transferToken());
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  const [ready, setReady] = useState(false),
    [exists, setExists] = useState(false),
    [vault, setVault] = useState<Vault | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([initSQL("/sql-wasm.wasm"), storage.read()])
      .then(([, e]) => {
        setExists(!!e);
        setReady(true);
      })
      .catch((e) => setError(String(e)));
  }, []);
  async function enter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const pass = String(fd.get("pass"));
      if (exists) setVault(await Vault.unlock(pass, storage));
      else {
        const v = await Vault.create(pass, storage);
        const one = crypto.randomUUID(),
          two = crypto.randomUUID();
        await v.mutate((r) => {
          r.write(
            "household",
            {
              name: String(fd.get("household")),
              currency: String(fd.get("currency")) as any,
              users: [
                { id: one, name: String(fd.get("one")) },
                { id: two, name: String(fd.get("two")) },
              ],
            },
            one,
            device,
          );
          r.setMeta("member", one);
        });
        setVault(v);
        navigator.storage?.persist?.();
      }
    } catch (e) {
      setError(exists ? "Unable to unlock. Check your passphrase." : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function importInitial(file: File, pass: string) {
    setBusy(true);
    try {
      const v = await Vault.create(pass, storage);
      await v.restore(JSON.parse(await file.text()), pass);
      await v.mutate((r) =>
        r.setMeta("member", r.rows("household")[0].users[1].id),
      );
      setVault(v);
    } catch (e) {
      setError("Could not restore backup: " + String(e));
    } finally {
      setBusy(false);
    }
  }
  if (ready && transfer && (!exists || vault))
    return (
      <TransferImport
        key={transfer}
        token={transfer}
        existing={!!vault}
        onImport={async (envelope, pass, member) => {
          if (vault) {
            await vault.restore(envelope, pass);
            return;
          }
          // Prepare and validate in memory before writing the new device's vault.
          const v = await Vault.create(pass, {
            read: async () => null,
            write: async () => {},
          });
          try {
            await v.restore(envelope, pass);
            await v.mutate((r) =>
              r.setMeta("member", r.rows("household")[0].users[member].id),
            );
            await storage.write(await v.backup());
            v.storage = storage;
            setVault(v);
            navigator.storage?.persist?.();
          } catch (e) {
            v.repo.close();
            throw e;
          }
        }}
        onClose={() => {
          history.replaceState(null, "", location.pathname + location.search);
          setTransfer(null);
        }}
      />
    );
  if (vault) return <Workspace vault={vault} />;
  return (
    <div className="welcome">
      <div className="welcome-story">
        <Brand />
        <div>
          <span className="eyebrow">
            A LITTLE CLARITY. A LOT OF POSSIBILITY.
          </span>
          <h1>
            Your life together.
            <br />
            Your money,
            <br />
            <em>in perspective.</em>
          </h1>
          <p>
            A private home for everything you’re building.
            <br />
            Always with you. Even when you’re offline.
          </p>
          <div className="brand-art">
            <div />
            <div />
            <span>Made for the two of you.</span>
          </div>
        </div>
        <small>
          <LockKeyhole size={14} /> Private by design. Yours by right.
        </small>
      </div>
      <div className="welcome-form">
        {transfer && exists && (
          <p role="status">
            Unlock this device’s vault to import your transfer link.
          </p>
        )}
        <InstallApp />
        <span className="pill">
          <span className="dot" /> LOCAL & ENCRYPTED
        </span>
        <h2>{exists ? "Welcome home." : "Let’s find your rhythm."}</h2>
        <p>
          {exists
            ? "Unlock your household’s financial picture."
            : "Create your private household. No public account needed."}
        </p>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <form onSubmit={enter}>
          {!exists && (
            <>
              <label>
                Household name
                <input name="household" placeholder="Our household" required />
              </label>
              <div className="form-grid">
                <label>
                  Your name
                  <input name="one" required />
                </label>
                <label>
                  Your partner’s name
                  <input name="two" required />
                </label>
              </div>
              <label>
                Base currency
                <select name="currency">
                  {currencies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label>
            Vault passphrase
            <input
              name="pass"
              type="password"
              minLength={12}
              required
              autoComplete={exists ? "current-password" : "new-password"}
              placeholder="At least 12 characters"
            />
          </label>
          <small>
            Your passphrase encrypts this device and your backups. Keep it safe:
            it cannot be recovered.
          </small>
          <button className="primary wide" disabled={!ready || busy}>
            {busy
              ? "Opening securely…"
              : exists
                ? "Unlock Tandem"
                : "Create our household"}
            <ArrowUpRight size={18} />
          </button>
        </form>
        {!exists && (
          <details>
            <summary>Joining your partner? Restore a backup</summary>
            <p>
              Use the encrypted backup and vault passphrase from their device.
            </p>
            <input
              type="password"
              id="importPass"
              aria-label="Backup passphrase"
              placeholder="Backup passphrase"
            />
            <label className="button">
              <Upload size={16} /> Choose encrypted backup
              <input
                type="file"
                accept=".tandem,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    void importInitial(
                      f,
                      (
                        document.getElementById(
                          "importPass",
                        ) as HTMLInputElement
                      ).value,
                    );
                }}
              />
            </label>
          </details>
        )}
      </div>
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <img src="/logo.svg" alt="Tandem interlocking arches" />
      <span>
        tandem<span className="brand-period">.</span>
      </span>
    </div>
  );
}
type Modal = {
  type: EntityType | "quick" | "audit";
  row?: any;
  kind?: string;
  expected?: F.Expected;
};
function Workspace({ vault }: { vault: Vault }) {
  const [, render] = useState(0),
    [page, setPage] = useState("Overview"),
    [scope, setScope] = useState("household"),
    [query, setQuery] = useState(""),
    [modal, setModal] = useState<Modal | null>(null),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [menu, setMenu] = useState(false),
    [month, setMonth] = useState(today().slice(0, 7)),
    [syncing, setSyncing] = useState(false),
    [syncStatus, setSyncStatus] = useState("Saved on this device"),
    [filters, setFilters] = useState({
      account: "",
      category: "",
      currency: "",
      from: "",
      to: "",
      min: "",
      max: "",
      person: "",
    });
  const [sharing, setSharing] = useState(false);
  const [priceStatus, setPriceStatus] = useState(""),
    [pricesBusy, setPricesBusy] = useState(false);
  const priceLock = useRef(false);
  const r = vault.repo,
    hh = r.rows("household")[0],
    base = hh.currency,
    member = r.meta("member", hh.users[0].id);
  const allTx = r.rows("transaction"),
    allAccounts = r.rows("account"),
    allDebts = r.rows("debt"),
    allInv = r.rows("investment");
  const visible = (x: any) => scope === "household" || x.owner === scope;
  const accounts = allAccounts.filter(visible),
    tx = allTx.filter(visible),
    debts = allDebts.filter(visible),
    investments = allInv.filter(visible),
    goals = r.rows("goal").filter(visible),
    bills = r.rows("bill").filter(visible),
    rules = r.rows("recurring").filter(visible);
  const rates: Record<string, number> = { [base]: 1000000 };
  for (const rate of r
    .rows("rate")
    .sort((a, b) => a.date.localeCompare(b.date)))
    if (rate.date <= today()) rates[rate.name] = rate.value;
  const missing = [
    ...new Set(
      [...accounts, ...debts, ...investments, ...bills, ...rules].map(
        (a) => a.currency,
      ),
    ),
  ].filter((c) => !rates[c]);
  const cv = (n: number, c: string) => (rates[c] ? F.convert(n, rates[c]) : 0);
  const bal = F.balances(allAccounts, allTx),
    cash = F.sum(
      accounts
        .filter((a) => a.kind !== "savings")
        .map((a) => cv(bal[a.id], a.currency)),
    ),
    savings = F.sum(
      accounts
        .filter((a) => a.kind === "savings")
        .map((a) => cv(bal[a.id], a.currency)),
    ),
    invValue = F.sum(
      investments.map((i) => cv(F.portfolioValue(i, allTx), i.currency)),
    ),
    debtTotal = F.sum(
      debts.map((d) => cv(F.debtBalance(d, allTx), d.currency)),
    ),
    net = F.add(cash, savings, invValue, -debtTotal),
    budget = F.budget(tx, month);
  const from = month + "-01",
    to = new Date(
      Number(month.slice(0, 4)),
      Number(month.slice(5)),
      0,
    ).toLocaleDateString("en-CA");
  const scheduled = F.expected(bills, rules, allTx, from, to);
  for (const d of debts) {
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(year, monthNumber, 0).getDate();
    const dueDay = Math.min(d.paymentDay ?? 1, lastDay);
    const date = month + "-" + String(dueDay).padStart(2, "0");
    if (
      date >= d.date &&
      !rules.some((x) => x.kind === "debt" && x.target === d.id) &&
      !allTx.some(
        (t) =>
          t.kind === "debt" && t.target === d.id && t.date.startsWith(month),
      )
    )
      scheduled.push({
        id: d.id + ":" + date,
        name: d.name,
        date,
        amount: d.payment,
        currency: d.currency,
        kind: "debt",
        target: d.id,
        account: "",
        destination: "",
      });
  }
  scheduled.sort((a, b) => a.date.localeCompare(b.date));
  const billsRemaining = F.sum(
    scheduled
      .filter((e) => e.kind === "bill")
      .map((e) => cv(e.amount, e.currency)),
  );
  const refresh = () => render((n) => n + 1);
  async function action(
    fn: () => Promise<unknown>,
    message = "Saved securely",
  ) {
    setBusy(true);
    setError("");
    try {
      await fn();
      refresh();
      setToast(message);
      setTimeout(() => setToast(""), 4000);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function runSync() {
    const config = r.meta<SyncConfig | null>("sync", null);
    if (!config) return;
    if (syncing) return;
    setSyncing(true);
    try {
      await sync(vault, config);
      refresh();
      setSyncStatus(
        "Up to date · " +
          new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
      );
    } catch (e) {
      setSyncStatus("Sync paused · " + String(e));
    } finally {
      setSyncing(false);
    }
  }
  const marketKey = r.meta("marketKey", "");
  async function refreshPrices(ids?: string[]) {
    if (priceLock.current) return;
    if (!marketKey) {
      setPriceStatus(
        "Connect online prices below to refresh. Saved values remain available offline.",
      );
      return;
    }
    priceLock.current = true;
    setPricesBusy(true);
    try {
      const result = await updateMarketValues(
        vault,
        marketKey,
        member,
        device,
        ids,
      );
      refresh();
      setPriceStatus(
        result.errors.length
          ? result.errors.join(" · ")
          : `${result.updated} holding(s) updated · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      );
    } catch (e) {
      setPriceStatus((e as Error).message);
    } finally {
      priceLock.current = false;
      setPricesBusy(false);
    }
  }
  useEffect(() => {
    if (page !== "Investments" || !marketKey) return;
    const update = () => {
      if (navigator.onLine) void refreshPrices();
    };
    update();
    const timer = setInterval(update, 15 * 60 * 1000);
    window.addEventListener("online", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", update);
    };
  }, [page, marketKey]);
  useEffect(() => {
    const interval = setInterval(() => {
      if (navigator.onLine) void runSync();
    }, 45000);
    const online = () => void runSync();
    window.addEventListener("online", online);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", online);
    };
  }, [syncing]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => location.reload(), 15 * 60 * 1000);
    };
    reset();
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
    };
  }, []);
  const openQuick = (kind: string, expected?: F.Expected) => {
    setModal({ type: "quick", kind, expected });
    setError("");
  };
  const navigate = (p: string) => {
    setPage(p);
    setMenu(false);
    setQuery("");
  };
  const title = page === "Overview" ? "A clear view of your together." : page;
  function matches(x: any) {
    return JSON.stringify(x).toLowerCase().includes(query.toLowerCase());
  }
  const filteredTx = tx.filter(
    (t) =>
      matches(t) &&
      (!filters.account || t.account === filters.account) &&
      (!filters.category || t.category === filters.category) &&
      (!filters.currency || t.currency === filters.currency) &&
      (!filters.person || t.person === filters.person) &&
      (!filters.from || t.date >= filters.from) &&
      (!filters.to || t.date <= filters.to) &&
      (!filters.min || t.amount >= F.parseMoney(filters.min)) &&
      (!filters.max || t.amount <= F.parseMoney(filters.max)),
  );
  const addButton = (type: EntityType, label: string) => (
    <button className="primary" onClick={() => setModal({ type })}>
      <Plus size={16} />
      {label}
    </button>
  );
  function rowActions(type: EntityType, row: any) {
    return (
      <div className="row-actions">
        <button
          title="Edit"
          aria-label={"Edit " + row.name}
          onClick={() =>
            setModal({
              type: type === "transaction" ? "quick" : type,
              row,
              kind: row.kind,
            })
          }
        >
          <Pencil size={14} />
        </button>
        <button
          title="History"
          aria-label={"History " + row.name}
          onClick={() => setModal({ type: "audit", row })}
        >
          <History size={14} />
        </button>
        <button
          title="Delete"
          aria-label={"Delete " + row.name}
          onClick={() => {
            if (
              confirm(
                "Mark this record deleted? Its audit history will be preserved.",
              )
            )
              void action(
                () =>
                  vault.mutate((repo) =>
                    remove(repo, type, row.id, member, device),
                  ),
                "Record archived",
              );
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    );
  }
  function transactionTable(rows: Row<"transaction">[]) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Transaction</th>
              <th>Category / account</th>
              <th>Person</th>
              <th>Date</th>
              <th className="right">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="transaction-name">
                      <span className={"transaction-icon " + t.kind}>
                        {["income", "dividend"].includes(t.kind) ||
                        t.funding === "external" ? (
                          <ArrowDownLeft size={17} />
                        ) : t.kind === "expense" ? (
                          <ShoppingBag size={16} />
                        ) : (
                          <ArrowUpRight size={17} />
                        )}
                      </span>
                      <span>
                        <b>{t.name}</b>
                        <small>
                          {t.merchant || nice(t.kind)}
                          {t.notes ? " · " + t.notes : ""}
                        </small>
                      </span>
                    </div>
                  </td>
                  <td>
                    {t.category}
                    <small>
                      {allAccounts.find((a) => a.id === t.account)?.name ??
                        (t.funding === "external" ? "Added directly" : "")}
                    </small>
                  </td>
                  <td>
                    <span className="avatar tiny">
                      {hh.users
                        .find((u) => u.id === t.person)
                        ?.name.slice(0, 1)}
                    </span>{" "}
                    {hh.users.find((u) => u.id === t.person)?.name}
                  </td>
                  <td>{t.date}</td>
                  <td
                    className={
                      "right amount " +
                      (["income", "dividend"].includes(t.kind) ||
                      t.funding === "external"
                        ? "positive"
                        : "")
                    }
                  >
                    {["income", "dividend"].includes(t.kind) ||
                    t.funding === "external"
                      ? "+"
                      : "−"}
                    {money(t.amount, t.currency)}
                  </td>
                  <td>{rowActions("transaction", t)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {!rows.length && (
          <Empty
            title="A fresh start"
            text="Your transactions will appear here. Add an account, then record your first income or expense."
          />
        )}
      </div>
    );
  }
  const goalCard = (g: Row<"goal">) => {
    const current = F.add(
      g.current,
      ...allTx
        .filter((t) => t.kind === "savings" && t.target === g.id)
        .map((t) => t.destinationAmount || t.amount),
    );
    const progress = F.savingsProgress(current, g.target, g.date, today());
    return (
      <div className="card goal-card" key={g.id}>
        <div className="section-title">
          <span className="soft-icon">
            <Target size={19} />
          </span>
          {rowActions("goal", g)}
        </div>
        <h3>{g.name}</h3>
        <p>
          <strong>{money(current, g.currency)}</strong>{" "}
          <span>of {money(g.target, g.currency)}</span>
        </p>
        <Progress value={progress.percent} />
        <div className="spread">
          <small>{Math.round(progress.percent)}% there</small>
          <small>{g.date}</small>
        </div>
        <small>
          {money(progress.monthly, g.currency)}/month to reach your target
        </small>
        <button
          className="text-button"
          onClick={() =>
            openQuick("savings", {
              id: "",
              name: g.name,
              date: today(),
              amount: 0,
              currency: g.currency,
              kind: "savings",
              target: g.id,
              account: g.account,
              destination: "",
            })
          }
        >
          Add a contribution <ArrowUpRight size={14} />
        </button>
      </div>
    );
  };
  return (
    <div className="app-shell">
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <Brand />
        <div className="household-chip">
          <span className="avatar">{hh.name.slice(0, 1)}</span>
          <span>
            <b>{hh.name}</b>
            <small>YOUR PRIVATE HOUSEHOLD</small>
          </span>
        </div>
        <span className="nav-caption">YOUR FINANCIAL PICTURE</span>
        <nav>
          {nav.map(([name, Icon]) => (
            <button
              className={page === name ? "active" : ""}
              key={name}
              onClick={() => navigate(name)}
            >
              <Icon size={18} />
              {name}
              {page === name && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="share-app-button" onClick={() => setSharing(true)}>
            <Share2 size={16} />
            Share Tandem
          </button>
          <div className="private-note">
            <LockKeyhole size={17} />
            <div>
              <b>Just the two of you.</b>
              <small>Encrypted. Offline-ready. Always yours.</small>
            </div>
          </div>
          <button className="user-button" onClick={() => location.reload()}>
            <span className="avatar">
              {hh.users.find((u) => u.id === member)?.name.slice(0, 1)}
            </span>
            <span>
              {hh.users.find((u) => u.id === member)?.name}
              <small>Lock your vault</small>
            </span>
            <LockKeyhole size={15} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <button
            className="mobile-menu"
            aria-label="Menu"
            onClick={() => setMenu(!menu)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Household <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="header-right">
            <div className="global-search">
              <Search size={16} />
              <input
                placeholder="Search your finances"
                aria-label="Search your finances"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>⌕</kbd>
            </div>
            <button
              className="sync-indicator"
              onClick={() => void runSync()}
              title={syncStatus}
            >
              <span className="dot" />
              {syncing
                ? "Syncing…"
                : r.pending().length
                  ? `${r.pending().length} local changes`
                  : "Saved locally"}
            </button>
            <button className="primary" onClick={() => openQuick("expense")}>
              <Plus size={17} />
              Quick add
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {new Date()
                  .toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })
                  .toUpperCase()}
              </span>
              <div className="page-title-row">
                <h1>{query ? "Find what matters." : title}</h1>{" "}
                <button
                  aria-label="Refresh page"
                  title="Refresh this page"
                  disabled={syncing || pricesBusy || busy}
                  onClick={() => {
                    void (async () => {
                      await runSync();
                      if (marketKey) await refreshPrices();
                      refresh();
                    })();
                  }}
                >
                  <RefreshCw size={17} />{" "}
                  <span className="refresh-label">Refresh</span>
                </button>
              </div>
              <p>
                {page === "Overview"
                  ? "Everything you own, owe, and are working toward. In one place."
                  : "Your household, thoughtfully organized."}
              </p>
            </div>
            <div className="heading-controls">
              <select
                aria-label="Household view"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value="household">Household view</option>
                {hh.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · individual
                  </option>
                ))}
              </select>
              <input
                aria-label="Reporting month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {toast && (
            <div className="toast" role="status">
              <Check size={16} />
              {toast}
            </div>
          )}
          {r.conflicts().length > 0 && (
            <div className="warning">
              {r.conflicts().length} record(s) need conflict resolution. These
              records are excluded from totals.{" "}
              <button onClick={() => setPage("Settings")}>
                Review versions
              </button>
            </div>
          )}
          {missing.length > 0 && (
            <div className="warning">
              Totals exclude {missing.join(", ")} until you add exchange rates
              in Settings.
            </div>
          )}
          {query ? (
            <>
              <section className="card">
                <div className="section-title">
                  <h2>Transactions</h2>
                  <span>{filteredTx.length} results</span>
                </div>
                {transactionTable(filteredTx)}
              </section>
              <div className="grid three">
                {[...accounts, ...bills, ...debts, ...investments, ...goals]
                  .filter(matches)
                  .map((x) => (
                    <button
                      className="card search-result"
                      key={x.id}
                      onClick={() => setModal({ type: x.type, row: x })}
                    >
                      <small>{nice(x.type)}</small>
                      <h3>{x.name}</h3>
                      <ChevronRight size={18} />
                    </button>
                  ))}
              </div>
            </>
          ) : (
            <>
              {page === "Overview" && (
                <>
                  <div className="overview-top">
                    <section className="wealth-card">
                      <div className="section-title">
                        <span className="eyebrow">HOUSEHOLD NET WORTH</span>
                        <span className="wealth-badge">{base}</span>
                      </div>
                      <div className="wealth-number">{money(net, base)}</div>
                      <Historical
                        r={r}
                        base={base}
                        scope={scope}
                        current={net}
                      />
                      <div className="wealth-footer">
                        <span>
                          <span className="dot" />
                          Your assets, less your liabilities
                        </span>
                        <span>
                          Built together <ArrowUpRight size={15} />
                        </span>
                      </div>
                    </section>
                    <section className="card month-card">
                      <div className="section-title">
                        <h2>This month at a glance</h2>
                        <span className="tag">
                          {new Date(from + "T12:00:00").toLocaleDateString(
                            "en-US",
                            { month: "short" },
                          )}
                        </span>
                      </div>
                      <div className="month-row">
                        <span>
                          <ArrowDownLeft size={17} /> Money in
                        </span>
                        <strong className="positive">
                          {money(budget.income, base)}
                        </strong>
                      </div>
                      <div className="month-row">
                        <span>
                          <ArrowUpRight size={17} /> Money out
                        </span>
                        <strong>
                          {money(F.add(budget.expenses, budget.debt), base)}
                        </strong>
                      </div>
                      <div className="month-row">
                        <span>
                          <PiggyBank size={17} /> Saved & invested
                        </span>
                        <strong>
                          {money(
                            F.add(budget.savings, budget.investment),
                            base,
                          )}
                        </strong>
                      </div>
                      <div className="available">
                        <span>
                          Disposable cash flow
                          <small>Income less spending & contributions</small>
                        </span>
                        <strong>{money(budget.available, base)}</strong>
                      </div>
                    </section>
                  </div>
                  <div className="grid four">
                    <Metric
                      label="Available cash"
                      value={money(cash, base)}
                      icon={<Wallet />}
                      note={`${accounts.filter((a) => a.kind !== "savings").length} everyday accounts`}
                    />
                    <Metric
                      label="Savings"
                      value={money(savings, base)}
                      icon={<PiggyBank />}
                      note="A little more peace of mind"
                    />
                    <Metric
                      label="Investments"
                      value={money(invValue, base)}
                      icon={<ChartNoAxesCombined />}
                      note={`${investments.length} assets in your portfolio`}
                    />
                    <Metric
                      label="Outstanding debt"
                      value={money(debtTotal, base)}
                      icon={<Landmark />}
                      note={`${money(F.sum(debts.map((d) => cv(d.payment, d.currency))), base)} scheduled / month`}
                    />
                  </div>
                  <div className="quick-strip">
                    <span>MAKE A SMALL MOVE</span>
                    {[
                      ["income", "Income", ArrowDownLeft],
                      ["expense", "Expense", ArrowUpRight],
                      ["expense", "Shopping", ShoppingBag],
                      ["transfer", "Transfer", ArrowLeftRight],
                      ["savings", "Save", PiggyBank],
                    ].map(([kind, label, Icon]: any) => (
                      <button
                        key={label}
                        onClick={() =>
                          openQuick(label === "Shopping" ? "shopping" : kind)
                        }
                      >
                        <Icon size={17} />
                        {label}
                        <Plus size={14} />
                      </button>
                    ))}
                  </div>
                  <div className="grid dashboard-bottom">
                    <section className="card">
                      <div className="section-title">
                        <div>
                          <h2>Recent activity</h2>
                          <p>The everyday steps that add up.</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => setPage("Transactions")}
                        >
                          View all <ArrowUpRight size={15} />
                        </button>
                      </div>
                      {transactionTable(
                        tx
                          .slice()
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .slice(0, 5),
                      )}
                    </section>
                    <section className="card">
                      <div className="section-title">
                        <h2>On the horizon</h2>
                        <CalendarDays size={18} />
                      </div>
                      <p>
                        {money(billsRemaining, base)} in unpaid bills this month
                      </p>
                      {scheduled.slice(0, 4).map((e) => (
                        <button
                          key={e.id}
                          className="upcoming-row"
                          onClick={() => openQuick(e.kind, e)}
                        >
                          <span className="date-tile">
                            {new Date(e.date + "T12:00:00").toLocaleDateString(
                              "en-US",
                              { month: "short" },
                            )}
                            <strong>{e.date.slice(8)}</strong>
                          </span>
                          <span>
                            <b>{e.name}</b>
                            <small>{nice(e.kind)} · expected</small>
                          </span>
                          <strong>{money(e.amount, e.currency)}</strong>
                        </button>
                      ))}
                      {!scheduled.length && (
                        <Empty
                          title="Room to breathe"
                          text="No expected payments this month."
                        />
                      )}
                      <button
                        className="text-button"
                        onClick={() => setPage("Calendar")}
                      >
                        Open calendar <ArrowUpRight size={15} />
                      </button>
                    </section>
                  </div>
                  <div className="section-title goals-heading">
                    <div>
                      <h2>A future worth saving for</h2>
                      <p>Big plans. Small, steady steps.</p>
                    </div>
                    {addButton("goal", "New goal")}
                  </div>
                  <div className="grid three">
                    {goals.slice(0, 3).map(goalCard)}
                    {!goals.length && (
                      <button
                        className="empty-goal"
                        onClick={() => setModal({ type: "goal" })}
                      >
                        <Plus />
                        <h3>What’s next for you two?</h3>
                        <p>Give your savings a purpose.</p>
                      </button>
                    )}
                  </div>
                </>
              )}
              {page === "Transactions" && (
                <>
                  <div className="toolbar">
                    <div className="button-group">
                      {[
                        "income",
                        "expense",
                        "shopping",
                        "transfer",
                        "bill",
                        "debt",
                        "savings",
                        "investment",
                      ].map((k) => (
                        <button key={k} onClick={() => openQuick(k)}>
                          + {nice(k)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="filter-bar">
                    <select
                      aria-label="Account filter"
                      value={filters.account}
                      onChange={(e) =>
                        setFilters({ ...filters, account: e.target.value })
                      }
                    >
                      <option value="">All accounts</option>
                      {allAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="Category"
                      value={filters.category}
                      onChange={(e) =>
                        setFilters({ ...filters, category: e.target.value })
                      }
                    />
                    <select
                      aria-label="Currency filter"
                      value={filters.currency}
                      onChange={(e) =>
                        setFilters({ ...filters, currency: e.target.value })
                      }
                    >
                      <option value="">All currencies</option>
                      {currencies.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Person filter"
                      value={filters.person}
                      onChange={(e) =>
                        setFilters({ ...filters, person: e.target.value })
                      }
                    >
                      <option value="">Both people</option>
                      {hh.users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="From date"
                      type="date"
                      value={filters.from}
                      onChange={(e) =>
                        setFilters({ ...filters, from: e.target.value })
                      }
                    />
                    <input
                      aria-label="To date"
                      type="date"
                      value={filters.to}
                      onChange={(e) =>
                        setFilters({ ...filters, to: e.target.value })
                      }
                    />
                    <input
                      placeholder="Min amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={filters.min}
                      onChange={(e) =>
                        setFilters({ ...filters, min: e.target.value })
                      }
                    />
                    <input
                      placeholder="Max amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={filters.max}
                      onChange={(e) =>
                        setFilters({ ...filters, max: e.target.value })
                      }
                    />
                  </div>
                  <section className="card">
                    {transactionTable(filteredTx)}
                  </section>
                </>
              )}
              {page === "Accounts" && (
                <>
                  <div className="toolbar">
                    <p>
                      Balances are calculated from opening balances and your
                      transactions.
                    </p>
                    {addButton("account", "Add account")}
                  </div>
                  <div className="grid three">
                    {accounts.map((a) => (
                      <section className="card account-card" key={a.id}>
                        <div className="section-title">
                          <span className="soft-icon">
                            <Wallet size={20} />
                          </span>
                          <span className="tag">{a.currency}</span>
                        </div>
                        <h3>{a.name}</h3>
                        <div className="big-number">
                          {money(bal[a.id], a.currency)}
                        </div>
                        <p>
                          {nice(a.kind)} ·{" "}
                          {a.owner === "shared"
                            ? "Shared"
                            : hh.users.find((u) => u.id === a.owner)?.name}
                        </p>
                        <div className="section-title">
                          <button
                            className="text-button"
                            onClick={() => openQuick("transfer")}
                          >
                            Transfer <ArrowUpRight size={14} />
                          </button>
                          {rowActions("account", a)}
                        </div>
                      </section>
                    ))}
                  </div>
                  {!accounts.length && (
                    <Empty
                      title="Every account, one picture"
                      text="Add your cash, bank and savings accounts to get started."
                    />
                  )}
                </>
              )}
              {page === "Bills" && (
                <>
                  <div className="toolbar">
                    <p>
                      Expected bills become actual expenses only when you record
                      payment.
                    </p>
                    {addButton("bill", "Add bill")}
                  </div>
                  <div className="grid three">
                    <Metric
                      label="Expected this month"
                      value={money(
                        F.sum(
                          scheduled
                            .filter((e) => e.kind === "bill")
                            .map((e) => cv(e.amount, e.currency)),
                        ) +
                          F.sum(
                            tx
                              .filter(
                                (t) =>
                                  t.kind === "bill" && t.date.startsWith(month),
                              )
                              .map((t) => F.convert(t.amount, t.rate)),
                          ),
                        base,
                      )}
                    />
                    <Metric
                      label="Paid this month"
                      value={money(
                        F.sum(
                          tx
                            .filter(
                              (t) =>
                                t.kind === "bill" && t.date.startsWith(month),
                            )
                            .map((t) => F.convert(t.amount, t.rate)),
                        ),
                        base,
                      )}
                    />
                    <Metric
                      label="Still to pay"
                      value={money(billsRemaining, base)}
                    />
                  </div>
                  <section className="card">
                    <h2>Upcoming payments</h2>
                    {scheduled
                      .filter((e) => e.kind === "bill")
                      .map((e) => (
                        <div className="list-row" key={e.id}>
                          <div>
                            <b>{e.name}</b>
                            <small>
                              {e.date}
                              {e.date < today()
                                ? " · Overdue"
                                : e.date === today()
                                  ? " · Due today"
                                  : " · Expected"}
                            </small>
                          </div>
                          <strong>{money(e.amount, e.currency)}</strong>
                          <button onClick={() => openQuick("bill", e)}>
                            Record payment
                          </button>
                        </div>
                      ))}
                  </section>
                  <div className="grid three">
                    {bills.map((b) => (
                      <section className="card" key={b.id}>
                        <div className="section-title">
                          <h3>{b.name}</h3>
                          {rowActions("bill", b)}
                        </div>
                        <div className="big-number">
                          {money(b.amount, b.currency)}
                        </div>
                        <p>
                          {nice(b.frequency)} · from {b.date}
                        </p>
                      </section>
                    ))}
                  </div>
                </>
              )}
              {page === "Debts" && (
                <>
                  <div className="toolbar">
                    <p>Track principal, interest and your path to debt-free.</p>
                    {addButton("debt", "Add debt")}
                  </div>
                  <div className="grid three">
                    <Metric
                      label="Outstanding debt"
                      value={money(debtTotal, base)}
                    />
                    <Metric
                      label="Monthly payments"
                      value={money(
                        F.sum(debts.map((d) => cv(d.payment, d.currency))),
                        base,
                      )}
                    />
                    <Metric
                      label="Projected interest"
                      value={
                        debts.some(
                          (d) =>
                            F.payoff(F.debtBalance(d, allTx), d.apr, d.payment)
                              .interest === null,
                        )
                          ? "Payment too low"
                          : money(
                              F.sum(
                                debts.map((d) =>
                                  cv(
                                    F.payoff(
                                      F.debtBalance(d, allTx),
                                      d.apr,
                                      d.payment,
                                    ).interest ?? 0,
                                    d.currency,
                                  ),
                                ),
                              ),
                              base,
                            )
                      }
                    />
                  </div>
                  <div className="grid two">
                    {debts.map((d) => {
                      const balance = F.debtBalance(d, allTx),
                        projection = F.payoff(balance, d.apr, d.payment);
                      return (
                        <section className="card" key={d.id}>
                          <div className="section-title">
                            <div>
                              <h3>{d.name}</h3>
                              <p>
                                {d.lender} · {d.apr / 100}% APR
                              </p>
                            </div>
                            {rowActions("debt", d)}
                          </div>
                          <div className="big-number">
                            {money(balance, d.currency)}
                          </div>
                          <p>
                            of {money(d.original, d.currency)} original
                            principal
                          </p>
                          <Progress
                            value={
                              d.original
                                ? ((d.original - balance) / d.original) * 100
                                : 0
                            }
                          />
                          <div className="detail-grid">
                            <span>
                              Principal paid
                              <strong>
                                {money(d.balance - balance, d.currency)}
                              </strong>
                            </span>
                            <span>
                              Interest paid
                              <strong>
                                {money(
                                  F.sum(
                                    allTx
                                      .filter(
                                        (t) =>
                                          t.kind === "debt" &&
                                          t.target === d.id,
                                      )
                                      .map((t) => t.interest),
                                  ),
                                  d.currency,
                                )}
                              </strong>
                            </span>
                            <span>
                              Estimated payoff
                              <strong>
                                {projection.months !== null
                                  ? F.addMonths(today(), projection.months)
                                  : "Increase payment"}
                              </strong>
                            </span>
                            <span>
                              Payments remaining
                              <strong>
                                {projection.months ?? "Not amortizing"}
                              </strong>
                            </span>
                          </div>
                          <small>
                            Projection assumes a constant rate and monthly
                            payments. Manual-interest loans require your
                            statement’s allocation.
                          </small>
                          <button
                            className="primary"
                            onClick={() =>
                              openQuick("debt", {
                                id: "",
                                name: d.name,
                                date: today(),
                                amount: d.payment,
                                currency: d.currency,
                                kind: "debt",
                                target: d.id,
                                account: "",
                                destination: "",
                              })
                            }
                          >
                            Record payment
                          </button>
                        </section>
                      );
                    })}
                  </div>
                  <section className="card">
                    <h2>Payment history</h2>
                    {transactionTable(tx.filter((t) => t.kind === "debt"))}
                  </section>
                </>
              )}
              {page === "Investments" && (
                <>
                  <div className="toolbar">
                    <p>Your investments, without the paperwork.</p>
                    {addButton("investment", "Add investment")}
                  </div>
                  {
                    <details className="card online-prices">
                      <summary>
                        Online prices{" "}
                        {marketKey ? "· connected" : "· connect once"}
                      </summary>
                      <p>
                        Connect a{" "}
                        <a
                          href="https://twelvedata.com/"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Twelve Data
                        </a>{" "}
                        API key to update supported shares, funds and crypto.
                        Only the ticker and exchange go to the provider; your
                        amounts and units stay here. Coverage and quote delays
                        depend on your plan.
                      </p>
                      <p>
                        Free-plan protection: at most 3 credits per minute and
                        300 per UTC day on this installation, shared across
                        tabs. Quotes are cached for 15 minutes, including when
                        you refresh. Two Tandem installations use at most
                        6/minute and 600/day together, leaving a buffer under
                        Basic limits. Keep this key for Tandem and avoid
                        connecting it to other apps or devices. Tandem never
                        requests a paid upgrade.
                      </p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const key = String(
                            new FormData(e.currentTarget).get("apiKey") ?? "",
                          ).trim();
                          void action(
                            () =>
                              vault.mutate((repo) =>
                                repo.setMeta("marketKey", key),
                              ),
                            key
                              ? "Online prices connected"
                              : "Online prices disconnected",
                          );
                        }}
                      >
                        <label>
                          Twelve Data API key
                          <input
                            name="apiKey"
                            type="password"
                            autoComplete="off"
                            defaultValue={marketKey}
                            placeholder="Paste your key"
                          />
                        </label>
                        <button className="primary">Save connection</button>
                      </form>
                    </details>
                  }
                  <div className="grid three">
                    <Metric
                      label="Total investment value"
                      value={money(invValue, base)}
                    />
                    <Metric
                      label="Accounts"
                      value={String(
                        new Set(
                          investments.map((i) => i.account).filter(Boolean),
                        ).size,
                      )}
                    />
                    <Metric
                      label="Investments"
                      value={String(investments.length)}
                    />
                  </div>
                  <section className="card investment-account-totals">
                    <h2>Investments by account</h2>
                    <small>
                      Investment values are separate from each account’s cash
                      balance.
                    </small>
                    {[...new Set(investments.map((i) => i.account ?? ""))].map(
                      (id) => {
                        const holdings = investments.filter(
                          (i) => (i.account ?? "") === id,
                        );
                        return (
                          <div className="summary-row" key={id || "unassigned"}>
                            <span>
                              {allAccounts.find((a) => a.id === id)?.name ??
                                "Unassigned — choose an account"}
                            </span>
                            <strong>
                              {money(
                                F.sum(
                                  holdings.map((i) =>
                                    cv(F.portfolioValue(i, allTx), i.currency),
                                  ),
                                ),
                                base,
                              )}
                            </strong>
                          </div>
                        );
                      },
                    )}
                  </section>
                  {!!investments.length && (
                    <div className="toolbar price-toolbar">
                      <small role="status">
                        {priceStatus ||
                          "Last saved values are available offline. Automatic prices refresh on opening this page and every 15 minutes while it stays open."}
                      </small>
                      <button
                        disabled={pricesBusy}
                        onClick={() =>
                          void refreshPrices(investments.map((i) => i.id))
                        }
                      >
                        <RefreshCw size={15} />
                        {pricesBusy ? "Updating…" : "Refresh market values"}
                      </button>
                    </div>
                  )}
                  <div className="grid two">
                    {investments.map((i) => {
                      const value = F.portfolioValue(i, allTx);
                      const projection = interestProjection(
                        value,
                        i.annualRate ?? 0,
                      );
                      return (
                        <section className="card investment-card" key={i.id}>
                          <div className="section-title">
                            <span className="tag">
                              {i.mode === "market"
                                ? "Market investment"
                                : i.mode === "interest"
                                  ? "Value + interest"
                                  : i.kind}
                            </span>
                            {rowActions("investment", i)}
                          </div>
                          <h3>{i.name}</h3>
                          <p>
                            {allAccounts.find((a) => a.id === i.account)
                              ?.name ?? "No account assigned"}{" "}
                            · {i.kind === "Stocks" ? "Equity" : i.kind}
                          </p>
                          <div className="big-number">
                            {money(value, i.currency)}
                          </div>
                          {i.mode === "interest" ? (
                            <>
                              <p>
                                {(i.annualRate ?? 0) / 100}% interest per annum
                              </p>
                              <div className="detail-grid">
                                <span>
                                  Expected per year
                                  <strong>
                                    {money(projection.annual, i.currency)}
                                  </strong>
                                </span>
                                <span>
                                  Expected per month
                                  <strong>
                                    {money(projection.monthly, i.currency)}
                                  </strong>
                                </span>
                              </div>
                              <small>
                                Estimate at your entered rate. Actual interest
                                depends on your investment’s terms.
                              </small>
                            </>
                          ) : i.mode === "market" ? (
                            <>
                              <p>
                                {i.quantity} units · {i.symbol}
                                {i.exchange ? " · " + i.exchange : ""}
                              </p>
                              <small>
                                {i.quoteAsOf
                                  ? `Market price as of ${i.quoteAsOf}`
                                  : `Value entered ${i.date}`}
                              </small>
                              <small>
                                {i.autoUpdate
                                  ? "Updates online; keeps its last saved value offline."
                                  : "Automatic updates off."}
                              </small>
                            </>
                          ) : (
                            <p>Last recorded {i.date}</p>
                          )}
                          <div className="button-group">
                            <button
                              className="primary"
                              onClick={() =>
                                setModal({ type: "investment", row: i })
                              }
                            >
                              {i.mode === "market"
                                ? "Update holding"
                                : "Update value"}
                            </button>
                            {i.mode !== "market" && (
                              <button
                                onClick={() =>
                                  openQuick("investment", {
                                    id: "",
                                    name: i.name,
                                    date: today(),
                                    amount: 0,
                                    currency: i.currency,
                                    kind: "investment",
                                    target: i.id,
                                    account: "",
                                    destination: "",
                                  })
                                }
                              >
                                Add money
                              </button>
                            )}
                            {i.mode === "market" && (
                              <button
                                disabled={pricesBusy}
                                onClick={() => void refreshPrices([i.id])}
                              >
                                <RefreshCw size={14} />
                                Refresh price
                              </button>
                            )}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                  {!investments.length && (
                    <Empty
                      title="Start with what you have"
                      text="Enter an amount, choose ETF, equity or another type, and select its account."
                    />
                  )}
                </>
              )}
              {page === "Savings & goals" && (
                <>
                  <div className="toolbar">
                    <p>
                      Goals earmark money; they are not counted as extra assets.
                    </p>
                    {addButton("goal", "Add goal")}
                  </div>
                  <div className="grid three">{goals.map(goalCard)}</div>
                  <section className="card">
                    <h2>Contribution history</h2>
                    {transactionTable(tx.filter((t) => t.kind === "savings"))}
                  </section>
                </>
              )}
              {page === "Budget" && (
                <>
                  <div className="toolbar">
                    <p>
                      Plan with expected amounts. Track with actual
                      transactions.
                    </p>
                    {addButton("budget", "Set monthly budget")}
                  </div>
                  <div className="grid two">
                    <section className="card">
                      <h2>Actual · {month}</h2>
                      {Object.entries(budget).map(([k, n]) => (
                        <div className="list-row" key={k}>
                          <span>{nice(k)}</span>
                          <strong>{money(n, base)}</strong>
                        </div>
                      ))}
                    </section>
                    <section className="card">
                      <h2>Expected · {month}</h2>
                      {r
                        .rows("budget")
                        .filter((b) => b.date.startsWith(month) && visible(b))
                        .map((b) => (
                          <div key={b.id}>
                            <div className="section-title">
                              <h3>
                                {b.name} · {b.category}
                              </h3>
                              {rowActions("budget", b)}
                            </div>
                            <div className="list-row">
                              <span>Income</span>
                              <strong>{money(b.income, b.currency)}</strong>
                            </div>
                            <div className="list-row">
                              <span>Spending limit</span>
                              <strong>{money(b.expenses, b.currency)}</strong>
                            </div>
                            <Progress
                              value={
                                b.expenses
                                  ? (budget.expenses /
                                      cv(b.expenses, b.currency)) *
                                    100
                                  : 0
                              }
                            />
                          </div>
                        ))}
                      <div className="list-row">
                        <span>Outstanding bills</span>
                        <strong>{money(billsRemaining, base)}</strong>
                      </div>
                      <div className="list-row">
                        <span>Outstanding debt payments</span>
                        <strong>
                          {money(
                            F.sum(
                              scheduled
                                .filter((e) => e.kind === "debt")
                                .map((e) => cv(e.amount, e.currency)),
                            ),
                            base,
                          )}
                        </strong>
                      </div>
                    </section>
                  </div>
                  <Forecast
                    cash={cash}
                    bills={bills}
                    rules={rules}
                    debts={debts}
                    tx={allTx}
                    rates={rates}
                    base={base}
                  />
                </>
              )}
              {page === "Calendar" && (
                <section className="card">
                  <div className="section-title">
                    <h2>
                      {new Date(from + "T12:00:00").toLocaleDateString(
                        "en-US",
                        { month: "long", year: "numeric" },
                      )}
                    </h2>
                    {addButton("recurring", "Add expected event")}
                  </div>
                  <div className="calendar">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (d) => (
                        <div className="weekday" key={d}>
                          {d}
                        </div>
                      ),
                    )}
                    {Array.from(
                      { length: new Date(from + "T12:00:00").getDay() },
                      (_, i) => (
                        <div key={"blank" + i} />
                      ),
                    )}
                    {Array.from({ length: Number(to.slice(8)) }, (_, i) => {
                      const date = month + "-" + String(i + 1).padStart(2, "0");
                      return (
                        <div
                          key={date}
                          className={
                            "calendar-day " + (date === today() ? "today" : "")
                          }
                        >
                          <b>{i + 1}</b>
                          {scheduled
                            .filter((e) => e.date === date)
                            .map((e) => (
                              <button
                                className={"event " + e.kind}
                                key={e.id}
                                onClick={() => openQuick(e.kind, e)}
                              >
                                {e.name}
                                <small>
                                  {money(e.amount, e.currency)} · expected
                                </small>
                              </button>
                            ))}
                          {tx
                            .filter((t) => t.date === date)
                            .map((t) => (
                              <div
                                className={"event actual " + t.kind}
                                key={t.id}
                              >
                                {t.name}
                                <small>
                                  {money(t.amount, t.currency)} · actual
                                </small>
                              </div>
                            ))}
                          {goals
                            .filter((g) => g.date === date)
                            .map((g) => (
                              <div className="event savings" key={g.id}>
                                {g.name}
                                <small>Goal target</small>
                              </div>
                            ))}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
              {page === "Reports" && (
                <Reports
                  tx={tx}
                  r={r}
                  base={base}
                  month={month}
                  scope={scope}
                  rates={rates}
                />
              )}
              {page === "Recurring" && (
                <>
                  <div className="toolbar">
                    <p>
                      These schedules create expectations, never automatic
                      payments.
                    </p>
                    {addButton("recurring", "Add recurring item")}
                  </div>
                  <section className="card">
                    {rules.map((rule) => (
                      <div className="list-row" key={rule.id}>
                        <div>
                          <b>{rule.name}</b>
                          <small>
                            {nice(rule.kind)} · {rule.frequency} · from{" "}
                            {rule.date}
                          </small>
                        </div>
                        <strong>{money(rule.amount, rule.currency)}</strong>
                        {rowActions("recurring", rule)}
                      </div>
                    ))}
                    {!rules.length && (
                      <Empty
                        title="Make room for the predictable"
                        text="Schedule salary, expenses or regular contributions."
                      />
                    )}
                  </section>
                </>
              )}
              {page === "Settings" && (
                <SettingsView
                  vault={vault}
                  action={action}
                  refresh={refresh}
                  runSync={runSync}
                  syncing={syncing}
                  syncStatus={syncStatus}
                  member={member}
                  device={device}
                  setModal={setModal}
                  rowActions={rowActions}
                />
              )}
            </>
          )}
          <footer>
            <span>
              <LockKeyhole size={13} /> Your financial life stays yours.
            </span>
            <span>Tandem · Built for two</span>
          </footer>
        </main>
      </div>
      {menu && (
        <button
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setMenu(false)}
        />
      )}
      <div
        className="mobile-bottom-nav"
        role="navigation"
        aria-label="Mobile navigation"
      >
        <button
          onClick={() => navigate("Overview")}
          className={page === "Overview" ? "current" : ""}
        >
          <LayoutDashboard size={19} />
          Home
        </button>
        <button
          onClick={() => navigate("Transactions")}
          className={page === "Transactions" ? "current" : ""}
        >
          <ArrowLeftRight size={19} />
          Activity
        </button>
        <button
          className="mobile-add"
          onClick={() => openQuick("expense")}
          aria-label="Add transaction"
        >
          <Plus size={24} />
          Add
        </button>
        <button
          onClick={() => navigate("Investments")}
          className={page === "Investments" ? "current" : ""}
        >
          <ChartNoAxesCombined size={19} />
          Invest
        </button>
        <button onClick={() => setMenu(!menu)}>
          <Menu size={19} />
          More
        </button>
      </div>
      {sharing && <ShareApp vault={vault} onClose={() => setSharing(false)} />}
      {modal && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal.type === "quick"
                ? "Add transaction"
                : modal.type === "audit"
                  ? "Record history"
                  : `Edit ${modal.type}`
            }
          >
            <div className="section-title">
              <div>
                <span className="eyebrow">EVERY LITTLE STEP COUNTS</span>
                <h2>
                  {modal.type === "audit"
                    ? "Record history"
                    : modal.type === "quick"
                      ? modal.row
                        ? "Edit transaction"
                        : nice(modal.kind ?? "expense")
                      : (modal.row ? "Edit " : "Add ") + nice(modal.type)}
                </h2>
              </div>
              <button aria-label="Close dialog" onClick={() => setModal(null)}>
                <X size={20} />
              </button>
            </div>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            {modal.type === "audit" ? (
              <div>
                {r
                  .events()
                  .filter((e) => e.recordId === modal.row.id)
                  .map((e) => (
                    <div className="audit" key={e.id}>
                      <b>
                        {e.deleted ? "Archived" : "Saved"} ·{" "}
                        {new Date(e.createdAt).toLocaleString()}
                      </b>
                      <small>
                        By {hh.users.find((u) => u.id === e.actor)?.name} ·
                        device {e.device.slice(0, 8)}
                      </small>
                      <pre>{JSON.stringify(e.data, null, 2)}</pre>
                    </div>
                  ))}
              </div>
            ) : modal.type === "investment" ? (
              <InvestmentForm
                onAddAccount={() => setModal({ type: "account" })}
                row={modal.row}
                r={r}
                base={base}
                busy={busy}
                onSave={async (type, data, id) => {
                  const ok = await action(() =>
                    vault.mutate((repo) =>
                      save(repo, type, data, member, device, id),
                    ),
                  );
                  if (ok) setModal(null);
                }}
              />
            ) : (
              <RecordForm
                onNewInvestment={() => setModal({ type: "investment" })}
                key={modal.row?.id ?? modal.type + modal.kind}
                modal={modal}
                r={r}
                base={base}
                member={member}
                rates={rates}
                busy={busy}
                onSave={async (type, data, id, attachment) => {
                  const recordId =
                    id ??
                    (type === "transaction" && data.occurrence
                      ? await occurrenceRecordId(data.occurrence)
                      : undefined);
                  const ok = await action(() =>
                    vault.mutate((repo) => {
                      if (attachment) {
                        const a = repo.write(
                          "attachment",
                          attachment,
                          member,
                          device,
                        );
                        data.attachment = a.recordId;
                      }
                      return save(repo, type, data, member, device, recordId);
                    }),
                  );
                  if (ok) setModal(null);
                }}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <span className="soft-icon">
        <Wallet size={22} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function Progress({ value }: { value: number }) {
  return (
    <div className="progress">
      <div style={{ width: Math.max(0, Math.min(100, value)) + "%" }} />
    </div>
  );
}
function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note?: string;
  icon?: React.ReactNode;
}) {
  return (
    <section className="card metric">
      <div className="section-title">
        <span>{label}</span>
        {icon && <span className="metric-icon">{icon}</span>}
      </div>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </section>
  );
}
function historical(r: Repository, date: string, base: string, scope: string) {
  return historicalPosition(r.events(), date, base, scope).net;
}
function Historical({
  r,
  base,
  scope,
  current,
}: {
  r: Repository;
  base: string;
  scope: string;
  current: number;
}) {
  const dates = Array.from({ length: 7 }, (_, i) => {
    const now = new Date();
    return i === 6
      ? today()
      : new Date(
          now.getFullYear(),
          now.getMonth() - 5 + i,
          0,
        ).toLocaleDateString("en-CA");
  });
  const values = dates.map((d) => historical(r, d, base, scope));
  values[6] = current;
  const previous = values[5],
    diff = current - previous;
  return (
    <>
      <div className="wealth-change">
        <span>
          {diff >= 0 ? "↗" : "↘"} {money(Math.abs(diff), base)}
        </span>{" "}
        this month
        {previous !== 0 && (
          <span className="change-tag">
            {F.ratio(diff, 10000, Math.abs(previous)) / 100}%
          </span>
        )}
      </div>
      <small className="wealth-previous">
        Previous month {money(previous, base)}
      </small>
      <Sparkline values={values} />
      <div className="chart-labels">
        {dates.map((d) => (
          <span key={d}>
            {new Date(d + "T12:00:00").toLocaleDateString("en-US", {
              month: "short",
            })}
          </span>
        ))}
      </div>
    </>
  );
}
function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values);
  const points = values
    .map(
      (v, i) =>
        `${(i / (values.length - 1)) * 600},${95 - ((v - min) / (max - min)) * 80}`,
    )
    .join(" ");
  return (
    <svg
      className="sparkline"
      viewBox="0 0 600 110"
      preserveAspectRatio="none"
      role="img"
      aria-label="Historical value chart"
    >
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a9d7ad" stopOpacity=".28" />
          <stop offset="100%" stopColor="#a9d7ad" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 30H600 M0 65H600 M0 100H600"
        stroke="currentColor"
        opacity=".10"
        strokeDasharray="4 6"
      />
      <polygon points={`0,110 ${points} 600,110`} fill="url(#fade)" />
      <polyline
        points={points}
        fill="none"
        stroke="#add7b2"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
function Forecast({
  cash,
  bills,
  rules,
  debts,
  tx,
  rates,
  base,
}: {
  cash: number;
  bills: Row<"bill">[];
  rules: Row<"recurring">[];
  debts: Row<"debt">[];
  tx: Row<"transaction">[];
  rates: Record<string, number>;
  base: string;
}) {
  const [horizon, setHorizon] = useState(30);
  function events(days: number) {
    const to = new Date();
    to.setDate(to.getDate() + days);
    const end = to.toLocaleDateString("en-CA");
    const start = today();
    const e = F.expected(bills, rules, tx, start, end);
    for (const d of debts)
      if (!rules.some((r) => r.kind === "debt" && r.target === d.id))
        for (const date of F.occurrences(d.date, "monthly", 1, start, end))
          if (
            !tx.some(
              (t) =>
                t.kind === "debt" &&
                t.target === d.id &&
                t.date.slice(0, 7) === date.slice(0, 7),
            )
          )
            e.push({
              id: d.id + date,
              name: d.name,
              date,
              amount: d.payment,
              currency: d.currency,
              kind: "debt",
              target: d.id,
              account: "",
              destination: "",
            });
    return e.sort((a, b) => a.date.localeCompare(b.date));
  }
  return (
    <section className="card">
      <div className="section-title">
        <div>
          <h2>A look ahead</h2>
          <p>Projected available cash, based on unpaid expected events.</p>
        </div>
        <select
          aria-label="Forecast horizon"
          value={horizon}
          onChange={(e) => setHorizon(Number(e.target.value))}
        >
          {[7, 30, 60, 90].map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
      </div>
      <div className="grid four">
        {[7, 30, 60, 90].map((d) => (
          <Metric
            key={d}
            label={`${d}-day forecast`}
            value={
              events(d).some((e) => !rates[e.currency])
                ? "Add exchange rates"
                : money(F.forecast(cash, events(d), rates), base)
            }
          />
        ))}
      </div>
      {events(horizon).map((e) => (
        <div className="list-row" key={e.id}>
          <span>
            {e.date} · {e.name}
          </span>
          <strong>
            {e.kind === "income" ? "+" : "−"}
            {money(e.amount, e.currency)}
          </strong>
        </div>
      ))}
    </section>
  );
}
function Reports({
  tx,
  r,
  base,
  month,
  scope,
  rates,
}: {
  tx: Row<"transaction">[];
  r: Repository;
  base: string;
  month: string;
  scope: string;
  rates: Record<string, number>;
}) {
  const [annual, setAnnual] = useState(false),
    [group, setGroup] = useState("category");
  const prefix = annual ? month.slice(0, 4) : month;
  const rows = tx.filter((t) => t.date.startsWith(prefix));
  const total = (k: string[]) =>
    F.sum(
      rows
        .filter((t) => k.includes(t.kind))
        .map((t) => F.convert(t.amount, t.rate)),
    );
  const spending: Record<string, number> = {};
  for (const t of rows.filter((t) => ["expense", "bill"].includes(t.kind))) {
    const key =
      group === "person"
        ? (r.rows("household")[0].users.find((u) => u.id === t.person)?.name ??
          "Unknown")
        : group === "month"
          ? t.date.slice(0, 7)
          : String((t as any)[group] || "Other");
    spending[key] = F.add(spending[key] ?? 0, F.convert(t.amount, t.rate));
  }
  const max = Math.max(1, ...Object.values(spending));
  const report = {
    income: total(["income", "dividend"]),
    expenses: total(["expense", "bill"]),
    savings: total(["savings"]),
    investments: total(["investment"]) - total(["withdrawal"]),
    debt: total(["debt"]),
    interest: F.sum(
      rows
        .filter((t) => t.kind === "debt")
        .map((t) => F.convert(t.interest, t.rate)),
    ),
  };
  const dates = Array.from({ length: 12 }, (_, i) => {
    const m = month.slice(0, 4) + "-" + String(i + 1).padStart(2, "0");
    return new Date(
      Number(m.slice(0, 4)),
      Number(m.slice(5)),
      0,
    ).toLocaleDateString("en-CA");
  }).filter((d) => d <= today());
  return (
    <>
      <div className="toolbar">
        <div className="button-group">
          <button
            className={!annual ? "selected" : ""}
            onClick={() => setAnnual(false)}
          >
            Monthly
          </button>
          <button
            className={annual ? "selected" : ""}
            onClick={() => setAnnual(true)}
          >
            Annual
          </button>
        </div>
        <button
          onClick={() =>
            download("tandem-report-" + prefix + ".json", {
              period: prefix,
              currency: base,
              ...report,
            }).catch((e) => alert(e.message))
          }
        >
          <Download size={16} /> Export report (plaintext)
        </button>
      </div>
      <div className="grid three">
        {Object.entries(report).map(([k, n]) => (
          <Metric key={k} label={nice(k)} value={money(n, base)} />
        ))}
      </div>
      <section className="card">
        <h2>Net cash flow</h2>
        <div className="big-number">
          {money(
            F.add(
              report.income,
              -report.expenses,
              -report.debt,
              -F.sum(
                rows
                  .filter(
                    (t) =>
                      ["savings", "investment"].includes(t.kind) &&
                      t.funding !== "external",
                  )
                  .map((t) => F.convert(t.amount, t.rate)),
              ),
              total(["withdrawal"]),
            ),
            base,
          )}
        </div>
      </section>
      <div className="grid two">
        <section className="card">
          <div className="section-title">
            <h2>Where it goes</h2>
            <select
              aria-label="Spending group"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              {["category", "merchant", "person", "month"].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </div>
          {Object.entries(spending)
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => (
              <div className="spending-bar" key={k}>
                <div className="spread">
                  <span>{k}</span>
                  <strong>{money(n, base)}</strong>
                </div>
                <Progress value={(n / max) * 100} />
              </div>
            ))}
        </section>
        <section className="wealth-card">
          <h2>Net worth over time</h2>
          <Sparkline
            values={
              dates.length > 1
                ? dates.map((d) => historical(r, d, base, scope))
                : [0, 0]
            }
          />
          <div className="chart-labels">
            {dates.map((d) => (
              <small key={d}>{d.slice(5, 7)}</small>
            ))}
          </div>
          <small>Uses recorded valuations and historical exchange rates.</small>
        </section>
      </div>
      <section className="card">
        <h2>Debt & portfolio history</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Debt outstanding</th>
                <th>Investments</th>
                <th>Net worth</th>
              </tr>
            </thead>
            <tbody>
              {dates.map((d) => {
                const position = historicalPosition(r.events(), d, base, scope);
                return (
                  <tr key={d}>
                    <td>{d.slice(0, 7)}</td>
                    <td>{money(position.debt, base)}</td>
                    <td>{money(position.investments, base)}</td>
                    <td>{money(position.net, base)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
function RecordForm({
  onNewInvestment,
  modal,
  r,
  base,
  member,
  rates,
  busy,
  onSave,
}: {
  onNewInvestment: () => void;
  modal: Modal;
  r: Repository;
  base: string;
  member: string;
  rates: Record<string, number>;
  busy: boolean;
  onSave: (
    type: EntityType,
    data: any,
    id?: string,
    attachment?: Data["attachment"],
  ) => Promise<void>;
}) {
  const quick = modal.type === "quick",
    shopping = modal.kind === "shopping";
  const type: EntityType = quick ? "transaction" : (modal.type as EntityType);
  const hh = r.rows("household")[0],
    accounts = r.rows("account");
  const [kind, setKind] = useState(
    modal.row?.kind ?? (shopping ? "expense" : (modal.kind ?? "expense")),
  );
  const [account, setAccount] = useState(
    modal.row?.account ??
      modal.expected?.account ??
      (modal.kind === "savings"
        ? accounts.find((a) => a.kind === "savings")?.id
        : accounts[0]?.id) ??
      "",
  );
  const externalInvestment =
    kind === "investment" && (!modal.row || modal.row.funding === "external");
  const directSavings =
    kind === "savings" && (!modal.row || modal.row.funding === "external");
  const [target, setTarget] = useState(
    modal.row?.target ?? modal.expected?.target ?? "",
  );
  const [localError, setLocalError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const defaults: any = {
    name: "",
    date: today(),
    currency: base,
    owner: "shared",
    kind:
      type === "account"
        ? "bank"
        : type === "investment"
          ? "ETF"
          : type === "goal"
            ? "savings"
            : "income",
    frequency: "monthly",
    interval: 1,
    category: "All",
    interestType: "monthly",
    paymentDay: 1,
    reminder: 1,
    ...modal.row,
    amountOwed:
      type === "debt" && modal.row
        ? F.debtBalance(modal.row, r.rows("transaction"))
        : 0,
  };
  const people = hh.users.map((u) => ({ value: u.id, label: u.name }));
  const opts = (f: Field): { value: string; label: string }[] =>
    f.options?.map((v) => ({ value: v, label: nice(v) })) ??
    (f.kind === "owner"
      ? [{ value: "shared", label: "Shared household" }, ...people]
      : f.kind === "currency"
        ? currencies.map((c) => ({ value: c, label: c }))
        : f.kind === "account"
          ? [
              { value: "", label: "Choose account" },
              ...accounts.map((a) => ({
                value: a.id,
                label: a.name + " · " + a.currency,
              })),
            ]
          : f.kind === "target"
            ? [
                { value: "", label: "Choose target" },
                ...[...r.rows("debt"), ...r.rows("investment")].map((x) => ({
                  value: x.id,
                  label: x.name,
                })),
              ]
            : []);
  function field(f: Field) {
    let value = defaults[f.key] ?? "";
    if (f.kind === "money") value = inputMoney(defaults[f.key] ?? 0);
    if (f.kind === "percent") value = String((defaults[f.key] ?? 0) / 100);
    if (f.kind === "rate")
      value = String((defaults[f.key] ?? 1000000) / 1000000);
    const options = opts(f);
    return (
      <label key={f.key}>
        {f.label}
        {options.length ? (
          <select
            aria-label={f.label}
            name={f.key}
            defaultValue={value || options[0].value}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : f.kind === "textarea" ? (
          <textarea aria-label={f.label} name={f.key} defaultValue={value} />
        ) : (
          <input
            aria-label={f.label}
            name={f.key}
            type={
              f.kind === "date"
                ? "date"
                : f.kind === "number"
                  ? "number"
                  : "text"
            }
            min={f.key === "paymentDay" ? 1 : undefined}
            max={f.key === "paymentDay" ? 31 : undefined}
            inputMode={
              ["money", "percent", "rate"].includes(f.kind ?? "")
                ? "decimal"
                : undefined
            }
            defaultValue={value}
            required={f.required}
          />
        )}{" "}
        {f.hint && <small>{f.hint}</small>}
      </label>
    );
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalError("");
    try {
      const fd = new FormData(e.currentTarget),
        raw = Object.fromEntries(fd);
      let data: any = { ...raw };
      let attachment: Data["attachment"] | undefined;
      if (quick) {
        const acct = accounts.find((a) => a.id === account);
        if (!acct && !externalInvestment)
          throw Error("Create an account before adding transactions");
        const currency = externalInvestment
          ? r.get("investment", String(raw.target))?.currency
          : acct?.currency;
        if (!currency) throw Error("Choose an investment");
        const rate = rates[currency];
        if (!rate)
          throw Error(
            "Add an exchange rate for " + currency + " in Settings first",
          );
        data = {
          ...raw,
          kind,
          funding: externalInvestment || directSavings ? "external" : "account",
          account: externalInvestment ? "" : account,
          currency,
          name: String(raw.name || raw.merchant || nice(kind)),
          amount: F.parseMoney(String(raw.amount)),
          date: String(raw.date || today()),
          owner: raw.owner ?? "shared",
          person: raw.person ?? member,
          category: String(raw.category || "Other"),
          rate: modal.row?.rate ?? rate,
          interest: F.parseMoney(String(raw.interest || "0")),
          destinationAmount: F.parseMoney(String(raw.destinationAmount || "0")),
          occurrence: modal.row?.occurrence ?? modal.expected?.id ?? "",
        };
        if (file) {
          if (file.size > 4 * 1024 * 1024)
            throw Error("Choose a receipt under 4 MB");
          if (
            ![
              "image/png",
              "image/jpeg",
              "image/webp",
              "application/pdf",
            ].includes(file.type)
          )
            throw Error("Use a PNG, JPEG, WebP or PDF");
          const dataURL = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          attachment = {
            name: file.name,
            mime: file.type as any,
            data: dataURL,
          };
        } else if (modal.row?.attachment)
          data.attachment = modal.row.attachment;
        if (raw.items) {
          const lines = String(raw.items).split("\n").filter(Boolean);
          let total = 0;
          for (const line of lines) {
            const match = line.match(/(.+?)\s+([0-9]+(?:\.[0-9]{1,2})?)$/);
            if (!match) throw Error("Use one item per line: Milk 2.50");
            total = F.add(total, F.parseMoney(match[2]));
          }
          if (total !== data.amount)
            throw Error("Item total does not match the transaction amount");
        }
      } else
        for (const f of fields[type]) {
          const value = String(raw[f.key] ?? "");
          if (f.kind === "money") data[f.key] = F.parseMoney(value || "0");
          if (f.kind === "percent") data[f.key] = F.parseMoney(value || "0");
          if (f.kind === "number") data[f.key] = Number(value || 0);
          if (f.kind === "rate") {
            if (!/^\d+(\.\d{1,6})?$/.test(value))
              throw Error("Exchange rates support up to six decimal places");
            const [a, b = ""] = value.split(".");
            data[f.key] = F.safe(
              BigInt(a) * 1000000n + BigInt(b.padEnd(6, "0")),
            );
          }
        }
      if (type === "debt") {
        data = {
          name: modal.row?.name ?? String(data.lender),
          currency: modal.row?.currency ?? base,
          owner: modal.row?.owner ?? "shared",
          date: modal.row?.date ?? today(),
          interestType: modal.row?.interestType ?? "monthly",
          paymentDay: modal.row?.paymentDay ?? 1,
          minimum: modal.row?.minimum ?? 0,
          term: modal.row?.term ?? 0,
          ...data,
        };
        if (data.amountOwed < 0) throw Error("Amount owed cannot be negative");
        const principalPaid = modal.row
          ? F.sum(
              r
                .rows("transaction")
                .filter((t) => t.kind === "debt" && t.target === modal.row.id)
                .map((t) => t.amount - t.interest),
            )
          : 0;
        data.balance = F.add(data.amountOwed, principalPaid);
        data.original = modal.row?.original ?? data.amountOwed;
      }
      if (type === "recurring" && ["savings", "investment"].includes(data.kind))
        data.funding = "external";
      await onSave(type, schemas[type].parse(data), modal.row?.id, attachment);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }
  const currentAccount = accounts.find((a) => a.id === account);
  const targetOptions =
    kind === "debt"
      ? r.rows("debt")
      : ["investment", "withdrawal", "dividend"].includes(kind)
        ? r.rows("investment")
        : kind === "bill"
          ? r.rows("bill")
          : r.rows("goal");
  return (
    <form onSubmit={submit}>
      {localError && (
        <div role="alert" className="error">
          {localError}
        </div>
      )}
      {quick ? (
        <>
          <div className="transaction-types">
            {[
              "income",
              "expense",
              "transfer",
              "bill",
              "debt",
              "savings",
              "investment",
              "withdrawal",
              "dividend",
            ].map((k) => (
              <button
                type="button"
                key={k}
                className={kind === k ? "selected" : ""}
                onClick={() => {
                  if (k === "investment" && !modal.row && !modal.expected) {
                    onNewInvestment();
                    return;
                  }
                  setKind(k);
                  if (k === "savings" && !modal.row)
                    setAccount(
                      accounts.find((a) => a.kind === "savings")?.id ?? "",
                    );
                  else if (!modal.row) setAccount(accounts[0]?.id ?? "");
                }}
              >
                {nice(k)}
              </button>
            ))}
          </div>
          <label className="amount-input">
            Amount{" "}
            <span>
              {externalInvestment
                ? (r.get("investment", target)?.currency ?? base)
                : (currentAccount?.currency ?? base)}
            </span>
            <input
              name="amount"
              autoFocus
              inputMode="decimal"
              placeholder="0.00"
              defaultValue={
                modal.row
                  ? inputMoney(modal.row.amount)
                  : modal.expected?.amount
                    ? inputMoney(modal.expected.amount)
                    : ""
              }
              required
            />
          </label>
          <div className="form-grid">
            {!externalInvestment && (
              <label>
                {directSavings ? "Savings account" : "Account"}
                <select
                  aria-label={directSavings ? "Savings account" : "Account"}
                  name="account"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  required
                >
                  <option value="">Choose account</option>
                  {accounts
                    .filter((a) => !directSavings || a.kind === "savings")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.currency}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {["expense", "income"].includes(kind) && (
              <label>
                Category
                <input
                  name="category"
                  list="categories"
                  defaultValue={
                    modal.row?.category ??
                    (shopping
                      ? "Groceries"
                      : kind === "income"
                        ? "Salary"
                        : "Other")
                  }
                />
                <datalist id="categories">
                  {[
                    ...expenseCategories,
                    ...r.rows("category").map((c) => c.name),
                    "Salary",
                    "Business",
                    "Freelance",
                    "Interest",
                    "Dividends",
                    "Rental",
                    "Gift",
                    "Refund",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </datalist>
              </label>
            )}
          </div>
          {(kind === "transfer" || (kind === "savings" && !directSavings)) && (
            <div className="form-grid">
              <label>
                Destination account
                <select
                  name="destination"
                  defaultValue={
                    modal.row?.destination ?? modal.expected?.destination ?? ""
                  }
                  required
                >
                  <option value="">Choose destination</option>
                  {accounts
                    .filter(
                      (a) =>
                        a.id !== account &&
                        (kind !== "savings" || a.kind === "savings"),
                    )
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.currency}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Amount received (cross-currency only)
                <input
                  name="destinationAmount"
                  inputMode="decimal"
                  defaultValue={inputMoney(modal.row?.destinationAmount ?? 0)}
                />
              </label>
            </div>
          )}
          {[
            "debt",
            "bill",
            "savings",
            "investment",
            "withdrawal",
            "dividend",
          ].includes(kind) && (
            <label>
              {kind === "savings"
                ? "Savings goal (optional)"
                : "Linked " + kind}
              <select
                name="target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                required={kind !== "savings"}
              >
                <option value="">Choose record</option>
                {targetOptions.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === "debt" && (
            <label>
              Interest amount (manual-interest debts)
              <input
                name="interest"
                defaultValue={inputMoney(modal.row?.interest ?? 0)}
                inputMode="decimal"
              />
              <small>
                Monthly loans allocate one monthly charge automatically. Manual
                loans use this amount.
              </small>
            </label>
          )}
          {(directSavings || externalInvestment) && (
            <small className="entry-hint">
              This adds new money. No other account is reduced. To move existing
              money, use Transfer.
            </small>
          )}
          {kind === "expense" && (
            <label>
              Merchant (optional)
              <input
                name="merchant"
                defaultValue={modal.row?.merchant ?? ""}
                placeholder="Where was it?"
              />
            </label>
          )}
          <details open={!!modal.row}>
            <summary>More details · date, person, receipt</summary>
            <div className="form-grid">
              <label>
                Date
                <input
                  type="date"
                  name="date"
                  defaultValue={
                    modal.row?.date ?? modal.expected?.date ?? today()
                  }
                  required
                />
              </label>
              <label>
                Person
                <select
                  name="person"
                  defaultValue={modal.row?.person ?? member}
                >
                  {people.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Description
              <input
                name="name"
                defaultValue={modal.row?.name ?? modal.expected?.name ?? ""}
                placeholder={nice(kind)}
              />
            </label>
            <label>
              Ownership
              <select name="owner" defaultValue={modal.row?.owner ?? "shared"}>
                <option value="shared">Shared household</option>
                {people.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Notes
              <textarea name="notes" defaultValue={modal.row?.notes ?? ""} />
            </label>
            <label>
              Items (optional, one per line: Milk 2.50)
              <textarea name="items" defaultValue={modal.row?.items ?? ""} />
            </label>
            <label>
              Receipt / document (up to 4 MB)
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {modal.row?.attachment && (
              <button
                type="button"
                onClick={() => {
                  const a = r.get("attachment", modal.row.attachment);
                  if (a) {
                    void saveBytes(
                      a.name,
                      bytes(a.data.split(",")[1]),
                      a.mime,
                    ).catch((e) => setLocalError(e.message));
                  }
                }}
              >
                Download attached receipt
              </button>
            )}
          </details>
        </>
      ) : (
        <div className="form-grid">{fields[type].map(field)}</div>
      )}
      <div className="form-footer">
        <small>
          <LockKeyhole size={13} /> Saved encrypted on this device
        </small>
        <button className="primary" disabled={busy}>
          {busy
            ? "Saving…"
            : modal.row
              ? "Save changes"
              : "Save " + (quick ? kind : type)}
          <Check size={16} />
        </button>
      </div>
    </form>
  );
}
function SettingsView({
  vault,
  action,
  refresh,
  runSync,
  syncing,
  syncStatus,
  member,
  device,
  setModal,
  rowActions,
}: any) {
  const r: Repository = vault.repo,
    hh = r.rows("household")[0];
  const [devices, setDevices] = useState<any[]>([]);
  const config = r.meta<SyncConfig | null>("sync", null);
  const [restorePass, setRestorePass] = useState("");
  async function backup() {
    await download("tandem-" + today() + ".tandem", await vault.backup());
  }
  return (
    <div className="settings-grid">
      <TransferLinks vault={vault} />
      <section className="card">
        <h2>Tandem on your devices</h2>
        <p>
          Open your private web address on a phone or computer, then install
          Tandem for quick access.
        </p>
        <InstallApp />
      </section>
      <section className="card">
        <h2>Your household</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void action(() =>
              vault.mutate((repo: Repository) => {
                repo.write(
                  "household",
                  {
                    ...hh,
                    name: String(fd.get("household")),
                    users: hh.users.map((u, i) => ({
                      ...u,
                      name: String(fd.get("user" + i)),
                    })),
                  },
                  member,
                  device,
                  hh.id,
                );
                repo.setMeta("member", fd.get("member"));
              }),
            );
          }}
        >
          <label>
            Household name
            <input name="household" defaultValue={hh.name} required />
          </label>
          <div className="form-grid">
            {hh.users.map((u, i) => (
              <label key={u.id}>
                Member {i + 1}
                <input name={"user" + i} defaultValue={u.name} required />
              </label>
            ))}
          </div>
          <label>
            Using this device
            <select name="member" defaultValue={member}>
              {hh.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <p>
            Base currency: {hh.currency}. Individual ownership is visible to
            both household members.
          </p>
          <button className="primary">Save household</button>
        </form>
      </section>
      <section className="card">
        <h2>Encrypted backup & restore</h2>
        <p>
          Your backup contains all financial records and their history. Store a
          copy somewhere safe.
        </p>
        <button
          onClick={() => void action(backup, "Encrypted backup exported")}
        >
          <Download size={16} /> Export encrypted backup
        </button>
        <label>
          Backup passphrase
          <input
            type="password"
            value={restorePass}
            onChange={(e) => setRestorePass(e.target.value)}
          />
        </label>
        <label className="button">
          <Upload size={16} /> Import & merge backup
          <input
            type="file"
            accept=".tandem,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (
                f &&
                confirm(
                  "A safety backup will download first. Imported records will be merged; conflicting versions will be preserved. Continue?",
                )
              )
                void action(async () => {
                  const data = JSON.parse(await f.text());
                  await backup();
                  await vault.restore(data, restorePass);
                }, "Backup merged safely");
            }}
          />
        </label>
        <small>Import is non-destructive. No existing history is erased.</small>
        {config && (
          <button
            onClick={() =>
              void action(
                async () =>
                  request(
                    config.url,
                    "/backups",
                    await vault.backup(),
                    config.token,
                  ),
                "Encrypted server backup saved",
              )
            }
          >
            Save backup to private relay
          </button>
        )}
      </section>
      <section className="card">
        <h2>Private synchronization</h2>
        <p>{syncStatus}</p>
        <small>
          {r.pending().length} queued changes · Device {device.slice(0, 8)}
        </small>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void action(async () => {
              const url = String(fd.get("url"));
              const login = await request(url, "/auth/login", {
                member: String(fd.get("member")),
                password: String(fd.get("password")),
                deviceId: device,
                deviceName: String(fd.get("deviceName")),
              });
              await vault.mutate((repo: Repository) =>
                repo.setMeta("sync", { url, token: login.token, device }),
              );
              refresh();
            }, "Device connected. You can now synchronize.");
          }}
        >
          <label>
            Private relay URL
            <input
              name="url"
              type="url"
              defaultValue={
                config?.url ??
                (location.protocol === "https:"
                  ? location.origin
                  : "http://127.0.0.1:8787")
              }
              required
            />
          </label>
          <div className="form-grid">
            <label>
              Server member
              <select
                name="member"
                defaultValue={member === hh.users[0].id ? "member1" : "member2"}
              >
                <option value="member1">{hh.users[0].name}</option>
                <option value="member2">{hh.users[1].name}</option>
              </select>
            </label>
            <label>
              Device name
              <input name="deviceName" defaultValue="My device" required />
            </label>
          </div>
          <label>
            Server password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          <div className="button-group">
            <button className="primary">Connect device</button>
            <button
              type="button"
              disabled={syncing}
              onClick={() => void runSync()}
            >
              <RefreshCw size={15} /> Sync now
            </button>
          </div>
        </form>
        {config && (
          <>
            <button
              onClick={() =>
                void action(
                  async () =>
                    setDevices(
                      (
                        await request(
                          config.url,
                          "/devices",
                          undefined,
                          config.token,
                        )
                      ).devices,
                    ),
                  "Devices refreshed",
                )
              }
            >
              Manage devices
            </button>
            {devices.map((d) => (
              <div className="list-row" key={d.id}>
                <span>
                  {d.name}
                  <small>
                    {d.member_id} · {d.revoked ? "Revoked" : "Active"}
                  </small>
                </span>
                <button
                  disabled={d.revoked}
                  onClick={() => {
                    if (
                      confirm(
                        "Revoke synchronization access for " + d.name + "?",
                      )
                    )
                      void action(async () => {
                        await request(
                          config.url,
                          "/devices/revoke",
                          { id: d.id },
                          config.token,
                        );
                        setDevices(
                          (
                            await request(
                              config.url,
                              "/devices",
                              undefined,
                              config.token,
                            )
                          ).devices,
                        );
                      });
                  }}
                >
                  Revoke
                </button>
              </div>
            ))}
          </>
        )}
      </section>
      <section className="card">
        <div className="section-title">
          <h2>Exchange rates</h2>
          <button onClick={() => setModal({ type: "rate" })}>
            <Plus size={15} /> Add rate
          </button>
        </div>
        <p>
          Enter the value of one foreign unit in {hh.currency}. Transactions
          freeze the rate used at entry.
        </p>
        {r.rows("rate").map((rate) => (
          <div className="list-row" key={rate.id}>
            <span>
              1 {rate.name} = {rate.value / 1000000} {hh.currency}
              <small>{rate.date}</small>
            </span>
            {rowActions("rate", rate)}
          </div>
        ))}
        <div className="section-title">
          <h2>Custom categories</h2>
          <button onClick={() => setModal({ type: "category" })}>
            <Plus size={15} /> Add
          </button>
        </div>
        {r.rows("category").map((c) => (
          <div className="list-row" key={c.id}>
            <span>{c.name}</span>
            {rowActions("category", c)}
          </div>
        ))}
      </section>
      <section className="card">
        <h2>Conflicts to review</h2>
        <p>
          Competing revisions are preserved. Choose the version to use; the
          other remains in history.
        </p>
        {r.conflicts().map((heads) => (
          <div key={heads[0].recordId} className="conflict">
            {heads.map((e) => (
              <div className="audit" key={e.id}>
                <b>{e.deleted ? "Deleted version" : (e.data as any).name}</b>
                <small>
                  {e.createdAt} · device {e.device.slice(0, 8)}
                </small>
                <pre>{JSON.stringify(e.data, null, 2)}</pre>
                <button
                  onClick={() =>
                    void action(
                      () =>
                        vault.mutate((repo: Repository) =>
                          repo.write(
                            e.type,
                            e.data as any,
                            member,
                            device,
                            e.recordId,
                            e.deleted,
                            true,
                          ),
                        ),
                      "Conflict resolved; both versions retained",
                    )
                  }
                >
                  Use this version
                </button>
              </div>
            ))}
          </div>
        ))}
        {!r.conflicts().length && (
          <p className="positive">
            <Check size={16} /> Everything agrees.
          </p>
        )}
      </section>
      <section className="card">
        <h2>Local reminders & security</h2>
        <p>
          The calendar and dashboard show due items offline. Your vault locks
          after 15 minutes of inactivity.
        </p>
        <button
          onClick={() =>
            void action(async () => {
              if (!("Notification" in window))
                throw Error(
                  "This device does not support browser notifications",
                );
              const permission = await Notification.requestPermission();
              if (permission !== "granted")
                throw Error("Notification permission was not granted");
              const end = new Date();
              end.setDate(end.getDate() + 3);
              const upcoming = F.expected(
                r.rows("bill"),
                r.rows("recurring"),
                r.rows("transaction"),
                today(),
                end.toLocaleDateString("en-CA"),
              );
              new Notification("Tandem reminders", {
                body: upcoming.length
                  ? upcoming.map((x) => `${x.name} · ${x.date}`).join("\n")
                  : "No expected payments in the next three days.",
              });
            }, "Local reminder displayed")
          }
        >
          Show local reminder
        </button>
        <small>
          Notifications require the app to be open; background scheduling is not
          provided by the browser.
        </small>
        <button onClick={() => location.reload()}>
          <LockKeyhole size={16} /> Lock vault now
        </button>
      </section>
    </div>
  );
}
