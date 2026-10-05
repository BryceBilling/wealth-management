import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .then((registration) => {
      const check = () => {
        if (navigator.onLine && document.visibilityState === "visible")
          void registration.update().catch(console.error);
      };
      window.addEventListener("online", check);
      document.addEventListener("visibilitychange", check);
    })
    .catch(console.error);
