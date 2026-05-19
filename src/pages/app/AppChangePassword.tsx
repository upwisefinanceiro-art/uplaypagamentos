import { useState } from "react";
import { Lock, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const AppChangePassword = () => {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast({ title: "Senha muito curta", description: "A nova senha deve ter pelo menos 6 caracteres.", variant: "destructive" });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({ title: "Senhas não coincidem", description: "A confirmação deve ser igual à nova senha.", variant: "destructive" });
      return;
    }

    if (currentPassword === newPassword) {
      toast({ title: "Mesma senha", description: "A nova senha deve ser diferente da atual.", variant: "destructive" });
      return;
    }

    setLoading(true);

    // Verify current password by re-authenticating
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      toast({ title: "Erro", description: "Não foi possível identificar o usuário.", variant: "destructive" });
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      toast({ title: "Senha atual incorreta", description: "Verifique sua senha atual e tente novamente.", variant: "destructive" });
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      toast({ title: "Erro ao alterar senha", description: error.message, variant: "destructive" });
    } else {
      await supabase
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", user.id);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Senha alterada com sucesso!" });
    }

    setLoading(false);
  };


  return (
    <div className="p-4 max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Lock size={24} className="text-primary" />
        <h1 className="text-xl font-bold text-foreground">Alterar Senha</h1>
      </div>

      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-700 text-sm mb-4">
          <CheckCircle size={16} />
          Senha alterada com sucesso!
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="current" className="text-sm font-medium">Senha atual</Label>
          <Input
            id="current"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
            className="h-11"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="new" className="text-sm font-medium">Nova senha</Label>
          <Input
            id="new"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            className="h-11"
            required
            minLength={6}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm" className="text-sm font-medium">Confirmar nova senha</Label>
          <Input
            id="confirm"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repita a nova senha"
            className="h-11"
            required
          />
        </div>

        <Button type="submit" className="w-full h-11" disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-2"><Loader2 size={18} className="animate-spin" /> Alterando...</span>
          ) : (
            "Alterar senha"
          )}
        </Button>
      </form>
    </div>
  );
};

export default AppChangePassword;
