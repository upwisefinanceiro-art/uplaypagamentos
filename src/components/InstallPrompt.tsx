import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.info("[pwa] Install outcome:", outcome);
    setDeferredPrompt(null);
  };

  if (!deferredPrompt || dismissed) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 bg-card border border-border rounded-xl p-4 shadow-lg flex items-center gap-3 animate-fade-in">
      <div className="flex-shrink-0 bg-primary/10 rounded-lg p-2">
        <Download className="h-6 w-6 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">Instalar App UPLAY</p>
        <p className="text-xs text-muted-foreground">Acesse direto da tela inicial</p>
      </div>
      <Button size="sm" onClick={handleInstall} className="flex-shrink-0">
        Instalar
      </Button>
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground p-1"
        aria-label="Fechar"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default InstallPrompt;
