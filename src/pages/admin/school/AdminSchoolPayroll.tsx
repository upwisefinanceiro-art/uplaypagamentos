import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSchoolAccess } from "@/hooks/useSchoolAccess";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Wallet, RefreshCcw, CheckCircle2, AlertCircle, Plus, Trash2, Calendar, Settings, FileText } from "lucide-react";

interface Teacher {
  id: string;
  full_name: string;
  unit_id: string;
  company_id: string;
  hourly_rate: number;
  pix_key: string | null;
}
interface Closure {
  id: string;
  teacher_id: string;
  unit_id: string;
  company_id: string;
  reference_month: string;
  lessons_count: number;
  total_hours: number;
  total_value: number;
  paid_amount: number;
  status: string;
  paid_at: string | null;
  due_date: string | null;
  scheduled_payment_date: string | null;
  payment_proof_url: string | null;
  notes: string | null;
}
interface AggLesson {
  teacher_id: string;
  count: number;
  hours: number;
  value: number;
}
interface TeacherPayment {
  id: string;
  teacher_id: string;
  closure_id: string | null;
  payment_type: string;
  amount: number;
  payment_date: string;
  competence_month: string | null;
  description: string | null;
  notes: string | null;
  payment_proof_url: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
}

const PAYMENT_TYPES: { value: string; label: string }[] = [
  { value: "FOLHA_MENSAL", label: "Folha mensal" },
  { value: "ADIANTAMENTO", label: "Adiantamento" },
  { value: "AVULSO", label: "Pagamento avulso" },
  { value: "REPOSICAO", label: "Reposição" },
  { value: "AULA_EXTRA", label: "Aula extra" },
  { value: "BONUS", label: "Bônus" },
  { value: "AJUDA_CUSTO", label: "Ajuda de custo" },
];
const TYPE_LABEL = Object.fromEntries(PAYMENT_TYPES.map((p) => [p.value, p.label]));

function fmtBRL(n: number) {
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR");
}
function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addMonths(iso: string, months: number) {
  const [y, m, day] = iso.split("-").map(Number);
  const d = new Date(y, m - 1 + months, day);
  return toISO(d);
}
/** Início do ciclo aberto baseado em hoje e no dia de fechamento da unidade. */
function computeCycleStart(closingDay: number, ref: Date = new Date()) {
  const safe = Math.min(Math.max(closingDay || 20, 1), 28);
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const day = ref.getDate();
  // ciclo aberto = [último closingDay <= hoje, próximo closingDay)
  const startDate = day >= safe ? new Date(y, m, safe) : new Date(y, m - 1, safe);
  return toISO(startDate);
}
function cycleEndOf(cycleStart: string) {
  return addMonths(cycleStart, 1);
}
function fmtCycle(start: string, end?: string | null) {
  const e = end || cycleEndOf(start);
  return `${fmtDate(start)} → ${fmtDate(e)}`;
}

interface UnitConfig {
  id: string;
  name: string;
  payroll_closing_day: number;
  payroll_payment_day: number;
}

export default function AdminSchoolPayroll() {
  const { user } = useAuth();
  const { units, loading: unitsLoading } = useSchoolAccess();
  const [unitId, setUnitId] = useState<string>("");
  const [month, setMonth] = useState<string>(currentMonth());
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [payments, setPayments] = useState<TeacherPayment[]>([]);
  const [agg, setAgg] = useState<Record<string, AggLesson>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [unitConfig, setUnitConfig] = useState<UnitConfig | null>(null);

  // Pay-closure dialog
  const [payOpen, setPayOpen] = useState<Closure | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", payment_date: "", proof: "", notes: "" });

  // Schedule dialog
  const [scheduleOpen, setScheduleOpen] = useState<Closure | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ due_date: "", scheduled_payment_date: "" });

  // Unit config dialog
  const [configOpen, setConfigOpen] = useState(false);
  const [configForm, setConfigForm] = useState({ closing: "20", payment: "25" });

  // New payment dialog (avulso/adiantamento/etc)
  const [newPayOpen, setNewPayOpen] = useState(false);
  const [newPayForm, setNewPayForm] = useState({
    teacher_id: "",
    payment_type: "AVULSO",
    amount: "",
    payment_date: new Date().toISOString().slice(0, 10),
    link_closure: true,
    description: "",
    notes: "",
    proof: "",
  });

  useEffect(() => {
    if (!unitId && units.length) setUnitId(units[0].id);
  }, [units, unitId]);

  const monthStart = `${month}-01`;
  const monthEnd = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }, [month]);

  const load = async () => {
    if (!unitId) return;
    setLoading(true);
    try {
      const [tRes, cRes, lRes, pRes, uRes] = await Promise.all([
        supabase
          .from("school_teachers")
          .select("id,full_name,unit_id,company_id,hourly_rate,pix_key")
          .eq("unit_id", unitId)
          .eq("active", true)
          .order("full_name"),
        supabase
          .from("school_payroll_closures")
          .select("*")
          .eq("unit_id", unitId)
          .eq("reference_month", monthStart),
        supabase
          .from("school_lessons")
          .select("teacher_id,duration_hours,computed_value")
          .eq("unit_id", unitId)
          .eq("status", "VALIDATED")
          .gte("starts_at", monthStart)
          .lt("starts_at", monthEnd),
        supabase
          .from("school_teacher_payments")
          .select("*")
          .eq("unit_id", unitId)
          .gte("payment_date", monthStart)
          .lt("payment_date", monthEnd)
          .order("payment_date", { ascending: false }),
        supabase
          .from("units")
          .select("id,name,payroll_closing_day,payroll_payment_day")
          .eq("id", unitId)
          .maybeSingle(),
      ]);
      setTeachers((tRes.data ?? []) as Teacher[]);
      setClosures((cRes.data ?? []) as Closure[]);
      setPayments((pRes.data ?? []) as TeacherPayment[]);
      if (uRes.data) setUnitConfig(uRes.data as UnitConfig);
      const map: Record<string, AggLesson> = {};
      (lRes.data ?? []).forEach((l: any) => {
        const a = (map[l.teacher_id] ||= { teacher_id: l.teacher_id, count: 0, hours: 0, value: 0 });
        a.count++;
        a.hours += Number(l.duration_hours);
        a.value += Number(l.computed_value);
      });
      setAgg(map);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [unitId, month]);

  const generate = async (teacherId: string) => {
    setBusy(teacherId);
    const { error } = await supabase.rpc("generate_school_payroll_closure", {
      _teacher_id: teacherId,
      _reference_month: monthStart,
    });
    setBusy(null);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Fechamento gerado/atualizado" });
    load();
  };

  const generateAll = async () => {
    setBusy("ALL");
    let ok = 0;
    for (const t of teachers) {
      const a = agg[t.id];
      if (!a || a.count === 0) continue;
      const { error } = await supabase.rpc("generate_school_payroll_closure", {
        _teacher_id: t.id,
        _reference_month: monthStart,
      });
      if (!error) ok++;
    }
    setBusy(null);
    toast({ title: `${ok} fechamento(s) gerados` });
    load();
  };

  const openPayDialog = (c: Closure) => {
    const remaining = Math.max(Number(c.total_value) - Number(c.paid_amount || 0), 0);
    setPayForm({
      amount: remaining.toFixed(2),
      payment_date: new Date().toISOString().slice(0, 10),
      proof: "",
      notes: "",
    });
    setPayOpen(c);
  };

  const confirmPay = async () => {
    if (!payOpen) return;
    const amount = Number(payForm.amount.replace(",", "."));
    if (!amount || amount <= 0) return toast({ title: "Valor inválido", variant: "destructive" });
    setBusy(payOpen.id);
    const { error } = await supabase.from("school_teacher_payments").insert({
      company_id: payOpen.company_id,
      unit_id: payOpen.unit_id,
      teacher_id: payOpen.teacher_id,
      closure_id: payOpen.id,
      payment_type: "FOLHA_MENSAL",
      amount,
      payment_date: payForm.payment_date,
      competence_month: payOpen.reference_month,
      description: `Pagamento folha ${fmtMonth(payOpen.reference_month)}`,
      notes: payForm.notes || null,
      payment_proof_url: payForm.proof || null,
      status: "PAGO",
      created_by: user?.id ?? null,
    });
    setBusy(null);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Pagamento registrado" });
    setPayOpen(null);
    load();
  };

  const openSchedule = (c: Closure) => {
    setScheduleForm({
      due_date: c.due_date ?? "",
      scheduled_payment_date: c.scheduled_payment_date ?? "",
    });
    setScheduleOpen(c);
  };

  const saveSchedule = async () => {
    if (!scheduleOpen) return;
    setBusy(scheduleOpen.id);
    const { error } = await supabase
      .from("school_payroll_closures")
      .update({
        due_date: scheduleForm.due_date || null,
        scheduled_payment_date: scheduleForm.scheduled_payment_date || null,
      })
      .eq("id", scheduleOpen.id);
    setBusy(null);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Datas atualizadas" });
    setScheduleOpen(null);
    load();
  };

  const openNewPayment = (teacherId?: string) => {
    setNewPayForm({
      teacher_id: teacherId ?? "",
      payment_type: "AVULSO",
      amount: "",
      payment_date: new Date().toISOString().slice(0, 10),
      link_closure: true,
      description: "",
      notes: "",
      proof: "",
    });
    setNewPayOpen(true);
  };

  const saveNewPayment = async () => {
    const teacher = teachers.find((t) => t.id === newPayForm.teacher_id);
    if (!teacher) return toast({ title: "Selecione um professor", variant: "destructive" });
    const amount = Number(newPayForm.amount.replace(",", "."));
    if (!amount || amount <= 0) return toast({ title: "Valor inválido", variant: "destructive" });
    const closure = newPayForm.link_closure ? closures.find((c) => c.teacher_id === teacher.id) : null;
    setBusy("new");
    const { error } = await supabase.from("school_teacher_payments").insert({
      company_id: teacher.company_id,
      unit_id: teacher.unit_id,
      teacher_id: teacher.id,
      closure_id: closure?.id ?? null,
      payment_type: newPayForm.payment_type,
      amount,
      payment_date: newPayForm.payment_date,
      competence_month: monthStart,
      description: newPayForm.description || TYPE_LABEL[newPayForm.payment_type],
      notes: newPayForm.notes || null,
      payment_proof_url: newPayForm.proof || null,
      status: "PAGO",
      created_by: user?.id ?? null,
    });
    setBusy(null);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Pagamento registrado" });
    setNewPayOpen(false);
    load();
  };

  const deletePayment = async (id: string) => {
    if (!confirm("Cancelar/excluir este pagamento?")) return;
    const { error } = await supabase.from("school_teacher_payments").delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Pagamento removido" });
    load();
  };

  const openConfig = () => {
    setConfigForm({
      closing: String(unitConfig?.payroll_closing_day ?? 20),
      payment: String(unitConfig?.payroll_payment_day ?? 25),
    });
    setConfigOpen(true);
  };

  const saveConfig = async () => {
    if (!unitId) return;
    const closing = Math.min(Math.max(parseInt(configForm.closing) || 20, 1), 28);
    const payment = Math.min(Math.max(parseInt(configForm.payment) || 25, 1), 28);
    setBusy("config");
    const { error } = await supabase
      .from("units")
      .update({ payroll_closing_day: closing, payroll_payment_day: payment })
      .eq("id", unitId);
    setBusy(null);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Configuração salva", description: `Fechamento dia ${closing} · Pagamento dia ${payment}` });
    setConfigOpen(false);
    load();
  };

  // Adiantamentos / pagamentos avulsos do professor no mês (não-FOLHA)
  const advancesByTeacher = useMemo(() => {
    const m: Record<string, number> = {};
    payments
      .filter((p) => p.status === "PAGO" && p.payment_type !== "FOLHA_MENSAL")
      .forEach((p) => {
        m[p.teacher_id] = (m[p.teacher_id] || 0) + Number(p.amount);
      });
    return m;
  }, [payments]);

  const generateReport = (c: Closure) => {
    const teacher = teachers.find((t) => t.id === c.teacher_id);
    const teacherPayments = payments.filter(
      (p) => p.teacher_id === c.teacher_id && p.status === "PAGO",
    );
    const advances = teacherPayments
      .filter((p) => p.payment_type !== "FOLHA_MENSAL")
      .reduce((s, p) => s + Number(p.amount), 0);
    const folha = teacherPayments
      .filter((p) => p.payment_type === "FOLHA_MENSAL")
      .reduce((s, p) => s + Number(p.amount), 0);
    const remaining = Math.max(Number(c.total_value) - Number(c.paid_amount || 0), 0);
    const lines = [
      `RELATÓRIO DE FOLHA - ${teacher?.full_name ?? "-"}`,
      `Competência: ${fmtMonth(c.reference_month)}`,
      `Unidade: ${unitConfig?.name ?? "-"}`,
      ``,
      `Hora-aula: ${fmtBRL(Number(teacher?.hourly_rate ?? 0))}`,
      `Aulas validadas: ${c.lessons_count}`,
      `Total de horas: ${Number(c.total_hours).toFixed(2)}h`,
      `Total bruto: ${fmtBRL(Number(c.total_value))}`,
      ``,
      `Adiantamentos/avulsos: ${fmtBRL(advances)}`,
      `Pagamento de folha: ${fmtBRL(folha)}`,
      `Total já pago: ${fmtBRL(Number(c.paid_amount || 0))}`,
      ``,
      `VALOR FINAL A PAGAR: ${fmtBRL(remaining)}`,
      ``,
      `Vencimento: ${fmtDate(c.due_date)}`,
      `Pagamento previsto: ${fmtDate(c.scheduled_payment_date)}`,
      `Status: ${c.status}`,
    ].join("\n");

    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `folha-${teacher?.full_name?.replace(/\s+/g, "_") ?? "professor"}-${c.reference_month}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!unitsLoading && !units.length) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto">
        <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p>Nenhuma unidade com módulo escolar habilitado.</p>
      </Card>
    );
  }

  const totals = teachers.reduce(
    (acc, t) => {
      const a = agg[t.id] || { count: 0, hours: 0, value: 0 };
      const c = closures.find((cl) => cl.teacher_id === t.id);
      acc.hours += a.hours;
      acc.value += a.value;
      const closureValue = c ? Number(c.total_value) : 0;
      const paid = c ? Number(c.paid_amount || 0) : 0;
      acc.paid += paid;
      acc.pending += Math.max(closureValue - paid, 0);
      return acc;
    },
    { hours: 0, value: 0, paid: 0, pending: 0 },
  );
  // Add extra payments not linked to closure to "paid"
  const extraPaid = payments
    .filter((p) => !p.closure_id && p.status === "PAGO")
    .reduce((s, p) => s + Number(p.amount), 0);
  totals.paid += extraPaid;

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      PAID: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
      PARTIAL: "bg-blue-500/10 text-blue-700 border-blue-200",
      PENDING: "bg-amber-500/10 text-amber-700 border-amber-200",
      CANCELED: "bg-destructive/10 text-destructive",
    };
    const label: Record<string, string> = {
      PAID: "Pago",
      PARTIAL: "Parcial",
      PENDING: "Pendente",
      CANCELED: "Cancelado",
    };
    return (
      <Badge variant="outline" className={map[s] ?? ""}>
        {label[s] ?? s}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6" /> Folha de Pagamento
          </h1>
          <p className="text-sm text-muted-foreground">
            Fechamento mensal, adiantamentos, bônus e pagamentos avulsos por professor.
          </p>
          {unitConfig && (
            <p className="text-xs text-muted-foreground mt-1">
              <Calendar className="h-3 w-3 inline mr-1" />
              Fechamento automático todo dia <b>{unitConfig.payroll_closing_day}</b> ·
              {" "}Pagamento dia <b>{unitConfig.payroll_payment_day}</b>
            </p>
          )}
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          {units.length > 1 && (
            <div>
              <Label className="text-xs">Unidade</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Competência</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <Button variant="outline" onClick={load}><RefreshCcw className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={openConfig} title="Configurar fechamento">
            <Settings className="h-4 w-4" />
          </Button>
          <Button onClick={() => openNewPayment()}>
            <Plus className="h-4 w-4 mr-1" /> Novo pagamento
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Horas validadas</p>
          <p className="text-xl font-bold">{totals.hours.toFixed(1)}h</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Valor validado</p>
          <p className="text-xl font-bold">{fmtBRL(totals.value)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Saldo a pagar</p>
          <p className="text-xl font-bold text-amber-600">{fmtBRL(totals.pending)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Pago no mês</p>
          <p className="text-xl font-bold text-emerald-600">{fmtBRL(totals.paid)}</p>
        </Card>
      </div>

      <Tabs defaultValue="closures">
        <TabsList>
          <TabsTrigger value="closures">Fechamento mensal</TabsTrigger>
          <TabsTrigger value="history">Histórico de pagamentos</TabsTrigger>
        </TabsList>

        <TabsContent value="closures" className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" onClick={generateAll} disabled={busy === "ALL" || teachers.length === 0}>
              Gerar fechamento de todos
            </Button>
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="divide-y">
              {teachers.map((t) => {
                const a = agg[t.id] || { count: 0, hours: 0, value: 0 };
                const c = closures.find((cl) => cl.teacher_id === t.id);
                const closureValue = c ? Number(c.total_value) : 0;
                const paid = c ? Number(c.paid_amount || 0) : 0;
                const remaining = Math.max(closureValue - paid, 0);
                const diverged = c && closureValue.toFixed(2) !== a.value.toFixed(2);
                const advances = advancesByTeacher[t.id] || 0;

                return (
                  <div key={t.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{t.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        PIX: {t.pix_key || "—"} · Hora: {fmtBRL(Number(t.hourly_rate))}
                      </p>
                    </div>
                    <div className="text-sm min-w-[300px]">
                      <p>
                        <span className="text-muted-foreground">Aulas validadas:</span>{" "}
                        <b>{a.count}</b> · {a.hours.toFixed(2)}h ·{" "}
                        <b>{fmtBRL(a.value)}</b>
                      </p>
                      {advances > 0 && (
                        <p className="text-xs mt-0.5">
                          <span className="text-muted-foreground">Adiantamentos/avulsos:</span>{" "}
                          <b className="text-blue-600">-{fmtBRL(advances)}</b>
                        </p>
                      )}
                      {c ? (
                        <>
                          <p className="text-xs mt-1">
                            <span className="text-muted-foreground">Bruto:</span>{" "}
                            <b>{fmtBRL(closureValue)}</b> · Pago: <b className="text-emerald-600">{fmtBRL(paid)}</b>
                            {" "}{statusBadge(c.status)}
                            {diverged && <span className="text-amber-600 ml-2">⚠ desatualizado</span>}
                          </p>
                          <p className="text-sm mt-1">
                            <span className="text-muted-foreground">Valor final a pagar:</span>{" "}
                            <b className="text-amber-600 text-base">{fmtBRL(remaining)}</b>
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Vencimento: {fmtDate(c.due_date)} · Pagamento previsto: {fmtDate(c.scheduled_payment_date)}
                          </p>
                        </>
                      ) : (
                        a.count > 0 && (
                          <p className="text-xs mt-1 text-muted-foreground">
                            Previsão final a pagar:{" "}
                            <b className="text-amber-600">{fmtBRL(Math.max(a.value - advances, 0))}</b>
                          </p>
                        )
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end">
                      {(!c || c.status !== "PAID") && (
                        <Button size="sm" variant="outline" onClick={() => generate(t.id)} disabled={busy === t.id || a.count === 0}>
                          {c ? "Atualizar" : "Gerar"}
                        </Button>
                      )}
                      {c && (
                        <Button size="sm" variant="outline" onClick={() => openSchedule(c)}>
                          <Calendar className="h-4 w-4 mr-1" /> Datas
                        </Button>
                      )}
                      {c && (
                        <Button size="sm" variant="outline" onClick={() => generateReport(c)} title="Relatório">
                          <FileText className="h-4 w-4" />
                        </Button>
                      )}
                      {c && remaining > 0 && (
                        <Button size="sm" onClick={() => openPayDialog(c)}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Pagar
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => openNewPayment(t.id)}>
                        <Plus className="h-4 w-4 mr-1" /> Avulso
                      </Button>
                    </div>
                  </div>
                );
              })}
              {!loading && teachers.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Nenhum professor cadastrado nesta unidade.
                </p>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Professor</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => {
                  const t = teachers.find((x) => x.id === p.teacher_id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>{fmtDate(p.payment_date)}</TableCell>
                      <TableCell>{t?.full_name ?? "—"}</TableCell>
                      <TableCell>{TYPE_LABEL[p.payment_type] ?? p.payment_type}</TableCell>
                      <TableCell className="max-w-[260px] truncate">{p.description ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtBRL(Number(p.amount))}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={p.status === "PAGO" ? "bg-emerald-500/10 text-emerald-700" : "bg-muted"}>
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => deletePayment(p.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {payments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      Nenhum pagamento neste mês.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Pay closure dialog */}
      <Dialog open={!!payOpen} onOpenChange={(o) => !o && setPayOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pagamento da folha</DialogTitle>
          </DialogHeader>
          {payOpen && (
            <div className="space-y-3">
              <p className="text-sm">
                Total: <b>{fmtBRL(Number(payOpen.total_value))}</b> · Pago: <b>{fmtBRL(Number(payOpen.paid_amount || 0))}</b>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor *</Label>
                  <Input value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
                </div>
                <div>
                  <Label>Data do pagamento *</Label>
                  <Input type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Comprovante (URL)</Label>
                <Input value={payForm.proof} onChange={(e) => setPayForm({ ...payForm, proof: e.target.value })} placeholder="https://..." />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(null)}>Cancelar</Button>
            <Button onClick={confirmPay} disabled={busy === payOpen?.id}>Confirmar pagamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule dialog */}
      <Dialog open={!!scheduleOpen} onOpenChange={(o) => !o && setScheduleOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Datas do fechamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Vencimento da folha</Label>
              <Input type="date" value={scheduleForm.due_date} onChange={(e) => setScheduleForm({ ...scheduleForm, due_date: e.target.value })} />
            </div>
            <div>
              <Label>Pagamento programado</Label>
              <Input type="date" value={scheduleForm.scheduled_payment_date} onChange={(e) => setScheduleForm({ ...scheduleForm, scheduled_payment_date: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(null)}>Cancelar</Button>
            <Button onClick={saveSchedule}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New payment dialog */}
      <Dialog open={newPayOpen} onOpenChange={setNewPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo pagamento ao professor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Professor *</Label>
              <Select value={newPayForm.teacher_id} onValueChange={(v) => setNewPayForm({ ...newPayForm, teacher_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo *</Label>
                <Select value={newPayForm.payment_type} onValueChange={(v) => setNewPayForm({ ...newPayForm, payment_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor *</Label>
                <Input value={newPayForm.amount} onChange={(e) => setNewPayForm({ ...newPayForm, amount: e.target.value })} placeholder="0,00" />
              </div>
              <div>
                <Label>Data do pagamento *</Label>
                <Input type="date" value={newPayForm.payment_date} onChange={(e) => setNewPayForm({ ...newPayForm, payment_date: e.target.value })} />
              </div>
              <div className="flex items-end gap-2">
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newPayForm.link_closure}
                    onChange={(e) => setNewPayForm({ ...newPayForm, link_closure: e.target.checked })}
                  />
                  Abater do fechamento do mês
                </label>
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={newPayForm.description} onChange={(e) => setNewPayForm({ ...newPayForm, description: e.target.value })} placeholder="Ex: adiantamento, bônus de campanha..." />
            </div>
            <div>
              <Label>Comprovante (URL)</Label>
              <Input value={newPayForm.proof} onChange={(e) => setNewPayForm({ ...newPayForm, proof: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={newPayForm.notes} onChange={(e) => setNewPayForm({ ...newPayForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewPayOpen(false)}>Cancelar</Button>
            <Button onClick={saveNewPayment} disabled={busy === "new"}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unit payroll config dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configuração da folha automática</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Todo dia configurado de fechamento, o sistema soma automaticamente as aulas
              validadas do mês e gera o fechamento de cada professor.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Dia do fechamento *</Label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={configForm.closing}
                  onChange={(e) => setConfigForm({ ...configForm, closing: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground mt-1">Ex: 20</p>
              </div>
              <div>
                <Label>Dia do pagamento *</Label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={configForm.payment}
                  onChange={(e) => setConfigForm({ ...configForm, payment: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground mt-1">Ex: 25</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>Cancelar</Button>
            <Button onClick={saveConfig} disabled={busy === "config"}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
