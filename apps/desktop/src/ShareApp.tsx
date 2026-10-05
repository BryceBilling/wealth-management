import { InstallApp } from "./InstallApp";
import { useState } from "react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { Download, Copy, Share2, X, MessageCircle } from "lucide-react";
import { saveBytes } from "./files";
import type { Vault } from "../../../packages/database/vault";
export function ShareApp({
  vault,
  onClose,
}: {
  vault: Vault;
  onClose: () => void;
}) {
  const suggested =
    location.protocol === "https:" &&
    !["localhost", "127.0.0.1"].includes(location.hostname)
      ? location.origin
      : "";
  const [url, setUrl] = useState(vault.repo.meta("appShareUrl", suggested));
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  function link() {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw Error("Enter your private HTTPS app link first");
    }
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      ["localhost", "127.0.0.1"].includes(u.hostname)
    )
      throw Error(
        "Use a private HTTPS app address without passwords, query parameters or local-only addresses",
      );
    return u.toString();
  }
  async function share(kind: "copy" | "system" | "whatsapp") {
    setStatus("");
    try {
      const target = link();
      const text =
        "Join me on Tandem, our private household finance app. " + target;
      if (kind === "copy") {
        await navigator.clipboard.writeText(target);
        setStatus("App link copied. Paste it into WhatsApp or any message.");
      } else if (kind === "whatsapp") {
        const shareUrl = "https://wa.me/?text=" + encodeURIComponent(text);
        if (isTauri()) await invoke("open_whatsapp", { url: shareUrl });
        else {
          const a = document.createElement("a");
          a.href = shareUrl;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.click();
        }
        setStatus(
          "Choose a recipient in WhatsApp. The message contains only the app link.",
        );
      } else if (navigator.share) {
        await navigator.share({
          title: "Tandem",
          text: "Our private household finance app",
          url: target,
        });
        setStatus("Share sheet opened.");
      } else {
        await navigator.clipboard.writeText(text);
        setStatus(
          "Share message copied. Paste it into WhatsApp, email or another app.",
        );
      }
      await vault.mutate((r) => r.setMeta("appShareUrl", target));
    } catch (e) {
      setStatus(
        (e as Error).name === "AbortError"
          ? "Sharing cancelled."
          : (e as Error).message,
      );
    }
  }
  async function installer() {
    setBusy(true);
    setStatus("Preparing the app file…");
    try {
      const bytes = await invoke<number[]>("share_app_archive");
      await saveBytes(
        "Tandem-macOS-AppleSilicon.zip",
        new Uint8Array(bytes),
        "application/zip",
      );
      setStatus(
        "App file saved. Attach the ZIP as a document in WhatsApp, AirDrop or email. Your vault is not included.",
      );
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Share Tandem"
      >
        <div className="section-title">
          <div>
            <span className="eyebrow">BETTER TOGETHER</span>
            <h2>Share Tandem</h2>
          </div>
          <button aria-label="Close sharing" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <p>
          Send the app to your partner using WhatsApp, AirDrop, email or a
          private link.
        </p>
        {isTauri() && (
          <div className="share-installer">
            <h3>Send the Mac app</h3>
            <p>Save an installable ZIP, then attach it as a document.</p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void installer()}
            >
              <Download size={16} />
              {busy ? "Preparing…" : "Save app to share"}
            </button>
          </div>
        )}
        <InstallApp />
        <h3>Share a private web link</h3>
        <label>
          Your app’s HTTPS address
          <input
            aria-label="Your app’s HTTPS address"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://tandem.your-private-network"
          />
        </label>
        <small>
          Use the address where you privately installed the web app. Your
          partner must have access to that network. A link cannot install the
          Mac app by itself.
        </small>
        <div className="button-group share-actions">
          <button onClick={() => void share("whatsapp")}>
            <MessageCircle size={16} />
            WhatsApp
          </button>
          <button onClick={() => void share("copy")}>
            <Copy size={16} />
            Copy link
          </button>
          <button onClick={() => void share("system")}>
            <Share2 size={16} />
            More ways
          </button>
        </div>
        {status && (
          <p role="status" className="share-status">
            {status}
          </p>
        )}
        <div className="private-share-note">
          <b>Your money stays private.</b>
          <p>
            This shares only the app. To connect household data afterward,
            export an encrypted backup in Settings and restore it on the other
            device. Share the passphrase separately.
          </p>
        </div>
      </section>
    </div>
  );
}
