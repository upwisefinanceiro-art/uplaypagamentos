import { useEffect, useState } from "react";
import { Plus, Pencil, Eye, EyeOff, Loader2, MessageCircle, Wifi, WifiOff, Building2, User, MapPin, Mail, Phone, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import UnitAccessModal from "@/components/admin/UnitAccessModal";

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
  razao_social: string | null;
  tipo_cadastro: string | null;
  cpf: string | null;
  rg_ie: string | null;
  cidade: string | null;
  estado: string | null;
  bairro: string | null;
  cep: string | null;
  whatsapp: string | null;
  email_empresa: string | null;
  email_acesso: string | null;
}

const ESTADOS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
];

const AdminUnits = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingUnit, setTestingUnit] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; unit: UnitRow | null; loading: boolean; deps: string | null }>({
    open: false, unit: null, loading: false, deps: null,
  });

  // Access modal
  const [accessModal, setAccessModal] = useState<{ open: boolean; name: string; email: string; whatsapp: string | null }>({
    open: false, name: "", email: "", whatsapp: null,
  });

  // Form state
  const [form, setForm] = useState({
    name: "", razao_social: "", tipo_cadastro: "PJ", cnpj: "", cpf: "", rg_ie: "",
    address: "", bairro: "", cidade: "", estado: "", cep: "",
    phone: "", whatsapp: "", email_empresa: "", email_acesso: "",
    asaas_api_key: "", asaas_base_url: "https://api.asaas.com/v3", asaas_webhook_token: "",
    whatsapp_financeiro: "", usar_whatsapp_padrao: true,
  });

  const setField = (key: string, value: string | boolean) => setForm(prev => ({ ...prev, [key]: value }));

  const fetchUnits = async () => {
    setLoading(true);
    const { data } = await supabase.from("units").select("*").order("name");
    if (data) setUnits(data as unknown as UnitRow[]);
    setLoading(false);
  };

  useEffect(() => { fetchUnits(); }, []);

  // Fetch current admin's company_id
  useEffect(() => {
    const fetchCompanyId = async () => {
      if (!profile?.unit_id) return;
      const { data } = await supabase.from("units").select("company_id").eq("id", profile.unit_id).maybeSingle();
      if (data?.company_id) setCompanyId(data.company_id);
    };
    fetchCompanyId();
  }, [profile?.unit_id]);

  const resetForm = () => {
    setForm({
      name: "", razao_social: "", tipo_cadastro: "PJ", cnpj: "", cpf: "", rg_ie: "",
      address: "", bairro: "", cidade: "", estado: "", cep: "",
      phone: "", whatsapp: "", email_empresa: "", email_acesso: "",
      asaas_api_key: "", asaas_base_url: "https://api.asaas.com/v3", asaas_webhook_token: "",
      whatsapp_financeiro: "", usar_whatsapp_padrao: true,
    });
    setEditingUnit(null);
  };

  const openEdit = (unit: UnitRow) => {
    setEditingUnit(unit);
    setForm({
      name: unit.name || "",
      razao_social: unit.razao_social || "",
      tipo_cadastro: unit.tipo_cadastro || "PJ",
      cnpj: unit.cnpj || "",
      cpf: unit.cpf || "",
      rg_ie: unit.rg_ie || "",
      address: unit.address || "",
      bairro: unit.bairro || "",
      cidade: unit.cidade || "",
      estado: unit.estado || "",
      cep: unit.cep || "",
      phone: unit.phone || "",
      whatsapp: unit.whatsapp || "",
      email_empresa: unit.email_empresa || "",
      email_acesso: unit.email_acesso || "",
      asaas_api_key: unit.asaas_api_key || "",
      asaas_base_url: unit.asaas_base_url || "https://api.asaas.com/v3",
      asaas_webhook_token: unit.asaas_webhook_token || "",
      whatsapp_financeiro: unit.whatsapp_financeiro || "",
      usar_whatsapp_padrao: unit.usar_whatsapp_padrao,
    });
    setDialogOpen(true);
  };

  const openNew = () => { resetForm(); setDialogOpen(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast({ title: "Nome do parceiro é obrigatório", variant: "destructive" });
      return;
    }
    if (form.tipo_cadastro === "PJ" && !form.cnpj.trim()) {
      toast({ title: "CNPJ é obrigatório para Pessoa Jurídica", variant: "destructive" });
      return;
    }
    if (form.tipo_cadastro === "PF" && !form.cpf.trim()) {
      toast({ title: "CPF é obrigatório para Pessoa Física", variant: "destructive" });
      return;
    }
    if (!editingUnit && !form.email_acesso.trim()) {
      toast({ title: "E-mail de acesso é obrigatório", variant: "destructive" });
      return;
    }
    if (!form.phone.trim() && !form.whatsapp.trim()) {
      toast({ title: "Telefone ou WhatsApp é obrigatório", variant: "destructive" });
      return;
    }

    setSaving(true);

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      razao_social: form.razao_social.trim() || null,
      tipo_cadastro: form.tipo_cadastro,
      cnpj: form.tipo_cadastro === "PJ" ? form.cnpj.trim() || null : null,
      cpf: form.tipo_cadastro === "PF" ? form.cpf.trim() || null : null,
      rg_ie: form.rg_ie.trim() || null,
      address: form.address.trim() || null,
      bairro: form.bairro.trim() || null,
      cidade: form.cidade.trim() || null,
      estado: form.estado.trim() || null,
      cep: form.cep.trim() || null,
      phone: form.phone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      email_empresa: form.email_empresa.trim() || null,
      email_acesso: form.email_acesso.trim() || null,
      asaas_api_key: form.asaas_api_key.trim() || null,
      asaas_base_url: form.asaas_base_url.trim() || "https://api.asaas.com/v3",
      asaas_webhook_token: form.asaas_webhook_token.trim() || null,
      whatsapp_financeiro: form.whatsapp_financeiro.trim() || null,
      usar_whatsapp_padrao: form.usar_whatsapp_padrao,
    };

    let error;
    let newUnitId: string | null = null;
    if (editingUnit) {
      ({ error } = await supabase.from("units").update(payload as any).eq("id", editingUnit.id));
    } else {
      // Auto-assign company_id for new units
      if (companyId) {
        payload.company_id = companyId;
      }
      const res = await supabase.from("units").insert(payload as any).select("id").single();
      error = res.error;
      newUnitId = res.data?.id ?? null;
    }

    if (error) {
      setSaving(false);
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }

    // Auto-create user for new units
    if (!editingUnit && form.email_acesso.trim()) {
      try {
        const { data: userData, error: userError } = await supabase.functions.invoke("create-user", {
          body: {
            cpf: form.tipo_cadastro === "PF" ? form.cpf.trim() : (form.cnpj.trim() || "00000000000"),
            full_name: form.name.trim(),
            phone: form.whatsapp.trim() || form.phone.trim() || null,
            password: "12345678",
            role: "ADMIN_UNIDADE",
            email_override: form.email_acesso.trim(),
            unit_id: newUnitId,
          },
        });

        if (userError || !userData?.success) {
          toast({
            title: "Unidade criada, mas erro ao criar usuário",
            description: userData?.error || userError?.message || "Erro desconhecido",
            variant: "destructive",
          });
        } else {
          // Show access modal
          setAccessModal({
            open: true,
            name: form.name.trim(),
            email: form.email_acesso.trim(),
            whatsapp: form.whatsapp.trim() || form.phone.trim() || null,
          });
        }
      } catch (err: any) {
        toast({ title: "Unidade criada, mas erro ao criar usuário", description: err.message, variant: "destructive" });
      }
    } else {
      toast({ title: editingUnit ? "Parceiro atualizado" : "Parceiro criado" });
    }

    setSaving(false);
    setDialogOpen(false);
    resetForm();
    fetchUnits();
  };

  const getWhatsAppDisplay = (unit: UnitRow) => {
    if (unit.usar_whatsapp_padrao) return `${DEFAULT_WHATSAPP} (padrão)`;
    return unit.whatsapp_financeiro || `${DEFAULT_WHATSAPP} (padrão)`;
  };

  const handleTestConnection = async (unitId: string) => {
    setTestingUnit(unitId);
    try {
      const { data, error } = await supabase.functions.invoke("test-asaas-connection", { body: { unit_id: unitId } });
      if (error) {
        toast({ title: "Erro ao testar", description: error.message, variant: "destructive" });
        return;
      }
      if (data?.success) {
        const env = data.environment === "production" ? "Produção" : "Sandbox";
        toast({ title: "✅ Conexão válida", description: `${data.unit_name} — ${env} — Saldo: R$ ${Number(data.balance).toFixed(2)}` });
      } else {
        toast({ title: "❌ Falha na conexão", description: data?.error || "Erro desconhecido", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setTestingUnit(null);
    }
  };

  const handleDeleteUnit = async () => {
    const unit = deleteConfirm.unit;
    if (!unit) return;
    setDeleteConfirm(prev => ({ ...prev, loading: true }));

    // Check dependencies
    const [profilesRes, studentsRes, contractsRes, paymentsRes] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("unit_id", unit.id),
      supabase.from("students").select("id", { count: "exact", head: true }).eq("unit_id", unit.id),
      supabase.from("contracts").select("id", { count: "exact", head: true }).eq("unit_id", unit.id),
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("unit_id", unit.id),
    ]);

    const profileCount = profilesRes.count ?? 0;
    const studentCount = studentsRes.count ?? 0;
    const contractCount = contractsRes.count ?? 0;
    const paymentCount = paymentsRes.count ?? 0;
    const total = profileCount + studentCount + contractCount + paymentCount;

    if (total > 0) {
      const parts = [];
      if (profileCount > 0) parts.push(`${profileCount} usuário(s)`);
      if (studentCount > 0) parts.push(`${studentCount} aluno(s)`);
      if (contractCount > 0) parts.push(`${contractCount} contrato(s)`);
      if (paymentCount > 0) parts.push(`${paymentCount} cobrança(s)`);
      setDeleteConfirm(prev => ({ ...prev, loading: false, deps: parts.join(", ") }));
      return;
    }

    const { error } = await supabase.from("units").delete().eq("id", unit.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Unidade excluída com sucesso" });
      fetchUnits();
    }
    setDeleteConfirm({ open: false, unit: null, loading: false, deps: null });
  };
  const toggleKey = (id: string) => setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));


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
        <h1 className="text-xl font-bold text-foreground">Parceiros / Unidades</h1>
        <Button onClick={openNew} className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <Plus size={16} className="mr-2" /> Novo Parceiro
        </Button>
      </div>

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingUnit ? "Editar Parceiro" : "Novo Parceiro"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSave}>
            {/* IDENTIFICAÇÃO */}
            <p className="text-xs font-semibold text-muted-foreground border-b border-border pb-1">Identificação</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nome fantasia / Parceiro *</Label>
                <Input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="Nome do parceiro" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Razão social</Label>
                <Input value={form.razao_social} onChange={e => setField("razao_social", e.target.value)} placeholder="Razão social (opcional)" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo *</Label>
                <Select value={form.tipo_cadastro} onValueChange={v => setField("tipo_cadastro", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                    <SelectItem value="PF">Pessoa Física</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.tipo_cadastro === "PJ" ? (
                <div className="space-y-1">
                  <Label className="text-xs">CNPJ *</Label>
                  <Input value={form.cnpj} onChange={e => setField("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs">CPF *</Label>
                  <Input value={form.cpf} onChange={e => setField("cpf", e.target.value)} placeholder="000.000.000-00" />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">RG / IE</Label>
                <Input value={form.rg_ie} onChange={e => setField("rg_ie", e.target.value)} placeholder="Documento complementar" />
              </div>
            </div>

            {/* ENDEREÇO */}
            <p className="text-xs font-semibold text-muted-foreground border-b border-border pb-1 mt-4">Endereço</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Endereço completo</Label>
                <Input value={form.address} onChange={e => setField("address", e.target.value)} placeholder="Rua, número" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bairro</Label>
                <Input value={form.bairro} onChange={e => setField("bairro", e.target.value)} placeholder="Bairro" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Cidade</Label>
                <Input value={form.cidade} onChange={e => setField("cidade", e.target.value)} placeholder="Cidade" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Estado</Label>
                <Select value={form.estado} onValueChange={v => setField("estado", v)}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    {ESTADOS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">CEP</Label>
                <Input value={form.cep} onChange={e => setField("cep", e.target.value)} placeholder="00000-000" />
              </div>
            </div>

            {/* CONTATO */}
            <p className="text-xs font-semibold text-muted-foreground border-b border-border pb-1 mt-4">Contato</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Telefone *</Label>
                <Input value={form.phone} onChange={e => setField("phone", e.target.value)} placeholder="(31) 9999-9999" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">WhatsApp</Label>
                <Input value={form.whatsapp} onChange={e => setField("whatsapp", e.target.value)} placeholder="31999999999" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">E-mail da empresa</Label>
                <Input value={form.email_empresa} onChange={e => setField("email_empresa", e.target.value)} placeholder="contato@empresa.com" type="email" />
              </div>
            </div>

            {/* ACESSO */}
            <div className="border border-primary/30 bg-primary/5 rounded-lg p-3 mt-4">
              <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1.5">
                <Mail size={14} /> Dados de Acesso à Plataforma
              </p>
              <div className="space-y-1">
                <Label className="text-xs">E-mail de acesso do parceiro {!editingUnit && "*"}</Label>
                <Input
                  value={form.email_acesso}
                  onChange={e => setField("email_acesso", e.target.value)}
                  placeholder="login@parceiro.com"
                  type="email"
                />
                <p className="text-[10px] text-muted-foreground">Este e-mail será usado para acessar a plataforma. Senha padrão: 12345678</p>
              </div>
            </div>

            {/* ASAAS */}
            <div className="border-t border-border pt-4 mt-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3">Integração Asaas</p>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">API Key Asaas</Label>
                  <Input value={form.asaas_api_key} onChange={e => setField("asaas_api_key", e.target.value)} placeholder="$aact_..." type="password" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Base URL Asaas</Label>
                  <Input value={form.asaas_base_url} onChange={e => setField("asaas_base_url", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Webhook Token</Label>
                  <Input value={form.asaas_webhook_token} onChange={e => setField("asaas_webhook_token", e.target.value)} placeholder="Token de validação" />
                </div>
              </div>
            </div>

            {/* WHATSAPP FINANCEIRO */}
            <div className="border-t border-border pt-4 mt-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <MessageCircle size={14} className="text-green-600" /> WhatsApp do Financeiro
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Usar número padrão ({DEFAULT_WHATSAPP})</Label>
                  <Switch checked={form.usar_whatsapp_padrao} onCheckedChange={v => setField("usar_whatsapp_padrao", v)} />
                </div>
                {!form.usar_whatsapp_padrao && (
                  <div className="space-y-1">
                    <Label className="text-xs">Número WhatsApp desta unidade</Label>
                    <Input value={form.whatsapp_financeiro} onChange={e => setField("whatsapp_financeiro", e.target.value)} placeholder="31999999999" />
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

      {/* Access Modal */}
      <UnitAccessModal
        open={accessModal.open}
        onOpenChange={(o) => setAccessModal(prev => ({ ...prev, open: o }))}
        partnerName={accessModal.name}
        adminEmail={accessModal.email}
        whatsapp={accessModal.whatsapp}
      />

      {/* LISTING */}
      <div className="space-y-3">
        {units.map((unit) => (
          <div key={unit.id} className="glass-card p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-foreground">{unit.name}</h3>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {unit.tipo_cadastro === "PF" ? "PF" : "PJ"}
                  </Badge>
                  {!unit.active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-medium">Inativa</span>
                  )}
                </div>
                {unit.razao_social && <p className="text-[11px] text-muted-foreground">{unit.razao_social}</p>}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(unit)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setDeleteConfirm({ open: true, unit, loading: false, deps: null })}
                  className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs mb-3">
              <div className="flex items-center gap-1.5">
                <Building2 size={11} className="text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">{unit.tipo_cadastro === "PF" ? "CPF:" : "CNPJ:"}</span>
                <span className="text-foreground">{(unit.tipo_cadastro === "PF" ? unit.cpf : unit.cnpj) || "—"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin size={11} className="text-muted-foreground flex-shrink-0" />
                <span className="text-foreground truncate">{[unit.cidade, unit.estado].filter(Boolean).join(" - ") || "—"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Phone size={11} className="text-muted-foreground flex-shrink-0" />
                <span className="text-foreground">{unit.phone || "—"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MessageCircle size={11} className="text-green-600 flex-shrink-0" />
                <span className="text-foreground">{unit.whatsapp || getWhatsAppDisplay(unit)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Mail size={11} className="text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">Acesso:</span>
                <span className="text-foreground truncate">{unit.email_acesso || "—"}</span>
              </div>
              {unit.email_empresa && (
                <div className="flex items-center gap-1.5">
                  <Mail size={11} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-foreground truncate">{unit.email_empresa}</span>
                </div>
              )}
            </div>

            {/* Asaas section */}
            <details className="text-xs">
              <summary className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors mb-2">Integração Asaas</summary>
              <div className="space-y-1.5 pl-2">
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
              </div>
            </details>

            <div className="mt-3 pt-3 border-t border-border">
              <Button
                size="sm" variant="outline"
                onClick={() => handleTestConnection(unit.id)}
                disabled={testingUnit === unit.id || !unit.asaas_api_key}
                className="text-xs"
              >
                {testingUnit === unit.id ? (
                  <Loader2 size={12} className="mr-1.5 animate-spin" />
                ) : unit.asaas_api_key ? (
                  <Wifi size={12} className="mr-1.5" />
                ) : (
                  <WifiOff size={12} className="mr-1.5" />
                )}
                {testingUnit === unit.id ? "Testando..." : "Testar conexão Asaas"}
              </Button>
              {!unit.asaas_api_key && (
                <span className="text-[10px] text-destructive ml-2">API Key não configurada</span>
              )}
            </div>
          </div>
        ))}
        {units.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-10">Nenhum parceiro cadastrado</p>
        )}
      </div>
    </div>
  );
};

export default AdminUnits;
