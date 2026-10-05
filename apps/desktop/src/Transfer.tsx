import { useEffect, useState } from "react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import type { Vault } from "../../../packages/database/vault";
import type { Envelope } from "../../../packages/database/crypto";
import { request, type SyncConfig } from "../../../packages/sync/client";

export function transferToken() {
  const token = new URLSearchParams(location.hash.slice(1)).get("transfer");
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
export function TransferLinks({ vault }: { vault: Vault }) {
  const config = vault.repo.meta<SyncConfig | null>("sync", null);
  const [hours, setHours] = useState(24);
  const [link, setLink] = useState("");
  const [expires, setExpires] = useState("");
  const [createdId, setCreatedId] = useState("");
  const [links, setLinks] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    if (config)
      setLinks(
        (await request(config.url, "/transfers", undefined, config.token))
          .transfers,
      );
  }
  useEffect(() => {
    void load().catch((e) => setStatus(e.message));
  }, [config?.url, config?.token]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setStatus("");
    try {
      await fn();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function share(kind: "copy" | "whatsapp" | "system") {
    const text =
      "Import our encrypted Tandem household backup. This link expires " +
      new Date(expires).toLocaleString() +
      ". Ask me separately for the vault passphrase. ";
    if (kind === "copy") {
      await navigator.clipboard.writeText(link);
      setStatus("Transfer link copied.");
    } else if (kind === "system" && navigator.share)
      await navigator.share({ title: "Tandem transfer", text, url: link });
    else if (kind === "whatsapp") {
      const url = "https://wa.me/?text=" + encodeURIComponent(text + link);
      if (isTauri()) await invoke("open_whatsapp", { url });
      else {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.click();
      }
    } else {
      await navigator.clipboard.writeText(text + link);
      setStatus("Share message copied.");
    }
  }
  return (
    <section className="card transfer-card">
      <h2>Transfer by private link</h2>
      <p>
        Send an encrypted snapshot to another device without sending a file.
        Only approved users can open it, and they need your vault passphrase.
      </p>
      {!config ? (
        <p>
          Connect this device under Private synchronization below to create a
          transfer link.
        </p>
      ) : (
        <>
          <label>
            Link expires after
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            >
              <option value={1}>1 hour</option>
              <option value={24}>24 hours</option>
            </select>
          </label>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const target = new URL(config.url);
                if (
                  target.protocol !== "https:" &&
                  !["localhost", "127.0.0.1"].includes(target.hostname)
                )
                  throw Error(
                    "Use your private HTTPS web address for transfers.",
                  );
                const result = await request(
                  config.url,
                  "/transfers",
                  { envelope: await vault.backup(), hours },
                  config.token,
                );
                target.pathname = "/";
                target.search = "";
                target.hash = "transfer=" + result.token;
                setLink(target.toString());
                setExpires(result.expiresAt);
                setCreatedId(result.id);
                await load();
              })
            }
          >
            {busy ? "Working…" : "Create transfer link"}
          </button>
          {link && (
            <div className="transfer-result">
              <label>
                Private transfer link
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <p>
                Expires {new Date(expires).toLocaleString()}, or after a
                successful import.
              </p>
              <div className="button-group">
                <button
                  disabled={busy}
                  onClick={() => void run(() => share("copy"))}
                >
                  Copy transfer link
                </button>
                <button
                  disabled={busy}
                  onClick={() => void run(() => share("whatsapp"))}
                >
                  WhatsApp
                </button>
                <button
                  disabled={busy}
                  onClick={() => void run(() => share("system"))}
                >
                  More ways
                </button>
              </div>
            </div>
          )}
          <button disabled={busy} onClick={() => void run(load)}>
            Refresh link status
          </button>
          {links.map((item) => (
            <div className="transfer-row" key={item.id}>
              <span>
                {new Date(item.created_at).toLocaleString()} ·{" "}
                {item.revoked_at
                  ? "Revoked"
                  : item.completed_at
                    ? "Imported"
                    : "Expires " + new Date(item.expires_at).toLocaleString()}
              </span>
              {!item.revoked_at && !item.completed_at && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await request(
                        config.url,
                        "/transfers/revoke",
                        { id: item.id },
                        config.token,
                      );
                      if (item.id === createdId) setLink("");
                      await load();
                      setStatus("Transfer link revoked.");
                    })
                  }
                >
                  Revoke link
                </button>
              )}
            </div>
          ))}
        </>
      )}
      {status && <p role="status">{status}</p>}
      <small>
        Share the passphrase separately. Revoking or expiring a link cannot
        erase a copy already imported. Links created on this device are listed
        here.
      </small>
    </section>
  );
}

export function TransferImport({
  token,
  existing,
  onImport,
  onClose,
}: {
  token: string;
  existing: boolean;
  onImport: (envelope: Envelope, pass: string, member: number) => Promise<void>;
  onClose: () => void;
}) {
  const [pass, setPass] = useState("");
  const [member, setMember] = useState(1);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  function receipt() {
    const key = "tandem-transfer-" + token;
    let value = sessionStorage.getItem(key);
    if (!value) {
      value = btoa(
        String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
      )
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
      sessionStorage.setItem(key, value);
    }
    return value;
  }
  return (
    <main className="transfer-screen">
      <section className="card">
        <img src="/logo.svg" alt="Tandem" width="64" height="64" />
        <h1>{saved ? "Your household is saved" : "Import your household"}</h1>
        <p>
          {saved
            ? "Your household data is now saved on this device."
            : existing
              ? "Merge this encrypted snapshot into this device. Existing history is preserved; a different household cannot overwrite yours."
              : "Enter the sender’s vault passphrase to open this encrypted backup on your device."}
        </p>
        {done ? (
          <p role="status">
            Import complete. The transfer link is now closed. Connect this
            device under Settings → Private synchronization for ongoing updates.
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              void (async () => {
                try {
                  const body = { token, receipt: receipt() };
                  if (!saved) {
                    const data = await request(
                      location.origin,
                      "/transfers/claim",
                      body,
                    );
                    await onImport(data.envelope, pass, member);
                    setSaved(true);
                    setPass("");
                  }
                  await request(location.origin, "/transfers/complete", body);
                  sessionStorage.removeItem("tandem-transfer-" + token);
                  setDone(true);
                } catch (e) {
                  const error = e as Error;
                  setError(
                    error.name === "OperationError" || !error.message
                      ? "Could not decrypt this backup. Check the sender’s vault passphrase and try again."
                      : error.message,
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {!saved && (
              <>
                <label>
                  Sender’s vault passphrase
                  <input
                    type="password"
                    autoComplete="off"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    required
                  />
                </label>
                {!existing && (
                  <label>
                    Using this device
                    <select
                      value={member}
                      onChange={(e) => setMember(Number(e.target.value))}
                    >
                      <option value={0}>Member 1 (original member)</option>
                      <option value={1}>Member 2 (partner)</option>
                    </select>
                  </label>
                )}
              </>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? "Importing…"
                : saved
                  ? "Retry closing transfer link"
                  : "Import encrypted backup"}
            </button>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
        {saved && !done && (
          <p>
            Your data is saved on this device. Retry closing the link, or ask
            the sender to revoke it.
          </p>
        )}
        <button disabled={busy} onClick={onClose}>
          {saved ? "Open Tandem" : "Cancel transfer"}
        </button>
      </section>
    </main>
  );
}
