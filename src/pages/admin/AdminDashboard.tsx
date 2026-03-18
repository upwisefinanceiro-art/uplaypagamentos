import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Users,
  Clock,
  CheckCircle2,
  Building2,
  Calendar,
  ChevronRight,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subDays, isToday, isBefore, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Payment = {
  id: string;
  status: string;
  value: number;
  final_value: number | null;
  due_date: string;
  paid_at: string | null;
  unit_id: string;
  responsible_id: string;
  installment_number: number;
  contract_id: string | null;
};

type Unit = {
  id: string;
  name: string;
};

type Profile = {
  id: string;
  full_name: string;
};

type Student = {
  id: string;
  active: boolean;
  unit_id: string;
};

const AdminDashboard = () => {
  const { hasRole, profile: userProfile } = useAuth();
  const isMaster = hasRole("ADMIN_MASTER");

  const [payments, setPayments] = useState<Payment[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  const [unitFilter, setUnitFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("month");

  // Fetch all data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [paymentsRes, unitsRes, profilesRes, studentsRes] = await Promise.all([
        supabase.from("payments").select("id, status, value, final_value, due_date, paid_at, unit_id, responsible_id, installment_number, contract_id"),
        isMaster
          ? supabase.from("units").select("id, name").eq("active", true)
          : supabase.from("units").select("id, name").eq("id", userProfile?.unit_id ?? ""),
        supabase.from("profiles").select("id, full_name"),
        supabase.from("students").select("id, active, unit_id"),
      ]);

      if (paymentsRes.data) setPayments(paymentsRes.data);
      if (unitsRes.data) setUnits(unitsRes.data);
      if (profilesRes.data) setProfiles(profilesRes.data);
      if (studentsRes.data) setStudents(studentsRes.data);
      setLoading(false);
    };

    fetchData();
  }, [isMaster, userProfile?.unit_id]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("payments-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setPayments((prev) => [...prev, payload.new as Payment]);
        } else if (payload.eventType === "UPDATE") {
          setPayments((prev) => prev.map((p) => (p.id === (payload.new as Payment).id ? (payload.new as Payment) : p)));
        } else if (payload.eventType === "DELETE") {
          setPayments((prev) => prev.filter((p) => p.id !== (payload.old as any).id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filtered data
  const filtered = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);

    let dateStart: Date;
    let dateEnd: Date;
    if (periodFilter === "month") {
      dateStart = startOfMonth(now);
      dateEnd = endOfMonth(now);
    } else {
      dateStart = subDays(now, 30);
      dateEnd = now;
    }

    let fp = payments;
    if (unitFilter !== "all") {
      fp = fp.filter((p) => p.unit_id === unitFilter);
    }

    const periodPayments = fp.filter((p) => {
      const d = new Date(p.due_date);
      return d >= dateStart && d <= dateEnd;
    });

    const paidInPeriod = fp.filter((p) => {
      if (p.status !== "RECEIVED" && p.status !== "CONFIRMED") return false;
      if (!p.paid_at) return false;
      const d = new Date(p.paid_at);
      return d >= dateStart && d <= dateEnd;
    });

    const totalReceived = paidInPeriod.reduce((sum, p) => sum + (p.final_value ?? p.value), 0);

    const pendingInPeriod = periodPayments.filter((p) => p.status === "PENDING");
    const totalToReceive = pendingInPeriod.reduce((sum, p) => sum + (p.final_value ?? p.value), 0);

    const overdueAll = fp.filter((p) => {
      if (p.status !== "PENDING" && p.status !== "OVERDUE") return false;
      return isBefore(new Date(p.due_date), today);
    });
    const totalOverdue = overdueAll.reduce((sum, p) => sum + (p.final_value ?? p.value), 0);

    const filteredStudents = unitFilter === "all"
      ? students.filter((s) => s.active)
      : students.filter((s) => s.active && s.unit_id === unitFilter);

    const dueTodayList = fp
      .filter((p) => (p.status === "PENDING") && isToday(new Date(p.due_date)))
      .sort((a, b) => (a.final_value ?? a.value) - (b.final_value ?? b.value));

    const overdueList = overdueAll
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .slice(0, 10);

    const recentPaid = paidInPeriod
      .sort((a, b) => new Date(b.paid_at!).getTime() - new Date(a.paid_at!).getTime())
      .slice(0, 10);

    // Inadimplência: overdue / (overdue + paid in period)
    const totalDueAndPaid = totalOverdue + totalReceived;
    const inadimplencia = totalDueAndPaid > 0 ? (totalOverdue / totalDueAndPaid) * 100 : 0;

    // Per unit breakdown
    const perUnit = units.map((u) => {
      const unitPayments = fp.filter((p) => p.unit_id === u.id);
      const received = unitPayments
        .filter((p) => (p.status === "RECEIVED" || p.status === "CONFIRMED") && p.paid_at)
        .filter((p) => {
          const d = new Date(p.paid_at!);
          return d >= dateStart && d <= dateEnd;
        })
        .reduce((s, p) => s + (p.final_value ?? p.value), 0);
      const overdue = unitPayments
        .filter((p) => (p.status === "PENDING" || p.status === "OVERDUE") && isBefore(new Date(p.due_date), today))
        .reduce((s, p) => s + (p.final_value ?? p.value), 0);
      return { name: u.name, received, overdue };
    });

    return {
      totalReceived,
      totalToReceive,
      totalOverdue,
      activeStudents: filteredStudents.length,
      dueTodayList,
      overdueList,
      recentPaid,
      inadimplencia,
      perUnit,
    };
  }, [payments, students, units, unitFilter, periodFilter]);

  const getProfileName = (id: string) =>
    profiles.find((p) => p.id === id)?.full_name ?? "—";

  const getUnitName = (id: string) =>
    units.find((u) => u.id === id)?.name ?? "—";

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const formatDate = (d: string) =>
    format(new Date(d), "dd/MM/yyyy", { locale: ptBR });

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-36" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header + Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground">Dashboard Financeiro</h1>
        <div className="flex gap-2">
          {isMaster && units.length > 1 && (
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger className="w-[160px] h-9 text-xs bg-card border-border">
                <Building2 size={14} className="mr-1 text-muted-foreground" />
                <SelectValue placeholder="Unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas unidades</SelectItem>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-[150px] h-9 text-xs bg-card border-border">
              <Calendar size={14} className="mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Mês atual</SelectItem>
              <SelectItem value="30days">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={CheckCircle2}
          label="Recebido"
          value={formatCurrency(filtered.totalReceived)}
          color="text-success"
          bgColor="bg-success/10"
        />
        <KpiCard
          icon={Clock}
          label="A receber"
          value={formatCurrency(filtered.totalToReceive)}
          color="text-warning"
          bgColor="bg-warning/10"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Em atraso"
          value={formatCurrency(filtered.totalOverdue)}
          color="text-destructive"
          bgColor="bg-destructive/10"
        />
        <KpiCard
          icon={Users}
          label="Alunos ativos"
          value={String(filtered.activeStudents)}
          color="text-primary"
          bgColor="bg-primary/10"
        />
      </div>

      {/* Indicators row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground font-medium">Taxa de Inadimplência</span>
            <TrendingUp size={14} className="text-muted-foreground" />
          </div>
          <div className="flex items-end gap-2">
            <span className={`text-2xl font-bold ${filtered.inadimplencia > 20 ? "text-destructive" : filtered.inadimplencia > 10 ? "text-warning" : "text-success"}`}>
              {filtered.inadimplencia.toFixed(1)}%
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${filtered.inadimplencia > 20 ? "bg-destructive" : filtered.inadimplencia > 10 ? "bg-warning" : "bg-success"}`}
              style={{ width: `${Math.min(filtered.inadimplencia, 100)}%` }}
            />
          </div>
        </div>

        {isMaster && filtered.perUnit.length > 1 && (
          <div className="glass-card p-4">
            <span className="text-xs text-muted-foreground font-medium">Valor por Unidade</span>
            <div className="mt-3 space-y-2">
              {filtered.perUnit.map((u) => (
                <div key={u.name} className="flex items-center justify-between text-sm">
                  <span className="text-foreground font-medium truncate">{u.name}</span>
                  <div className="flex gap-3 text-xs">
                    <span className="text-success">{formatCurrency(u.received)}</span>
                    {u.overdue > 0 && (
                      <span className="text-destructive">{formatCurrency(u.overdue)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lists */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Due Today */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-warning" />
            <h2 className="text-sm font-semibold text-foreground">Vencendo Hoje</h2>
            <span className="ml-auto text-xs text-muted-foreground">{filtered.dueTodayList.length}</span>
          </div>
          {filtered.dueTodayList.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma cobrança vencendo hoje</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filtered.dueTodayList.map((p) => (
                <PaymentRow
                  key={p.id}
                  name={getProfileName(p.responsible_id)}
                  unit={getUnitName(p.unit_id)}
                  value={formatCurrency(p.final_value ?? p.value)}
                  badgeClass="status-pending"
                  badgeLabel="Hoje"
                  showUnit={isMaster && unitFilter === "all"}
                />
              ))}
            </div>
          )}
        </div>

        {/* Overdue */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-destructive" />
            <h2 className="text-sm font-semibold text-foreground">Vencidas</h2>
            <span className="ml-auto text-xs text-muted-foreground">{filtered.overdueList.length}</span>
          </div>
          {filtered.overdueList.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma cobrança vencida</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filtered.overdueList.map((p) => (
                <PaymentRow
                  key={p.id}
                  name={getProfileName(p.responsible_id)}
                  unit={getUnitName(p.unit_id)}
                  value={formatCurrency(p.final_value ?? p.value)}
                  subtitle={formatDate(p.due_date)}
                  badgeClass="status-overdue"
                  badgeLabel="Vencida"
                  showUnit={isMaster && unitFilter === "all"}
                />
              ))}
            </div>
          )}
        </div>

        {/* Recent Payments */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-success" />
            <h2 className="text-sm font-semibold text-foreground">Últimos Recebidos</h2>
            <span className="ml-auto text-xs text-muted-foreground">{filtered.recentPaid.length}</span>
          </div>
          {filtered.recentPaid.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Nenhum pagamento recebido</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filtered.recentPaid.map((p) => (
                <PaymentRow
                  key={p.id}
                  name={getProfileName(p.responsible_id)}
                  unit={getUnitName(p.unit_id)}
                  value={formatCurrency(p.final_value ?? p.value)}
                  subtitle={p.paid_at ? format(new Date(p.paid_at), "dd/MM HH:mm") : ""}
                  badgeClass="status-paid"
                  badgeLabel="Pago"
                  showUnit={isMaster && unitFilter === "all"}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Sub-components

function KpiCard({ icon: Icon, label, value, color, bgColor }: {
  icon: any;
  label: string;
  value: string;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-md ${bgColor}`}>
          <Icon size={16} className={color} />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function PaymentRow({ name, unit, value, subtitle, badgeClass, badgeLabel, showUnit }: {
  name: string;
  unit: string;
  value: string;
  subtitle?: string;
  badgeClass: string;
  badgeLabel: string;
  showUnit: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <div className="flex-1 min-w-0 mr-2">
        <p className="text-sm font-medium text-foreground truncate">{name}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {subtitle && <span>{subtitle}</span>}
          {showUnit && subtitle && <span>•</span>}
          {showUnit && <span className="text-primary/70">{unit}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-sm font-semibold text-foreground">{value}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badgeClass}`}>{badgeLabel}</span>
      </div>
    </div>
  );
}

export default AdminDashboard;
