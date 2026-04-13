import { useState, useEffect } from "react";
import { Download, Smartphone, Share, MoreVertical, Plus, ArrowUp, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import BrandName from "@/components/BrandName";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Instalar = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");
  const [showSteps, setShowSteps] = useState(true);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setPlatform("ios");
    } else if (/android/.test(ua)) {
      setPlatform("android");
    }
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => setInstalled(true);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  };

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true;

  if (isStandalone || installed) {
    return (
      <div className="min-h-[100dvh] bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-green-500/20 rounded-full p-4 mb-6">
          <CheckCircle2 className="h-16 w-16 text-green-400" />
        </div>
        <h1 className="text-2xl font-bold mb-2">App Instalado!</h1>
        <p className="text-white/70 mb-8 max-w-sm">
          O UPLAY já está instalado no seu dispositivo. Você pode acessá-lo pela tela inicial.
        </p>
        <Button
          onClick={() => window.location.href = "/login"}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 text-base"
        >
          Acessar o App
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-black text-white flex flex-col">
      {/* Header */}
      <div className="flex flex-col items-center pt-12 pb-6 px-6">
        <img src="/icons/icon-192x192.png" alt="UPLAY" className="h-24 w-24 rounded-2xl shadow-2xl mb-6" />
        <h1 className="text-2xl font-bold mb-1"><BrandName /></h1>
        <p className="text-white/60 text-sm">Gestão de cobranças e pagamentos</p>
      </div>

      {/* Main action */}
      <div className="flex-1 flex flex-col items-center px-6">
        {/* Android / Desktop - direct install button */}
        {deferredPrompt && (
          <div className="w-full max-w-sm mb-8">
            <Button
              onClick={handleInstall}
              className="w-full h-14 text-base gap-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-lg"
            >
              <Download className="h-5 w-5" />
              Instalar App
            </Button>
            <p className="text-white/40 text-xs text-center mt-3">
              Não ocupa espaço. Abre direto da tela inicial.
            </p>
          </div>
        )}

        {/* Instructions - always visible */}
        <div className="w-full max-w-sm">
          <button
            onClick={() => setShowSteps(!showSteps)}
            className="flex items-center justify-between w-full text-left mb-4"
          >
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              Como instalar
            </h2>
            {showSteps ? <ChevronUp className="h-4 w-4 text-white/40" /> : <ChevronDown className="h-4 w-4 text-white/40" />}
          </button>

          {showSteps && (
            <div className="space-y-4">
              {platform === "ios" ? (
                <>
                  <Step number={1} icon={<Share className="h-5 w-5" />}
                    title="Toque em Compartilhar"
                    description='Toque no ícone de compartilhar (quadrado com seta) na barra inferior do Safari'
                  />
                  <Step number={2} icon={<Plus className="h-5 w-5" />}
                    title='Toque em "Adicionar à Tela de Início"'
                    description="Role as opções até encontrar e toque nela"
                  />
                  <Step number={3} icon={<CheckCircle2 className="h-5 w-5" />}
                    title='Toque em "Adicionar"'
                    description="O app UPLAY aparecerá na sua tela inicial como um aplicativo normal"
                  />
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-200/80">
                    <strong className="text-amber-300">Importante:</strong> No iPhone, use o <strong>Safari</strong> para que a instalação funcione. Chrome e outros navegadores não suportam.
                  </div>
                </>
              ) : platform === "android" ? (
                <>
                  <Step number={1} icon={<MoreVertical className="h-5 w-5" />}
                    title="Toque nos 3 pontos ⋮"
                    description="No canto superior direito do Chrome"
                  />
                  <Step number={2} icon={<Download className="h-5 w-5" />}
                    title='Procure "Instalar aplicativo"'
                    description='Ou "Adicionar à tela inicial" — role o menu para baixo se necessário'
                  />
                  <Step number={3} icon={<CheckCircle2 className="h-5 w-5" />}
                    title='Confirme tocando "Instalar"'
                    description="O app UPLAY aparecerá na sua tela inicial"
                  />
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-sm text-blue-200/80">
                    <strong className="text-blue-300">Dica:</strong> Se não encontrar a opção, tente atualizar a página (puxe para baixo) e abra o menu novamente. Use o <strong>Chrome</strong> para melhor compatibilidade.
                  </div>
                </>
              ) : (
                <>
                  <Step number={1} icon={<ArrowUp className="h-5 w-5" />}
                    title="Clique no ícone de instalar"
                    description="Na barra de endereço do navegador, procure o ícone de instalação"
                  />
                  <Step number={2} icon={<CheckCircle2 className="h-5 w-5" />}
                    title='Confirme clicando "Instalar"'
                    description="O app abrirá em uma janela própria"
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-6 px-6">
        <a
          href="/login"
          className="text-primary text-sm underline underline-offset-4"
        >
          Ou acesse pelo navegador
        </a>
      </div>
    </div>
  );
};

const Step = ({ number, icon, title, description }: {
  number: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <div className="flex gap-4 items-start">
    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
      {number}
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-medium text-white/90 flex items-center gap-2">
        {icon} {title}
      </p>
      <p className="text-sm text-white/50 mt-0.5">{description}</p>
    </div>
  </div>
);

export default Instalar;
