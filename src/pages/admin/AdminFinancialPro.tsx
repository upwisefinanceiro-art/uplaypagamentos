import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import { FINANCE_CATEGORIES, findCategoryGroup, getSubitems } from "@/lib/finance-categories";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  TrendingUp, DollarSign, Wallet, Target, Plus, Edit2, Trash2,
  CalendarClock, ArrowDownCircle, ArrowUpCircle, Activity, Layers, Download, Filter,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, Legend, CartesianGrid,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from "recharts";

interface Unit { id: string; name: string }
interface Payment {
  id: string; unit_id: string; due_date: string; paid_at: string | null;
  value: number; final_value: number | null; status: string; raw_response: any;
  stock_item_id: string | null; stock_quantity: number;
}
interface StockItem { id: string; cost_price: number }
interface FinanceEntry {
  id: string; unit_id: string; entry_type: "FIXO" | "VARIAVEL" | "CONSUMO";
  direction: "DESPESA" | "RECEITA"; category: string | null; description: string;
  amount: number; competence_date: string; due_date: string; paid_date: string | null;
  reconciliation_status: "PENDENTE" | "PAGO" | "ATRASADO" | "PARCIAL" | "CANCELADO";
  recurrence: "UNICO" | "SEMANAL" | "QUINZENAL" | "MENSAL" | "ANUAL";
  notes: string | null;
  subcategoria?: string | null;
  descricao_item?: string | null;
}

const PAID = ["PAID", "RECEIVED", "CONFIRMED"];
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const toDate = (s: string | null) => (s ? new Date(s.length <= 10 ? s + "T00:00:00" : s) : null);
const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const PERIOD_OPTIONS: Record<string, number | null> = {
  "30D": 30, "90D": 90, "6M": 180, "12M": 365, "ALL": null,
};
const PERIOD_LABEL: Record<string, string> = {
  "30D": "30 dias", "90D": "90 dias", "6M": "6 meses", "12M": "12 meses", "ALL": "Todo período",
};

const emptyEntry = (unitId: string): Partial<FinanceEntry> => ({
  unit_id: unitId, entry_type: "FIXO", direction: "DESPESA",
  category: "", description: "", amount: 0,
  competence_date: isoDate(new Date()),
  due_date: isoDate(new Date()),
  paid_date: null, reconciliation_status: "PENDENTE", recurrence: "UNICO", notes: "",
});

const STATUS_COLOR: Record<string, string> = {
  PENDENTE: "bg-warning/10 text-warning border-warning/20",
  PAGO: "bg-success/10 text-success border-success/20",
  ATRASADO: "bg-destructive/10 text-destructive border-destructive/20",
  PARCIAL: "bg-primary/10 text-primary border-primary/20",
  CANCELADO: "bg-muted text-muted-foreground border-border",
};

const TYPE_LABEL: Record<string, string> = {
  FIXO: "Custo Fixo", VARIAVEL: "Custo Variável", CONSUMO: "Consumo",
};

const AdminFinancialPro = () => {
  const { hasRole, user } = useAuth();
  const isMaster = hasRole("ADMIN_MASTER");

  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<Unit[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [entries, setEntries] = useState<FinanceEntry[]>([]);

  // ===== Filtros =====
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [periodFilter, setPeriodFilter] = useState<string>("90D");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const [directionFilter, setDirectionFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  // dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<FinanceEntry> | null>(null);

  const periodCutoff = useMemo(() => {
    const days = PERIOD_OPTIONS[periodFilter];
    if (days == null) return null;
    return isoDate(addDays(startOfDay(), -days));
  }, [periodFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usRes, siRes, paymentsAll, entriesAll] = await Promise.all([
        supabase.from("units").select("id,name").eq("active", true).order("name"),
        supabase.from("stock_items").select("id,cost_price"),
        fetchAllPaginated<Payment>((from, to) => {
          let q = supabase
            .from("payments")
            .select("id,unit_id,due_date,paid_at,value,final_value,status,raw_response,stock_item_id,stock_quantity")
            .order("due_date", { ascending: false })
            .range(from, to);
          if (periodCutoff) q = q.gte("due_date", periodCutoff);
          return q as any;
        }),
        fetchAllPaginated<FinanceEntry>((from, to) => {
          let q = supabase
            .from("finance_entries")
            .select("*")
            .order("due_date", { ascending: false })
            .range(from, to);
          if (periodCutoff) q = q.gte("due_date", periodCutoff);
          return q as any;
        }),
      ]);
      setUnits(usRes.data || []);
      setPayments(paymentsAll || []);
      const sm: Record<string, number> = {};
      (siRes.data || []).forEach((s: StockItem) => { sm[s.id] = Number(s.cost_price || 0); });
      setStock(sm);
      setEntries(entriesAll || []);
      if (!isMaster && usRes.data && usRes.data.length === 1) setUnitFilter(usRes.data[0].id);
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao carregar dados financeiros");
    } finally {
      setLoading(false);
    }
  }, [isMaster, periodCutoff]);

  useEffect(() => { load(); }, [load]);

  const filteredPayments = useMemo(
    () => unitFilter === "ALL" ? payments : payments.filter(p => p.unit_id === unitFilter),
    [payments, unitFilter]
  );
  const filteredEntries = useMemo(() => {
    let arr = unitFilter === "ALL" ? entries : entries.filter(e => e.unit_id === unitFilter);
    if (statusFilter !== "ALL") arr = arr.filter(e => e.reconciliation_status === statusFilter);
    if (directionFilter !== "ALL") arr = arr.filter(e => e.direction === directionFilter);
    if (groupFilter !== "ALL") {
      const grp = FINANCE_CATEGORIES.find(g => g.group === groupFilter);
      const cats = new Set(grp?.items || []);
      arr = arr.filter(e => e.category && cats.has(e.category));
    }
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      arr = arr.filter(e =>
        e.description?.toLowerCase().includes(s) ||
        e.category?.toLowerCase().includes(s) ||
        e.notes?.toLowerCase().includes(s)
      );
    }
    return arr;
  }, [entries, unitFilter, statusFilter, directionFilter, groupFilter, search]);

  // ==== KPIs ====
  const kpis = useMemo(() => {
    const receita = filteredPayments
      .filter(p => PAID.includes(p.status))
      .reduce((s, p) => s + Number(p.final_value || p.value || 0), 0);

    let taxasAsaas = 0;
    let custoEstoque = 0;
    filteredPayments.filter(p => PAID.includes(p.status)).forEach(p => {
      const r = p.raw_response || {};
      const v = Number(r.value ?? p.final_value ?? p.value ?? 0);
      const nv = Number(r.netValue ?? v);
      const fee = Math.max(0, v - nv);
      taxasAsaas += fee;
      if (p.stock_item_id && stock[p.stock_item_id]) {
        custoEstoque += stock[p.stock_item_id] * (p.stock_quantity || 1);
      }
    });

    let custoFixo = 0, custoVariavelManual = 0, consumo = 0, receitaExtra = 0;
    let aPagar = 0, aReceber = 0, atrasados = 0;
    filteredEntries.forEach(e => {
      const amt = Number(e.amount || 0);
      const isPaid = e.reconciliation_status === "PAGO";
      if (e.direction === "RECEITA") {
        if (isPaid) receitaExtra += amt;
        else if (e.reconciliation_status !== "CANCELADO") aReceber += amt;
      } else {
        if (isPaid) {
          if (e.entry_type === "FIXO") custoFixo += amt;
          else if (e.entry_type === "VARIAVEL") custoVariavelManual += amt;
          else consumo += amt;
        } else if (e.reconciliation_status !== "CANCELADO") {
          aPagar += amt;
        }
      }
      if (e.reconciliation_status === "ATRASADO") atrasados += amt;
    });

    const receitaTotal = receita + receitaExtra;
    const custoVariavel = taxasAsaas + custoEstoque + custoVariavelManual + consumo;
    const margemContribuicao = receitaTotal - custoVariavel;
    const margemPct = receitaTotal > 0 ? (margemContribuicao / receitaTotal) * 100 : 0;
    const breakEven = margemPct > 0 ? custoFixo / (margemPct / 100) : 0;
    const lucro = margemContribuicao - custoFixo;

    return {
      receita, receitaExtra, receitaTotal,
      taxasAsaas, custoEstoque, custoVariavelManual, custoVariavel, custoFixo, consumo,
      margemContribuicao, margemPct, breakEven, lucro,
      aPagar, aReceber, atrasados,
    };
  }, [filteredPayments, filteredEntries, stock]);

  // ==== Despesas por Grupo ====
  const expensesByGroup = useMemo(() => {
    const map: Record<string, number> = {};
    FINANCE_CATEGORIES.filter(g => g.direction === "DESPESA").forEach(g => { map[g.group] = 0; });
    filteredEntries
      .filter(e => e.direction === "DESPESA" && e.reconciliation_status === "PAGO")
      .forEach(e => {
        const g = findCategoryGroup(e.category);
        const groupName = g?.group || "Outros";
        map[groupName] = (map[groupName] || 0) + Number(e.amount || 0);
      });
    return Object.entries(map)
      .filter(([, v]) => v > 0)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredEntries]);

  // ==== Fluxo de Caixa 30 / 60 / 90 ====
  const flow = useMemo(() => {
    const t = startOfDay();
    return [30, 60, 90].map(days => {
      const limit = addDays(t, days);
      const entradas = filteredPayments
        .filter(p => !PAID.includes(p.status))
        .filter(p => { const d = toDate(p.due_date); return d && d >= t && d <= limit; })
        .reduce((s, p) => s + Number(p.final_value || p.value || 0), 0);
      const entradasExtras = filteredEntries
        .filter(e => e.direction === "RECEITA" && e.reconciliation_status !== "PAGO" && e.reconciliation_status !== "CANCELADO")
        .filter(e => { const d = toDate(e.due_date); return d && d >= t && d <= limit; })
        .reduce((s, e) => s + Number(e.amount || 0), 0);
      const saidas = filteredEntries
        .filter(e => e.direction === "DESPESA" && e.reconciliation_status !== "PAGO" && e.reconciliation_status !== "CANCELADO")
        .filter(e => { const d = toDate(e.due_date); return d && d >= t && d <= limit; })
        .reduce((s, e) => s + Number(e.amount || 0), 0);
      const totalEntradas = entradas + entradasExtras;
      return { days, entradas: totalEntradas, saidas, saldo: totalEntradas - saidas };
    });
  }, [filteredPayments, filteredEntries]);

  // ==== Gráfico mensal ====
  const monthlyChart = useMemo(() => {
    const now = startOfDay();
    const months: { key: string; label: string; receita: number; despesa: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: d.toLocaleDateString("pt-BR", { month: "short" }), receita: 0, despesa: 0 });
    }
    const findM = (s: string | null) => {
      const d = toDate(s);
      if (!d) return null;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return months.find(m => m.key === key);
    };
    filteredPayments.filter(p => PAID.includes(p.status)).forEach(p => {
      const m = findM(p.paid_at || p.due_date);
      if (m) m.receita += Number(p.final_value || p.value || 0);
      const r = p.raw_response || {};
      const v = Number(r.value ?? p.final_value ?? p.value ?? 0);
      const nv = Number(r.netValue ?? v);
      if (m) m.despesa += Math.max(0, v - nv);
      if (m && p.stock_item_id && stock[p.stock_item_id]) {
        m.despesa += stock[p.stock_item_id] * (p.stock_quantity || 1);
      }
    });
    filteredEntries.forEach(e => {
      const m = findM(e.paid_date || e.competence_date);
      if (!m) return;
      if (e.direction === "DESPESA" && e.reconciliation_status === "PAGO") m.despesa += Number(e.amount || 0);
      if (e.direction === "RECEITA" && e.reconciliation_status === "PAGO") m.receita += Number(e.amount || 0);
    });
    return months;
  }, [filteredPayments, filteredEntries, stock]);

  // ==== Gauge break-even ====
  const breakEvenGauge = useMemo(() => {
    if (kpis.breakEven <= 0) return [{ name: "atingido", value: 0, fill: "hsl(var(--muted))" }];
    const pct = Math.min(100, (kpis.receitaTotal / kpis.breakEven) * 100);
    const color = pct >= 100 ? "hsl(var(--success))" : pct >= 70 ? "hsl(var(--warning))" : "hsl(var(--destructive))";
    return [{ name: "atingido", value: pct, fill: color }];
  }, [kpis]);

  // ==== Alertas ====
  const alerts = useMemo(() => {
    const today = startOfDay();
    const in7 = addDays(today, 7);
    const venceEm7 = filteredEntries.filter(e => {
      if (e.reconciliation_status === "PAGO" || e.reconciliation_status === "CANCELADO") return false;
      const d = toDate(e.due_date);
      return d && d >= today && d <= in7;
    });
    const overdue = filteredEntries.filter(e => {
      if (e.reconciliation_status === "PAGO" || e.reconciliation_status === "CANCELADO") return false;
      const d = toDate(e.due_date);
      return d && d < today;
    });
    const fluxoNegativo = flow.find(f => f.saldo < 0);
    return { venceEm7, overdue, fluxoNegativo };
  }, [filteredEntries, flow]);

  // ==== CRUD ====
  const openNew = () => {
    const defaultUnit = unitFilter !== "ALL" ? unitFilter : units[0]?.id || "";
    if (!defaultUnit) { toast.error("Selecione uma unidade primeiro"); return; }
    setEditing(emptyEntry(defaultUnit));
    setDialogOpen(true);
  };
  const openEdit = (e: FinanceEntry) => { setEditing({ ...e }); setDialogOpen(true); };

  const onCategoryChange = (cat: string) => {
    if (!editing) return;
    const grp = findCategoryGroup(cat);
    setEditing({
      ...editing,
      category: cat,
      direction: grp?.direction || editing.direction,
      entry_type: grp?.entryType || editing.entry_type,
    });
  };

  const save = async () => {
    if (!editing || !editing.unit_id || !editing.description || !editing.amount) {
      toast.error("Preencha unidade, descrição e valor");
      return;
    }
    const payload: any = {
      unit_id: editing.unit_id,
      entry_type: editing.entry_type,
      direction: editing.direction,
      category: editing.category || null,
      description: editing.description,
      amount: Number(editing.amount),
      competence_date: editing.competence_date,
      due_date: editing.due_date,
      paid_date: editing.paid_date || null,
      reconciliation_status: editing.reconciliation_status,
      recurrence: editing.recurrence,
      notes: editing.notes || null,
      created_by: user?.id,
    };
    try {
      if (editing.id) {
        const { error } = await supabase.from("finance_entries").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Lançamento atualizado");
      } else {
        const { error } = await supabase.from("finance_entries").insert(payload);
        if (error) throw error;

        // Recorrência: gerar 11 ocorrências futuras (totalizando 12 meses)
        const rec = editing.recurrence;
        if (rec && rec !== "UNICO") {
          const stepDays: Record<string, { type: "d" | "m"; n: number; count: number }> = {
            SEMANAL: { type: "d", n: 7, count: 51 },
            QUINZENAL: { type: "d", n: 15, count: 23 },
            MENSAL: { type: "m", n: 1, count: 11 },
            ANUAL: { type: "m", n: 12, count: 4 },
          };
          const cfg = stepDays[rec];
          if (cfg) {
            const base = new Date(editing.due_date + "T00:00:00");
            const baseComp = new Date(editing.competence_date + "T00:00:00");
            const future: any[] = [];
            for (let i = 1; i <= cfg.count; i++) {
              const due = cfg.type === "d" ? addDays(base, cfg.n * i) : addMonths(base, cfg.n * i);
              const comp = cfg.type === "d" ? addDays(baseComp, cfg.n * i) : addMonths(baseComp, cfg.n * i);
              future.push({ ...payload, due_date: isoDate(due), competence_date: isoDate(comp), paid_date: null, reconciliation_status: "PENDENTE" });
            }
            await supabase.from("finance_entries").insert(future);
            toast.success(`Lançamento criado + ${cfg.count} recorrências`);
          } else {
            toast.success("Lançamento criado");
          }
        } else {
          toast.success("Lançamento criado");
        }
      }
      setDialogOpen(false);
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este lançamento?")) return;
    const { error } = await supabase.from("finance_entries").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Lançamento excluído");
    load();
  };

  const togglePaid = async (e: FinanceEntry) => {
    const isPaid = e.reconciliation_status === "PAGO";
    const { error } = await supabase
      .from("finance_entries")
      .update({
        reconciliation_status: isPaid ? "PENDENTE" : "PAGO",
        paid_date: isPaid ? null : isoDate(new Date()),
      })
      .eq("id", e.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  // ==== Exportar CSV ====
  const exportCSV = () => {
    const header = ["Tipo","Direção","Categoria","Descrição","Unidade","Valor","Competência","Vencimento","Pagamento","Status","Recorrência","Observações"];
    const rows = filteredEntries.map(e => [
      TYPE_LABEL[e.entry_type] || e.entry_type,
      e.direction,
      e.category || "",
      (e.description || "").replace(/"/g, '""'),
      units.find(u => u.id === e.unit_id)?.name || "",
      String(e.amount).replace(".", ","),
      e.competence_date,
      e.due_date,
      e.paid_date || "",
      e.reconciliation_status,
      e.recurrence,
      (e.notes || "").replace(/"/g, '""'),
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `financeiro-pro-${isoDate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="text-primary" size={24} /> Financeiro Pro
          </h1>
          <p className="text-sm text-muted-foreground">Inteligência financeira: margem, break-even, fluxo de caixa e alertas.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.keys(PERIOD_OPTIONS).map(k => <SelectItem key={k} value={k}>{PERIOD_LABEL[k]}</SelectItem>)}
            </SelectContent>
          </Select>
          {isMaster && (
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas as unidades</SelectItem>
                {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download size={14} className="mr-1" /> CSV
          </Button>
          <Button onClick={openNew}><Plus size={16} className="mr-1" /> Novo lançamento</Button>
        </div>
      </div>

      {/* Alertas */}
      {(alerts.overdue.length > 0 || alerts.venceEm7.length > 0 || alerts.fluxoNegativo) && (
        <div className="grid md:grid-cols-3 gap-3">
          {alerts.overdue.length > 0 && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="pt-4">
                <p className="text-xs text-destructive font-semibold">⚠ Contas em atraso</p>
                <p className="text-2xl font-bold text-destructive">{alerts.overdue.length}</p>
                <p className="text-xs text-muted-foreground">{fmt(alerts.overdue.reduce((s, e) => s + Number(e.amount || 0), 0))}</p>
              </CardContent>
            </Card>
          )}
          {alerts.venceEm7.length > 0 && (
            <Card className="border-warning/40 bg-warning/5">
              <CardContent className="pt-4">
                <p className="text-xs text-warning font-semibold">⏰ Vencem em 7 dias</p>
                <p className="text-2xl font-bold text-warning">{alerts.venceEm7.length}</p>
                <p className="text-xs text-muted-foreground">{fmt(alerts.venceEm7.reduce((s, e) => s + Number(e.amount || 0), 0))}</p>
              </CardContent>
            </Card>
          )}
          {alerts.fluxoNegativo && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="pt-4">
                <p className="text-xs text-destructive font-semibold">📉 Fluxo negativo</p>
                <p className="text-2xl font-bold text-destructive">{fmt(alerts.fluxoNegativo.saldo)}</p>
                <p className="text-xs text-muted-foreground">Em {alerts.fluxoNegativo.days} dias</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="entries">Lançamentos</TabsTrigger>
          <TabsTrigger value="cashflow">Fluxo de Caixa</TabsTrigger>
        </TabsList>

        {/* ============ DASHBOARD ============ */}
        <TabsContent value="dashboard" className="space-y-6 mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard icon={DollarSign} label="Receita Total" value={fmt(kpis.receitaTotal)} tone="success" />
            <KpiCard icon={ArrowDownCircle} label="Custos Variáveis" value={fmt(kpis.custoVariavel)} tone="warning"
              hint={`Taxas ${fmt(kpis.taxasAsaas)} + Estoque ${fmt(kpis.custoEstoque)}`} />
            <KpiCard icon={Layers} label="Custos Fixos" value={fmt(kpis.custoFixo)} tone="destructive" />
            <KpiCard icon={Wallet} label="Lucro" value={fmt(kpis.lucro)} tone={kpis.lucro >= 0 ? "success" : "destructive"} />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp size={16} className="text-primary" /> Margem de Contribuição
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{fmt(kpis.margemContribuicao)}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Margem: <span className="font-semibold text-primary">{fmtPct(kpis.margemPct)}</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, kpis.margemPct))}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Receita Total − Custos Variáveis. Quanto sobra para cobrir custos fixos e gerar lucro.
                </p>
              </CardContent>
            </Card>

            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target size={16} className="text-primary" /> Ponto de Equilíbrio
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{fmt(kpis.breakEven)}</div>
                <div className="mt-1 text-sm text-muted-foreground">Receita necessária para zerar o resultado</div>
                <div className="h-40 mt-2">
                  <ResponsiveContainer>
                    <RadialBarChart innerRadius="65%" outerRadius="100%" data={breakEvenGauge} startAngle={180} endAngle={0}>
                      <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                      <RadialBar background dataKey="value" cornerRadius={8} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-center -mt-12 font-semibold text-foreground">
                  {kpis.breakEven > 0 ? `${Math.min(100, (kpis.receitaTotal / kpis.breakEven) * 100).toFixed(0)}% atingido` : "—"}
                </p>
              </CardContent>
            </Card>

            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CalendarClock size={16} className="text-primary" /> Conciliação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="A Pagar (pendente)" value={fmt(kpis.aPagar)} tone="warning" />
                <Row label="A Receber (extra)" value={fmt(kpis.aReceber)} tone="success" />
                <Row label="Atrasados" value={fmt(kpis.atrasados)} tone="destructive" />
                <Row label="Receita extra paga" value={fmt(kpis.receitaExtra)} tone="success" />
                <Row label="Consumo (operacional)" value={fmt(kpis.consumo)} tone="muted" />
              </CardContent>
            </Card>
          </div>

          {/* Grid: mensal + por categoria */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Despesas vs Receitas — últimos 6 meses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer>
                    <BarChart data={monthlyChart}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" className="text-xs" />
                      <YAxis className="text-xs" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                      <RTooltip formatter={(v: number) => fmt(v)} />
                      <Legend />
                      <Bar dataKey="receita" name="Receita" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="despesa" name="Despesa" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Despesas por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                {expensesByGroup.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Sem despesas pagas no período.</p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer>
                      <BarChart data={expensesByGroup} layout="vertical" margin={{ left: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis type="number" className="text-xs" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                        <YAxis dataKey="label" type="category" className="text-xs" width={120} />
                        <RTooltip formatter={(v: number) => fmt(v)} />
                        <Bar dataKey="value" name="Total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============ ENTRIES ============ */}
        <TabsContent value="entries" className="mt-4 space-y-3">
          <Card>
            <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
              <div className="md:col-span-2">
                <Input placeholder="Buscar descrição, categoria, observação..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={directionFilter} onValueChange={setDirectionFilter}>
                <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os tipos</SelectItem>
                  <SelectItem value="RECEITA">Receitas</SelectItem>
                  <SelectItem value="DESPESA">Despesas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os status</SelectItem>
                  <SelectItem value="PAGO">Pago</SelectItem>
                  <SelectItem value="PENDENTE">Pendente</SelectItem>
                  <SelectItem value="ATRASADO">Atrasado</SelectItem>
                  <SelectItem value="PARCIAL">Parcial</SelectItem>
                  <SelectItem value="CANCELADO">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              <Select value={groupFilter} onValueChange={setGroupFilter}>
                <SelectTrigger><SelectValue placeholder="Grupo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os grupos</SelectItem>
                  {FINANCE_CATEGORIES.map(g => <SelectItem key={g.group} value={g.group}>{g.group}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter size={14} /> Lançamentos ({filteredEntries.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {filteredEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhum lançamento. Clique em "Novo lançamento" para começar.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 px-2">Tipo</th>
                      <th className="text-left py-2 px-2">Descrição</th>
                      <th className="text-left py-2 px-2">Unidade</th>
                      <th className="text-right py-2 px-2">Valor</th>
                      <th className="text-left py-2 px-2">Vencimento</th>
                      <th className="text-left py-2 px-2">Competência</th>
                      <th className="text-left py-2 px-2">Status</th>
                      <th className="text-right py-2 px-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.slice(0, 500).map(e => (
                      <tr key={e.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 px-2">
                          <Badge variant="outline" className="text-[10px]">
                            {e.direction === "RECEITA" ? "↑ Receita" : TYPE_LABEL[e.entry_type]}
                          </Badge>
                        </td>
                        <td className="py-2 px-2">
                          <div className="font-medium">{e.description}</div>
                          {e.category && <div className="text-xs text-muted-foreground">{e.category}</div>}
                        </td>
                        <td className="py-2 px-2 text-xs text-muted-foreground">
                          {units.find(u => u.id === e.unit_id)?.name || "—"}
                        </td>
                        <td className={`py-2 px-2 text-right font-mono font-semibold ${
                          e.direction === "RECEITA" ? "text-success" : "text-destructive"
                        }`}>
                          {e.direction === "RECEITA" ? "+" : "−"} {fmt(Number(e.amount))}
                        </td>
                        <td className="py-2 px-2 text-xs">{new Date(e.due_date + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                        <td className="py-2 px-2 text-xs">{new Date(e.competence_date + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                        <td className="py-2 px-2">
                          <button onClick={() => togglePaid(e)} className="cursor-pointer">
                            <Badge className={`${STATUS_COLOR[e.reconciliation_status]} border text-[10px]`}>
                              {e.reconciliation_status}
                            </Badge>
                          </button>
                        </td>
                        <td className="py-2 px-2 text-right">
                          <div className="inline-flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(e)}>
                              <Edit2 size={14} />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => remove(e.id)}>
                              <Trash2 size={14} className="text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {filteredEntries.length > 500 && (
                <p className="text-xs text-muted-foreground text-center mt-3">
                  Exibindo 500 de {filteredEntries.length} — refine os filtros para ver mais.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ CASHFLOW ============ */}
        <TabsContent value="cashflow" className="mt-4 space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            {flow.map(f => (
              <Card key={f.days}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CalendarClock size={16} className="text-primary" /> Próximos {f.days} dias
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Row label="Entradas" value={fmt(f.entradas)} tone="success" icon={ArrowUpCircle} />
                  <Row label="Saídas" value={fmt(f.saidas)} tone="destructive" icon={ArrowDownCircle} />
                  <div className="border-t pt-2 mt-2 flex justify-between items-center">
                    <span className="text-sm font-semibold">Saldo projetado</span>
                    <span className={`text-lg font-bold font-mono ${
                      f.saldo >= 0 ? "text-success" : "text-destructive"
                    }`}>{fmt(f.saldo)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Comparativo Entradas × Saídas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={flow.map(f => ({ label: `${f.days}d`, entradas: f.entradas, saidas: f.saidas }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <RTooltip formatter={(v: number) => fmt(v)} />
                    <Legend />
                    <Bar dataKey="entradas" name="Entradas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="saidas" name="Saídas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============ DIALOG ============ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle>
            <DialogDescription>
              Escolha a categoria — direção e tipo serão definidos automaticamente.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 grid grid-cols-3 gap-3">
                <div>
                  <Label>Unidade</Label>
                  <Select value={editing.unit_id} onValueChange={(v) => setEditing({ ...editing, unit_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Direção</Label>
                  <Select value={editing.direction} onValueChange={(v) => setEditing({ ...editing, direction: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DESPESA">Despesa</SelectItem>
                      <SelectItem value="RECEITA">Receita</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={editing.entry_type} onValueChange={(v) => setEditing({ ...editing, entry_type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIXO">Custo Fixo</SelectItem>
                      <SelectItem value="VARIAVEL">Custo Variável</SelectItem>
                      <SelectItem value="CONSUMO">Consumo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="col-span-2">
                <Label>Categoria</Label>
                <Select value={editing.category || ""} onValueChange={onCategoryChange}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {FINANCE_CATEGORIES.map(g => (
                      <SelectGroup key={g.group}>
                        <SelectLabel>{g.group}</SelectLabel>
                        {g.items.map(it => <SelectItem key={it} value={it}>{it}</SelectItem>)}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Descrição *</Label>
                <Input value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Ex: Aluguel sede, Energia maio, Salário João..." />
              </div>
              <div>
                <Label>Valor (R$) *</Label>
                <Input type="number" step="0.01" min="0" value={editing.amount || 0}
                  onChange={(e) => setEditing({ ...editing, amount: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>Recorrência</Label>
                <Select value={editing.recurrence} onValueChange={(v) => setEditing({ ...editing, recurrence: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNICO">Único</SelectItem>
                    <SelectItem value="SEMANAL">Semanal (gera 51 ocorrências)</SelectItem>
                    <SelectItem value="QUINZENAL">Quinzenal (gera 23 ocorrências)</SelectItem>
                    <SelectItem value="MENSAL">Mensal (gera 11 ocorrências)</SelectItem>
                    <SelectItem value="ANUAL">Anual (gera 4 ocorrências)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data competência</Label>
                <Input type="date" value={editing.competence_date || ""}
                  onChange={(e) => setEditing({ ...editing, competence_date: e.target.value })} />
              </div>
              <div>
                <Label>Vencimento</Label>
                <Input type="date" value={editing.due_date || ""}
                  onChange={(e) => setEditing({ ...editing, due_date: e.target.value })} />
              </div>
              <div>
                <Label>Data de pagamento</Label>
                <Input type="date" value={editing.paid_date || ""}
                  onChange={(e) => setEditing({ ...editing, paid_date: e.target.value || null })} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editing.reconciliation_status} onValueChange={(v) => setEditing({ ...editing, reconciliation_status: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDENTE">Pendente</SelectItem>
                    <SelectItem value="PAGO">Pago</SelectItem>
                    <SelectItem value="ATRASADO">Atrasado</SelectItem>
                    <SelectItem value="PARCIAL">Parcial</SelectItem>
                    <SelectItem value="CANCELADO">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Observações</Label>
                <Textarea rows={2} value={editing.notes || ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// === Helpers ===
function KpiCard({ icon: Icon, label, value, tone, hint }: {
  icon: any; label: string; value: string; tone: "success" | "warning" | "destructive" | "primary"; hint?: string;
}) {
  const colorMap: Record<string, string> = {
    success: "text-success bg-success/10",
    warning: "text-warning bg-warning/10",
    destructive: "text-destructive bg-destructive/10",
    primary: "text-primary bg-primary/10",
  };
  const txt: Record<string, string> = {
    success: "text-success", warning: "text-warning",
    destructive: "text-destructive", primary: "text-primary",
  };
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={`p-1.5 rounded-md ${colorMap[tone]}`}>
            <Icon size={16} />
          </div>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className={`text-xl font-bold ${txt[tone]}`}>{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, tone, icon: Icon }: {
  label: string; value: string; tone: "success" | "warning" | "destructive" | "muted"; icon?: any;
}) {
  const colors: Record<string, string> = {
    success: "text-success", warning: "text-warning",
    destructive: "text-destructive", muted: "text-muted-foreground",
  };
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        {Icon && <Icon size={12} />} {label}
      </span>
      <span className={`font-mono font-semibold text-sm ${colors[tone]}`}>{value}</span>
    </div>
  );
}

export default AdminFinancialPro;
