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