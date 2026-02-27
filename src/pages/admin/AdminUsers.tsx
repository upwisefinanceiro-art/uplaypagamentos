import { useState } from "react";
import { Plus, Pencil, Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const mockAdmins = [
  { id: "1", name: "Ana Souza", cpf: "111.222.333-44", phone: "(31) 98888-1111", unit: "Serra Verde", active: true },
  { id: "2", name: "Roberto Lima", cpf: "555.666.777-88", phone: "(31) 97777-2222", unit: "Vespasiano", active: true },
];

const AdminUsers = () => {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Usuários Admin</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus size={16} className="mr-2" />
              Novo Admin
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Novo Admin de Unidade</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setDialogOpen(false); }}>
              <div className="space-y-2">
                <Label className="text-foreground">Nome</Label>
                <Input className="bg-input border-border text-foreground" placeholder="Nome completo" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">CPF</Label>
                <Input className="bg-input border-border text-foreground" placeholder="000.000.000-00" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Telefone</Label>
                <Input className="bg-input border-border text-foreground" placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Unidade</Label>
                <Select>
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="serra-verde">Serra Verde</SelectItem>
                    <SelectItem value="vespasiano">Vespasiano</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Senha Provisória</Label>
                <Input className="bg-input border-border text-foreground" type="password" placeholder="Senha inicial" />
              </div>
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {mockAdmins.map((admin) => (
          <div key={admin.id} className="glass-card p-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{admin.name}</h3>
              <p className="text-xs text-muted-foreground">{admin.cpf} • {admin.unit}</p>
              <p className="text-xs text-muted-foreground">{admin.phone}</p>
            </div>
            <div className="flex gap-1">
              <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Editar"><Pencil size={14} /></button>
              <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Resetar senha"><RotateCcw size={14} /></button>
              <button className="p-1.5 text-muted-foreground hover:text-destructive transition-colors" title="Desativar"><Ban size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminUsers;
