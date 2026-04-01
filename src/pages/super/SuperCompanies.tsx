import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Plus, Pencil, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import CompanyDialog from "@/components/super/CompanyDialog";

export interface Company {
  id: string;
  name: string;
  system_name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  whatsapp_financeiro: string | null;
  plan: string;
  status: string;
  max_units: number;
  max_users: number;
  created_at: string;
  updated_at: string;
}

const SuperCompanies = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const { toast } = useToast();

  const fetchCompanies = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("companies").select("*").order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar empresas", description: error.message, variant: "destructive" });
    } else {
      setCompanies(data as Company[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const filtered = companies.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.system_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleNew = () => {
    setEditingCompany(null);
    setDialogOpen(true);
  };

  const handleEdit = (company: Company) => {
    setEditingCompany(company);
    setDialogOpen(true);
  };

  const handleSaved = () => {
    setDialogOpen(false);
    setEditingCompany(null);
    fetchCompanies();
  };

  const planColor = (plan: string) => {
    switch (plan) {
      case "ENTERPRISE": return "bg-primary text-primary-foreground";
      case "PRO": return "bg-chart-1 text-white";
      case "BASIC": return "bg-chart-2 text-white";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "ATIVO": return "bg-success/20 text-success";
      case "INATIVO": return "bg-muted text-muted-foreground";
      case "BLOQUEADO": return "bg-destructive/20 text-destructive";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground">Empresas</h1>
        <Button onClick={handleNew} size="sm" className="gap-2">
          <Plus size={16} />
          Nova Empresa
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar empresa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card className="border-border">
          <CardContent className="p-8 text-center">
            <Building2 size={40} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma empresa encontrada.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((company) => (
            <Card key={company.id} className="border-border hover:border-primary/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {company.logo_url ? (
                      <img src={company.logo_url} alt={company.name} className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <div
                        className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                        style={{ backgroundColor: company.primary_color }}
                      >
                        {company.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-sm text-foreground">{company.name}</p>
                      <p className="text-xs text-muted-foreground">{company.system_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[10px] ${planColor(company.plan)}`}>{company.plan}</Badge>
                    <Badge className={`text-[10px] ${statusColor(company.status)}`}>{company.status}</Badge>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(company)} className="h-8 w-8">
                      <Pencil size={14} />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                  <span>Máx. {company.max_units} unidades</span>
                  <span>Máx. {company.max_users} usuários</span>
                  {company.whatsapp_financeiro && <span>WhatsApp: {company.whatsapp_financeiro}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CompanyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        company={editingCompany}
        onSaved={handleSaved}
      />
    </div>
  );
};

export default SuperCompanies;
