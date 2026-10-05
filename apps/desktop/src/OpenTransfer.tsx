import { useState } from "react";
export function parseTransferLink(text: string, origin = location.origin) {
  for (const candidate of text.match(/https?:\/\/[^\s<>]+/g) ?? []) {
    try {
      const url = new URL(candidate);
      const token = new URLSearchParams(url.hash.slice(1)).get("transfer");
      if (
        url.origin === origin &&
        url.pathname === "/" &&
        token &&
        /^[A-Za-z0-9_-]{43}$/.test(token)
      )
        return token;
    } catch {
      /* Ignore non-URL text from a share message. */
    }
  }
  return null;
}
export function OpenTransfer() {
  const [text, setText] = useState(""),
    [error, setError] = useState(
      location.hash === "#invalid-transfer"
        ? "The shared message did not contain a transfer link for this Tandem website."
        : "",
    );
  return (
    <details className="open-transfer">
      <summary>Open a transfer link</summary>
      <p>
        If a message opened in your browser, copy its transfer link, open Tandem
        from its icon, and paste it here.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const token = parseTransferLink(text);
          if (!token) {
            setError("Paste a valid transfer link for this Tandem website.");
            return;
          }
          setError("");
          location.hash = "transfer=" + token;
        }}
      >
        <label>
          Paste transfer link
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>
        <button type="submit">Open transfer</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
export function TransferAppHelp() {
  const [status, setStatus] = useState("");
  if (
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone
  )
    return null;
  return (
    <aside className="transfer-app-help">
      <b>Want to use the installed app?</b>
      <p>
        On Android, check Settings → Apps → Tandem → Open by default and enable
        Open supported links, if offered.
      </p>
      <p>
        On Android, use your browser’s Share menu and choose Tandem if listed.
        In WhatsApp, first choose Open in browser. Otherwise, copy this link,
        open Tandem from its icon, and choose Open a transfer link.
      </p>
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard
            .writeText(location.href)
            .then(() =>
              setStatus(
                "Link copied. Open Tandem and paste it into Open a transfer link.",
              ),
            )
            .catch(() =>
              setStatus(
                "Copy the link from your address bar, then open Tandem.",
              ),
            )
        }
      >
        Copy link for installed app
      </button>
      {status && <p role="status">{status}</p>}
    </aside>
  );
}
