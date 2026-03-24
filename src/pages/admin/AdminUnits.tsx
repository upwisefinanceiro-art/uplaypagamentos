import { useEffect, useState } from "react";
import { Plus, Pencil, Eye, EyeOff, Loader2, MessageCircle, Wifi, WifiOff, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_WHATSAPP = "31996726918";

interface UnitRow {
  id: string;
  name: string;
  active: boolean;
  cnpj: string | null;
  address: string | null;
  phone: string | null;
  asaas_api_key: string | null;
  asaas_base_url: string | null;
  asaas_webhook_token: string | null;
  whatsapp_financeiro: string | null;
  usar_whatsapp_padrao: boolean;
}

const AdminUnits = () => {
  const { toast } = useToast();
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingUnit, setTestingUnit] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formCnpj, setFormCnpj] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("https://api.asaas.com/v3");
  const [formWebhookToken, setFormWebhookToken] = useState("");
  const [formWhatsapp, setFormWhatsapp] = useState("");
  const [formUsarPadrao, setFormUsarPadrao] = useState(true);

  const fetchUnits = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("units")
      .select("*")
      .order("name");
    if (data) setUnits(data as unknown as UnitRow[]);
    setLoading(false);
  };

  useEffect(() => { fetchUnits(); }, []);

  const toggleKey = (id: string) => setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }));

  const resetForm = () => {
    setFormName("");
    setFormCnpj("");
    setFormAddress("");
    setFormPhone("");
    setFormApiKey("");
    setFormBaseUrl("https://api.asaas.com/v3");
    setFormWebhookToken("");
    setFormWhatsapp("");
    setFormUsarPadrao(true);
    setEditingUnit(null);
  };

  const openEdit = (unit: UnitRow) => {
    setEditingUnit(unit);
    setFormName(unit.name);
    setFormCnpj(unit.cnpj || "");
    setFormAddress(unit.address || "");
    setFormPhone(unit.phone || "");
    setFormApiKey(unit.asaas_api_key || "");
    setFormBaseUrl(unit.asaas_base_url || "https://api.asaas.com/v3");
    setFormWebhookToken(unit.asaas_webhook_token || "");
    setFormWhatsapp(unit.whatsapp_financeiro || "");
    setFormUsarPadrao(unit.usar_whatsapp_padrao);
    setDialogOpen(true);
  };

  const openNew = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      name: formName.trim(),
      cnpj: formCnpj.trim() || null,
      address: formAddress.trim() || null,
      phone: formPhone.trim() || null,
      asaas_api_key: formApiKey.trim() || null,
      asaas_base_url: formBaseUrl.trim() || "https://api.asaas.com/v3",
      asaas_webhook_token: formWebhookToken.trim() || null,
      whatsapp_financeiro: formWhatsapp.trim() || null,
      usar_whatsapp_padrao: formUsarPadrao,
    };

    let error;
    if (editingUnit) {
      ({ error } = await supabase.from("units").update(payload as any).eq("id", editingUnit.id));
    } else {
      ({ error } = await supabase.from("units").insert(payload as any));
    }

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingUnit ? "Unidade atualizada" : "Unidade criada" });
      setDialogOpen(false);
      resetForm();
      fetchUnits();
    }
  };

  const getWhatsAppDisplay = (unit: UnitRow) => {
    if (unit.usar_whatsapp_padrao) return `${DEFAULT_WHATSAPP} (padrão)`;
    return unit.whatsapp_financeiro || `${DEFAULT_WHATSAPP} (padrão)`;
  };

  const handleTestConnection = async (unitId: string) => {
    setTestingUnit(unitId);
    try {
      const { data, error } = await supabase.functions.invoke("test-asaas-connection", {
        body: { unit_id: unitId },
      });

      if (error) {
        toast({ title: "Erro ao testar", description: error.message, variant: "destructive" });
        return;
      }

      if (data?.success) {
        const env = data.environment === "production" ? "Produção" : "Sandbox";
        toast({
          title: "✅ Conexão válida",
          description: `${data.unit_name} — ${env} — Saldo: R$ ${Number(data.balance).toFixed(2)}`,
        });
      } else {
        toast({ title: "❌ Falha na conexão", description: data?.error || "Erro desconhecido", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setTestingUnit(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Unidades</h1>
        <Button onClick={openNew} className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <Plus size={16} className="mr-2" />
          Nova Unidade
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingUnit ? "Editar Unidade" : "Nova Unidade"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSave}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-foreground text-xs">Nome *</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Nome da unidade" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground text-xs">CNPJ</Label>
                <Input value={formCnpj} onChange={(e) => setFormCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-foreground text-xs">Endereço</Label>
                <Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Endereço" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground text-xs">Telefone</Label>
                <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="(31) 9999-9999" />
              </div>
            </div>

            <div className="border-t border-border pt-4 mt-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3">Integração Asaas</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">API Key Asaas</Label>
                  <Input value={formApiKey} onChange={(e) => setFormApiKey(e.target.value)} placeholder="$aact_..." type="password" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">Base URL Asaas</Label>
                  <Input value={formBaseUrl} onChange={(e) => setFormBaseUrl(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">Webhook Token</Label>
                  <Input value={formWebhookToken} onChange={(e) => setFormWebhookToken(e.target.value)} placeholder="Token de validação" />
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-4 mt-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <MessageCircle size={14} className="text-success" />
                WhatsApp do Financeiro
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-foreground text-xs">Usar número padrão ({DEFAULT_WHATSAPP})</Label>
                  <Switch checked={formUsarPadrao} onCheckedChange={setFormUsarPadrao} />
                </div>
                {!formUsarPadrao && (
                  <div className="space-y-1.5">
                    <Label className="text-foreground text-xs">Número WhatsApp desta unidade</Label>
                    <Input
                      value={formWhatsapp}
                      onChange={(e) => setFormWhatsapp(e.target.value)}
                      placeholder="31999999999"
                    />
                    <p className="text-[10px] text-muted-foreground">Apenas números, com DDD. Ex: 31996726918</p>
                  </div>
                )}
              </div>
            </div>

            <Button type="submit" disabled={saving} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
              {saving && <Loader2 size={14} className="mr-2 animate-spin" />}
              Salvar
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="space-y-3">
        {units.map((unit) => (
          <div key={unit.id} className="glass-card p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{unit.name}</h3>
                  {!unit.active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-medium">Inativa</span>
                  )}
                </div>
                {unit.cnpj && <p className="text-xs text-muted-foreground">CNPJ: {unit.cnpj}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(unit)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                  <Pencil size={14} />
                </button>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20">API Key:</span>
                <code className="text-foreground flex-1 truncate">
                  {showKeys[unit.id] ? (unit.asaas_api_key || "—") : "••••••••••••"}
                </code>
                <button onClick={() => toggleKey(unit.id)} className="text-muted-foreground hover:text-foreground">
                  {showKeys[unit.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20">Base URL:</span>
                <code className="text-foreground truncate">{unit.asaas_base_url || "—"}</code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20">Webhook:</span>
                <code className="text-foreground truncate">{unit.asaas_webhook_token || "—"}</code>
              </div>
              <div className="flex items-center gap-2">
                <MessageCircle size={12} className="text-success flex-shrink-0" />
                <span className="text-muted-foreground w-16">WhatsApp:</span>
                <code className="text-foreground">{getWhatsAppDisplay(unit)}</code>
              </div>
            </div>
          </div>
        ))}
        {units.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-10">Nenhuma unidade cadastrada</p>
        )}
      </div>
    </div>
  );
};

export default AdminUnits;
