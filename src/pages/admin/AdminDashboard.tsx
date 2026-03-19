import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle,
  Users,
  Clock,
  CheckCircle2,
  Building2,
  Calendar,
  TrendingUp,
  MessageCircle,
  Trash2,
  Loader2,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subDays, isToday, isBefore, startOfDay, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import WhatsAppDialog from "@/components/WhatsAppDialog";
import DashboardKpiCards from "@/components/dashboard/DashboardKpiCards";
import DashboardOverdueList from "@/components/dashboard/DashboardOverdueList";
import DashboardDueTodayList from "@/components/dashboard/DashboardDueTodayList";
import DashboardRecentPaid from "@/components/dashboard/DashboardRecentPaid";
import DashboardUnitSummary from "@/components/dashboard/DashboardUnitSummary";
import { useToast } from "@/hooks/use-toast";



export type DashboardPayment = {
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
  checkout_url: string | null;
};

export type DashboardUnit = {
  id: string;
  name: string;
};

export type DashboardProfile = {
  id: string;
  full_name: string;
  phone: string | null;
};

export type DashboardStudent = {
  id: string;
  active: boolean;
  unit_id: string;
  full_name: string;
  responsible_id: string;
};

const AdminDashboard = () => {
  const { hasRole, profile: userProfile } = useAuth();
  const { toast } = useToast();
  const isMaster = hasRole("ADMIN_MASTER");

  const [payments, setPayments] = useState<DashboardPayment[]>([]);
  const [units, setUnits] = useState<DashboardUnit[]>([]);
  const [profiles, setProfiles] = useState<DashboardProfile[]>([]);
  const [students, setStudents] = useState<DashboardStudent[]>([]);
  const [loading, setLoading] = useState(true);

  const [unitFilter, setUnitFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("month");

  // Cleanup state
  const [cleanupPreview, setCleanupPreview] = useState<any>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<any>(null);
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);

  // WhatsApp dialog state
  const [waDialog, setWaDialog] = useState<{
    open: boolean;
    phone: string | null;
    responsibleName: string;
    studentName: string;
    value: number;
    dueDate: string;
    paymentId: string;
    responsibleId: string;
    invoiceUrl: string | null;
  }>({
    open: false,
    phone: null,
    responsibleName: "",
    studentName: "",
    value: 0,
    dueDate: "",
    paymentId: "",
    responsibleId: "",
    invoiceUrl: null,
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [paymentsRes, unitsRes, profilesRes, studentsRes] = await Promise.all([
        supabase.from("payments").select("id, status, value, final_value, due_date, paid_at, unit_id, responsible_id, installment_number, contract_id, checkout_url"),
        isMaster
          ? supabase.from("units").select("id, name").eq("active", true)
          : supabase.from("units").select("id, name").eq("id", userProfile?.unit_id ?? ""),
        supabase.from("profiles").select("id, full_name, phone"),
        supabase.from("students").select("id, active, unit_id, full_name, responsible_id"),
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
          setPayments((prev) => [...prev, payload.new as DashboardPayment]);
        } else if (payload.eventType === "UPDATE") {
          setPayments((prev) => prev.map((p) => (p.id === (payload.new as DashboardPayment).id ? (payload.new as DashboardPayment) : p)));
        } else if (payload.eventType === "DELETE") {
          setPayments((prev) => prev.filter((p) => p.id !== (payload.old as any).id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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

    // Paid in period
    const paidInPeriod = fp.filter((p) => {
      if (p.status !== "RECEIVED" && p.status !== "CONFIRMED") return false;
      if (!p.paid_at) return false;
      const d = new Date(p.paid_at);
      return d >= dateStart && d <= dateEnd;
    });
    const totalReceived = paidInPeriod.reduce((sum, p) => sum + (p.final_value ?? p.value), 0);

    // A receber: only FUTURE pending (due_date >= today, not overdue)
    const pendingFuture = fp.filter((p) => {
      if (p.status !== "PENDING") return false;
      return !isBefore(new Date(p.due_date), today);
    });
    const totalToReceive = pendingFuture.reduce((sum, p) => sum + (p.final_value ?? p.value), 0);

    // Em atraso: only past due
    const overdueAll = fp.filter((p) => {
      if (p.status !== "PENDING" && p.status !== "OVERDUE") return false;
      return isBefore(new Date(p.due_date), today);
    });
    const totalOverdue = overdueAll.reduce((sum, p) => sum + (p.final_value ?? p.value), 0);

    const filteredStudents = unitFilter === "all"
      ? students.filter((s) => s.active)
      : students.filter((s) => s.active && s.unit_id === unitFilter);

    // Inadimplência: atraso / (a receber + atraso)
    const totalAReceber = totalToReceive + totalOverdue;
    const inadimplencia = totalAReceber > 0 ? (totalOverdue / totalAReceber) * 100 : 0;

    // Due today list
    const dueTodayList = fp
      .filter((p) => p.status === "PENDING" && isToday(new Date(p.due_date)))
      .sort((a, b) => (b.final_value ?? b.value) - (a.final_value ?? a.value));

    // Overdue list - all, sorted by most days overdue
    const overdueList = overdueAll
      .map((p) => ({
        ...p,
        daysOverdue: differenceInDays(today, new Date(p.due_date)),
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);

    // Recent paid
    const recentPaid = paidInPeriod
      .sort((a, b) => new Date(b.paid_at!).getTime() - new Date(a.paid_at!).getTime())
      .slice(0, 10);

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
      const toReceive = unitPayments
        .filter((p) => p.status === "PENDING" && !isBefore(new Date(p.due_date), today))
        .reduce((s, p) => s + (p.final_value ?? p.value), 0);
      return { id: u.id, name: u.name, received, overdue, toReceive };
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

  const getProfilePhone = (id: string) =>
    profiles.find((p) => p.id === id)?.phone ?? null;

  const getUnitName = (id: string) =>
    units.find((u) => u.id === id)?.name ?? "—";

  const getStudentByResponsible = (responsibleId: string) =>
    students.find((s) => s.responsible_id === responsibleId);

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const openWhatsApp = (payment: DashboardPayment) => {
    const student = getStudentByResponsible(payment.responsible_id);
    setWaDialog({
      open: true,
      phone: getProfilePhone(payment.responsible_id),
      responsibleName: getProfileName(payment.responsible_id),
      studentName: student?.full_name ?? "",
      value: payment.final_value ?? payment.value,
      dueDate: payment.due_date,
      paymentId: payment.id,
      responsibleId: payment.responsible_id,
      invoiceUrl: payment.checkout_url ?? null,
    });
  };

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
        <div className="grid lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
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
      <DashboardKpiCards
        totalReceived={filtered.totalReceived}
        totalToReceive={filtered.totalToReceive}
        totalOverdue={filtered.totalOverdue}
        activeStudents={filtered.activeStudents}
        inadimplencia={filtered.inadimplencia}
        formatCurrency={formatCurrency}
      />

      {/* Main lists grid */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Overdue */}
        <DashboardOverdueList
          overdueList={filtered.overdueList}
          getProfileName={getProfileName}
          getStudentByResponsible={getStudentByResponsible}
          getUnitName={getUnitName}
          formatCurrency={formatCurrency}
          showUnit={isMaster && unitFilter === "all"}
          onSendWhatsApp={openWhatsApp}
        />

        {/* Due Today */}
        <DashboardDueTodayList
          dueTodayList={filtered.dueTodayList}
          getProfileName={getProfileName}
          getStudentByResponsible={getStudentByResponsible}
          formatCurrency={formatCurrency}
          onSendWhatsApp={openWhatsApp}
        />
      </div>

      {/* Recent paid + Unit summary */}
      <div className="grid lg:grid-cols-2 gap-4">
        <DashboardRecentPaid
          recentPaid={filtered.recentPaid}
          getProfileName={getProfileName}
          formatCurrency={formatCurrency}
        />

        {isMaster && filtered.perUnit.length > 0 && (
          <DashboardUnitSummary
            perUnit={filtered.perUnit}
            formatCurrency={formatCurrency}
          />
        )}
      </div>

      {/* WhatsApp Dialog */}
      <WhatsAppDialog
        open={waDialog.open}
        onOpenChange={(open) => setWaDialog((prev) => ({ ...prev, open }))}
        phone={waDialog.phone}
        responsibleName={waDialog.responsibleName}
        studentName={waDialog.studentName}
        description={`Parcela`}
        value={waDialog.value}
        dueDate={waDialog.dueDate}
        invoiceUrl={waDialog.invoiceUrl}
        paymentId={waDialog.paymentId}
        responsibleId={waDialog.responsibleId}
      />
    </div>
  );
};

export default AdminDashboard;
