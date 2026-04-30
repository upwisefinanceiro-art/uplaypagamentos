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
import DashboardBirthdays, { type BirthdayPerson } from "@/components/dashboard/DashboardBirthdays";
import DashboardDeliveries from "@/components/dashboard/DashboardDeliveries";
import DashboardLowStock from "@/components/dashboard/DashboardLowStock";
import DashboardInconsistencies from "@/components/dashboard/DashboardInconsistencies";
import DashboardSpcList from "@/components/dashboard/DashboardSpcList";
import { useToast } from "@/hooks/use-toast";
import { resolveWhatsAppChargeData } from "@/lib/asaas-payment";



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
  invoice_url: string | null;
  boleto_url: string | null;
  pix_copy_paste: string | null;
  payment_method: string | null;
  payment_type: string;
  student_id: string | null;
  raw_response: unknown;
  in_dunning?: boolean;
  dunning_status?: string | null;
  dunning_manual?: boolean;
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
  birth_date: string | null;
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
    description: string;
    invoiceUrl: string | null;
    boletoUrl: string | null;
    pixCopyPaste: string | null;
    paymentMethod: string | null;
    messageTemplate: "default" | "spc";
  }>({
    open: false,
    phone: null,
    responsibleName: "",
    studentName: "",
    value: 0,
    dueDate: "",
    paymentId: "",
    responsibleId: "",
    description: "",
    invoiceUrl: null,
    boletoUrl: null,
    pixCopyPaste: null,
    paymentMethod: null,
    messageTemplate: "default",
  });

  const fetchData = async () => {
    setLoading(true);
    const [paymentsRes, unitsRes, profilesRes, studentsRes] = await Promise.all([
      supabase.from("payments").select("id, status, value, final_value, due_date, paid_at, unit_id, responsible_id, installment_number, contract_id, checkout_url, invoice_url, boleto_url, pix_copy_paste, payment_method, payment_type, student_id, raw_response, in_dunning, dunning_status, dunning_manual"),
      isMaster
        ? supabase.from("units").select("id, name").eq("active", true)
        : supabase.from("units").select("id, name").eq("id", userProfile?.unit_id ?? ""),
      supabase.from("profiles").select("id, full_name, phone"),
      supabase.from("students").select("id, active, unit_id, full_name, responsible_id, birth_date"),
    ]);

    if (paymentsRes.data) setPayments(paymentsRes.data as DashboardPayment[]);
    if (unitsRes.data) setUnits(unitsRes.data);
    if (profilesRes.data) setProfiles(profilesRes.data);
    if (studentsRes.data) setStudents(studentsRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMaster, userProfile?.unit_id]);

  // Sincroniza negativações Asaas (Serasa) ao abrir o Dashboard, em background
  useEffect(() => {
    let cancelled = false;
    const syncDunnings = async () => {
      try {
        const payload: Record<string, string> = {};
        if (!isMaster && userProfile?.unit_id) payload.unit_id = userProfile.unit_id;
        const { error } = await supabase.functions.invoke("sync-asaas-dunnings", { body: payload });
        if (!cancelled && !error) {
          // Recarrega payments para refletir flags in_dunning atualizadas
          fetchData();
        }
      } catch (e) {
        console.warn("[dashboard] auto-sync dunnings falhou:", e);
      }
    };
    syncDunnings();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Parse date-only string (YYYY-MM-DD) as local midnight to avoid UTC shift
  const parseLocalDate = (dateStr: string) => new Date(dateStr + "T00:00:00");

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
      if (p.status !== "PAID" && p.status !== "RECEIVED" && p.status !== "CONFIRMED") return false;
      if (!p.paid_at) return false;
      const d = new Date(p.paid_at);
      return d >= dateStart && d <= dateEnd;
    });
    const totalReceived = paidInPeriod.reduce((sum, p) => sum + (p.final_value ?? p.value), 0);

    // Custo com taxas Asaas (despesa interna): bruto - líquido
    const totalAsaasFees = paidInPeriod.reduce((sum, p) => {
      const raw = (p.raw_response || {}) as Record<string, unknown>;
      const v = typeof raw.value === "number" ? raw.value : Number(raw.value ?? 0);
      const n = typeof raw.netValue === "number" ? raw.netValue : Number(raw.netValue ?? v);
      const fee = v - n;
      return sum + (fee > 0 ? fee : 0);
    }, 0);

    // A receber: only FUTURE pending (due_date >= today, not overdue)
    const pendingFuture = fp.filter((p) => {
      if (p.status !== "PENDING") return false;
      return !isBefore(parseLocalDate(p.due_date), today);
    });
    const totalToReceive = pendingFuture.reduce((sum, p) => sum + (p.final_value ?? p.value), 0);

    // Em atraso: only past due
    const overdueAll = fp.filter((p) => {
      if (p.status !== "PENDING" && p.status !== "OVERDUE") return false;
      return isBefore(parseLocalDate(p.due_date), today);
    });
    const totalOverdue = overdueAll.reduce((sum, p) => sum + (p.final_value ?? p.value), 0);

    // Alunos ativos: only students with active profile, active contract, and pending monthly payments
    const activeContractStudentIds = new Set<string>();
    // Get contracts that are ACTIVE
    const activeContractPayments = fp.filter(
      (p) => p.contract_id && p.payment_type === "MENSALIDADE" && (p.status === "PENDING" || p.status === "OVERDUE")
    );
    activeContractPayments.forEach((p) => {
      if (p.student_id) activeContractStudentIds.add(p.student_id);
    });

    // Also check by responsible_id for students linked to those responsibles
    const responsibleIdsWithActivePayments = new Set(activeContractPayments.map((p) => p.responsible_id));

    const filteredStudents = students.filter((s) => {
      if (!s.active) return false;
      if (unitFilter !== "all" && s.unit_id !== unitFilter) return false;
      // Student must have active monthly payments (either directly or via responsible)
      return activeContractStudentIds.has(s.id) || responsibleIdsWithActivePayments.has(s.responsible_id);
    });

    // Inadimplência: atraso / (a receber + atraso)
    const totalAReceber = totalToReceive + totalOverdue;
    const inadimplencia = totalAReceber > 0 ? (totalOverdue / totalAReceber) * 100 : 0;

    // Due today list - include PENDING due today AND OVERDUE due today
    const dueTodayList = fp
      .filter((p) => (p.status === "PENDING" || p.status === "OVERDUE") && isToday(parseLocalDate(p.due_date)))
      .sort((a, b) => (b.final_value ?? b.value) - (a.final_value ?? a.value));

    // Overdue list - all, sorted by most days overdue
    const overdueRaw = overdueAll
      .map((p) => ({
        ...p,
        daysOverdue: differenceInDays(today, parseLocalDate(p.due_date)),
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);

    // Separa SPC (em negativação) das cobranças em atraso
    const spcList = overdueRaw.filter((p) => p.in_dunning === true);
    const overdueList = overdueRaw.filter((p) => p.in_dunning !== true);

    // Recent paid
    const recentPaid = paidInPeriod
      .sort((a, b) => new Date(b.paid_at!).getTime() - new Date(a.paid_at!).getTime())
      .slice(0, 10);

    // Per unit breakdown
    const perUnit = units.map((u) => {
      const unitPayments = fp.filter((p) => p.unit_id === u.id);
      const received = unitPayments
        .filter((p) => (p.status === "PAID" || p.status === "RECEIVED" || p.status === "CONFIRMED") && p.paid_at)
        .filter((p) => {
          const d = new Date(p.paid_at!);
          return d >= dateStart && d <= dateEnd;
        })
        .reduce((s, p) => s + (p.final_value ?? p.value), 0);
      const overdue = unitPayments
        .filter((p) => (p.status === "PENDING" || p.status === "OVERDUE") && isBefore(parseLocalDate(p.due_date), today))
        .reduce((s, p) => s + (p.final_value ?? p.value), 0);
      const toReceive = unitPayments
        .filter((p) => p.status === "PENDING" && !isBefore(parseLocalDate(p.due_date), today))
        .reduce((s, p) => s + (p.final_value ?? p.value), 0);
      return { id: u.id, name: u.name, received, overdue, toReceive };
    });

    return {
      totalReceived,
      totalAsaasFees,
      totalToReceive,
      totalOverdue,
      activeStudents: filteredStudents.length,
      dueTodayList,
      overdueList,
      spcList,
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

  // Birthday computation
  const todayBirthdays = useMemo((): BirthdayPerson[] => {
    const now = new Date();
    const todayMonth = now.getMonth() + 1;
    const todayDay = now.getDate();

    const result: BirthdayPerson[] = [];

    students.filter(s => s.active && s.birth_date).forEach(s => {
      const [, m, d] = s.birth_date!.split("-").map(Number);
      if (m === todayMonth && d === todayDay) {
        result.push({
          id: s.id,
          name: s.full_name,
          type: "Aluno",
          birthDate: s.birth_date!,
          unitName: getUnitName(s.unit_id),
          phone: getProfilePhone(s.responsible_id),
        });
      }
    });

    return unitFilter === "all" ? result : result.filter(b => {
      const st = students.find(s => s.id === b.id);
      return st && st.unit_id === unitFilter;
    });
  }, [students, units, profiles, unitFilter]);

  const openBirthdayWhatsApp = (person: BirthdayPerson) => {
    const msg = `Olá, ${person.name}! A equipe da UPLAY deseja um feliz aniversário! 🎉`;
    if (person.phone) {
      const digits = person.phone.replace(/\D/g, "");
      const clean = digits.startsWith("55") ? digits : `55${digits}`;
      window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, "_blank");
    } else {
      navigator.clipboard.writeText(msg);
      toast({ title: "Mensagem copiada!", description: "O contato não possui telefone cadastrado. A mensagem foi copiada." });
    }
  };

  const openWhatsApp = async (payment: DashboardPayment, template: "default" | "spc" = "default") => {
    try {
      toast({ title: "Sincronizando cobrança no Asaas antes do envio..." });
      const resolved = await resolveWhatsAppChargeData(payment.id);

      setWaDialog({
        open: true,
        phone: resolved.responsible.phone,
        responsibleName: resolved.responsible.full_name,
        studentName: resolved.studentName ?? "",
        value: resolved.payment.final_value ?? resolved.payment.value,
        dueDate: resolved.payment.due_date,
        paymentId: resolved.payment.id,
        responsibleId: resolved.payment.responsible_id,
        description: resolved.description,
        invoiceUrl: resolved.payment.invoice_url || resolved.payment.checkout_url,
        boletoUrl: resolved.payment.boleto_url,
        pixCopyPaste: resolved.payment.pix_copy_paste,
        paymentMethod: resolved.payment.payment_method,
        messageTemplate: template,
      });
    } catch (err) {
      toast({
        title: "Envio bloqueado",
        description: err instanceof Error ? err.message : "Não foi possível obter os dados completos da cobrança no Asaas.",
        variant: "destructive",
      });
    }
  };

  const openWhatsAppSpc = (payment: DashboardPayment) => openWhatsApp(payment, "spc");

  const handleCleanupPreview = async () => {
    setCleanupLoading(true);
    setCleanupPreview(null);
    setCleanupResult(null);

    const { data, error } = await supabase.functions.invoke("clean-test-data", {
      body: { mode: "preview" },
    });

    setCleanupLoading(false);

    if (error || data?.error) {
      toast({ title: "Erro", description: error?.message || data?.error, variant: "destructive" });
      return;
    }

    setCleanupPreview(data.preview);
    setCleanupDialogOpen(true);
  };

  const handleCleanupExecute = async () => {
    setCleanupLoading(true);

    const { data, error } = await supabase.functions.invoke("clean-test-data", {
      body: { mode: "execute" },
    });

    setCleanupLoading(false);

    if (error || data?.error) {
      toast({ title: "Erro", description: error?.message || data?.error, variant: "destructive" });
      return;
    }

    setCleanupResult(data.result);
    setCleanupPreview(null);
    toast({ title: "Limpeza concluída", description: `${data.result.deleted_clients} clientes removidos.` });
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

      {/* Inconsistências Asaas × Sistema (alerta prioritário) */}
      <DashboardInconsistencies unitFilter={unitFilter} units={units} />

      {/* KPI Cards */}
      <DashboardKpiCards
        totalReceived={filtered.totalReceived}
        totalToReceive={filtered.totalToReceive}
        totalOverdue={filtered.totalOverdue}
        activeStudents={filtered.activeStudents}
        inadimplencia={filtered.inadimplencia}
        totalAsaasFees={filtered.totalAsaasFees}
        formatCurrency={formatCurrency}
      />

      {/* Birthdays */}
      <DashboardBirthdays
        birthdays={todayBirthdays}
        onSendGreeting={openBirthdayWhatsApp}
      />

      {/* Delivery notifications */}
      <DashboardDeliveries unitFilter={unitFilter} />

      {/* Low stock alerts */}
      <DashboardLowStock unitFilter={unitFilter} units={units} />

      {/* Overdue + SPC */}
      <div className="grid lg:grid-cols-2 gap-4">
        <DashboardOverdueList
          overdueList={filtered.overdueList}
          getProfileName={getProfileName}
          getStudentByResponsible={getStudentByResponsible}
          getUnitName={getUnitName}
          formatCurrency={formatCurrency}
          showUnit={isMaster && unitFilter === "all"}
          onSendWhatsApp={openWhatsApp}
          onChanged={fetchData}
        />

        <DashboardSpcList
          spcList={filtered.spcList}
          getProfileName={getProfileName}
          getStudentByResponsible={getStudentByResponsible}
          getUnitName={getUnitName}
          formatCurrency={formatCurrency}
          showUnit={isMaster && unitFilter === "all"}
          onSendWhatsApp={openWhatsAppSpc}
          onChanged={fetchData}
        />
      </div>

      {/* Vencendo hoje */}
      <div className="grid lg:grid-cols-2 gap-4">
        <DashboardDueTodayList
          dueTodayList={filtered.dueTodayList}
          getProfileName={getProfileName}
          getStudentByResponsible={getStudentByResponsible}
          getUnitName={getUnitName}
          formatCurrency={formatCurrency}
          showUnit={isMaster && unitFilter === "all"}
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
        description={waDialog.description}
        value={waDialog.value}
        dueDate={waDialog.dueDate}
        invoiceUrl={waDialog.invoiceUrl}
        boletoUrl={waDialog.boletoUrl}
        pixCopyPaste={waDialog.pixCopyPaste}
        paymentMethod={waDialog.paymentMethod}
        paymentId={waDialog.paymentId}
        responsibleId={waDialog.responsibleId}
      />

      {/* Cleanup Test Data - ADMIN_MASTER only */}
      {isMaster && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Limpeza de Dados de Teste</h3>
              <p className="text-xs text-muted-foreground">Remove clientes, contratos e parcelas sem pagamentos confirmados</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCleanupPreview}
              disabled={cleanupLoading}
            >
              {cleanupLoading ? <Loader2 size={14} className="animate-spin mr-2" /> : <Trash2 size={14} className="mr-2" />}
              Limpar dados de teste
            </Button>
          </div>
        </div>
      )}

      {/* Cleanup Dialog */}
      <AlertDialog open={cleanupDialogOpen} onOpenChange={(open) => { if (!open) { setCleanupDialogOpen(false); setCleanupPreview(null); setCleanupResult(null); } }}>
        <AlertDialogContent className="bg-card border-border sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              {cleanupResult ? "Relatório de Limpeza" : "Confirmar Limpeza de Dados de Teste"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {cleanupPreview && !cleanupResult && (
                  <>
                    <p className="text-sm">Esta ação é <strong className="text-destructive">irreversível</strong>. Serão removidos:</p>
                    <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
                      <p>🧑 <strong>{cleanupPreview.deletable_clients}</strong> clientes</p>
                      <p>📄 <strong>{cleanupPreview.deletable_contracts}</strong> contratos</p>
                      <p>💰 <strong>{cleanupPreview.deletable_payments}</strong> parcelas/cobranças</p>
                    </div>
                    {cleanupPreview.blocked_clients > 0 && (
                      <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
                        <p className="font-semibold text-warning">⚠️ {cleanupPreview.blocked_clients} clientes com pagamentos confirmados NÃO serão removidos:</p>
                        {cleanupPreview.blocked.map((b: any, i: number) => (
                          <p key={i} className="text-xs text-muted-foreground">• {b.name} ({b.paid_count} pagamentos)</p>
                        ))}
                      </div>
                    )}
                    {cleanupPreview.clients?.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        <p className="font-medium mb-1">Clientes que serão removidos:</p>
                        {cleanupPreview.clients.map((name: string, i: number) => (
                          <p key={i}>• {name}</p>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {cleanupResult && (
                  <>
                    <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
                      <p>✅ <strong>{cleanupResult.deleted_clients}</strong> clientes removidos</p>
                      <p>✅ <strong>{cleanupResult.deleted_contracts}</strong> contratos removidos</p>
                      <p>✅ <strong>{cleanupResult.deleted_payments}</strong> parcelas removidas</p>
                      <p>✅ <strong>{cleanupResult.deleted_students}</strong> alunos removidos</p>
                    </div>
                    {cleanupResult.blocked_clients > 0 && (
                      <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
                        <p className="font-semibold text-warning">⚠️ {cleanupResult.blocked_clients} clientes preservados (possuem pagamentos):</p>
                        {cleanupResult.blocked?.map((b: any, i: number) => (
                          <p key={i} className="text-xs text-muted-foreground">• {b.name} ({b.paid_count} pagamentos)</p>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border" disabled={cleanupLoading}>
              {cleanupResult ? "Fechar" : "Cancelar"}
            </AlertDialogCancel>
            {!cleanupResult && (
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleCleanupExecute(); }}
                disabled={cleanupLoading || (cleanupPreview?.deletable_clients === 0)}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                {cleanupLoading ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                Executar Limpeza
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminDashboard;
