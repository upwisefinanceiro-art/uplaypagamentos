import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Plus, Pencil, Search, FileText, Copy, RefreshCw, CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  plan: string;
  status: string;
  max_units: number;
  max_users: number;
  created_at: string;
  updated_at: string;
}

interface Subscription {
  id: string;
  company_id: string;
  monthly_value: number;
  due_day: number;
  next_billing_date: string | null;
  block_deadline: string | null;
  status: string;
  asaas_customer_id: string | null;
}

interface Invoice {
  id: string;
  company_id: string;
  value: number;
  due_date: string;
  status: string;
  invoice_url: string | null;
  boleto_url: string | null;
  pix_copy_paste: string | null;
  asaas_payment_id: string | null;
}

const SuperCompanies = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [subscriptions, setSubscriptions] = useState<Record<string, Subscription>>({});
  const [latestInvoices, setLatestInvoices] = useState<Record<string, Invoice>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [charging, setCharging] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    const COMPANY_COLS = "id, name, system_name, logo_url, primary_color, secondary_color, whatsapp_financeiro, cnpj, email, phone, plan, status, max_units, max_users, endereco, numero, bairro, cidade, estado, cep, asaas_base_url_master, valor_mensalidade, dias_bloqueio, whatsapp_master, created_at, updated_at";
    const [companiesRes, subsRes, invoicesRes] = await Promise.all([
      supabase.from("companies").select(COMPANY_COLS).order("created_at", { ascending: false }),
      supabase.from("saas_subscriptions").select("*"),
      supabase.from("saas_invoices").select("*").order("due_date", { ascending: false }),
    ]);

    if (companiesRes.data) setCompanies(companiesRes.data as Company[]);

    if (subsRes.data) {
      const map: Record<string, Subscription> = {};
      (subsRes.data as Subscription[]).forEach(s => { map[s.company_id] = s; });
      setSubscriptions(map);
    }

    if (invoicesRes.data) {
      const map: Record<string, Invoice> = {};
      (invoicesRes.data as Invoice[]).forEach(inv => {
        if (!map[inv.company_id]) map[inv.company_id] = inv;
      });
      setLatestInvoices(map);
    }

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = companies.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.system_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "ALL" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleNew = () => { setEditingCompany(null); setDialogOpen(true); };
  const handleEdit = (company: Company) => { setEditingCompany(company); setDialogOpen(true); };
  const handleSaved = () => { setDialogOpen(false); setEditingCompany(null); fetchData(); };

  const handleGenerateCharge = async (companyId: string) => {
    setCharging(companyId);
    try {
      const { data, error } = await supabase.functions.invoke("create-saas-charge", {
        body: { company_id: companyId, action: "charge" },
      });

      if (error) throw error;
      if (data?.error) {
        toast({ title: "Erro", description: data.error, variant: "destructive" });
      } else {
        toast({ title: "Cobrança gerada com sucesso!" });
        fetchData();
      }
    } catch (err: any) {
      toast({ title: "Erro ao gerar cobrança", description: err.message, variant: "destructive" });
    }
    setCharging(null);
  };

  const handleCopyPix = (pix: string) => {
    navigator.clipboard.writeText(pix);
    toast({ title: "PIX copiado!" });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "ATIVO": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
      case "ATRASADO": return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
      case "BLOQUEADO": return "bg-destructive/15 text-destructive";
      case "INATIVO": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const subStatusLabel = (status: string) => {
    switch (status) {
      case "ACTIVE": return { label: "Ativa", cls: "bg-emerald-500/15 text-emerald-700" };
      case "OVERDUE": return { label: "Atrasada", cls: "bg-yellow-500/15 text-yellow-700" };
      case "BLOCKED": return { label: "Bloqueada", cls: "bg-destructive/15 text-destructive" };
      default: return { label: status, cls: "bg-muted text-muted-foreground" };
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground">Empresas</h1>
        <Button onClick={handleNew} size="sm" className="gap-2">
          <Plus size={16} /> Nova Empresa
        </Button>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar empresa..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1">
          {["ALL", "ATIVO", "ATRASADO", "BLOQUEADO", "INATIVO"].map(s => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => setStatusFilter(s)}
              className="text-xs"
            >
              {s === "ALL" ? "Todos" : s.charAt(0) + s.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>
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
          {filtered.map((company) => {
            const sub = subscriptions[company.id];
            const invoice = latestInvoices[company.id];
            const subStatus = sub ? subStatusLabel(sub.status) : null;

            return (
              <Card key={company.id} className="border-border hover:border-primary/30 transition-colors">
                <CardContent className="p-4 space-y-3">
                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {company.logo_url ? (
                        <img src={company.logo_url} alt={company.name} className="h-10 w-10 rounded-lg object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                          style={{ backgroundColor: company.primary_color }}>
                          {company.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-sm text-foreground">{company.name}</p>
                        <p className="text-xs text-muted-foreground">{company.system_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${statusColor(company.status)}`}>{company.status}</Badge>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(company)} className="h-8 w-8">
                        <Pencil size={14} />
                      </Button>
                    </div>
                  </div>

                  {/* Company info */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {company.cnpj && <span>CNPJ: {company.cnpj}</span>}
                    {company.email && <span>{company.email}</span>}
                    <span>Máx. {company.max_units} unidades</span>
                  </div>

                  {/* Subscription info */}
                  <div className="border-t pt-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {sub ? (
                        <>
                          <span className="text-muted-foreground">
                            Mensalidade: <strong className="text-foreground">R$ {sub.monthly_value.toFixed(2)}</strong>
                          </span>
                          {sub.next_billing_date && (
                            <span className="text-muted-foreground">
                              Vencimento: <strong className="text-foreground">
                                {new Date(sub.next_billing_date + "T00:00:00").toLocaleDateString("pt-BR")}
                              </strong>
                            </span>
                          )}
                          {sub.block_deadline && (
                            <span className="text-muted-foreground">
                              Limite: <strong className="text-foreground">
                                {new Date(sub.block_deadline + "T00:00:00").toLocaleDateString("pt-BR")}
                              </strong>
                            </span>
                          )}
                          {subStatus && (
                            <Badge className={`text-[10px] ${subStatus.cls}`}>{subStatus.label}</Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground italic">Sem assinatura</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1.5 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs h-7"
                        onClick={() => handleGenerateCharge(company.id)}
                        disabled={charging === company.id}
                      >
                        {charging === company.id ? (
                          <RefreshCw size={12} className="animate-spin" />
                        ) : (
                          <CreditCard size={12} />
                        )}
                        Gerar Cobrança
                      </Button>

                      {invoice?.invoice_url && (
                        <a href={invoice.invoice_url} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7">
                            <FileText size={12} /> Fatura
                          </Button>
                        </a>
                      )}

                      {invoice?.boleto_url && (
                        <a href={invoice.boleto_url} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7">
                            <FileText size={12} /> Boleto
                          </Button>
                        </a>
                      )}

                      {invoice?.pix_copy_paste && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs h-7"
                          onClick={() => handleCopyPix(invoice.pix_copy_paste!)}
                        >
                          <Copy size={12} /> PIX
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
