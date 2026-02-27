import { useState } from "react";
import { Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Unit {
  id: string;
  name: string;
  slug: string;
  asaasApiKey: string;
  asaasBaseUrl: string;
  webhookToken: string;
}

const mockUnits: Unit[] = [
  { id: "1", name: "Serra Verde", slug: "serra-verde", asaasApiKey: "$aact_abc123...", asaasBaseUrl: "https://sandbox.asaas.com/api/v3", webhookToken: "wh_token_sv" },
  { id: "2", name: "Vespasiano", slug: "vespasiano", asaasApiKey: "$aact_def456...", asaasBaseUrl: "https://sandbox.asaas.com/api/v3", webhookToken: "wh_token_vs" },
];

const AdminUnits = () => {
  const [units] = useState<Unit[]>(mockUnits);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [dialogOpen, setDialogOpen] = useState(false);

  const toggleKey = (id: string) => setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Unidades</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus size={16} className="mr-2" />
              Nova Unidade
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Nova Unidade</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setDialogOpen(false); }}>
              <div className="space-y-2">
                <Label className="text-foreground">Nome</Label>
                <Input className="bg-input border-border text-foreground" placeholder="Nome da unidade" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Slug</Label>
                <Input className="bg-input border-border text-foreground" placeholder="nome-da-unidade" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">API Key Asaas</Label>
                <Input className="bg-input border-border text-foreground" placeholder="$aact_..." type="password" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Base URL Asaas</Label>
                <Input className="bg-input border-border text-foreground" defaultValue="https://sandbox.asaas.com/api/v3" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Webhook Token</Label>
                <Input className="bg-input border-border text-foreground" placeholder="Token de validação" />
              </div>
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                Salvar
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {units.map((unit) => (
          <div key={unit.id} className="glass-card p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{unit.name}</h3>
                <p className="text-xs text-muted-foreground">Slug: {unit.slug}</p>
              </div>
              <div className="flex gap-1">
                <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                  <Pencil size={14} />
                </button>
                <button className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20">API Key:</span>
                <code className="text-foreground flex-1">
                  {showKeys[unit.id] ? unit.asaasApiKey : "••••••••••••"}
                </code>
                <button onClick={() => toggleKey(unit.id)} className="text-muted-foreground hover:text-foreground">
                  {showKeys[unit.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20">Base URL:</span>
                <code className="text-foreground">{unit.asaasBaseUrl}</code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20">Webhook:</span>
                <code className="text-foreground">{unit.webhookToken}</code>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminUnits;
