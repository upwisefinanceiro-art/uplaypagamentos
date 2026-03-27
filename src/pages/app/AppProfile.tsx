import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, User, Phone, Mail, Building2, CreditCard, Loader2, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const AppProfile = () => {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { toast } = useToast();
  const [unitName, setUnitName] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    const fetchUnit = async () => {
      if (profile?.unit_id) {
        const { data } = await supabase.from("units").select("name").eq("id", profile.unit_id).single();
        if (data) setUnitName(data.name);
      }
      setLoading(false);
    };
    fetchUnit();
  }, [profile]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({ title: "Senha muito curta", description: "Mínimo de 6 caracteres.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Senhas diferentes", description: "As senhas não coincidem.", variant: "destructive" });
      return;
    }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Senha alterada com sucesso!" });
      setShowPasswordForm(false);
      setNewPassword("");
      setConfirmPassword("");
    }
    setSavingPw(false);
  };

  if (loading || !profile) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  const formatCpf = (cpf: string) => {
    const digits = cpf.replace(/\D/g, "");
    if (digits.length === 11) {
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    }
    return cpf;
  };

  const infoItems = [
    { icon: User, label: "Nome", value: profile.full_name },
    { icon: CreditCard, label: "CPF", value: formatCpf(profile.cpf) },
    { icon: Mail, label: "E-mail", value: user?.email || "—" },
    { icon: Phone, label: "Telefone", value: profile.phone || "—" },
    { icon: Building2, label: "Unidade", value: unitName || "—" },
  ];

  return (
    <div className="p-4 space-y-6 animate-fade-in">
      <h1 className="text-xl font-bold text-foreground">Meu Perfil</h1>

      <div className="glass-card p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <User size={28} className="text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-foreground truncate">{profile.full_name}</p>
          {unitName && <p className="text-sm text-muted-foreground">{unitName}</p>}
        </div>
      </div>

      <div className="glass-card divide-y divide-border">
        {infoItems.map(({ icon: Icon, label, value }) => (
          <div key={label} className="p-4 flex items-center gap-3">
            <Icon size={18} className="text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-medium text-foreground truncate">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Alterar Senha */}
      <div className="glass-card p-4 space-y-3">
        <Button
          variant="outline"
          onClick={() => setShowPasswordForm(!showPasswordForm)}
          className="w-full h-12 text-base border-border"
        >
          <Lock size={18} className="mr-2" />
          Alterar senha
        </Button>

        {showPasswordForm && (
          <form onSubmit={handleChangePassword} className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label htmlFor="new-pw" className="text-sm">Nova senha</Label>
              <div className="relative">
                <Input id="new-pw" type={showPw ? "text" : "password"} placeholder="Mínimo 6 caracteres" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-11 pr-10" required />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm-pw" className="text-sm">Confirmar senha</Label>
              <Input id="confirm-pw" type={showPw ? "text" : "password"} placeholder="Repita a senha" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-11" required />
            </div>
            <Button type="submit" className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" disabled={savingPw}>
              {savingPw ? <Loader2 size={18} className="animate-spin" /> : "Salvar nova senha"}
            </Button>
          </form>
        )}
      </div>

      <Button
        variant="outline"
        onClick={handleSignOut}
        className="w-full h-12 text-base border-border text-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
      >
        <LogOut size={18} className="mr-2" />
        Sair da conta
      </Button>
    </div>
  );
};

export default AppProfile;
