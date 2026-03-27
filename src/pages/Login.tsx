import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const formatCpfInput = (value: string): string => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

const isCpf = (value: string): boolean => {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && !/^[a-zA-Z@]/.test(value);
};

const Login = () => {
  const [credential, setCredential] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signIn, user, roles, loading: authLoading } = useAuth();

  useEffect(() => {
    if (user && !authLoading) {
      const isAdmin = roles.includes("ADMIN_MASTER") || roles.includes("ADMIN_UNIDADE");
      navigate(isAdmin ? "/admin" : "/app", { replace: true });
    }
  }, [user, roles, authLoading, navigate]);

  const handleCredentialChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // If starts with digit and no @ sign, treat as CPF and format
    const isTypingCpf = /^\d/.test(raw) && !raw.includes("@");
    setCredential(isTypingCpf ? formatCpfInput(raw) : raw);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!credential.trim()) {
      toast({ title: "Campo obrigatório", description: "Digite seu CPF ou e-mail", variant: "destructive" });
      setLoading(false);
      return;
    }

    let email = credential.trim();

    // If it looks like a CPF, look up the email
    if (isCpf(credential)) {
      const cpfDigits = credential.replace(/\D/g, "");
      const { data, error: rpcError } = await supabase.rpc("get_email_by_cpf", { _cpf: cpfDigits });

      if (rpcError || !data) {
        toast({ title: "CPF não encontrado", description: "Verifique o CPF digitado ou entre com o e-mail.", variant: "destructive" });
        setLoading(false);
        return;
      }
      email = data as string;
    }

    try {
      const { error } = await signIn(email, password);

      if (error) {
        toast({ title: "Erro ao entrar", description: "CPF/e-mail ou senha inválidos", variant: "destructive" });
        setLoading(false);
        return;
      }

      toast({ title: "Bem-vindo!" });
    } catch (err) {
      console.error("Login error:", err);
      toast({ title: "Erro ao entrar", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex justify-center mb-8">
          <img src="/logo.png" alt="EnsinUP Educação" className="h-20 w-auto object-contain" />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-foreground">EnsinUP Pagamentos</h1>
          <p className="text-sm text-muted-foreground mt-1">Acesse sua conta para continuar</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="credential" className="text-sm font-medium text-foreground">CPF ou E-mail</Label>
            <Input
              id="credential"
              type="text"
              inputMode="text"
              placeholder="000.000.000-00 ou seu@email.com"
              value={credential}
              onChange={handleCredentialChange}
              className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground focus:ring-primary focus:border-primary"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium text-foreground">Senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground focus:ring-primary focus:border-primary pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Entrando...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <LogIn size={18} />
                Entrar
              </span>
            )}
          </Button>

          <Link to="/forgot-password" className="block text-center text-sm text-primary hover:underline mt-2">
            Esqueci minha senha
          </Link>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-8">© {new Date().getFullYear()} EnsinUP Educação</p>
      </div>
    </div>
  );
};

export default Login;
