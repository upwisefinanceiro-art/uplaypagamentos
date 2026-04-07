import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Building2, Pencil, Upload, Save, X, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Company {
  id: string;
  name: string;
  system_name: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  whatsapp_financeiro: string | null;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  plan: string;
  status: string;
  max_units: number;
  max_users: number;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  asaas_api_key_master: string | null;
  asaas_base_url_master: string | null;
  asaas_webhook_token_master: string | null;
  valor_mensalidade: number | null;
  dias_bloqueio: number | null;
  whatsapp_master: string | null;
}

const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
];

const AdminCompanies = () => {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { profile } = useAuth();
  const { toast } = useToast();

  // Form state
  const [form, setForm] = useState<Partial<Company>>({});

  const updateForm = (field: keyof Company, value: string | number | null) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const fetchCompany = async () => {
    if (!profile?.unit_id) {
      setCompany(null);
      setLoading(false);
      return;
    }

    const { data: unit } = await supabase
      .from("units")
      .select("company_id")
      .eq("id", profile.unit_id)
      .maybeSingle();

    if (!unit?.company_id) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("id", unit.company_id)
      .maybeSingle();

    if (error) {
      toast({ title: "Erro ao carregar empresa", variant: "destructive" });
    } else {
      setCompany(data as Company | null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCompany();
  }, [profile?.unit_id]);

  const startEditing = () => {
    if (!company) return;
    setForm({ ...company });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setForm({});
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !company) return;

    if (!file.type.match(/^image\/(png|jpe?g)$/)) {
      toast({ title: "Formato inválido", description: "Use PNG ou JPG", variant: "destructive" });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 2MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${company.id}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("company-logos")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast({ title: "Erro no upload", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("company-logos").getPublicUrl(path);
    const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("companies")
      .update({ logo_url: logoUrl })
      .eq("id", company.id);

    setUploading(false);

    if (updateError) {
      toast({ title: "Erro ao salvar logo", variant: "destructive" });
    } else {
      toast({ title: "Logo atualizada!" });
      updateForm("logo_url", logoUrl);
      fetchCompany();
    }
  };

  const validateForm = (): string | null => {
    if (!form.name?.trim()) return "Nome da empresa é obrigatório";
    if (!form.system_name?.trim()) return "Nome do sistema é obrigatório";
    if (form.cnpj && !/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|^\d{14}$/.test(form.cnpj.trim())) {
      return "CNPJ inválido (use XX.XXX.XXX/XXXX-XX ou 14 dígitos)";
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return "E-mail inválido";
    }
    return null;
  };

  const handleSave = async () => {
    if (!company) return;

    const validationError = validateForm();
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from("companies")
      .update({
        name: form.name?.trim(),
        system_name: form.system_name?.trim(),
        cnpj: form.cnpj?.trim() || null,
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        whatsapp_financeiro: form.whatsapp_financeiro?.trim() || null,
        primary_color: form.primary_color,
        secondary_color: form.secondary_color,
        endereco: form.endereco?.trim() || null,
        numero: form.numero?.trim() || null,
        bairro: form.bairro?.trim() || null,
        cidade: form.cidade?.trim() || null,
        estado: form.estado || null,
        cep: form.cep?.trim() || null,
        asaas_api_key_master: form.asaas_api_key_master?.trim() || null,
        asaas_base_url_master: form.asaas_base_url_master?.trim() || "https://api.asaas.com/v3",
        asaas_webhook_token_master: form.asaas_webhook_token_master?.trim() || null,
        valor_mensalidade: form.valor_mensalidade ?? 97,
        dias_bloqueio: form.dias_bloqueio ?? 10,
      })
      .eq("id", company.id);

    setSaving(false);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Empresa atualizada com sucesso!" });
      setEditing(false);
      fetchCompany();
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-xl font-bold text-foreground">Minha Empresa</h1>
        <Card>
          <CardContent className="p-8 text-center">
            <Building2 size={40} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma empresa vinculada à sua conta.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderViewMode = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Minha Empresa</h1>
        <Button onClick={startEditing} size="sm" variant="outline" className="gap-2">
          <Pencil size={14} /> Editar
        </Button>
      </div>

      {/* Company Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            {company.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="h-16 w-16 rounded-lg object-cover border" />
            ) : (
              <div
                className="h-16 w-16 rounded-lg flex items-center justify-center text-white font-bold text-xl"
                style={{ backgroundColor: company.primary_color ?? "#3B82F6" }}
              >
                {company.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-lg font-bold text-foreground">{company.name}</h2>
              <p className="text-sm text-muted-foreground">{company.system_name}</p>
            </div>
            <Badge>{company.plan}</Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            {company.cnpj && <InfoRow label="CNPJ" value={company.cnpj} />}
            {company.email && <InfoRow label="E-mail" value={company.email} />}
            {company.phone && <InfoRow label="Telefone" value={company.phone} />}
            {company.whatsapp_financeiro && <InfoRow label="WhatsApp" value={company.whatsapp_financeiro} />}
            <InfoRow label="Máx. Unidades" value={String(company.max_units)} />
            <InfoRow label="Máx. Usuários" value={String(company.max_users)} />
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      {(company.endereco || company.cidade) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Endereço</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>
              {[company.endereco, company.numero].filter(Boolean).join(", ")}
              {company.bairro && ` - ${company.bairro}`}
            </p>
            <p>
              {[company.cidade, company.estado].filter(Boolean).join(" / ")}
              {company.cep && ` - CEP: ${company.cep}`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Billing Config */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configuração de Cobrança SaaS</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <InfoRow label="API Asaas Master" value={company.asaas_api_key_master ? "••••••••" + company.asaas_api_key_master.slice(-4) : "Não configurada"} />
          <InfoRow label="URL Base" value={company.asaas_base_url_master || "https://api.asaas.com/v3"} />
          <InfoRow label="Mensalidade" value={`R$ ${(company.valor_mensalidade ?? 97).toFixed(2)}`} />
          <InfoRow label="Dias p/ Bloqueio" value={`${company.dias_bloqueio ?? 10} dias após vencimento`} />
        </CardContent>
      </Card>

      {/* Colors */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Identidade Visual</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full border" style={{ backgroundColor: company.primary_color ?? "#3B82F6" }} />
              <span className="text-sm text-muted-foreground">Principal</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full border" style={{ backgroundColor: company.secondary_color ?? "#1E40AF" }} />
              <span className="text-sm text-muted-foreground">Secundária</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderEditMode = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Editar Empresa</h1>
        <div className="flex gap-2">
          <Button onClick={cancelEditing} size="sm" variant="outline" className="gap-2">
            <X size={14} /> Cancelar
          </Button>
          <Button onClick={handleSave} size="sm" disabled={saving} className="gap-2">
            <Save size={14} /> {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="dados" className="w-full">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="endereco">Endereço</TabsTrigger>
          <TabsTrigger value="cobranca">Cobrança</TabsTrigger>
          <TabsTrigger value="visual">Visual</TabsTrigger>
        </TabsList>

        {/* TAB: Dados da Empresa */}
        <TabsContent value="dados">
          <Card>
            <CardContent className="p-6 space-y-4">
              {/* Logo Upload */}
              <div className="space-y-2">
                <Label>Logo da Empresa</Label>
                <div className="flex items-center gap-4">
                  {(form.logo_url || company.logo_url) ? (
                    <img
                      src={form.logo_url || company.logo_url || ""}
                      alt="Logo"
                      className="h-16 w-16 rounded-lg object-cover border"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center">
                      <Building2 size={24} className="text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="gap-2"
                    >
                      <Upload size={14} />
                      {uploading ? "Enviando..." : "Upload Logo"}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">PNG ou JPG, máx 2MB</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Nome da Empresa *" value={form.name ?? ""} onChange={v => updateForm("name", v)} />
                <FormField label="Nome do Sistema *" value={form.system_name ?? ""} onChange={v => updateForm("system_name", v)} />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="CNPJ" value={form.cnpj ?? ""} onChange={v => updateForm("cnpj", v)} placeholder="XX.XXX.XXX/XXXX-XX" />
                <FormField label="E-mail" value={form.email ?? ""} onChange={v => updateForm("email", v)} type="email" />
                <FormField label="Telefone" value={form.phone ?? ""} onChange={v => updateForm("phone", v)} />
              </div>

              <FormField label="WhatsApp Financeiro" value={form.whatsapp_financeiro ?? ""} onChange={v => updateForm("whatsapp_financeiro", v)} />
              <FormField label="WhatsApp Master (cobrança SaaS)" value={form.whatsapp_master ?? ""} onChange={v => updateForm("whatsapp_master", v)} placeholder="Número para cobrar empresas parceiras" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Endereço */}
        <TabsContent value="endereco">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <FormField label="Endereço" value={form.endereco ?? ""} onChange={v => updateForm("endereco", v)} />
                </div>
                <FormField label="Número" value={form.numero ?? ""} onChange={v => updateForm("numero", v)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="Bairro" value={form.bairro ?? ""} onChange={v => updateForm("bairro", v)} />
                <FormField label="Cidade" value={form.cidade ?? ""} onChange={v => updateForm("cidade", v)} />
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <select
                    value={form.estado ?? ""}
                    onChange={e => updateForm("estado", e.target.value || null)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Selecione</option>
                    {ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="CEP" value={form.cep ?? ""} onChange={v => updateForm("cep", v)} placeholder="00000-000" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Cobrança */}
        <TabsContent value="cobranca">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">API Asaas (Cobrança da Plataforma)</CardTitle>
              <p className="text-xs text-muted-foreground">
                Essa API é da SUA empresa, usada para cobrar mensalidade dos parceiros/unidades.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>API Key Asaas Master</Label>
                <div className="flex gap-2">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={form.asaas_api_key_master ?? ""}
                    onChange={e => updateForm("asaas_api_key_master", e.target.value)}
                    placeholder="$aact_..."
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </Button>
                </div>
              </div>

              <FormField
                label="URL Base Asaas"
                value={form.asaas_base_url_master ?? "https://api.asaas.com/v3"}
                onChange={v => updateForm("asaas_base_url_master", v)}
              />

              <FormField
                label="Webhook Token (opcional)"
                value={form.asaas_webhook_token_master ?? ""}
                onChange={v => updateForm("asaas_webhook_token_master", v)}
              />

              <Separator />

              <CardTitle className="text-base">Plano SaaS</CardTitle>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Valor Mensalidade (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.valor_mensalidade ?? 97}
                    onChange={e => updateForm("valor_mensalidade", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Dias para Bloqueio após Vencimento</Label>
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={form.dias_bloqueio ?? 10}
                    onChange={e => updateForm("dias_bloqueio", parseInt(e.target.value) || 10)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Visual */}
        <TabsContent value="visual">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Cor Principal</Label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={form.primary_color ?? "#3B82F6"}
                      onChange={e => updateForm("primary_color", e.target.value)}
                      className="h-10 w-14 rounded border border-input cursor-pointer"
                    />
                    <Input
                      value={form.primary_color ?? "#3B82F6"}
                      onChange={e => updateForm("primary_color", e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Cor Secundária</Label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={form.secondary_color ?? "#1E40AF"}
                      onChange={e => updateForm("secondary_color", e.target.value)}
                      className="h-10 w-14 rounded border border-input cursor-pointer"
                    />
                    <Input
                      value={form.secondary_color ?? "#1E40AF"}
                      onChange={e => updateForm("secondary_color", e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <Label className="text-sm">Preview</Label>
                <div className="mt-2 p-4 rounded-lg border flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: form.primary_color ?? "#3B82F6" }}>
                    {(form.name ?? "E").charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold" style={{ color: form.primary_color ?? "#3B82F6" }}>
                      {form.name || "Nome da Empresa"}
                    </p>
                    <p className="text-xs" style={{ color: form.secondary_color ?? "#1E40AF" }}>
                      {form.system_name || "Nome do Sistema"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Floating Save */}
      <div className="sticky bottom-4">
        <Button onClick={handleSave} disabled={saving} className="w-full gap-2" size="lg">
          <Save size={16} /> {saving ? "Salvando..." : "Salvar Todas as Alterações"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in">
      {editing ? renderEditMode() : renderViewMode()}
    </div>
  );
};

// Helper components
const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-1">
    <span className="text-muted-foreground">{label}:</span>
    <span className="font-medium">{value}</span>
  </div>
);

const FormField = ({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    <Input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  </div>
);

export default AdminCompanies;
