import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const ForgotPassword = () => {
  const [credential, setCredential] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credential.trim()) return;
    setLoading(true);

    let email = credential.trim();

    // If looks like CPF, resolve email
    const digits = credential.replace(/\D/g, "");
    if (digits.length === 11 && !/[@]/.test(credential)) {
      const { data, error } = await supabase.rpc("get_email_by_cpf", { _cpf: digits });
      if (error || !data) {
        toast({ title: "Usuário não encontrado", description: "Não localizamos um acesso com este CPF.", variant: "destructive" });
        setLoading(false);
        return;
      }
      email = data as string;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("active")
      .eq("email", email)
      .maybeSingle();

    if (profileError || !profile) {
      toast({
        title: "Usuário não encontrado",
        description: "Não localizamos um acesso com este CPF ou e-mail.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    if (!profile.active) {
      toast({
        title: "Acesso inativo",
        description: "Seu acesso está inativo. Entre em contato com o administrador.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast({ title: "Erro", description: "Não foi possível enviar o e-mail de recuperação.", variant: "destructive" });
    } else {
      setSent(true);
      toast({ title: "E-mail enviado!", description: "Verifique sua caixa de entrada." });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex justify-center mb-8">
          <img src="/logo.png" alt="UPLAY Pagamentos" className="h-20 w-auto object-contain" />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-foreground">Recuperar Senha</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {sent ? "Verifique seu e-mail para redefinir a senha." : "Digite seu CPF ou e-mail para recuperar o acesso."}
          </p>
        </div>

        {!sent ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="credential" className="text-sm font-medium text-foreground">CPF ou E-mail</Label>
              <Input
                id="credential"
                type="text"
                placeholder="000.000.000-00 ou seu@email.com"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground"
                required
              />
            </div>
            <Button type="submit" className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2"><Loader2 size={18} className="animate-spin" /> Enviando...</span>
              ) : (
                <span className="flex items-center gap-2"><Send size={18} /> Enviar link de recuperação</span>
              )}
            </Button>
          </form>
        ) : (
          <div className="glass-card p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">Um link foi enviado para o e-mail vinculado. Verifique sua caixa de entrada e spam.</p>
          </div>
        )}

        <Link to="/login" className="flex items-center justify-center gap-2 text-sm text-primary mt-6 hover:underline">
          <ArrowLeft size={16} /> Voltar ao login
        </Link>

        <p className="text-center text-xs text-muted-foreground mt-8">© {new Date().getFullYear()} UPLAY Pagamentos</p>
      </div>
    </div>
  );
};

export default ForgotPassword;
