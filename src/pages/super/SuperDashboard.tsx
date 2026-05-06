import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Users, CreditCard, TrendingUp, AlertTriangle, CheckCircle2, Ban, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface Company {
  id: string;
  name: string;
  system_name: string;
  plan: string;
  status: string;
  created_at: string;
}

interface Subscription {
  company_id: string;
  status: string;
  monthly_value: number;
  next_billing_date: string | null;
  block_deadline: string | null;
  plan: string;
}

interface Metrics {
  totalCompanies: number;
  activeCompanies: number;
  lateCompanies: number;
  blockedCompanies: number;
  totalUnits: number;
  totalUsers: number;
  totalPayments: number;
  totalRevenue: number;
  overduePayments: number;
  saasMonthlyRevenue: number;
  saasReceivedRevenue: number;
  companies: Company[];
  subscriptions: Record<string, Subscription>;
}

const SuperDashboard = () => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);

      const [companiesRes, unitsRes, profilesRes, paymentsRes, subsRes, saasInvoicesRes] = await Promise.all([
        supabase.from("companies").select("id, name, system_name, logo_url, primary_color, secondary_color, whatsapp_financeiro, cnpj, email, phone, plan, status, max_units, max_users, endereco, numero, bairro, cidade, estado, cep, asaas_base_url_master, valor_mensalidade, dias_bloqueio, whatsapp_master, created_at, updated_at"),
        supabase.from("units").select("id, company_id"),
        supabase.from("profiles").select("id"),
        supabase.from("payments").select("id, status, value, final_value, paid_at"),
        supabase.from("saas_subscriptions").select("company_id, status, monthly_value, next_billing_date, block_deadline, plan"),
        supabase.from("saas_invoices").select("id, status, value, paid_at"),
      ]);

      const companies = (companiesRes.data ?? []) as Company[];
      const units = unitsRes.data ?? [];
      const profiles = profilesRes.data ?? [];
      const payments = paymentsRes.data ?? [];
      const subs = (subsRes.data ?? []) as Subscription[];
      const saasInvoices = saasInvoicesRes.data ?? [];

      const paidPayments = payments.filter(
        (p) => p.status === "PAID" || p.status === "RECEIVED" || p.status === "CONFIRMED"
      );
      const totalRevenue = paidPayments.reduce(
        (sum, p) => sum + ((p as any).final_value ?? (p as any).value ?? 0),
        0
      );
      const overduePayments = payments.filter(
        (p) => p.status === "OVERDUE" || (p.status === "PENDING" && new Date((p as any).due_date + "T00:00:00") < new Date(new Date().toDateString()))
      ).length;

      // SaaS revenue
      const saasMonthlyRevenue = subs.reduce((sum, s) => sum + (s.monthly_value || 0), 0);
      const saasReceivedRevenue = saasInvoices
        .filter((i: any) => i.status === "PAID" || i.status === "RECEIVED" || i.status === "CONFIRMED")
        .reduce((sum: number, i: any) => sum + (i.value || 0), 0);

      // Build subscriptions map
      const subsMap: Record<string, Subscription> = {};
      subs.forEach(s => { subsMap[s.company_id] = s; });

      setMetrics({
        totalCompanies: companies.length,
        activeCompanies: companies.filter((c) => c.status === "ATIVO").length,
        lateCompanies: companies.filter((c) => c.status === "ATRASADO").length,
        blockedCompanies: companies.filter((c) => c.status === "BLOQUEADO").length,
        totalUnits: units.length,
        totalUsers: profiles.length,
        totalPayments: payments.length,
        totalRevenue,
        overduePayments,
        saasMonthlyRevenue,
        saasReceivedRevenue,
        companies,
        subscriptions: subsMap,
      });

      setLoading(false);
    };

    fetchMetrics();
  }, []);

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
      case "ATRASADO": return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400";
      case "BLOQUEADO": return "bg-destructive/20 text-destructive";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-xl font-bold text-foreground">Dashboard SaaS</h1>

      {/* Company Status KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Building2 size={20} className="text-primary" />
              <span className="text-[10px] text-muted-foreground">/ {metrics.totalCompanies} total</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{metrics.activeCompanies}</p>
            <p className="text-xs text-muted-foreground mt-1">Empresas Ativas</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Clock size={20} className="text-yellow-600" />
            </div>
            <p className="text-2xl font-bold text-foreground">{metrics.lateCompanies}</p>
            <p className="text-xs text-muted-foreground mt-1">Empresas Atrasadas</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Ban size={20} className="text-destructive" />
            </div>
            <p className="text-2xl font-bold text-foreground">{metrics.blockedCompanies}</p>
            <p className="text-xs text-muted-foreground mt-1">Empresas Bloqueadas</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp size={20} className="text-success" />
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(metrics.saasMonthlyRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">Receita Mensal SaaS</p>
          </CardContent>
        </Card>
      </div>

      {/* Platform KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <Building2 size={20} className="text-chart-1" />
            <div>
              <p className="text-lg font-bold text-foreground">{metrics.totalUnits}</p>
              <p className="text-xs text-muted-foreground">Unidades</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <Users size={20} className="text-chart-2" />
            <div>
              <p className="text-lg font-bold text-foreground">{metrics.totalUsers}</p>
              <p className="text-xs text-muted-foreground">Usuários</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <CreditCard size={20} className="text-chart-3" />
            <div>
              <p className="text-lg font-bold text-foreground">{metrics.totalPayments}</p>
              <p className="text-xs text-muted-foreground">Cobranças Total</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp size={20} className="text-success" />
            <div>
              <p className="text-lg font-bold text-foreground">{formatCurrency(metrics.totalRevenue)}</p>
              <p className="text-xs text-muted-foreground">Receita Clientes</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SaaS Revenue */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-success" />
            <div>
              <p className="text-lg font-bold text-foreground">{formatCurrency(metrics.saasReceivedRevenue)}</p>
              <p className="text-xs text-muted-foreground">Recebido SaaS</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle size={20} className="text-warning" />
            <div>
              <p className="text-lg font-bold text-foreground">{metrics.overduePayments}</p>
              <p className="text-xs text-muted-foreground">Cobranças em Atraso</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-success" />
            <div>
              <p className="text-lg font-bold text-foreground">
                {metrics.totalPayments > 0
                  ? ((1 - metrics.overduePayments / metrics.totalPayments) * 100).toFixed(1)
                  : "0"}%
              </p>
              <p className="text-xs text-muted-foreground">Adimplência</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Companies list with subscription info */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Empresas Cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.companies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma empresa cadastrada.</p>
          ) : (
            <div className="space-y-3">
              {metrics.companies.map((company) => {
                const sub = metrics.subscriptions[company.id];
                return (
                  <div key={company.id} className="p-3 rounded-lg bg-muted/30 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-sm text-foreground">{company.name}</p>
                        <p className="text-xs text-muted-foreground">{company.system_name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`text-[10px] ${planColor(company.plan)}`}>{company.plan}</Badge>
                        <Badge className={`text-[10px] ${statusColor(company.status)}`}>{company.status}</Badge>
                      </div>
                    </div>
                    {sub && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground mt-1">
                        <span>Mensalidade: {formatCurrency(sub.monthly_value)}</span>
                        {sub.next_billing_date && (
                          <span>Próx. vencimento: {new Date(sub.next_billing_date + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                        )}
                        {sub.block_deadline && (
                          <span>Limite bloqueio: {new Date(sub.block_deadline + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                        )}
                        <span className={sub.status === "BLOCKED" ? "text-destructive font-medium" : sub.status === "OVERDUE" ? "text-yellow-600 font-medium" : ""}>
                          Assinatura: {sub.status}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperDashboard;
