import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { Vault } from "../../../packages/database/vault";
import {
  biometricAvailable,
  biometricEnabled,
  enableBiometric,
  removeBiometric,
} from "../../../packages/database/biometric";
export function biometricError(e: unknown) {
  const error = e as Error;
  if (error.name === "NotAllowedError" || error.name === "AbortError")
    return "Device verification was cancelled or unavailable. Your vault passphrase still works.";
  if (error.name === "OperationError")
    return "Could not unlock securely. Check your vault passphrase, or set up biometrics again after unlocking.";
  return error.message || "Biometric unlock failed. Use your vault passphrase.";
}
export function BiometricSettings({ vault }: { vault: Vault }) {
  const [available, setAvailable] = useState<boolean | null>(null),
    [enabled, setEnabled] = useState(biometricEnabled),
    [pass, setPass] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  useEffect(() => {
    void biometricAvailable()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, []);
  return (
    <section className="card">
      <h2>Biometric unlock</h2>
      <p>
        Unlock this vault using a device passkey: fingerprint, face recognition,
        or your device PIN. Keep your vault passphrase for recovery and
        transfers.
      </p>
      <small>
        This applies to this browser or installed app. Cloudflare may still ask
        you to sign in to the website.
      </small>
      {enabled ? (
        <>
          <p>Biometric unlock is enabled here.</p>
          <button
            onClick={() => {
              removeBiometric();
              setEnabled(false);
              setStatus(
                "Biometric unlock disabled on this browser. The passkey can also be removed from your device’s password manager.",
              );
            }}
          >
            Disable biometric unlock
          </button>
        </>
      ) : isTauri() || available === false ? (
        <p>
          Encrypted biometric unlock is unavailable here. Try the installed web
          app or a current browser with device passkeys enabled.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setStatus("");
            void enableBiometric(vault, pass)
              .then(() => {
                setEnabled(true);
                setStatus(
                  "Biometric unlock enabled. You can now lock Tandem and try it.",
                );
              })
              .catch((e) => setStatus(biometricError(e)))
              .finally(() => {
                setPass("");
                setBusy(false);
              });
          }}
        >
          <label>
            Confirm vault passphrase
            <input
              type="password"
              autoComplete="current-password"
              required
              minLength={12}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy || available === null}>
            {busy ? "Follow your device prompts…" : "Enable biometric unlock"}
          </button>
        </form>
      )}
      {status && <p role="status">{status}</p>}
    </section>
  );
}
