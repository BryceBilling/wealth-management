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
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.ready.then(() => setReady(true));
    return () => {
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
        {installed
          ? "Installed on this device"
          : prompt
            ? "Install Tandem"
            : "Install on your phone"}
      </button>
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
