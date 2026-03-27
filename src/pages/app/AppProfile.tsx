import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, User, Phone, Mail, MapPin, Building2, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const AppProfile = () => {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const [unitName, setUnitName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (profile?.unit_id) {
        const { data } = await supabase.from("units").select("name").eq("id", profile.unit_id).single();
        if (data) setUnitName(data.name);
      }
      setLoading(false);
    };
    fetch();
  }, [profile]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
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

      {/* Avatar / Header */}
      <div className="glass-card p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <User size={28} className="text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-foreground truncate">{profile.full_name}</p>
          {unitName && <p className="text-sm text-muted-foreground">{unitName}</p>}
        </div>
      </div>

      {/* Info */}
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
