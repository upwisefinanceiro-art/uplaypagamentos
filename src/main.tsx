import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import AppErrorBoundary from "@/components/AppErrorBoundary";

const showBootstrapError = (error: unknown) => {
  console.error("[app] Bootstrap crash captured", error);
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
    <main class="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <section class="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
        <p class="text-sm font-semibold text-primary">UPLAY Pagamentos</p>
        <h1 class="mt-3 text-2xl font-bold">Falha ao iniciar o aplicativo</h1>
        <p class="mt-3 text-sm text-muted-foreground">Recarregue a página. Se o problema persistir, limpe o cache do app no navegador.</p>
        <p class="mt-4 rounded-md bg-muted p-3 text-xs text-muted-foreground break-words">${escapedMessage}</p>
        <button class="mt-6 h-10 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" onclick="window.location.reload()">Recarregar aplicativo</button>
      </section>
    </main>
  `;
};

window.addEventListener("error", (event) => {
  if (!document.getElementById("root")?.hasChildNodes()) {
    showBootstrapError(event.error ?? event.message);
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (!document.getElementById("root")?.hasChildNodes()) {
    showBootstrapError(event.reason);
  }
});

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

try {
  createRoot(document.getElementById("root")!).render(
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
} catch (error) {
  showBootstrapError(error);
}
