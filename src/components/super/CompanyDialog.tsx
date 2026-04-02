import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Building2, UserPlus } from "lucide-react";
import type { Company } from "@/pages/super/SuperCompanies";
import CompanyAccessModal from "@/components/super/CompanyAccessModal";

interface UnitOption {
  id: string;
  name: string;
  company_id: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
  onSaved: () => void;
}

const CompanyDialog = ({ open, onOpenChange, company, onSaved }: Props) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

  // Company fields
  const [name, setName] = useState("");
  const [systemName, setSystemName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#3B82F6");
  const [secondaryColor, setSecondaryColor] = useState("#1E40AF");
  const [whatsapp, setWhatsapp] = useState("");
  const [plan, setPlan] = useState("FREE");
  const [status, setStatus] = useState("ATIVO");
  const [maxUnits, setMaxUnits] = useState("1");
  const [maxUsers, setMaxUsers] = useState("10");

  // Auto-create admin
  const [createAdmin, setCreateAdmin] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [createdAdminInfo, setCreatedAdminInfo] = useState<{ companyName: string; adminName: string; adminEmail: string; companyPhone: string | null } | null>(null);

  const isEditing = !!company;

  useEffect(() => {
    if (!open) return;
    supabase.from("units").select("id, name, company_id").eq("active", true).then(({ data }) => {
      setUnits((data as UnitOption[]) ?? []);
    });
  }, [open]);

  useEffect(() => {
    if (company) {
      setName(company.name);
      setSystemName(company.system_name);
      setCnpj((company as any).cnpj ?? "");
      setEmail((company as any).email ?? "");
      setPhone((company as any).phone ?? "");
      setLogoUrl(company.logo_url ?? "");
      setPrimaryColor(company.primary_color);
      setSecondaryColor(company.secondary_color);
      setWhatsapp(company.whatsapp_financeiro ?? "");
      setPlan(company.plan);
      setStatus(company.status);
      setMaxUnits(String(company.max_units));
      setMaxUsers(String(company.max_users));
      setSelectedUnitIds(units.filter(u => u.company_id === company.id).map(u => u.id));
      setCreateAdmin(false);
      setAdminName("");
      setAdminEmail("");
    } else {
      setName(""); setSystemName(""); setCnpj(""); setEmail(""); setPhone("");
      setLogoUrl(""); setPrimaryColor("#3B82F6"); setSecondaryColor("#1E40AF");
      setWhatsapp(""); setPlan("FREE"); setStatus("ATIVO");
      setMaxUnits("1"); setMaxUsers("10"); setSelectedUnitIds([]);
      setCreateAdmin(true); setAdminName(""); setAdminEmail("");
    }
  }, [company, open, units]);

  const toggleUnit = (unitId: string) => {
    setSelectedUnitIds(prev =>
      prev.includes(unitId) ? prev.filter(id => id !== unitId) : [...prev, unitId]
    );
  };

  const handleSave = async () => {
    if (!name.trim() || !systemName.trim()) {
      toast({ title: "Preencha o nome e nome do sistema", variant: "destructive" });
      return;
    }

    if (!isEditing && createAdmin && (!adminName.trim() || !adminEmail.trim())) {
      toast({ title: "Preencha nome e e-mail do administrador", variant: "destructive" });
      return;
    }

    setSaving(true);

    const payload = {
      name: name.trim(),
      system_name: systemName.trim(),
      cnpj: cnpj.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      logo_url: logoUrl.trim() || null,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
      whatsapp_financeiro: whatsapp.trim() || null,
      plan,
      status,
      max_units: parseInt(maxUnits) || 1,
      max_users: parseInt(maxUsers) || 10,
    };

    let companyId = company?.id;
    let error;

    if (company) {
      ({ error } = await supabase.from("companies").update(payload).eq("id", company.id));
    } else {
      const res = await supabase.from("companies").insert(payload).select("id").single();
      error = res.error;
      companyId = res.data?.id;
    }

    if (error) {
      setSaving(false);
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }

    // Update unit linkages
    if (companyId) {
      const previouslyLinked = units.filter(u => u.company_id === companyId).map(u => u.id);
      const toUnlink = previouslyLinked.filter(id => !selectedUnitIds.includes(id));
      const toLink = selectedUnitIds.filter(id => !previouslyLinked.includes(id));

      if (toUnlink.length > 0) {
        await supabase.from("units").update({ company_id: null }).in("id", toUnlink);
      }
      if (toLink.length > 0) {
        await supabase.from("units").update({ company_id: companyId }).in("id", toLink);
      }
    }

    // Auto-create admin for new company
    if (!isEditing && createAdmin && companyId && adminEmail.trim()) {
      const firstLinkedUnit = selectedUnitIds[0] || null;
      const { data: session } = await supabase.auth.getSession();
      
      const { data: adminResult, error: adminError } = await supabase.functions.invoke(
        "create-company-admin",
        {
          body: {
            company_id: companyId,
            admin_name: adminName.trim(),
            admin_email: adminEmail.trim(),
            unit_id: firstLinkedUnit,
          },
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`,
          },
        }
      );

      if (adminError || adminResult?.error) {
        toast({
          title: "Empresa criada, mas erro ao criar admin",
          description: adminResult?.error || adminError?.message,
          variant: "destructive",
        });
      } else {
        toast({ title: "Empresa e administrador criados!", description: "Senha padrão: 12345678" });
        setSaving(false);
        setCreatedAdminInfo({
          companyName: name.trim(),
          adminName: adminName.trim(),
          adminEmail: adminEmail.trim(),
          companyPhone: phone.trim() || null,
        });
        setAccessModalOpen(true);
        onSaved();
        return;
      }
    }

    setSaving(false);
    toast({ title: company ? "Empresa atualizada!" : "Empresa criada!" });
    onSaved();
  };

  const availableUnits = units.filter(u => !u.company_id || u.company_id === company?.id);
  const linkedElsewhere = units.filter(u => u.company_id && u.company_id !== company?.id);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{company ? "Editar Empresa" : "Nova Empresa"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Name & System Name */}
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

          {/* CNPJ, Email, Phone */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>CNPJ</Label>
              <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0001-00" />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@empresa.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(31) 99999-9999" />
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

          {/* Unit Linking */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Building2 size={14} />
              Unidades Vinculadas
            </Label>
            {availableUnits.length === 0 && linkedElsewhere.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma unidade cadastrada.</p>
            ) : (
              <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/20">
                {availableUnits.map(unit => (
                  <label key={unit.id} className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={selectedUnitIds.includes(unit.id)}
                      onCheckedChange={() => toggleUnit(unit.id)}
                    />
                    <span className="text-foreground">{unit.name}</span>
                  </label>
                ))}
                {linkedElsewhere.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-[10px] text-muted-foreground mb-1">Vinculadas a outra empresa:</p>
                    {linkedElsewhere.map(unit => (
                      <p key={unit.id} className="text-xs text-muted-foreground pl-6">• {unit.name}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Auto-create Admin (only for new companies) */}
          {!isEditing && (
            <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/20">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                <Checkbox
                  checked={createAdmin}
                  onCheckedChange={(v) => setCreateAdmin(!!v)}
                />
                <UserPlus size={14} />
                <span className="text-foreground">Criar administrador automaticamente</span>
              </label>
              {createAdmin && (
                <div className="grid gap-3 sm:grid-cols-2 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome do Admin</Label>
                    <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Nome completo" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">E-mail do Admin</Label>
                    <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@empresa.com" />
                  </div>
                  <p className="text-[10px] text-muted-foreground sm:col-span-2">
                    Senha padrão: <strong>12345678</strong> — o admin deverá trocar no primeiro acesso.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          {name && (
            <div className="p-3 rounded-lg border border-border bg-muted/30">
              <p className="text-xs text-muted-foreground mb-2">Preview da Marca</p>
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  <img src={logoUrl} alt={name} className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {name.charAt(0).toUpperCase()}
                  </div>
                )}
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

    {createdAdminInfo && (
      <CompanyAccessModal
        open={accessModalOpen}
        onOpenChange={setAccessModalOpen}
        companyName={createdAdminInfo.companyName}
        adminName={createdAdminInfo.adminName}
        adminEmail={createdAdminInfo.adminEmail}
        companyPhone={createdAdminInfo.companyPhone}
      />
    )}
    </>
  );
};

export default CompanyDialog;
