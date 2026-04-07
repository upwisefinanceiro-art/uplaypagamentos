import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Building2, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
}

const AdminCompanies = () => {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { profile } = useAuth();
  const { toast } = useToast();

  // Edit form state
  const [name, setName] = useState("");
  const [systemName, setSystemName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#3B82F6");
  const [secondaryColor, setSecondaryColor] = useState("#1E40AF");
  const [whatsapp, setWhatsapp] = useState("");

  const fetchCompany = async () => {
    if (!profile?.unit_id) {
      setCompany(null);
      setLoading(false);
      return;
    }
    
    // Get company_id from unit
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

  const openEdit = () => {
    if (!company) return;
    setName(company.name);
    setSystemName(company.system_name);
    setCnpj(company.cnpj ?? "");
    setEmail(company.email ?? "");
    setPhone(company.phone ?? "");
    setLogoUrl(company.logo_url ?? "");
    setPrimaryColor(company.primary_color ?? "#3B82F6");
    setSecondaryColor(company.secondary_color ?? "#1E40AF");
    setWhatsapp(company.whatsapp_financeiro ?? "");
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!company) return;
    setSaving(true);

    const { error } = await supabase
      .from("companies")
      .update({
        name: name.trim(),
        system_name: systemName.trim(),
        cnpj: cnpj.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        logo_url: logoUrl.trim() || null,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        whatsapp_financeiro: whatsapp.trim() || null,
      })
      .eq("id", company.id);

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Empresa atualizada!" });
      setEditOpen(false);
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Minha Empresa</h1>
        <Button onClick={openEdit} size="sm" variant="outline" className="gap-2">
          <Pencil size={14} /> Editar
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            {company.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="h-14 w-14 rounded-lg object-cover" />
            ) : (
              <div
                className="h-14 w-14 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: company.primary_color ?? "#3B82F6" }}
              >
                {company.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-foreground">{company.name}</h2>
              <p className="text-sm text-muted-foreground">{company.system_name}</p>
            </div>
            <Badge className="ml-auto">{company.plan}</Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            {company.cnpj && (
              <div><span className="text-muted-foreground">CNPJ:</span> {company.cnpj}</div>
            )}
            {company.email && (
              <div><span className="text-muted-foreground">E-mail:</span> {company.email}</div>
            )}
            {company.phone && (
              <div><span className="text-muted-foreground">Telefone:</span> {company.phone}</div>
            )}
            {company.whatsapp_financeiro && (
              <div><span className="text-muted-foreground">WhatsApp:</span> {company.whatsapp_financeiro}</div>
            )}
            <div><span className="text-muted-foreground">Máx. Unidades:</span> {company.max_units}</div>
            <div><span className="text-muted-foreground">Máx. Usuários:</span> {company.max_users}</div>
          </div>

          {/* Color preview */}
          <div className="mt-6 flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Cores:</span>
            <div className="h-6 w-6 rounded-full border" style={{ backgroundColor: company.primary_color ?? "#3B82F6" }} />
            <div className="h-6 w-6 rounded-full border" style={{ backgroundColor: company.secondary_color ?? "#1E40AF" }} />
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome da Empresa</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Nome do Sistema</Label>
                <Input value={systemName} onChange={(e) => setSystemName(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>CNPJ</Label>
                <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>URL do Logo</Label>
              <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
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
              <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCompanies;
