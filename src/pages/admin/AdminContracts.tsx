import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const mockContracts = [
  { id: "1", client: "Carlos Santos", course: "Informática Básica", installments: 12, value: 350, method: "PIX", unit: "Serra Verde", status: "Ativo" },
  { id: "2", client: "Fernanda Costa", course: "Administração", installments: 6, value: 500, method: "BOLETO", unit: "Vespasiano", status: "Ativo" },
];

const AdminContracts = () => {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Contratos</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus size={16} className="mr-2" />
              Novo Contrato
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">Novo Contrato</DialogTitle>
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
              <div className="space-y-2">
                <Label className="text-foreground">Responsável</Label>
                <Select>
                  <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="carlos">Carlos Santos</SelectItem>
                    <SelectItem value="fernanda">Fernanda Costa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Descrição / Curso</Label>
                <Input className="bg-input border-border text-foreground" placeholder="Ex: Informática Básica" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-foreground">Valor da Parcela</Label>
                  <Input className="bg-input border-border text-foreground" placeholder="R$ 0,00" type="number" />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Nº de Parcelas</Label>
                  <Input className="bg-input border-border text-foreground" placeholder="12" type="number" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Data do 1º Vencimento</Label>
                <Input className="bg-input border-border text-foreground" type="date" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Método de Pagamento</Label>
                <Select>
                  <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="PIX">PIX</SelectItem>
                    <SelectItem value="BOLETO">Boleto</SelectItem>
                    <SelectItem value="CARD">Cartão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                Criar Contrato e Gerar Parcelas
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {mockContracts.map((contract) => (
          <div key={contract.id} className="glass-card p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{contract.course}</h3>
                <p className="text-xs text-muted-foreground">{contract.client} • {contract.unit}</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full border status-paid font-medium">{contract.status}</span>
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span>{contract.installments}x R$ {contract.value.toFixed(2).replace(".", ",")}</span>
              <span>• {contract.method}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminContracts;
