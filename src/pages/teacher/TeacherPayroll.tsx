import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, CheckCircle2, Clock, Building2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { logTeacherAppEvent } from "@/lib/teacher-app-logger";

interface Closure {
  id: string;
  reference_month: string;
  lessons_count: number;
  total_hours: number;
  total_value: number;
  paid_amount: number;
  status: string;
  paid_at: string | null;
  due_date: string | null;
  scheduled_payment_date: string | null;
  notes: string | null;
  teacher_id: string;
  unit_id: string;
}
interface PaymentRow {
  id: string;
  payment_type: string;
  amount: number;
  payment_date: string;
  description: string | null;
  status: string;
  closure_id: string | null;
  teacher_id: string;
}
interface TeacherRow {
  id: string;
  unit_id: string;
  company_id: string | null;
  unit_name: string;
}

const TYPE_LABEL: Record<string, string> = {
  FOLHA_MENSAL: "Folha mensal",
  ADIANTAMENTO: "Adiantamento",
  AVULSO: "Avulso",
  REPOSICAO: "Reposição",
  AULA_EXTRA: "Aula extra",
  BONUS: "Bônus",
  AJUDA_CUSTO: "Ajuda de custo",
};

const STATUS_LABEL: Record<string, string> = {
  PAID: "Pago",
  PARTIAL: "Parcial",
  PENDING: "Pendente",
  CANCELED: "Cancelado",
};

function fmtBRL(n: number) {
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR");
}
function fmtMonth(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export default function TeacherPayroll() {
  const { user } = useAuth();
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [closures, setClosures] = useState<Closure[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const reloadTimerRef = useRef<number | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      console.info("[teacher-payroll] carregando vínculos", { userId: user.id });
      const { data: teacherRows, error: teacherError } = await supabase
        .from("school_teachers")
        .select("id,unit_id,company_id,active,units(name)")
        .eq("profile_id", user.id)
        .eq("active", true);
      if (teacherError) throw teacherError;

      const list: TeacherRow[] = (teacherRows ?? []).map((t: any) => ({
        id: t.id,
        unit_id: t.unit_id,
        company_id: t.company_id ?? null,
        unit_name: t.units?.name ?? "Unidade",
      }));
      setTeachers(list);
      if (list.length === 0) {
        setClosures([]);
        setPayments([]);
        void logTeacherAppEvent({
          userId: user.id,
          event: "teacher_payroll_no_active_link",
          status: "WARN",
          message: "Usuário sem vínculo ativo de professor ao abrir folha",
        });
        return;
      }

      const ids = list.map((t) => t.id);
      const [cRes, pRes] = await Promise.all([
        supabase
          .from("school_payroll_closures")
          .select("*")
          .in("teacher_id", ids)
          .order("reference_month", { ascending: false }),
        supabase
          .from("school_teacher_payments")
          .select("id,payment_type,amount,payment_date,description,status,closure_id,teacher_id")
          .in("teacher_id", ids)
          .order("payment_date", { ascending: false }),
      ]);
      if (cRes.error) throw cRes.error;
      if (pRes.error) throw pRes.error;

      setClosures((cRes.data ?? []) as Closure[]);
      setPayments((pRes.data ?? []) as PaymentRow[]);
      void logTeacherAppEvent({
        userId: user.id,
        event: "teacher_payroll_loaded",
        teacherId: ids[0] ?? null,
        unitId: list[0]?.unit_id ?? null,
        companyId: list[0]?.company_id ?? null,
        details: {
          teacher_ids: ids,
          unit_ids: list.map((t) => t.unit_id),
          closures_count: cRes.data?.length ?? 0,
          payments_count: pRes.data?.length ?? 0,
        },
      });
    } catch (e: any) {
      console.error("[teacher-payroll] erro ao carregar folha", { userId: user.id, error: e });
      void logTeacherAppEvent({
        userId: user.id,
        event: "teacher_payroll_load_error",
        status: "ERROR",
        message: e.message,
        details: { error: e },
      });
      toast({ title: "Erro ao carregar folha", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [user?.id]);

  const teacherIdsKey = useMemo(() => teachers.map((t) => t.id).sort().join(","), [teachers]);

  useEffect(() => {
    if (!user || teachers.length === 0) return;
    const teacherIds = teachers.map((t) => t.id);
    const scheduleReload = (source: string, row: { teacher_id?: string; profile_id?: string } | null, eventType: string) => {
      if (row?.teacher_id && !teacherIds.includes(row.teacher_id)) return;
      if (row?.profile_id && row.profile_id !== user.id) return;
      console.info("[teacher-payroll] atualização em tempo real", { userId: user.id, source, eventType });
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = window.setTimeout(() => void load(), 300);
    };

    const channel = supabase
      .channel(`teacher-payroll-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "school_payroll_closures" }, (payload) =>
        scheduleReload("school_payroll_closures", (payload.new ?? payload.old) as any, payload.eventType),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "school_teacher_payments" }, (payload) =>
        scheduleReload("school_teacher_payments", (payload.new ?? payload.old) as any, payload.eventType),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "school_teachers" }, (payload) =>
        scheduleReload("school_teachers", (payload.new ?? payload.old) as any, payload.eventType),
      )
      .subscribe((status) => console.info("[teacher-payroll] realtime", { userId: user.id, status }));

    return () => {
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [user?.id, teacherIdsKey]);

  const teacherUnitById = useMemo(
    () => Object.fromEntries(teachers.map((t) => [t.id, t])),
    [teachers]
  );

  const scopedClosures = useMemo(() => {
    if (unitFilter === "ALL") return closures;
    return closures.filter((c) => c.unit_id === unitFilter);
  }, [closures, unitFilter]);

  const scopedPayments = useMemo(() => {
    if (unitFilter === "ALL") return payments;
    const ids = teachers.filter((t) => t.unit_id === unitFilter).map((t) => t.id);
    return payments.filter((p) => ids.includes(p.teacher_id));
  }, [payments, unitFilter, teachers]);

  const totalPending = scopedClosures.reduce((s, c) => {
    if (c.status === "CANCELED") return s;
    return s + Math.max(Number(c.total_value) - Number(c.paid_amount || 0), 0);
  }, 0);
  const totalPaid = scopedPayments.filter((p) => p.status === "PAGO").reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Meus Pagamentos</h1>
          <p className="text-sm text-muted-foreground">Folha mensal, adiantamentos e pagamentos avulsos.</p>
        </div>
        {teachers.length > 1 && (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas as unidades ({teachers.length})</SelectItem>
                {teachers.map((t) => (
                  <SelectItem key={t.unit_id} value={t.unit_id}>{t.unit_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <p className="text-xs uppercase">Saldo a receber</p>
          </div>
          <p className="text-2xl font-bold text-amber-600 mt-1">{fmtBRL(totalPending)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" />
            <p className="text-xs uppercase">Total recebido</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{fmtBRL(totalPaid)}</p>
        </Card>
      </div>

      <Tabs defaultValue="closures">
        <TabsList>
          <TabsTrigger value="closures">Folha mensal</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="closures" className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loading && scopedClosures.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              <Wallet className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              Nenhum fechamento ainda.
            </Card>
          )}
          {scopedClosures.map((c) => {
            const paid = Number(c.paid_amount || 0);
            const total = Number(c.total_value);
            const remaining = Math.max(total - paid, 0);
            const unitName = teacherUnitById[c.teacher_id]?.unit_name;
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold capitalize">{fmtMonth(c.reference_month)}</p>
                      {teachers.length > 1 && unitName && (
                        <Badge variant="outline" className="gap-1">
                          <Building2 className="h-3 w-3" />
                          {unitName}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.lessons_count} aulas · {Number(c.total_hours).toFixed(2)}h
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Vence: {fmtDate(c.due_date)} · Pgto previsto: {fmtDate(c.scheduled_payment_date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{fmtBRL(total)}</p>
                    <p className="text-xs">
                      Pago: <b className="text-emerald-600">{fmtBRL(paid)}</b>
                    </p>
                    <p className="text-xs">
                      Saldo: <b className="text-amber-600">{fmtBRL(remaining)}</b>
                    </p>
                    <Badge
                      variant="outline"
                      className={
                        c.status === "PAID"
                          ? "bg-emerald-500/10 text-emerald-700 mt-1"
                          : c.status === "PARTIAL"
                          ? "bg-blue-500/10 text-blue-700 mt-1"
                          : c.status === "CANCELED"
                          ? "bg-destructive/10 text-destructive mt-1"
                          : "bg-amber-500/10 text-amber-700 mt-1"
                      }
                    >
                      {STATUS_LABEL[c.status] ?? c.status}
                    </Badge>
                  </div>
                </div>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="history" className="space-y-2">
          {scopedPayments.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum pagamento registrado.</Card>
          )}
          {scopedPayments.map((p) => {
            const unitName = teacherUnitById[p.teacher_id]?.unit_name;
            return (
              <Card key={p.id} className="p-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{TYPE_LABEL[p.payment_type] ?? p.payment_type}</p>
                    {teachers.length > 1 && unitName && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Building2 className="h-3 w-3" />
                        {unitName}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{p.description ?? "—"}</p>
                  <p className="text-[11px] text-muted-foreground">{fmtDate(p.payment_date)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{fmtBRL(Number(p.amount))}</p>
                  <Badge variant="outline" className={p.status === "PAGO" ? "bg-emerald-500/10 text-emerald-700" : "bg-muted"}>
                    {p.status}
                  </Badge>
                </div>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
