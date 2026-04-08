import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;
    let resolved = false;

    const getRecoveryParams = () => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const searchParams = new URLSearchParams(window.location.search);

      return {
        type: hashParams.get("type") || searchParams.get("type"),
        error: hashParams.get("error") || searchParams.get("error"),
        errorDescription:
          hashParams.get("error_description") || searchParams.get("error_description"),
        hasAccessToken: hashParams.has("access_token") || searchParams.has("access_token"),
        hasRefreshToken: hashParams.has("refresh_token") || searchParams.has("refresh_token"),
      };
    };

    const getFriendlyMessage = (raw?: string | null) => {
      const normalized = (raw || "").toLowerCase();

      if (normalized.includes("banned")) {
        return "Seu acesso está inativo. Entre em contato com o administrador.";
      }

      if (normalized.includes("expired") || normalized.includes("invalid")) {
        return "Este link de recuperação é inválido ou expirou. Solicite um novo link.";
      }

      return "Não foi possível validar sua recuperação de senha. Solicite um novo link.";
    };

    const markReady = () => {
      if (!mounted || resolved) return;
      resolved = true;
      setSessionError(null);
      setReady(true);
    };

    const markError = (message: string) => {
      if (!mounted || resolved) return;
      resolved = true;
      setReady(false);
      setSessionError(message);
    };

    const evaluateRecovery = async () => {
      const params = getRecoveryParams();

      if (params.error || params.errorDescription) {
        markError(getFriendlyMessage(params.errorDescription || params.error));
        return;
      }

      if (params.type === "recovery" || params.hasAccessToken || params.hasRefreshToken) {
        markReady();
        return;
      }

      const { data, error } = await supabase.auth.getSession();

      if (error) {
        markError(getFriendlyMessage(error.message));
        return;
      }

      if (data.session) {
        markReady();
        return;
      }

      markError("Este link de recuperação é inválido ou expirou. Solicite um novo link.");
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || resolved) return;

      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        markReady();
      }
    });

    const timeout = setTimeout(() => {
      if (!resolved) {
        const params = getRecoveryParams();
        markError(getFriendlyMessage(params.errorDescription || params.error));
      }
    }, 4000);

    evaluateRecovery();

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Senha muito curta", description: "Mínimo de 6 caracteres.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Senhas diferentes", description: "As senhas não coincidem.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Senha alterada!", description: "Você já pode entrar com a nova senha." });
      navigate("/login", { replace: true });
    }
    setLoading(false);
  };

  if (sessionError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm animate-fade-in text-center space-y-5">
          <div className="flex justify-center mb-2">
            <img src="/logo.png" alt="UPLAY Pagamentos" className="h-16 w-auto object-contain" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-foreground">Não foi possível abrir a recuperação</h1>
            <p className="text-sm text-muted-foreground">{sessionError}</p>
          </div>
          <div className="space-y-3">
            <Button asChild className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
              <Link to="/forgot-password">Solicitar novo link</Link>
            </Button>
            <Button asChild variant="outline" className="w-full h-11">
              <Link to="/login">Voltar ao login</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <Loader2 className="animate-spin mx-auto text-muted-foreground" size={32} />
          <p className="text-sm text-muted-foreground">Verificando sessão...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex justify-center mb-8">
          <img src="/logo.png" alt="UPLAY Pagamentos" className="h-20 w-auto object-contain" />
        </div>
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-foreground">Nova Senha</h1>
          <p className="text-sm text-muted-foreground mt-1">Digite sua nova senha abaixo.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password">Nova senha</Label>
            <div className="relative">
              <Input id="password" type={show ? "text" : "password"} placeholder="Mínimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 pr-10" required />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmar senha</Label>
            <Input id="confirm" type={show ? "text" : "password"} placeholder="Repita a senha" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11" required />
          </div>
          <Button type="submit" className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" disabled={loading}>
            {loading ? <Loader2 size={18} className="animate-spin" /> : <span className="flex items-center gap-2"><Lock size={18} /> Salvar nova senha</span>}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground mt-8">© {new Date().getFullYear()} UPLAY Pagamentos</p>
      </div>
    </div>
  );
};

export default ResetPassword;
