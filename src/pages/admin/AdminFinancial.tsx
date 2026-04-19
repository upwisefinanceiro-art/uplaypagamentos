import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle, FileDown,
  FileSpreadsheet, Trophy, Calculator, CalendarClock, Bell,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface Payment {
  id: string;
  unit_id: string;
  responsible_id: string;
  due_date: string;
  paid_at: string | null;
  value: number;
  final_value: number | null;
  original_value: number | null;
  status: string;
  payment_method: string | null;
  payment_type: string;
  description: string;
}
interface Unit { id: string; name: string; }
interface Profile { id: string; full_name: string; unit_id: string | null; }
interface CostRow { unit_id: string; fixed_monthly_cost: number; cost_per_student: number; }

const PAID = ["PAID", "RECEIVED", "CONFIRMED"];
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const parseDate = (s: string | null) => s ? new Date(s.length <= 10 ? s + "T00:00:00" : s) : null;

const AdminFinancial = () => {
  const { hasRole } = useAuth();
  const isMaster = hasRole("ADMIN_MASTER");

  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeStudents, setActiveStudents] = useState<Record<string, number>>({});
  const [costs, setCosts] = useState<Record<string, CostRow>>({});

  // filters
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [methodFilter, setMethodFilter] = useState<string>("ALL");
  const [period, setPeriod] = useState<string>("MONTH"); // MONTH | LAST30 | LAST90 | YEAR

  // costs editor (Master only)
  const [editCosts, setEditCosts] = useState<Record<string, { fixed: string; perStudent: string }>>({});

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [pRes, uRes, prRes, sRes, cRes] = await Promise.all([
        supabase.from("payments").select("id,unit_id,responsible_id,due_date,paid_at,value,final_value,original_value,status,payment_method,payment_type,description").limit(10000),
        supabase.from("units").select("id,name").eq("active", true),
        supabase.from("profiles").select("id,full_name,unit_id"),
        supabase.from("students").select("unit_id, active"),
        supabase.from("unit_financial_costs").select("unit_id,fixed_monthly_cost,cost_per_student"),
      ]);
      setPayments((pRes.data ?? []) as Payment[]);
      setUnits((uRes.data ?? []) as Unit[]);
      setProfiles((prRes.data ?? []) as Profile[]);
      const byUnit: Record<string, number> = {};
      (sRes.data ?? []).forEach((s: any) => {
        if (s.active && s.unit_id) byUnit[s.unit_id] = (byUnit[s.unit_id] || 0) + 1;
      });
      setActiveStudents(byUnit);
      const cm: Record<string, CostRow> = {};
      (cRes.data ?? []).forEach((c: any) => { cm[c.unit_id] = c; });
      setCosts(cm);
    } catch (e: any) {
      toast.error("Erro ao carregar dados financeiros");
    } finally {
      setLoading(false);
    }
  };

  // ===== filtering =====
  const periodRange = useMemo(() => {
    const end = today();
    const start = new Date(end);
    if (period === "MONTH") { start.setDate(1); }
    else if (period === "LAST30") { start.setDate(end.getDate() - 30); }
    else if (period === "LAST90") { start.setDate(end.getDate() - 90); }
    else if (period === "YEAR") { start.setMonth(0, 1); }
    return { start, end };
  }, [period]);

  const filtered = useMemo(() => {
    return payments.filter(p => {
      if (unitFilter !== "ALL" && p.unit_id !== unitFilter) return false;
      if (methodFilter !== "ALL" && (p.payment_method ?? "") !== methodFilter) return false;
      const dd = parseDate(p.due_date);
      if (!dd) return false;
      const inPeriod = dd >= periodRange.start && dd <= new Date(periodRange.end.getTime() + 86400000);
      if (!inPeriod) return false;
      if (statusFilter === "PAID") return PAID.includes(p.status);
      if (statusFilter === "PENDING") return p.status === "PENDING" && dd >= today();
      if (statusFilter === "OVERDUE") return p.status === "OVERDUE" || (p.status === "PENDING" && dd < today());
      return true;
    });
  }, [payments, unitFilter, statusFilter, methodFilter, periodRange]);

  // ===== KPIs =====
  const kpis = useMemo(() => {
    const total = filtered.reduce((s, p) => s + (p.original_value ?? p.value ?? 0), 0);
    const paid = filtered.filter(p => PAID.includes(p.status));
    const received = paid.reduce((s, p) => s + (p.final_value ?? p.value ?? 0), 0);
    const pending = filtered.filter(p => p.status === "PENDING" && (parseDate(p.due_date)! >= today()))
      .reduce((s, p) => s + (p.value ?? 0), 0);
    const overdueList = filtered.filter(p => p.status === "OVERDUE" || (p.status === "PENDING" && parseDate(p.due_date)! < today()));
    const overdue = overdueList.reduce((s, p) => s + (p.value ?? 0), 0);
    const ticket = paid.length ? received / paid.length : 0;

    // growth: compare current month receipts vs previous month receipts
    const now = today();
    const startCur = new Date(now.getFullYear(), now.getMonth(), 1);
    const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endPrev = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const recCur = payments.filter(p => PAID.includes(p.status) && p.paid_at && new Date(p.paid_at) >= startCur)
      .reduce((s, p) => s + (p.final_value ?? p.value ?? 0), 0);
    const recPrev = payments.filter(p => PAID.includes(p.status) && p.paid_at && new Date(p.paid_at) >= startPrev && new Date(p.paid_at) <= endPrev)
      .reduce((s, p) => s + (p.final_value ?? p.value ?? 0), 0);
    const growth = recPrev > 0 ? ((recCur - recPrev) / recPrev) * 100 : (recCur > 0 ? 100 : 0);

    return { total, received, pending, overdue, ticket, growth, overdueList, paidCount: paid.length };
  }, [filtered, payments]);

  // ===== charts =====
  const monthlyChart = useMemo(() => {
    const map: Record<string, { mes: string; faturado: number; recebido: number }> = {};
    const now = today();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short" });
      map[k] = { mes: label, faturado: 0, recebido: 0 };
    }
    payments.forEach(p => {
      if (unitFilter !== "ALL" && p.unit_id !== unitFilter) return;
      const dd = parseDate(p.due_date); if (!dd) return;
      const k = `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,"0")}`;
      if (map[k]) map[k].faturado += p.original_value ?? p.value ?? 0;
      if (PAID.includes(p.status) && p.paid_at) {
        const pd = new Date(p.paid_at);
        const kp = `${pd.getFullYear()}-${String(pd.getMonth()+1).padStart(2,"0")}`;
        if (map[kp]) map[kp].recebido += p.final_value ?? p.value ?? 0;
      }
    });
    return Object.values(map);
  }, [payments, unitFilter]);

  const pieData = useMemo(() => [
    { name: "Recebido", value: kpis.received, color: "hsl(var(--success, 142 71% 45%))" },
    { name: "Pendente", value: kpis.pending, color: "hsl(var(--warning, 38 92% 50%))" },
    { name: "Atrasado", value: kpis.overdue, color: "hsl(var(--destructive))" },
  ].filter(d => d.value > 0), [kpis]);

  const unitChart = useMemo(() => {
    const map: Record<string, { name: string; recebido: number }> = {};
    units.forEach(u => { map[u.id] = { name: u.name, recebido: 0 }; });
    filtered.filter(p => PAID.includes(p.status)).forEach(p => {
      if (map[p.unit_id]) map[p.unit_id].recebido += p.final_value ?? p.value ?? 0;
    });
    return Object.values(map).filter(x => x.recebido > 0).sort((a,b) => b.recebido - a.recebido).slice(0, 8);
  }, [filtered, units]);

  // ===== inadimplência =====
  const inadimplencia = useMemo(() => {
    const grouped: Record<string, { name: string; unit: string; days: number; total: number; count: number }> = {};
    kpis.overdueList.forEach(p => {
      const dd = parseDate(p.due_date)!;
      const days = Math.floor((today().getTime() - dd.getTime()) / 86400000);
      const profile = profiles.find(x => x.id === p.responsible_id);
      const unit = units.find(u => u.id === p.unit_id);
      const k = p.responsible_id;
      if (!grouped[k]) grouped[k] = { name: profile?.full_name ?? "Cliente", unit: unit?.name ?? "—", days, total: 0, count: 0 };
      grouped[k].days = Math.max(grouped[k].days, days);
      grouped[k].total += p.value ?? 0;
      grouped[k].count += 1;
    });
    return Object.values(grouped).sort((a,b) => b.days - a.days);
  }, [kpis.overdueList, profiles, units]);

  const severity = (days: number) => {
    if (days <= 5) return { label: "Leve", cls: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400", flash: false };
    if (days <= 15) return { label: "Moderado", cls: "bg-orange-500/20 text-orange-700 dark:text-orange-400", flash: false };
    return { label: "Grave", cls: "bg-destructive/20 text-destructive", flash: true };
  };

  // ===== ranking =====
  const ranking = useMemo(() => {
    return units.map(u => {
      const ps = payments.filter(p => p.unit_id === u.id);
      const total = ps.reduce((s, p) => s + (p.original_value ?? p.value ?? 0), 0);
      const recebido = ps.filter(p => PAID.includes(p.status))
        .reduce((s, p) => s + (p.final_value ?? p.value ?? 0), 0);
      const overdue = ps.filter(p => p.status === "OVERDUE" || (p.status === "PENDING" && parseDate(p.due_date)! < today()))
        .reduce((s, p) => s + (p.value ?? 0), 0);
      const inad = total > 0 ? (overdue / total) * 100 : 0;
      const taxaPag = total > 0 ? (recebido / total) * 100 : 0;
      return { id: u.id, name: u.name, total, recebido, overdue, inad, taxaPag };
    }).sort((a, b) => b.recebido - a.recebido);
  }, [payments, units]);

  // ===== lucro real =====
  const lucro = useMemo(() => {
    const list = (unitFilter === "ALL" ? units : units.filter(u => u.id === unitFilter));
    let receita = 0, custoFixo = 0, custoVar = 0, alunos = 0;
    list.forEach(u => {
      const c = costs[u.id];
      const a = activeStudents[u.id] ?? 0;
      alunos += a;
      custoFixo += c?.fixed_monthly_cost ?? 0;
      custoVar += (c?.cost_per_student ?? 0) * a;
      receita += filtered.filter(p => p.unit_id === u.id && PAID.includes(p.status))
        .reduce((s, p) => s + (p.final_value ?? p.value ?? 0), 0);
    });
    const custoTotal = custoFixo + custoVar;
    const lucroLiq = receita - custoTotal;
    const margem = receita > 0 ? (lucroLiq / receita) * 100 : 0;
    return { receita, custoFixo, custoVar, custoTotal, lucroLiq, margem, alunos };
  }, [filtered, units, costs, activeStudents, unitFilter]);

  // ===== previsão =====
  const previsao = useMemo(() => {
    const now = today();
    const ranges = [7, 15, 30];
    return ranges.map(days => {
      const end = new Date(now.getTime() + days * 86400000);
      const sum = payments
        .filter(p => unitFilter === "ALL" || p.unit_id === unitFilter)
        .filter(p => p.status === "PENDING")
        .filter(p => {
          const dd = parseDate(p.due_date)!;
          return dd >= now && dd <= end;
        })
        .reduce((s, p) => s + (p.value ?? 0), 0);
      return { label: `${days} dias`, value: sum };
    });
  }, [payments, unitFilter]);

  // ===== alertas =====
  const alertas = useMemo(() => {
    const out: { type: "danger" | "warn"; msg: string }[] = [];
    const inadPct = kpis.total > 0 ? (kpis.overdue / kpis.total) * 100 : 0;
    if (inadPct >= 20) out.push({ type: "danger", msg: `Inadimplência alta no período: ${inadPct.toFixed(1)}%` });
    if (kpis.growth <= -10) out.push({ type: "danger", msg: `Queda de faturamento: ${kpis.growth.toFixed(1)}% vs mês anterior` });
    const cancel = payments.filter(p => p.status === "CANCELLED").length;
    if (cancel >= 10) out.push({ type: "warn", msg: `${cancel} cobranças canceladas no histórico` });
    return out;
  }, [kpis, payments]);

  // ===== exports =====
  const exportPDF = () => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString("pt-BR");
    doc.setFontSize(16); doc.text("Relatório Financeiro — UPLAY Pagamentos", 14, 18);
    doc.setFontSize(10); doc.text(`Gerado em ${dateStr}`, 14, 25);
    doc.text(`Período: ${period} • Unidade: ${unitFilter === "ALL" ? "Todas" : (units.find(u => u.id === unitFilter)?.name ?? "—")}`, 14, 31);

    autoTable(doc, {
      startY: 38,
      head: [["Indicador", "Valor"]],
      body: [
        ["Faturamento total", fmt(kpis.total)],
        ["Recebido", fmt(kpis.received)],
        ["Pendente", fmt(kpis.pending)],
        ["Em atraso", fmt(kpis.overdue)],
        ["Ticket médio", fmt(kpis.ticket)],
        ["Crescimento m/m", `${kpis.growth.toFixed(1)}%`],
        ["Receita (lucro)", fmt(lucro.receita)],
        ["Custo total", fmt(lucro.custoTotal)],
        ["Lucro líquido", fmt(lucro.lucroLiq)],
        ["Margem", `${lucro.margem.toFixed(1)}%`],
      ],
    });

    autoTable(doc, {
      head: [["Unidade", "Faturado", "Recebido", "Inadimplência %"]],
      body: ranking.map(r => [r.name, fmt(r.total), fmt(r.recebido), `${r.inad.toFixed(1)}%`]),
    });

    if (inadimplencia.length) {
      autoTable(doc, {
        head: [["Cliente", "Unidade", "Dias", "Valor"]],
        body: inadimplencia.slice(0, 30).map(i => [i.name, i.unit, String(i.days), fmt(i.total)]),
      });
    }

    doc.save(`financeiro-${dateStr.replace(/\//g, "-")}.pdf`);
    toast.success("Relatório PDF gerado");
  };

  const exportXLSX = () => {
    const wb = XLSX.utils.book_new();
    const summary = [
      ["Indicador", "Valor"],
      ["Faturamento total", kpis.total],
      ["Recebido", kpis.received],
      ["Pendente", kpis.pending],
      ["Em atraso", kpis.overdue],
      ["Ticket médio", kpis.ticket],
      ["Crescimento m/m %", kpis.growth],
      ["Lucro líquido", lucro.lucroLiq],
      ["Margem %", lucro.margem],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Resumo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ranking.map(r => ({
      Unidade: r.name, Faturado: r.total, Recebido: r.recebido, Atrasado: r.overdue, "Inadimplência%": r.inad,
    }))), "Ranking");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filtered.map(p => ({
      Vencimento: p.due_date, Valor: p.value, Recebido: p.final_value, Status: p.status,
      Forma: p.payment_method, Tipo: p.payment_type, Descrição: p.description,
    }))), "Cobranças");
    XLSX.writeFile(wb, `financeiro-${new Date().toISOString().slice(0,10)}.xlsx`);
    toast.success("Excel gerado");
  };

  // ===== save costs =====
  const saveCost = async (unitId: string) => {
    const ed = editCosts[unitId];
    if (!ed) return;
    const fixed = parseFloat(ed.fixed.replace(",", ".")) || 0;
    const perStudent = parseFloat(ed.perStudent.replace(",", ".")) || 0;
    const { error } = await supabase
      .from("unit_financial_costs")
      .upsert({ unit_id: unitId, fixed_monthly_cost: fixed, cost_per_student: perStudent }, { onConflict: "unit_id" });
    if (error) { toast.error("Erro ao salvar custos"); return; }
    toast.success("Custos salvos");
    setEditCosts(prev => { const c = { ...prev }; delete c[unitId]; return c; });
    fetchAll();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <style>{`@keyframes flashred {0%,100%{background-color:hsl(var(--destructive)/0.15)}50%{background-color:hsl(var(--destructive)/0.35)}}.flash-danger{animation:flashred 1.4s ease-in-out infinite;}`}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Financeiro Avançado</h1>
          <p className="text-xs text-muted-foreground">Visão completa de receita, lucro e inadimplência</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportXLSX}><FileSpreadsheet size={16} className="mr-1" />Excel</Button>
          <Button size="sm" onClick={exportPDF}><FileDown size={16} className="mr-1" />Relatório PDF</Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Período</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTH">Mês atual</SelectItem>
                <SelectItem value="LAST30">Últimos 30 dias</SelectItem>
                <SelectItem value="LAST90">Últimos 90 dias</SelectItem>
                <SelectItem value="YEAR">Ano atual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Unidade</Label>
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas</SelectItem>
                {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="PAID">Pago</SelectItem>
                <SelectItem value="PENDING">Pendente</SelectItem>
                <SelectItem value="OVERDUE">Atrasado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Forma de pagamento</Label>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas</SelectItem>
                <SelectItem value="PIX">PIX</SelectItem>
                <SelectItem value="BOLETO">Boleto</SelectItem>
                <SelectItem value="CREDIT_CARD">Cartão</SelectItem>
                <SelectItem value="UNDEFINED">Indefinida</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Alertas */}
      {alertas.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Bell size={16} className="text-destructive" />Alertas Importantes</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {alertas.map((a, i) => (
              <div key={i} className={`text-xs px-3 py-2 rounded ${a.type === "danger" ? "bg-destructive/10 text-destructive" : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"}`}>{a.msg}</div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Kpi icon={<DollarSign size={18} />} label="Faturado" value={fmt(kpis.total)} />
        <Kpi icon={<TrendingUp size={18} className="text-success" />} label="Recebido" value={fmt(kpis.received)} />
        <Kpi icon={<CalendarClock size={18} />} label="Pendente" value={fmt(kpis.pending)} />
        <Kpi icon={<AlertTriangle size={18} className="text-destructive" />} label="Em atraso" value={fmt(kpis.overdue)} />
        <Kpi icon={<Calculator size={18} />} label="Ticket médio" value={fmt(kpis.ticket)} />
        <Kpi
          icon={kpis.growth >= 0 ? <TrendingUp size={18} className="text-success" /> : <TrendingDown size={18} className="text-destructive" />}
          label="Crescimento m/m"
          value={`${kpis.growth >= 0 ? "+" : ""}${kpis.growth.toFixed(1)}%`}
        />
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="overview">Visão</TabsTrigger>
          <TabsTrigger value="inad">Inadimplência</TabsTrigger>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="lucro">Lucro</TabsTrigger>
          <TabsTrigger value="prev">Previsão</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Faturamento por mês</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                    <RTooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                    <Legend />
                    <Line type="monotone" dataKey="faturado" stroke="hsl(var(--primary))" strokeWidth={2} />
                    <Line type="monotone" dataKey="recebido" stroke="hsl(var(--success, 142 71% 45%))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Distribuição de status</CardTitle></CardHeader>
              <CardContent className="h-64">
                {pieData.length === 0 ? <p className="text-xs text-muted-foreground text-center pt-16">Sem dados no período</p> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e: any) => e.name}>
                        {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <RTooltip formatter={(v: number) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Recebimentos por unidade</CardTitle></CardHeader>
              <CardContent className="h-64">
                {unitChart.length === 0 ? <p className="text-xs text-muted-foreground text-center pt-16">Sem recebimentos no período</p> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={unitChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                      <RTooltip formatter={(v: number) => fmt(v)} />
                      <Bar dataKey="recebido" fill="hsl(var(--primary))" radius={[6,6,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* INAD */}
        <TabsContent value="inad">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Controle de Inadimplência ({inadimplencia.length})</CardTitle></CardHeader>
            <CardContent>
              {inadimplencia.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum cliente em atraso 🎉</p>
              ) : (
                <div className="space-y-2 max-h-[480px] overflow-y-auto">
                  {inadimplencia.map((i, idx) => {
                    const sev = severity(i.days);
                    return (
                      <div key={idx} className={`p-3 rounded border border-border flex items-center justify-between gap-3 ${sev.flash ? "flash-danger" : "bg-muted/30"}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{i.name}</p>
                          <p className="text-[11px] text-muted-foreground">{i.unit} • {i.count} cobrança(s)</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge className={`text-[10px] ${sev.cls}`}>{sev.label} • {i.days}d</Badge>
                          <span className="text-sm font-semibold text-destructive">{fmt(i.total)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* RANKING */}
        <TabsContent value="ranking">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Trophy size={16} />Desempenho das Unidades</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr><th className="text-left py-2">#</th><th className="text-left">Unidade</th><th className="text-right">Faturado</th><th className="text-right">Recebido</th><th className="text-right">Taxa pgto</th><th className="text-right">Inadimplência</th></tr>
                  </thead>
                  <tbody>
                    {ranking.map((r, idx) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="py-2">{idx + 1}</td>
                        <td className="font-medium">{r.name}</td>
                        <td className="text-right">{fmt(r.total)}</td>
                        <td className="text-right text-success">{fmt(r.recebido)}</td>
                        <td className="text-right">{r.taxaPag.toFixed(1)}%</td>
                        <td className={`text-right ${r.inad >= 20 ? "text-destructive font-semibold" : ""}`}>{r.inad.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LUCRO */}
        <TabsContent value="lucro" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={<DollarSign size={18} className="text-success" />} label="Receita" value={fmt(lucro.receita)} />
            <Kpi icon={<Calculator size={18} />} label="Custo total" value={fmt(lucro.custoTotal)} />
            <Kpi icon={lucro.lucroLiq >= 0 ? <TrendingUp size={18} className="text-success" /> : <TrendingDown size={18} className="text-destructive" />} label="Lucro líquido" value={fmt(lucro.lucroLiq)} />
            <Kpi icon={<TrendingUp size={18} />} label="Margem" value={`${lucro.margem.toFixed(1)}%`} />
          </div>

          {isMaster && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Custos por unidade</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">Configure o custo fixo mensal (aluguel, folha, etc.) e o custo médio por aluno ativo. Usado para calcular o lucro real.</p>
                {units.map(u => {
                  const cur = costs[u.id];
                  const ed = editCosts[u.id];
                  const editing = !!ed;
                  return (
                    <div key={u.id} className="grid grid-cols-12 gap-2 items-end p-3 rounded border border-border">
                      <div className="col-span-12 lg:col-span-3">
                        <p className="text-sm font-medium">{u.name}</p>
                        <p className="text-[11px] text-muted-foreground">{activeStudents[u.id] ?? 0} alunos ativos</p>
                      </div>
                      <div className="col-span-6 lg:col-span-3">
                        <Label className="text-xs">Custo fixo (R$)</Label>
                        <Input value={editing ? ed.fixed : (cur?.fixed_monthly_cost ?? 0).toString()} onChange={e => setEditCosts(p => ({ ...p, [u.id]: { fixed: e.target.value, perStudent: ed?.perStudent ?? (cur?.cost_per_student ?? 0).toString() } }))} />
                      </div>
                      <div className="col-span-6 lg:col-span-3">
                        <Label className="text-xs">Custo/aluno (R$)</Label>
                        <Input value={editing ? ed.perStudent : (cur?.cost_per_student ?? 0).toString()} onChange={e => setEditCosts(p => ({ ...p, [u.id]: { fixed: ed?.fixed ?? (cur?.fixed_monthly_cost ?? 0).toString(), perStudent: e.target.value } }))} />
                      </div>
                      <div className="col-span-12 lg:col-span-3">
                        <Button size="sm" disabled={!editing} onClick={() => saveCost(u.id)} className="w-full">Salvar</Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* PREVISAO */}
        <TabsContent value="prev">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Previsão de Recebimento</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {previsao.map(p => (
                  <div key={p.label} className="p-4 rounded border border-border bg-muted/30 text-center">
                    <p className="text-xs text-muted-foreground">Próximos {p.label}</p>
                    <p className="text-xl font-bold text-foreground mt-1">{fmt(p.value)}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">Baseado em cobranças PENDENTES com vencimento dentro do período.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const Kpi = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <Card>
    <CardContent className="p-3">
      <div className="flex items-center justify-between mb-1">{icon}</div>
      <p className="text-base font-bold text-foreground truncate">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </CardContent>
  </Card>
);

export default AdminFinancial;
