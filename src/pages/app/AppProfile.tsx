import { useNavigate } from "react-router-dom";
import { LogOut, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const AppProfile = () => {
  const navigate = useNavigate();

  return (
    <div className="p-4 space-y-6 animate-fade-in">
      <h1 className="text-lg font-bold text-foreground">Meu Perfil</h1>

      <div className="glass-card p-4 space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Nome</p>
          <p className="text-sm font-medium text-foreground">Carlos Santos</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">CPF</p>
          <p className="text-sm font-medium text-foreground">123.456.789-00</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Email</p>
          <p className="text-sm font-medium text-foreground">carlos@email.com</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Telefone</p>
          <p className="text-sm font-medium text-foreground">(31) 99999-0000</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Unidade</p>
          <p className="text-sm font-medium text-foreground">Serra Verde</p>
        </div>
      </div>

      <Button
        variant="outline"
        onClick={() => navigate("/login")}
        className="w-full border-border text-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
      >
        <LogOut size={16} className="mr-2" />
        Sair da conta
      </Button>
    </div>
  );
};

export default AppProfile;
