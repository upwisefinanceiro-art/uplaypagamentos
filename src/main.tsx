import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

// Prevent SW issues in Lovable preview/iframe
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((regs) =>
    regs.forEach((r) => r.unregister())
  );
} else {
  // Em produção: registra SW e força reload automático ao detectar nova versão
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Nova versão disponível — ativa imediatamente e recarrega a página
      updateSW(true);
    },
    onRegisteredSW(_swUrl, registration) {
      // Verifica atualizações a cada 60 segundos enquanto o app está aberto
      if (registration) {
        setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 1000);
      }
    },
  });
}

createRoot(document.getElementById("root")!).render(<App />);
