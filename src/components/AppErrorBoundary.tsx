import { Component, ErrorInfo, ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || "Erro inesperado de renderização.",
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[app] React render crash captured", { error, errorInfo });
    const msg = `${error?.name ?? ""} ${error?.message ?? ""}`;
    if (/ChunkLoadError|Loading chunk|dynamically imported module|preload CSS/i.test(msg)) {
      // Bundle obsoleto em cache → limpa SW/caches e recarrega 1x
      const FLAG = "uplay_sw_recovery_v1";
      if (!sessionStorage.getItem(FLAG)) {
        sessionStorage.setItem(FLAG, "boundary-chunk");
        (async () => {
          try {
            const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
            await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
            const keys = (await caches?.keys()) ?? [];
            await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
          } finally {
            const url = new URL(window.location.href);
            url.searchParams.set("_r", Date.now().toString());
            window.location.replace(url.toString());
          }
        })();
      }
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
          <div className="space-y-3">
            <p className="text-sm font-semibold text-primary">UPLAY Pagamentos</p>
            <h1 className="text-2xl font-bold">Não foi possível abrir esta tela</h1>
            <p className="text-sm text-muted-foreground">
              O aplicativo encontrou uma falha temporária ao carregar. Recarregue a página para tentar novamente.
            </p>
            {this.state.message && (
              <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground break-words">
                {this.state.message}
              </p>
            )}
          </div>
          <button
            className="mt-6 h-10 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            onClick={() => window.location.reload()}
          >
            Recarregar aplicativo
          </button>
        </section>
      </main>
    );
  }
}

export default AppErrorBoundary;