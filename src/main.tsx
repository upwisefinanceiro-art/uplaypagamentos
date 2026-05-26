import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import AppErrorBoundary from "@/components/AppErrorBoundary";

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-RECOVERY contra cache/PWA quebrado (causa raiz da tela preta em massa)
// ─────────────────────────────────────────────────────────────────────────────
const RECOVERY_FLAG = "uplay_sw_recovery_v1";
const RECOVERY_DONE = "uplay_sw_recovery_done_v1";

const nukeCachesAndSW = async () => {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch (e) {
    console.warn("[recovery] nuke failed", e);
  }
};

const hardReload = () => {
  const url = new URL(window.location.href);
  url.searchParams.set("_r", Date.now().toString());
  window.location.replace(url.toString());
};

const triggerRecovery = async (reason: string) => {
  // Evita loop: só executa 1x por sessão
  if (sessionStorage.getItem(RECOVERY_FLAG)) {
    console.warn("[recovery] já executada nesta sessão, ignorando", reason);
    return false;
  }
  sessionStorage.setItem(RECOVERY_FLAG, reason);
  console.warn("[recovery] disparando limpeza completa:", reason);
  await nukeCachesAndSW();
  sessionStorage.setItem(RECOVERY_DONE, "1");
  hardReload();
  return true;
};

// Detecta falhas de carregamento de chunk (bundle obsoleto)
const isChunkLoadError = (err: unknown): boolean => {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "");
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(
    msg,
  );
};

const showBootstrapError = (error: unknown) => {
  console.error("[app] Bootstrap crash captured", error);

  // Se for chunk error e ainda não tentamos recuperar → limpa tudo e recarrega
  if (isChunkLoadError(error)) {
    void triggerRecovery("chunk-load-error");
    return;
  }

  const root = document.getElementById("root");
  if (!root) return;

  const message = error instanceof Error ? error.message : "Erro inesperado ao iniciar o aplicativo.";
  const escapedMessage = message.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[char] ?? char));
  root.innerHTML = `
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:#0a0a0a;color:#fafafa;font-family:system-ui,sans-serif">
      <section style="width:100%;max-width:28rem;border-radius:0.5rem;border:1px solid #262626;background:#171717;padding:1.5rem">
        <p style="font-size:0.875rem;font-weight:600;color:#ef4444">UPLAY Pagamentos</p>
        <h1 style="margin-top:0.75rem;font-size:1.5rem;font-weight:700">Falha ao iniciar o aplicativo</h1>
        <p style="margin-top:0.75rem;font-size:0.875rem;color:#a3a3a3">Vamos limpar o cache e recarregar automaticamente. Se nada acontecer, toque no botão abaixo.</p>
        <p style="margin-top:1rem;border-radius:0.375rem;background:#0a0a0a;padding:0.75rem;font-size:0.75rem;color:#a3a3a3;word-break:break-word">${escapedMessage}</p>
        <button id="uplay-recovery-btn" style="margin-top:1.5rem;height:2.5rem;width:100%;border-radius:0.375rem;background:#ef4444;color:#fff;font-size:0.875rem;font-weight:500;border:0;cursor:pointer">Limpar cache e recarregar</button>
      </section>
    </main>
  `;
  document.getElementById("uplay-recovery-btn")?.addEventListener("click", async () => {
    sessionStorage.removeItem(RECOVERY_FLAG);
    await nukeCachesAndSW();
    hardReload();
  });
};

// Handlers globais
window.addEventListener("error", (event) => {
  if (isChunkLoadError(event.error ?? event.message)) {
    void triggerRecovery("window-error-chunk");
    return;
  }
  if (!document.getElementById("root")?.hasChildNodes()) {
    showBootstrapError(event.error ?? event.message);
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (isChunkLoadError(event.reason)) {
    void triggerRecovery("unhandledrejection-chunk");
    return;
  }
  if (!document.getElementById("root")?.hasChildNodes()) {
    showBootstrapError(event.reason);
  }
});

// Watchdog: se em 8s ainda não montou nada, força recuperação
setTimeout(() => {
  const root = document.getElementById("root");
  if (!root || !root.hasChildNodes()) {
    void triggerRecovery("mount-timeout-8s");
  }
}, 8000);

// ─────────────────────────────────────────────────────────────────────────────
// PWA / Service Worker
// ─────────────────────────────────────────────────────────────────────────────
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com") ||
  window.location.hostname.includes("lovable.app");

if (isPreviewHost || isInIframe) {
  // Em preview NUNCA registra SW; ainda remove qualquer SW antigo
  navigator.serviceWorker?.getRegistrations().then((regs) =>
    regs.forEach((r) => r.unregister())
  );
} else {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateSW(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 1000);
      }
    },
    onRegisterError(err) {
      console.error("[pwa] SW register error", err);
    },
  });
}

try {
  createRoot(document.getElementById("root")!).render(
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
} catch (error) {
  showBootstrapError(error);
}
