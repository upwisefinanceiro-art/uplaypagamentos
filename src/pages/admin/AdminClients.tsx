import { useState } from "react";
import { Plus, Pencil, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const mockClients = [
  { id: "1", name: "Carlos Santos", cpf: "123.456.789-00", phone: "(31) 99999-0000", email: "carlos@email.com", unit: "Serra Verde", student: "João Silva" },
  { id: "2", name: "Fernanda Costa", cpf: "987.654.321-00", phone: "(31) 98888-0000", email: "fernanda@email.com", unit: "Vespasiano", student: "Ana Costa" },
];

const AdminClients = () => {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Clientes (Responsáveis)</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus size={16} className="mr-2" />
              Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">Novo Cliente</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setDialogOpen(false); }}>
              <div className="space-y-2">
                <Label className="text-foreground">Unidade</Label>
                <Select>
                  <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="serra-verde">Serra Verde</SelectItem>
                    <SelectItem value="vespasiano">Vespasiano</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2 col-span-2">
                  <Label className="text-foreground">Nome do Responsável</Label>
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
                <div className="space-y-2 col-span-2">
                  <Label className="text-foreground">Email</Label>
                  <Input className="bg-input border-border text-foreground" placeholder="email@exemplo.com" type="email" />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label className="text-foreground">Endereço</Label>
                  <Input className="bg-input border-border text-foreground" placeholder="Rua, Nº, Bairro, Cidade, CEP" />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label className="text-foreground">Nome do Aluno</Label>
                  <Input className="bg-input border-border text-foreground" placeholder="Nome do aluno" />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label className="text-foreground">Senha Provisória</Label>
                  <Input className="bg-input border-border text-foreground" type="password" placeholder="Senha inicial" />
                </div>
              </div>
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Input className="bg-input border-border text-foreground" placeholder="Buscar por nome, CPF ou aluno..." />

      <div className="space-y-3">
        {mockClients.map((client) => (
          <div key={client.id} className="glass-card p-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{client.name}</h3>
              <p className="text-xs text-muted-foreground">{client.cpf} • {client.unit}</p>
              <p className="text-xs text-muted-foreground">Aluno: {client.student}</p>
            </div>
            <div className="flex gap-1">
              <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"><Eye size={14} /></button>
              <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"><Pencil size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminClients;
