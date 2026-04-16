import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

const SW_UPDATE_INTERVAL_MS = 60_000;

const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((regs) =>
    regs.forEach((registration) => registration.unregister())
  );
} else {
  let isRefreshing = false;
  let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined;

  updateServiceWorker = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      void registration.update();
      window.setInterval(() => {
        void registration.update();
      }, SW_UPDATE_INTERVAL_MS);
    },
    onNeedRefresh() {
      void updateServiceWorker?.(true);
    },
    onOfflineReady() {
      console.info("[pwa] App pronto para uso offline");
    },
  });

  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (isRefreshing) return;
    isRefreshing = true;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(<App />);

