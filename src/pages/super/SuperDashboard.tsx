import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Users, CreditCard, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
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

interface Metrics {
  totalCompanies: number;
  activeCompanies: number;
  totalUnits: number;
  totalUsers: number;
  totalPayments: number;
  totalRevenue: number;
  overduePayments: number;
  companies: Company[];
}

const SuperDashboard = () => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);

      const [companiesRes, unitsRes, profilesRes, paymentsRes] = await Promise.all([
        supabase.from("companies").select("*"),
        supabase.from("units").select("id, company_id"),
        supabase.from("profiles").select("id"),
        supabase.from("payments").select("id, status, value, final_value, paid_at"),
      ]);

      const companies = (companiesRes.data ?? []) as Company[];
      const units = unitsRes.data ?? [];
      const profiles = profilesRes.data ?? [];
      const payments = paymentsRes.data ?? [];

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

      setMetrics({
        totalCompanies: companies.length,
        activeCompanies: companies.filter((c) => c.status === "ATIVO").length,
        totalUnits: units.length,
        totalUsers: profiles.length,
        totalPayments: payments.length,
        totalRevenue,
        overduePayments,
        companies,
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

  const kpis = [
    { label: "Empresas Ativas", value: metrics.activeCompanies, total: metrics.totalCompanies, icon: Building2, color: "text-primary" },
    { label: "Unidades", value: metrics.totalUnits, icon: Building2, color: "text-chart-1" },
    { label: "Usuários", value: metrics.totalUsers, icon: Users, color: "text-chart-2" },
    { label: "Receita Total", value: formatCurrency(metrics.totalRevenue), icon: TrendingUp, color: "text-success" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-xl font-bold text-foreground">Dashboard SaaS</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <kpi.icon size={20} className={kpi.color} />
                {kpi.total !== undefined && (
                  <span className="text-[10px] text-muted-foreground">/ {kpi.total} total</span>
                )}
              </div>
              <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Extra KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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
            <AlertTriangle size={20} className="text-warning" />
            <div>
              <p className="text-lg font-bold text-foreground">{metrics.overduePayments}</p>
              <p className="text-xs text-muted-foreground">Em Atraso</p>
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

      {/* Companies list */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Empresas Cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.companies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma empresa cadastrada.</p>
          ) : (
            <div className="space-y-3">
              {metrics.companies.map((company) => (
                <div key={company.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                  <div>
                    <p className="font-semibold text-sm text-foreground">{company.name}</p>
                    <p className="text-xs text-muted-foreground">{company.system_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[10px] ${planColor(company.plan)}`}>{company.plan}</Badge>
                    <Badge className={`text-[10px] ${statusColor(company.status)}`}>{company.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperDashboard;
