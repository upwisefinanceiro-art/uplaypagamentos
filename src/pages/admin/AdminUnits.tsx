import { useEffect, useState } from "react";
import { Plus, Pencil, Loader2, MessageCircle, Wifi, WifiOff, Building2, MapPin, Mail, Phone, Trash2, Shield, ShieldOff, ShieldAlert, Filter, Copy } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import UnitAccessModal from "@/components/admin/UnitAccessModal";

const DEFAULT_WHATSAPP = "31996726918";

type UnitStatus = "ATIVO" | "INATIVO" | "BLOQUEADO";

interface UnitRow {
  id: string;
  name: string;
  active: boolean;
  status: UnitStatus;
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
  cora_client_id: string | null;
  cora_certificate: string | null;
  cora_private_key: string | null;
  cora_environment: string | null;
  preferred_bank: string | null;
  partnership_plan: string | null;
  uplay_fee_type: string | null;
  uplay_fee_value: number | null;
  uplay_balance: number | null;
}

const ESTADOS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
];

const STATUS_CONFIG: Record<UnitStatus, { label: string; color: string; bgClass: string; borderClass: string }> = {
  ATIVO: { label: "Ativo", color: "bg-green-500/15 text-green-700 border-green-500/30", bgClass: "", borderClass: "" },
  BLOQUEADO: { label: "Bloqueado", color: "bg-destructive/15 text-destructive border-destructive/30", bgClass: "opacity-80", borderClass: "border-destructive/20" },
  INATIVO: { label: "Inativo", color: "bg-muted text-muted-foreground border-border", bgClass: "opacity-60", borderClass: "border-muted" },
};

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
  const [statusFilter, setStatusFilter] = useState<"TODOS" | UnitStatus>("TODOS");
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; unit: UnitRow | null; loading: boolean; deps: string | null }>({
    open: false, unit: null, loading: false, deps: null,
  });
  const [statusChange, setStatusChange] = useState<{ open: boolean; unit: UnitRow | null; newStatus: UnitStatus | null; loading: boolean }>({
    open: false, unit: null, newStatus: null, loading: false,
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
    cora_client_id: "", cora_certificate: "", cora_private_key: "", cora_environment: "stage",
    cora_fee_pix: "0", cora_fee_boleto: "2.50",
    preferred_bank: "asaas",
    partnership_plan: "PLANO_ASAAS",
    uplay_fee_type: "PERCENT",
    uplay_fee_value: "0",
    // SaaS contract fields
    saas_valor_mensalidade: "", saas_desconto_pontualidade: "", saas_parcelas: "12",
    saas_primeiro_vencimento: "", saas_dia_vencimento: "10", saas_forma_pagamento: "UNDEFINED",
    saas_plan_id: "", saas_trial_days: "0",
  });

  const setField = (key: string, value: string | boolean) => setForm(prev => ({ ...prev, [key]: value }));

  const fetchUnits = async () => {
    setLoading(true);
    // NOTE: secret columns (asaas_api_key, asaas_webhook_token, cora_*) are NOT
    // selectable directly — they must be loaded via the get_unit_secrets RPC.
    const NON_SECRET_COLS = "id, name, active, status, cnpj, address, phone, asaas_base_url, whatsapp_financeiro, usar_whatsapp_padrao, razao_social, tipo_cadastro, cpf, rg_ie, cidade, estado, bairro, cep, whatsapp, email_empresa, email_acesso, cora_environment, cora_fee_pix, cora_fee_boleto, preferred_bank, partnership_plan, uplay_fee_type, uplay_fee_value, uplay_balance, company_id";
    const { data } = await supabase.from("units").select(NON_SECRET_COLS).order("name");
    if (data) {
      // Mark secret fields as null on the row — they will be loaded on demand.
      const rows = (data as any[]).map(r => ({
        ...r,
        asaas_api_key: null,
        asaas_webhook_token: null,
        cora_client_id: null,
        cora_certificate: null,
        cora_private_key: null,
      }));
      setUnits(rows as unknown as UnitRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchUnits(); }, []);

  useEffect(() => {
    const fetchCompanyId = async () => {
      if (!profile?.unit_id) return;
      const { data } = await supabase.from("units").select("company_id").eq("id", profile.unit_id).maybeSingle();
      if (data?.company_id) setCompanyId(data.company_id);
    };
    fetchCompanyId();
  }, [profile?.unit_id]);

  // SaaS subscription data for editing
  const [unitSubscription, setUnitSubscription] = useState<any>(null);
  // SaaS plans for selector
  const [saasPlans, setSaasPlans] = useState<{ id: string; nome_plano: string; valor_base: number; duracao_meses: number; desconto_percentual: number }[]>([]);

  useEffect(() => {
    supabase.from("saas_plans").select("id, nome_plano, valor_base, duracao_meses, desconto_percentual").eq("ativo", true).order("duracao_meses")
      .then(({ data }) => setSaasPlans((data ?? []) as any));
  }, []);

  const resetForm = () => {
    setForm({
      name: "", razao_social: "", tipo_cadastro: "PJ", cnpj: "", cpf: "", rg_ie: "",
      address: "", bairro: "", cidade: "", estado: "", cep: "",
      phone: "", whatsapp: "", email_empresa: "", email_acesso: "",
      asaas_api_key: "", asaas_base_url: "https://api.asaas.com/v3", asaas_webhook_token: "",
      whatsapp_financeiro: "", usar_whatsapp_padrao: true,
      cora_client_id: "", cora_certificate: "", cora_private_key: "", cora_environment: "stage",
      cora_fee_pix: "0", cora_fee_boleto: "2.50",
      preferred_bank: "asaas",
      partnership_plan: "PLANO_ASAAS",
      uplay_fee_type: "PERCENT",
      uplay_fee_value: "0",
      saas_valor_mensalidade: "", saas_desconto_pontualidade: "", saas_parcelas: "12",
      saas_primeiro_vencimento: "", saas_dia_vencimento: "10", saas_forma_pagamento: "UNDEFINED",
      saas_plan_id: "", saas_trial_days: "0",
    });
    setEditingUnit(null);
    setUnitSubscription(null);
  };

  const openEdit = async (unit: UnitRow) => {
    setEditingUnit(unit);

    // Load secret credentials via secure RPC (admins only).
    let secrets: any = {};
    try {
      const { data: sec } = await supabase.rpc("get_unit_secrets", { _unit_id: unit.id });
      secrets = (sec as any) || {};
    } catch {
      secrets = {};
    }

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
      asaas_api_key: secrets.asaas_api_key || "",
      asaas_base_url: unit.asaas_base_url || "https://api.asaas.com/v3",
      asaas_webhook_token: secrets.asaas_webhook_token || "",
      whatsapp_financeiro: unit.whatsapp_financeiro || "",
      usar_whatsapp_padrao: unit.usar_whatsapp_padrao,
      cora_client_id: secrets.cora_client_id || "",
      cora_certificate: secrets.cora_certificate || "",
      cora_private_key: secrets.cora_private_key || "",
      cora_environment: unit.cora_environment || "stage",
      cora_fee_pix: String((unit as any).cora_fee_pix ?? "0"),
      cora_fee_boleto: String((unit as any).cora_fee_boleto ?? "2.50"),
      preferred_bank: unit.preferred_bank || "asaas",
      partnership_plan: (unit as any).partnership_plan || "PLANO_ASAAS",
      uplay_fee_type: (unit as any).uplay_fee_type || "PERCENT",
      uplay_fee_value: String((unit as any).uplay_fee_value ?? "0"),
      saas_valor_mensalidade: "", saas_desconto_pontualidade: "", saas_parcelas: "12",
      saas_primeiro_vencimento: "", saas_dia_vencimento: "10", saas_forma_pagamento: "UNDEFINED",
      saas_plan_id: "", saas_trial_days: "0",
    });
    setDialogOpen(true);

    // Load SaaS subscription if exists — query by unit_id
    if (unit.id) {
      const { data: sub } = await supabase
        .from("saas_subscriptions")
        .select("*")
        .eq("unit_id", unit.id)
        .maybeSingle();
      if (sub) {
        setUnitSubscription(sub);
        setForm(prev => ({
          ...prev,
          saas_valor_mensalidade: String(sub.monthly_value || ""),
          saas_desconto_pontualidade: String(sub.punctuality_discount || "0"),
          saas_parcelas: String(sub.total_installments || "12"),
          saas_primeiro_vencimento: sub.first_due_date || "",
          saas_dia_vencimento: String(sub.due_day || "10"),
          saas_forma_pagamento: sub.billing_type || "UNDEFINED",
          saas_plan_id: sub.plan_id || "",
          saas_trial_days: String(sub.trial_days || "0"),
        }));
      }
    }
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
    if (!editingUnit && !form.email_empresa.trim()) {
      toast({ title: "E-mail da empresa é obrigatório para criar acesso", variant: "destructive" });
      return;
    }
    if (!form.phone.trim() && !form.whatsapp.trim()) {
      toast({ title: "Telefone ou WhatsApp é obrigatório", variant: "destructive" });
      return;
    }

    setSaving(true);

    // Note: secret fields (asaas_api_key, asaas_webhook_token, cora_*) are
    // saved separately through the update_unit_secrets RPC (server-side only).
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
      email_acesso: form.email_empresa.trim() || null,
      asaas_base_url: form.asaas_base_url.trim() || "https://api.asaas.com/v3",
      whatsapp_financeiro: form.whatsapp_financeiro.trim() || null,
      usar_whatsapp_padrao: form.usar_whatsapp_padrao,
      cora_environment: form.cora_environment || "stage",
      cora_fee_pix: parseFloat(String(form.cora_fee_pix).replace(",", ".")) || 0,
      cora_fee_boleto: parseFloat(String(form.cora_fee_boleto).replace(",", ".")) || 0,
      preferred_bank: form.preferred_bank || "asaas",
      partnership_plan: form.partnership_plan || "PLANO_ASAAS",
      uplay_fee_type: form.uplay_fee_type || "PERCENT",
      uplay_fee_value: parseFloat(form.uplay_fee_value) || 0,
    };

    let error;
    let newUnitId: string | null = null;
    if (editingUnit) {
      ({ error } = await supabase.from("units").update(payload as any).eq("id", editingUnit.id));
      newUnitId = editingUnit.id;
    } else {
      if (companyId) payload.company_id = companyId;
      const res = await supabase.from("units").insert(payload as any).select("id").single();
      error = res.error;
      newUnitId = res.data?.id ?? null;
    }

    // Persist secrets via RPC (only when at least one secret was filled).
    if (!error && newUnitId) {
      const secretsPayload: Record<string, string> = {};
      if (form.asaas_api_key.trim()) secretsPayload.asaas_api_key = form.asaas_api_key.trim();
      if (form.asaas_webhook_token.trim()) secretsPayload.asaas_webhook_token = form.asaas_webhook_token.trim();
      if (form.cora_client_id.trim()) secretsPayload.cora_client_id = form.cora_client_id.trim();
      if (form.cora_certificate.trim()) secretsPayload.cora_certificate = form.cora_certificate.trim();
      if (form.cora_private_key.trim()) secretsPayload.cora_private_key = form.cora_private_key.trim();
      if (Object.keys(secretsPayload).length > 0) {
        const { error: secErr } = await supabase.rpc("update_unit_secrets", {
          _unit_id: newUnitId,
          _secrets: secretsPayload,
        });
        if (secErr) {
          toast({ title: "Aviso: dados salvos, mas falha ao gravar credenciais", description: secErr.message, variant: "destructive" });
        }
      }
    }

    if (error) {
      setSaving(false);
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }

    // Determine if we need to create a user (new unit with email, or editing and email changed)
    const accessEmail = form.email_empresa.trim();
    const emailChanged = editingUnit && accessEmail && accessEmail !== (editingUnit.email_acesso || "");
    const shouldCreateUser = (!editingUnit && accessEmail) || emailChanged;
    const targetUnitId = editingUnit ? editingUnit.id : newUnitId;

    if (shouldCreateUser && targetUnitId) {
      try {
        // Generate a unique placeholder CPF for PJ to avoid duplicates
        const userCpf = form.tipo_cadastro === "PF"
          ? form.cpf.trim()
          : `99${Date.now().toString().slice(-9)}`;

        const { data: userData, error: userError } = await supabase.functions.invoke("create-user", {
          body: {
            cpf: userCpf,
            full_name: form.name.trim(),
            phone: form.whatsapp.trim() || form.phone.trim() || null,
            password: "12345678",
            role: "ADMIN_UNIDADE",
            email_override: accessEmail,
            unit_id: targetUnitId,
          },
        });

        if (userError || !userData?.success) {
          toast({
            title: editingUnit ? "Parceiro atualizado, mas erro ao criar usuário" : "Unidade criada, mas erro ao criar usuário",
            description: userData?.error || userError?.message || "Erro desconhecido",
            variant: "destructive",
          });
        } else {
          setAccessModal({
            open: true,
            name: form.name.trim(),
            email: accessEmail,
            whatsapp: form.whatsapp.trim() || form.phone.trim() || null,
          });
        }
      } catch (err: any) {
        toast({ title: "Parceiro salvo, mas erro ao criar usuário", description: err.message, variant: "destructive" });
      }
    } else {
      toast({ title: editingUnit ? "Parceiro atualizado" : "Parceiro criado" });
    }

    // Save SaaS subscription data if value is provided
    const saasValue = parseFloat(form.saas_valor_mensalidade);
    if (saasValue > 0 && targetUnitId) {
      try {
        // Get the company_id for this unit
        const { data: unitData } = await supabase.from("units").select("company_id").eq("id", targetUnitId).maybeSingle();
        const unitCompanyId = unitData?.company_id;
        
        if (unitCompanyId) {
          const saasDiscount = parseFloat(form.saas_desconto_pontualidade) || 0;
          const saasInstallments = parseInt(form.saas_parcelas) || 12;
          const saasDueDay = parseInt(form.saas_dia_vencimento) || 10;
          
          const trialDays = parseInt(form.saas_trial_days) || 0;
          const isTrialNew = trialDays > 0 && !unitSubscription;
          
          const subPayload: Record<string, unknown> = {
            company_id: unitCompanyId,
            unit_id: targetUnitId,
            monthly_value: saasValue,
            punctuality_discount: saasDiscount,
            total_installments: saasInstallments,
            due_day: saasDueDay,
            billing_type: form.saas_forma_pagamento || "UNDEFINED",
            first_due_date: form.saas_primeiro_vencimento || null,
            status: isTrialNew ? "TRIAL" : "ACTIVE",
            plan: "BASIC",
            plan_id: form.saas_plan_id || null,
            trial_days: trialDays,
          };

          // Calculate trial_ends_at for new subscriptions with trial
          if (isTrialNew) {
            const trialEnd = new Date();
            trialEnd.setDate(trialEnd.getDate() + trialDays);
            (subPayload as any).trial_ends_at = trialEnd.toISOString().split("T")[0];
          }

          // Check if subscription exists by unit_id
          const { data: existingSub } = await supabase
            .from("saas_subscriptions")
            .select("id")
            .eq("unit_id", targetUnitId)
            .maybeSingle();

          if (existingSub) {
            await supabase.from("saas_subscriptions").update(subPayload as any).eq("id", existingSub.id);
          } else {
            // Calculate next billing date
            const firstDue = form.saas_primeiro_vencimento
              ? form.saas_primeiro_vencimento
              : (() => {
                  const now = new Date();
                  const next = new Date(now.getFullYear(), now.getMonth(), saasDueDay);
                  if (next <= now) next.setMonth(next.getMonth() + 1);
                  return next.toISOString().split("T")[0];
                })();

            await supabase.from("saas_subscriptions").insert({
              ...subPayload,
              next_billing_date: firstDue,
              block_deadline: (() => {
                const bd = new Date(firstDue + "T00:00:00");
                bd.setDate(bd.getDate() + 10);
                return bd.toISOString().split("T")[0];
              })(),
            } as any);
          }
        }
      } catch (err: any) {
        console.error("Error saving SaaS subscription:", err);
      }
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

  const [testingCora, setTestingCora] = useState<string | null>(null);
  const [coraDiagnostic, setCoraDiagnostic] = useState<{ open: boolean; data: any; unitName: string }>({ open: false, data: null, unitName: "" });
  const handleTestCora = async (unitId: string, unitName: string) => {
    setTestingCora(unitId);
    try {
      const { data, error } = await supabase.functions.invoke("cora-test-connection", { body: { unit_id: unitId } });
      if (error) {
        toast({ title: "Erro ao testar Cora", description: error.message, variant: "destructive" });
        setCoraDiagnostic({ open: true, data: { error: error.message }, unitName });
        return;
      }
      setCoraDiagnostic({ open: true, data, unitName });
      if (data?.success) {
        const env = data.environment === "production" ? "Produção" : "Stage (Sandbox)";
        toast({
          title: data.ready_for_boletos ? "✅ Cora pronto para boletos" : "⚠️ OAuth OK, conta com restrição",
          description: `${env} — ${data.message ?? ""}`,
          variant: data.ready_for_boletos ? "default" : "destructive",
        });
      } else {
        toast({ title: "❌ Falha na conexão Cora", description: data?.error || "Erro desconhecido", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
      setCoraDiagnostic({ open: true, data: { error: err.message }, unitName });
    } finally {
      setTestingCora(null);
    }
  };

  const [migratingCora, setMigratingCora] = useState<string | null>(null);
  const handleMigrateCoraToUnit = async (unitId: string, unitName: string) => {
    if (!confirm(`Copiar as credenciais Cora globais (CORA_CLIENT_ID/CERTIFICATE/PRIVATE_KEY) para a unidade "${unitName}"?\n\nIsto sobrescreve qualquer credencial Cora já cadastrada nessa unidade.`)) return;
    setMigratingCora(unitId);
    try {
      const { data, error } = await supabase.functions.invoke("migrate-cora-secrets-to-unit", { body: { unit_id: unitId } });
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
      if (data?.success) {
        toast({ title: "✅ Credenciais migradas", description: `Cora vinculado à unidade ${unitName}.` });
        fetchUnits();
      } else {
        toast({ title: "❌ Falha", description: data?.error || "Erro desconhecido", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setMigratingCora(null);
    }
  };

  const handleDeleteUnit = async () => {
    const unit = deleteConfirm.unit;
    if (!unit) return;
    setDeleteConfirm(prev => ({ ...prev, loading: true }));

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
      toast({ title: "Parceiro excluído com sucesso" });
      fetchUnits();
    }
    setDeleteConfirm({ open: false, unit: null, loading: false, deps: null });
  };

  const handleChangeStatus = async () => {
    const { unit, newStatus } = statusChange;
    if (!unit || !newStatus) return;
    setStatusChange(prev => ({ ...prev, loading: true }));

    const { error } = await supabase
      .from("units")
      .update({ status: newStatus } as any)
      .eq("id", unit.id);

    if (error) {
      toast({ title: "Erro ao alterar status", description: error.message, variant: "destructive" });
    } else {
      const labels: Record<UnitStatus, string> = {
        ATIVO: "ativado",
        INATIVO: "inativado",
        BLOQUEADO: "bloqueado",
      };
      toast({ title: `Parceiro ${labels[newStatus]} com sucesso` });
      fetchUnits();
    }
    setStatusChange({ open: false, unit: null, newStatus: null, loading: false });
  };

  const toggleKey = (id: string) => setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));

  const filteredUnits = statusFilter === "TODOS"
    ? units
    : units.filter(u => (u.status || (u.active ? "ATIVO" : "INATIVO")) === statusFilter);

  const statusCounts = {
    TODOS: units.length,
    ATIVO: units.filter(u => (u.status || (u.active ? "ATIVO" : "INATIVO")) === "ATIVO").length,
    BLOQUEADO: units.filter(u => u.status === "BLOQUEADO").length,
    INATIVO: units.filter(u => (u.status || (u.active ? "ATIVO" : "INATIVO")) === "INATIVO").length,
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
        <h1 className="text-xl font-bold text-foreground">Parceiros / Unidades</h1>
        <Button onClick={openNew} className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <Plus size={16} className="mr-2" /> Novo Parceiro
        </Button>
      </div>

      {/* Status Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-muted-foreground" />
        {(["TODOS", "ATIVO", "BLOQUEADO", "INATIVO"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            onClick={() => setStatusFilter(s)}
            className="text-xs h-7 px-3"
          >
            {s === "TODOS" ? "Todos" : STATUS_CONFIG[s].label} ({statusCounts[s]})
          </Button>
        ))}
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
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">Link do Painel do Parceiro</Label>
                  <div className="flex gap-2">
                    <Input
                      value="https://uplaypagamento.com.br/login"
                      readOnly
                      className="bg-muted/50 cursor-default text-xs"
                    />
                    <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={async () => {
                      try {
                        await navigator.clipboard.writeText("https://uplaypagamento.com.br/login");
                        toast({ title: "Link copiado!" });
                      } catch {
                        toast({ title: "Erro ao copiar", variant: "destructive" });
                      }
                    }}>
                      <Copy size={14} />
                    </Button>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  O parceiro acessa com o <strong>e-mail da empresa</strong> ({form.email_empresa || "definido acima"}) e a senha padrão: <strong>12345678</strong>
                </p>
              </div>
            </div>

            {/* PLANO DE PARCERIA UPLAY */}
            <div className="border-t border-border pt-4 mt-4">
              <p className="text-xs font-semibold text-primary mb-1">🤝 Plano de Parceria</p>
              <p className="text-[10px] text-muted-foreground mb-3">
                Define como o parceiro recebe os pagamentos dos clientes finais.
              </p>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Plano</Label>
                  <Select value={form.partnership_plan} onValueChange={v => setField("partnership_plan", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PLANO_UPLAY">Plano UpPlay (intermediado · taxa por boleto)</SelectItem>
                      <SelectItem value="PLANO_ASAAS">Plano Asaas (parceiro recebe direto)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.partnership_plan === "PLANO_UPLAY" && (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
                    <p className="text-[11px] text-foreground">
                      Os pagamentos serão recebidos pela conta UpPlay. A UpPlay deduz uma taxa por boleto e repassa o líquido ao parceiro.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Tipo de taxa</Label>
                        <Select value={form.uplay_fee_type} onValueChange={v => setField("uplay_fee_type", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PERCENT">Percentual (%)</SelectItem>
                            <SelectItem value="FIXED">Valor fixo (R$)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Valor da taxa {form.uplay_fee_type === "PERCENT" ? "(%)" : "(R$)"}
                        </Label>
                        <Input
                          type="number" step="0.01" min="0"
                          value={form.uplay_fee_value}
                          onChange={e => setField("uplay_fee_value", e.target.value)}
                          placeholder={form.uplay_fee_type === "PERCENT" ? "Ex: 2.5" : "Ex: 3.00"}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Integrações bancárias — só no Plano Asaas */}
            {form.partnership_plan !== "PLANO_UPLAY" && (
              <>
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

                {/* CORA */}
                <div className="border-t border-border pt-4 mt-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-3">Integração Banco Cora</p>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Banco preferido (geração de cobranças)</Label>
                        <Select value={form.preferred_bank} onValueChange={v => setField("preferred_bank", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="asaas">Asaas</SelectItem>
                            <SelectItem value="cora">Banco Cora</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Ambiente Cora</Label>
                        <Select value={form.cora_environment} onValueChange={v => setField("cora_environment", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="stage">Stage (testes)</SelectItem>
                            <SelectItem value="production">Produção</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cora Client ID</Label>
                      <Input value={form.cora_client_id} onChange={e => setField("cora_client_id", e.target.value)} placeholder="int-app-..." />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Certificado Cora (PEM)</Label>
                      <Textarea value={form.cora_certificate} onChange={e => setField("cora_certificate", e.target.value)} placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----" rows={4} className="font-mono text-[10px]" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Chave Privada Cora (PEM)</Label>
                      <Textarea value={form.cora_private_key} onChange={e => setField("cora_private_key", e.target.value)} placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----" rows={4} className="font-mono text-[10px]" />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Cole o conteúdo completo dos arquivos <code>.pem</code> gerados no painel Cora. Cada unidade pode ter sua própria conta Cora.
                    </p>

                    {/* Tarifas Cora */}
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                      <div className="space-y-1">
                        <Label className="text-xs">Tarifa por PIX recebido (R$)</Label>
                        <Input
                          type="number" step="0.01" min="0"
                          value={form.cora_fee_pix}
                          onChange={e => setField("cora_fee_pix", e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Tarifa por boleto liquidado (R$)</Label>
                        <Input
                          type="number" step="0.01" min="0"
                          value={form.cora_fee_boleto}
                          onChange={e => setField("cora_fee_boleto", e.target.value)}
                          placeholder="2,50"
                        />
                      </div>
                      <p className="col-span-2 text-[10px] text-muted-foreground">
                        Estas tarifas alimentam o relatório <strong>Taxas Cora</strong>. Quando a reconciliação por extrato rodar, o valor real cobrado pela Cora substitui esta estimativa.
                      </p>
                    </div>
                    <div className="mt-2 rounded border border-primary/30 bg-primary/5 p-2">
                      <p className="text-[10px] font-semibold text-primary">Webhook Cora (cadastre na conta Cora)</p>
                      <code className="text-[10px] break-all block mt-1">https://kfhjoffsqfnwiiwgelhl.supabase.co/functions/v1/cora-webhook</code>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Eventos: cobrança paga, boleto pago, Pix recebido. A baixa automática acontece via webhook + sincronização periódica a cada 5 min.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="border border-primary/30 bg-primary/5 rounded-lg p-3 mt-4">
              <p className="text-xs font-semibold text-primary mb-3">💰 Contrato SaaS da Empresa</p>

              {/* Plan selector */}
              {saasPlans.length > 0 && (
                <div className="mb-3">
                  <Label className="text-xs">Plano SaaS</Label>
                  <Select value={form.saas_plan_id} onValueChange={v => {
                    setField("saas_plan_id", v);
                    const plan = saasPlans.find(p => p.id === v);
                    if (plan) {
                      const valorFinal = plan.valor_base - (plan.valor_base * plan.desconto_percentual / 100);
                      setForm(prev => ({
                        ...prev,
                        saas_plan_id: v,
                        saas_valor_mensalidade: String(valorFinal.toFixed(2)),
                        saas_parcelas: String(plan.duracao_meses),
                      }));
                    }
                  }}>
                    <SelectTrigger><SelectValue placeholder="Selecione um plano (opcional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Personalizado</SelectItem>
                      {saasPlans.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome_plano} — R$ {(p.valor_base - (p.valor_base * p.desconto_percentual / 100)).toFixed(2)}/mês ({p.duracao_meses}m{p.desconto_percentual > 0 ? `, ${p.desconto_percentual}% desc.` : ""})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Trial days */}
              <div className="mb-3">
                <Label className="text-xs">Dias de teste grátis</Label>
                <Input value={form.saas_trial_days} onChange={e => setField("saas_trial_days", e.target.value)} placeholder="0" type="number" min="0" />
                {parseInt(form.saas_trial_days) > 0 && (
                  <p className="text-[10px] text-primary mt-1">
                    ⏱️ Teste grátis de {form.saas_trial_days} dias. Cobrança inicia após o período.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Valor real da mensalidade</Label>
                  <Input value={form.saas_valor_mensalidade} onChange={e => setField("saas_valor_mensalidade", e.target.value)} placeholder="97.00" type="number" step="0.01" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Desconto pontualidade</Label>
                  <Input value={form.saas_desconto_pontualidade} onChange={e => setField("saas_desconto_pontualidade", e.target.value)} placeholder="10.00" type="number" step="0.01" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valor final</Label>
                  <Input
                    value={(() => {
                      const v = parseFloat(form.saas_valor_mensalidade) || 0;
                      const d = parseFloat(form.saas_desconto_pontualidade) || 0;
                      return (v - d).toFixed(2);
                    })()}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nº de parcelas</Label>
                  <Input value={form.saas_parcelas} onChange={e => setField("saas_parcelas", e.target.value)} placeholder="12" type="number" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">1º vencimento</Label>
                  <Input value={form.saas_primeiro_vencimento} onChange={e => setField("saas_primeiro_vencimento", e.target.value)} type="date" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dia do vencimento</Label>
                  <Input value={form.saas_dia_vencimento} onChange={e => setField("saas_dia_vencimento", e.target.value)} placeholder="10" type="number" min="1" max="28" />
                </div>
              </div>
              <div className="mt-3">
                <Label className="text-xs">Forma de pagamento</Label>
                <Select value={form.saas_forma_pagamento} onValueChange={v => setField("saas_forma_pagamento", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNDEFINED">Todos (Boleto + PIX + Cartão)</SelectItem>
                    <SelectItem value="BOLETO">Boleto</SelectItem>
                    <SelectItem value="PIX">PIX</SelectItem>
                    <SelectItem value="CREDIT_CARD">Cartão de Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Preview do contrato */}
              {parseFloat(form.saas_valor_mensalidade) > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border space-y-1">
                  <p className="text-xs font-semibold text-foreground mb-2">📋 Prévia do Contrato</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Parcela sem desconto:</span>
                      <span className="text-foreground font-medium ml-1">R$ {(parseFloat(form.saas_valor_mensalidade) || 0).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Desc. pontualidade:</span>
                      <span className="text-foreground font-medium ml-1">R$ {(parseFloat(form.saas_desconto_pontualidade) || 0).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Parcela com desconto:</span>
                      <span className="font-medium ml-1 text-green-600">R$ {((parseFloat(form.saas_valor_mensalidade) || 0) - (parseFloat(form.saas_desconto_pontualidade) || 0)).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total de parcelas:</span>
                      <span className="text-foreground font-medium ml-1">{form.saas_parcelas || "12"}</span>
                    </div>
                  </div>
                  {form.saas_primeiro_vencimento && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-[10px] text-muted-foreground mb-1">Próximos vencimentos:</p>
                      <div className="flex flex-wrap gap-1">
                        {Array.from({ length: Math.min(parseInt(form.saas_parcelas) || 12, 6) }, (_, i) => {
                          const d = new Date(form.saas_primeiro_vencimento + "T00:00:00");
                          d.setMonth(d.getMonth() + i);
                          return (
                            <Badge key={i} variant="outline" className="text-[9px]">
                              {d.toLocaleDateString("pt-BR")}
                            </Badge>
                          );
                        })}
                        {parseInt(form.saas_parcelas) > 6 && <Badge variant="outline" className="text-[9px]">...</Badge>}
                      </div>
                    </div>
                  )}
                </div>
              )}
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
        {filteredUnits.map((unit) => {
          const unitStatus = (unit.status || (unit.active ? "ATIVO" : "INATIVO")) as UnitStatus;
          const cfg = STATUS_CONFIG[unitStatus];

          return (
            <div key={unit.id} className={`glass-card p-4 transition-all ${cfg.bgClass} ${cfg.borderClass ? `border ${cfg.borderClass}` : ""}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-foreground">{unit.name}</h3>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {unit.tipo_cadastro === "PF" ? "PF" : "PJ"}
                    </Badge>
                    <Badge className={`text-[10px] px-1.5 py-0 border ${cfg.color}`}>
                      {cfg.label}
                    </Badge>
                  </div>
                  {unit.razao_social && <p className="text-[11px] text-muted-foreground">{unit.razao_social}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(unit)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Editar">
                    <Pencil size={14} />
                  </button>
                  {/* Status action buttons */}
                  {unitStatus === "ATIVO" && (
                    <>
                      <button
                        onClick={() => setStatusChange({ open: true, unit, newStatus: "BLOQUEADO", loading: false })}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                        title="Bloquear"
                      >
                        <ShieldAlert size={14} />
                      </button>
                      <button
                        onClick={() => setStatusChange({ open: true, unit, newStatus: "INATIVO", loading: false })}
                        className="p-1.5 text-muted-foreground hover:text-yellow-600 transition-colors"
                        title="Inativar"
                      >
                        <ShieldOff size={14} />
                      </button>
                    </>
                  )}
                  {unitStatus === "BLOQUEADO" && (
                    <button
                      onClick={() => setStatusChange({ open: true, unit, newStatus: "ATIVO", loading: false })}
                      className="p-1.5 text-green-600 hover:text-green-700 transition-colors"
                      title="Reativar"
                    >
                      <Shield size={14} />
                    </button>
                  )}
                  {unitStatus === "INATIVO" && (
                    <button
                      onClick={() => setStatusChange({ open: true, unit, newStatus: "ATIVO", loading: false })}
                      className="p-1.5 text-green-600 hover:text-green-700 transition-colors"
                      title="Ativar"
                    >
                      <Shield size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteConfirm({ open: true, unit, loading: false, deps: null })}
                    className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                    title="Excluir"
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
                    <button
                      onClick={async () => {
                        if (!showKeys[unit.id] && !unit.asaas_api_key) {
                          // Lazy-load secrets via secure RPC.
                          const { data } = await supabase.rpc("get_unit_secrets", { _unit_id: unit.id });
                          if (data) {
                            const s: any = data;
                            setUnits(prev => prev.map(u => u.id === unit.id ? {
                              ...u,
                              asaas_api_key: s.asaas_api_key,
                              asaas_webhook_token: s.asaas_webhook_token,
                              cora_client_id: s.cora_client_id,
                              cora_certificate: s.cora_certificate,
                              cora_private_key: s.cora_private_key,
                            } : u));
                          }
                        }
                        toggleKey(unit.id);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {showKeys[unit.id] ? <ShieldOff size={14} /> : <Shield size={14} />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-20">Base URL:</span>
                    <code className="text-foreground truncate">{unit.asaas_base_url || "—"}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-20">Webhook:</span>
                    <code className="text-foreground truncate">{showKeys[unit.id] ? (unit.asaas_webhook_token || "—") : "••••••••"}</code>
                  </div>
                </div>
              </details>

              <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-2">
                <Button
                  size="sm" variant="outline"
                  onClick={() => handleTestConnection(unit.id)}
                  disabled={testingUnit === unit.id}
                  className="text-xs"
                >
                  {testingUnit === unit.id ? (
                    <Loader2 size={12} className="mr-1.5 animate-spin" />
                  ) : (
                    <Wifi size={12} className="mr-1.5" />
                  )}
                  {testingUnit === unit.id ? "Testando..." : "Testar conexão Asaas"}
                </Button>

                <Button
                  size="sm" variant="outline"
                  onClick={() => handleTestCora(unit.id, unit.name)}
                  disabled={testingCora === unit.id}
                  className="text-xs"
                >
                  {testingCora === unit.id ? (
                    <Loader2 size={12} className="mr-1.5 animate-spin" />
                  ) : (
                    <Wifi size={12} className="mr-1.5" />
                  )}
                  {testingCora === unit.id ? "Testando..." : "Testar conexão Cora"}
                </Button>
              </div>
            </div>
          );
        })}
        {filteredUnits.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-10">
            {statusFilter === "TODOS" ? "Nenhum parceiro cadastrado" : `Nenhum parceiro com status "${STATUS_CONFIG[statusFilter].label}"`}
          </p>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(o) => { if (!o && !deleteConfirm.loading) setDeleteConfirm({ open: false, unit: null, loading: false, deps: null }); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir parceiro</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {deleteConfirm.deps ? (
                  <span className="text-destructive">
                    Não é possível excluir. Este parceiro possui registros vinculados: {deleteConfirm.deps}.
                    <br /><br />
                    <strong>Use o botão "Desativar" para ocultar este parceiro sem perder dados.</strong>
                  </span>
                ) : (
                  <span>Tem certeza que deseja excluir <strong>{deleteConfirm.unit?.name}</strong>? Esta ação não pode ser desfeita.</span>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteConfirm.loading}>Cancelar</AlertDialogCancel>
            {deleteConfirm.deps ? (
              <Button
                onClick={() => {
                  if (deleteConfirm.unit) {
                    supabase.from("units").update({ status: "INATIVO" } as any).eq("id", deleteConfirm.unit.id).then(({ error }) => {
                      if (error) {
                        toast({ title: "Erro ao desativar", description: error.message, variant: "destructive" });
                      } else {
                        toast({ title: "Parceiro desativado com sucesso" });
                        fetchUnits();
                      }
                    });
                  }
                  setDeleteConfirm({ open: false, unit: null, loading: false, deps: null });
                }}
                className="bg-yellow-600 text-white hover:bg-yellow-700"
              >
                <ShieldOff size={14} className="mr-2" />
                Desativar parceiro
              </Button>
            ) : (
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  handleDeleteUnit();
                }}
                disabled={deleteConfirm.loading}
                variant="destructive"
              >
                {deleteConfirm.loading && <Loader2 size={14} className="mr-2 animate-spin" />}
                Confirmar exclusão
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Status Change Confirmation Dialog */}
      <AlertDialog open={statusChange.open} onOpenChange={(o) => { if (!o && !statusChange.loading) setStatusChange({ open: false, unit: null, newStatus: null, loading: false }); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar status do parceiro</AlertDialogTitle>
            <AlertDialogDescription>
              {statusChange.newStatus === "BLOQUEADO" && (
                <>Tem certeza que deseja <strong>bloquear</strong> o parceiro <strong>{statusChange.unit?.name}</strong>? O parceiro não poderá acessar a plataforma.</>
              )}
              {statusChange.newStatus === "INATIVO" && (
                <>Tem certeza que deseja <strong>inativar</strong> o parceiro <strong>{statusChange.unit?.name}</strong>? O parceiro será ocultado das operações principais.</>
              )}
              {statusChange.newStatus === "ATIVO" && (
                <>Tem certeza que deseja <strong>reativar</strong> o parceiro <strong>{statusChange.unit?.name}</strong>? O acesso será restaurado.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusChange.loading}>Cancelar</AlertDialogCancel>
            <Button
              onClick={(e) => {
                e.preventDefault();
                handleChangeStatus();
              }}
              disabled={statusChange.loading}
              variant={statusChange.newStatus === "ATIVO" ? "default" : "destructive"}
            >
              {statusChange.loading && <Loader2 size={14} className="mr-2 animate-spin" />}
              {statusChange.newStatus === "BLOQUEADO" && "Bloquear"}
              {statusChange.newStatus === "INATIVO" && "Inativar"}
              {statusChange.newStatus === "ATIVO" && "Reativar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={coraDiagnostic.open} onOpenChange={(o) => setCoraDiagnostic(prev => ({ ...prev, open: o }))}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Diagnóstico Cora — {coraDiagnostic.unitName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            {coraDiagnostic.data?.success ? (
              <div className="rounded border border-green-500/30 bg-green-500/10 p-3">
                <div className="font-semibold text-green-700 dark:text-green-400">✅ OAuth2 mTLS autenticado</div>
                <div className="mt-1">Ambiente: <strong>{coraDiagnostic.data.environment}</strong></div>
                <div>Base URL: <code>{coraDiagnostic.data.base_url}</code></div>
                <div>Client ID: <code>{coraDiagnostic.data.client_id}</code></div>
                <div>Token: <code>{coraDiagnostic.data.token_preview}</code> (expira em {coraDiagnostic.data.expires_in}s)</div>
              </div>
            ) : (
              <div className="rounded border border-destructive/30 bg-destructive/10 p-3">
                <div className="font-semibold text-destructive">❌ Falha</div>
                <div className="mt-1 whitespace-pre-wrap">{coraDiagnostic.data?.error || "Erro desconhecido"}</div>
                {coraDiagnostic.data?.status_code && <div>HTTP {coraDiagnostic.data.status_code}</div>}
              </div>
            )}

            {coraDiagnostic.data?.account_check && (
              <div className={`rounded border p-3 ${coraDiagnostic.data.account_check.ok ? "border-green-500/30 bg-green-500/10" : "border-destructive/30 bg-destructive/10"}`}>
                <div className="font-semibold">
                  {coraDiagnostic.data.account_check.ok ? "✅" : "❌"} Endpoint autenticado: {coraDiagnostic.data.account_check.endpoint || "/v2/invoices"}
                </div>
                {coraDiagnostic.data.account_check.status && <div>HTTP {coraDiagnostic.data.account_check.status}</div>}
                {coraDiagnostic.data.account_check.error && <div className="mt-1 whitespace-pre-wrap">{coraDiagnostic.data.account_check.error}</div>}
                <div className="mt-2">
                  {coraDiagnostic.data.ready_for_boletos
                    ? "Liberado para emitir boletos."
                    : "Boleto bloqueado até endpoint autenticado responder OK."}
                </div>
              </div>
            )}

            <details>
              <summary className="cursor-pointer font-semibold">Resposta completa (JSON)</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded bg-muted p-2 text-[10px]">{JSON.stringify(coraDiagnostic.data, null, 2)}</pre>
            </details>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUnits;
