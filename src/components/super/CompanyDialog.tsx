import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Company } from "@/pages/super/SuperCompanies";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
  onSaved: () => void;
}

const CompanyDialog = ({ open, onOpenChange, company, onSaved }: Props) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [systemName, setSystemName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#3B82F6");
  const [secondaryColor, setSecondaryColor] = useState("#1E40AF");
  const [whatsapp, setWhatsapp] = useState("");
  const [plan, setPlan] = useState("FREE");
  const [status, setStatus] = useState("ATIVO");
  const [maxUnits, setMaxUnits] = useState("1");
  const [maxUsers, setMaxUsers] = useState("10");

  useEffect(() => {
    if (company) {
      setName(company.name);
      setSystemName(company.system_name);
      setLogoUrl(company.logo_url ?? "");
      setPrimaryColor(company.primary_color);
      setSecondaryColor(company.secondary_color);
      setWhatsapp(company.whatsapp_financeiro ?? "");
      setPlan(company.plan);
      setStatus(company.status);
      setMaxUnits(String(company.max_units));
      setMaxUsers(String(company.max_users));
    } else {
      setName("");
      setSystemName("");
      setLogoUrl("");
      setPrimaryColor("#3B82F6");
      setSecondaryColor("#1E40AF");
      setWhatsapp("");
      setPlan("FREE");
      setStatus("ATIVO");
      setMaxUnits("1");
      setMaxUsers("10");
    }
  }, [company, open]);

  const handleSave = async () => {
    if (!name.trim() || !systemName.trim()) {
      toast({ title: "Preencha o nome e nome do sistema", variant: "destructive" });
      return;
    }

    setSaving(true);

    const payload = {
      name: name.trim(),
      system_name: systemName.trim(),
      logo_url: logoUrl.trim() || null,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
      whatsapp_financeiro: whatsapp.trim() || null,
      plan,
      status,
      max_units: parseInt(maxUnits) || 1,
      max_users: parseInt(maxUsers) || 10,
    };

    let error;
    if (company) {
      ({ error } = await supabase.from("companies").update(payload).eq("id", company.id));
    } else {
      ({ error } = await supabase.from("companies").insert(payload));
    }

    setSaving(false);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: company ? "Empresa atualizada!" : "Empresa criada!" });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{company ? "Editar Empresa" : "Nova Empresa"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome da Empresa *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Escola XYZ" />
            </div>
            <div className="space-y-1.5">
              <Label>Nome do Sistema *</Label>
              <Input value={systemName} onChange={(e) => setSystemName(e.target.value)} placeholder="Ex: EscolaXYZ App" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>URL do Logo</Label>
            <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cor Principal</Label>
              <div className="flex gap-2 items-center">
                <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-9 w-12 rounded border border-border cursor-pointer" />
                <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cor Secundária</Label>
              <div className="flex gap-2 items-center">
                <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="h-9 w-12 rounded border border-border cursor-pointer" />
                <Input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="flex-1" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>WhatsApp Financeiro</Label>
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="31999999999" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Plano</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FREE">Free</SelectItem>
                  <SelectItem value="BASIC">Basic</SelectItem>
                  <SelectItem value="PRO">Pro</SelectItem>
                  <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ATIVO">Ativo</SelectItem>
                  <SelectItem value="INATIVO">Inativo</SelectItem>
                  <SelectItem value="BLOQUEADO">Bloqueado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Máx. Unidades</Label>
              <Input type="number" min="1" value={maxUnits} onChange={(e) => setMaxUnits(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Máx. Usuários</Label>
              <Input type="number" min="1" value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} />
            </div>
          </div>

          {/* Preview */}
          {name && (
            <div className="p-3 rounded-lg border border-border bg-muted/30">
              <p className="text-xs text-muted-foreground mb-2">Preview</p>
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: primaryColor }}
                >
                  {name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: primaryColor }}>{name}</p>
                  <p className="text-xs text-muted-foreground">{systemName}</p>
                </div>
              </div>
            </div>
          )}

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Salvando..." : company ? "Salvar Alterações" : "Criar Empresa"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CompanyDialog;
