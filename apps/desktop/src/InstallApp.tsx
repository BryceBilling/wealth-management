import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
type Prompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function InstallApp() {
  const [prompt, setPrompt] = useState<Prompt | null>(null),
    [help, setHelp] = useState(false),
    [update, setUpdate] = useState<ServiceWorker | null>(null),
    [installed, setInstalled] = useState(
      matchMedia("(display-mode: standalone)").matches ||
        !!(navigator as Navigator & { standalone?: boolean }).standalone,
    ),
    [ready, setReady] = useState(false);
  useEffect(() => {
    const show = (e: Event) => {
      e.preventDefault();
      setPrompt(e as Prompt);
    };
    const done = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", show);
    window.addEventListener("appinstalled", done);
    let registration: ServiceWorkerRegistration | undefined;
    let worker: ServiceWorker | null = null;
    let disposed = false;
    const changed = () => {
      if (worker?.state === "installed" && navigator.serviceWorker.controller)
        setUpdate(registration?.waiting ?? worker);
    };
    const found = () => {
      worker?.removeEventListener("statechange", changed);
      worker = registration?.installing ?? null;
      worker?.addEventListener("statechange", changed);
    };
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.ready.then((r) => {
        if (disposed) return;
        setReady(true);
        registration = r;
        setUpdate(r.waiting);
        r.addEventListener("updatefound", found);
        found();
      });
    return () => {
      disposed = true;
      registration?.removeEventListener("updatefound", found);
      worker?.removeEventListener("statechange", changed);
      window.removeEventListener("beforeinstallprompt", show);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  if (isTauri()) return null;
  return (
    <div className="install-app">
      <button
        type="button"
        onClick={async () => {
          if (prompt) {
            await prompt.prompt();
            const result = await prompt.userChoice;
            setPrompt(null);
            if (result.outcome === "accepted") setInstalled(true);
          } else setHelp(!help);
        }}
      >
        {installed ? <Smartphone size={16} /> : <Download size={16} />}{" "}
        {installed ? "Installed on this device" : "Install Tandem"}
      </button>
      {update && (
        <div role="status">
          <p>A new version is ready. Save any open form before updating.</p>
          <button
            type="button"
            onClick={() => {
              navigator.serviceWorker.addEventListener(
                "controllerchange",
                () => location.reload(),
                { once: true },
              );
              update.postMessage({ type: "SKIP_WAITING" });
            }}
          >
            Update Tandem
          </button>
        </div>
      )}
      {help && (
        <div className="install-instructions">
          <p>
            <b>iPhone:</b> open this address in Safari, tap Share, then Add to
            Home Screen. Enable Open as Web App if offered.
          </p>
          <p>
            <b>Android:</b> open in Chrome, tap its menu, then Install app or
            Add to Home screen.
          </p>
          <p>
            <b>Computer:</b> in Chrome or Edge, use the install icon in the
            address bar. On supported Macs, Safari offers File → Add to Dock.
          </p>
          <p>
            {ready
              ? "App files are saved for offline use."
              : "Open the HTTPS app address online once to save its files for offline use."}{" "}
            Install first, then create or restore your household inside the
            installed app. Keep encrypted backups before clearing browser data.
          </p>
        </div>
      )}
    </div>
  );
}
