import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { CalendarCheck2, XCircle, CheckCircle2, Clock, AlertCircle, Building2, type LucideIcon } from "lucide-react";
import { logTeacherAppEvent } from "@/lib/teacher-app-logger";

interface Lesson {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  duration_hours: number;
  computed_value: number;
  hourly_rate_snapshot: number;
  teacher_confirmed_at: string | null;
  validated_at: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  notes: string | null;
  class_id: string | null;
  course_id: string | null;
  teacher_id: string;
  unit_id: string;
}

interface TeacherRow {
  id: string;
  unit_id: string;
  company_id: string | null;
  unit_name: string;
}

type TeacherSelectRow = {
  id: string;
  unit_id: string;
  company_id: string | null;
};

type UnitNameRow = { id: string; name: string | null };

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.stack || error.message;
  if (error && typeof error === "object") {
    const err = error as { message?: string; code?: string; details?: string; hint?: string };
    const parts = [err.message, err.code && `Código: ${err.code}`, err.details && `Detalhes: ${err.details}`, err.hint && `Dica: ${err.hint}`].filter(Boolean);
    if (parts.length) return parts.join(" | ");
  }
  return String(error || "Erro sem detalhes retornado pelo backend");
}

const STATUS_META: Record<string, { label: string; cls: string; icon: LucideIcon }> = {
  SCHEDULED: { label: "Agendada", cls: "bg-blue-500/10 text-blue-600 border-blue-200", icon: Clock },
  CONFIRMED: { label: "Confirmada por você", cls: "bg-amber-500/10 text-amber-700 border-amber-200", icon: CheckCircle2 },
  VALIDATED: { label: "Validada", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-200", icon: CalendarCheck2 },
  CANCELED: { label: "Cancelada", cls: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
};

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}
function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function TeacherLessons() {
  const { user } = useAuth();
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<Record<string, string>>({});
  const [courses, setCourses] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"upcoming" | "month" | "all">("upcoming");
  const [cancelOpen, setCancelOpen] = useState<Lesson | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const reloadTimerRef = useRef<number | null>(null);

  const load = async (attempt = 0) => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      // Aguarda sessão ficar pronta (até 3 tentativas silenciosas) para evitar
      // race condition no mount inicial que gerava "Erro desconhecido".
      let sessionReady = false;
      for (let i = 0; i < 3; i++) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) { sessionReady = true; break; }
        await supabase.auth.refreshSession();
        await wait(400 + i * 300);
      }
      if (!sessionReady && attempt < 2) {
        await wait(500);
        return load(attempt + 1);
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        throw new Error(`Sessão não carregada para consultar aulas: ${authError?.message ?? "usuário ausente"}`);
      }

      console.info("[teacher-lessons] carregando vínculos", { userId: user.id });
      const { data: teacherRows, error: teacherError } = await supabase
        .from("school_teachers")
        .select("id,unit_id,company_id,active")
        .eq("profile_id", user.id)
        .eq("active", true);
      if (teacherError) throw teacherError;

      const rows = (teacherRows ?? []) as TeacherSelectRow[];
      const unitIds = Array.from(new Set(rows.map((t) => t.unit_id).filter(Boolean)));
      const { data: unitRows, error: unitError } = unitIds.length
        ? await supabase.from("units_public").select("id,name").in("id", unitIds)
        : { data: [] as UnitNameRow[], error: null };
      if (unitError) console.warn("[teacher-lessons] erro ao carregar nomes das unidades", { userId: user.id, unitIds, error: unitError });
      const unitNameByUnitId = Object.fromEntries(((unitRows ?? []) as UnitNameRow[]).map((u) => [u.id, u.name ?? "Unidade"]));

      const list: TeacherRow[] = rows.map((t) => ({
        id: t.id,
        unit_id: t.unit_id,
        company_id: t.company_id ?? null,
        unit_name: unitNameByUnitId[t.unit_id] ?? "Unidade",
      }));
      setTeachers(list);

      if (list.length === 0) {
        if (attempt === 0) {
          console.warn("[teacher-lessons] nenhum vínculo retornado; tentando novamente após refresh de sessão", { userId: user.id });
          await supabase.auth.refreshSession();
          await wait(700);
          return load(1);
        }
        setLessons([]);
        setClasses({});
        setCourses({});
        void logTeacherAppEvent({
          userId: user.id,
          event: "teacher_lessons_no_active_link",
          status: "WARN",
          message: "Usuário sem vínculo ativo de professor",
        });
        return;
      }

      const teacherIds = list.map((t) => t.id);
      console.info("[teacher-lessons] vínculos encontrados", {
        userId: user.id,
        teacherIds,
        units: list.map((t) => t.unit_id),
      });
      const { data, error } = await supabase
        .from("school_lessons")
        .select("*")
        .in("teacher_id", teacherIds)
        .order("starts_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const lessonRows = (data ?? []) as Lesson[];
      setLessons(lessonRows);
      void logTeacherAppEvent({
        userId: user.id,
        event: "teacher_lessons_loaded",
        teacherId: teacherIds[0] ?? null,
        unitId: list[0]?.unit_id ?? null,
        companyId: list[0]?.company_id ?? null,
        details: {
          teacher_ids: teacherIds,
          unit_ids: list.map((t) => t.unit_id),
          lessons_count: lessonRows.length,
          filter,
        },
      });

      const classIds = Array.from(new Set(lessonRows.map((l) => l.class_id).filter(Boolean)));
      const courseIds = Array.from(new Set(lessonRows.map((l) => l.course_id).filter(Boolean)));
      if (classIds.length) {
        const { data: cs, error: classError } = await supabase.from("school_classes").select("id,name").in("id", classIds);
        if (classError) console.warn("[teacher-lessons] erro ao carregar turmas", { userId: user.id, classError });
        setClasses(Object.fromEntries(((cs ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name])));
      } else {
        setClasses({});
      }
      if (courseIds.length) {
        const { data: cs, error: courseError } = await supabase.from("courses").select("id,name").in("id", courseIds);
        if (courseError) console.warn("[teacher-lessons] erro ao carregar cursos", { userId: user.id, courseError });
        setCourses(Object.fromEntries(((cs ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name])));
      } else {
        setCourses({});
      }
    } catch (e: unknown) {
      if (attempt < 2) {
        console.warn("[teacher-lessons] falha; renovando sessão e tentando novamente", { userId: user.id, attempt, error: e });
        await supabase.auth.refreshSession();
        await wait(700 + attempt * 400);
        return load(attempt + 1);
      }
      const message = getErrorMessage(e);
      setLoadError(message);
      console.error("[teacher-lessons] erro ao carregar área do professor", {
        userId: user.id,
        error: e,
        failedQuery: "school_teachers -> school_lessons -> school_classes/courses",
        payload: { profile_id: user.id, filter },
      });
      void logTeacherAppEvent({
        userId: user.id,
        event: "teacher_lessons_load_error",
        status: "ERROR",
        message,
        details: { error: message, filter, attempt },
      });
      // Só mostra toast se já existe dado prévio (não polui o mount inicial);
      // caso contrário deixa a UI mostrar o card de erro com botão "Tentar novamente".
      if (lessons.length > 0) {
        toast({ title: "Erro ao carregar aulas", description: message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const teacherIdsKey = useMemo(() => teachers.map((t) => t.id).sort().join(","), [teachers]);

  useEffect(() => {
    if (!user || teachers.length === 0) return;
    const teacherIds = teachers.map((t) => t.id);
    let reconnectAttempts = 0;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let reconnectTimer: number | null = null;

    const setup = () => {
      channel = supabase
        .channel(`teacher-lessons-${user.id}-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "school_lessons" },
          (payload) => {
            const row = (payload.new ?? payload.old) as Partial<Lesson> | null;
            if (!row?.teacher_id || !teacherIds.includes(row.teacher_id)) return;
            if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
            reloadTimerRef.current = window.setTimeout(() => void load(), 300);
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "school_teachers" },
          (payload) => {
            const row = (payload.new ?? payload.old) as { profile_id?: string } | null;
            if (row?.profile_id !== user.id) return;
            if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
            reloadTimerRef.current = window.setTimeout(() => void load(), 300);
          },
        )
        .subscribe((status) => {
          console.info("[teacher-lessons] realtime", { userId: user.id, status });
          if (status === "SUBSCRIBED") {
            reconnectAttempts = 0;
            void logTeacherAppEvent({ userId: user.id, event: "REALTIME_CONNECTED", details: { source: "lessons" } });
            return;
          }
          // CLOSED é emitido pelo próprio removeChannel/cleanup — NÃO tratar como erro,
          // ou geramos um loop de disconnect→reconnect a cada ~2s que satura a aba.
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            void logTeacherAppEvent({ userId: user.id, event: "REALTIME_DISCONNECTED", status: "WARN", details: { source: "lessons", status } });
            const backoff = Math.min(30000, 2000 * Math.pow(2, reconnectAttempts++));
            if (reconnectTimer) window.clearTimeout(reconnectTimer);
            reconnectTimer = window.setTimeout(() => {
              const stale = channel;
              channel = null;
              if (stale) void supabase.removeChannel(stale);
              setup();
            }, backoff);
          }
        });
    };

    setup();

    // Polling de segurança a cada 60s caso o realtime caia silenciosamente
    const safetyPoll = window.setInterval(() => void load(), 60000);

    return () => {
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.clearInterval(safetyPoll);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [user?.id, teacherIdsKey]);


  const unitNameById = useMemo(
    () => Object.fromEntries(teachers.map((t) => [t.unit_id, t.unit_name])),
    [teachers]
  );

  const scopedLessons = useMemo(() => {
    if (unitFilter === "ALL") return lessons;
    return lessons.filter((l) => l.unit_id === unitFilter);
  }, [lessons, unitFilter]);

  const filtered = useMemo(() => {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return scopedLessons
      .filter((l) => {
        const d = new Date(l.starts_at);
        if (filter === "upcoming") return d >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && l.status !== "CANCELED";
        if (filter === "month") return d >= startMonth && d < endMonth;
        return true;
      })
      .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  }, [scopedLessons, filter]);

  const totals = useMemo(() => {
    const month = new Date();
    const startMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const endMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const monthLessons = scopedLessons.filter((l) => {
      const d = new Date(l.starts_at);
      return d >= startMonth && d < endMonth && l.status !== "CANCELED";
    });
    const validated = monthLessons.filter((l) => l.status === "VALIDATED");
    return {
      monthHours: monthLessons.reduce((s, l) => s + Number(l.duration_hours || 0), 0),
      monthValue: monthLessons.reduce((s, l) => s + Number(l.computed_value || 0), 0),
      validatedValue: validated.reduce((s, l) => s + Number(l.computed_value || 0), 0),
      pending: scopedLessons.filter((l) => l.status === "SCHEDULED" && new Date(l.starts_at) <= new Date()).length,
    };
  }, [scopedLessons]);

  const confirm = async (l: Lesson) => {
    setBusy(l.id);
    console.info("[teacher-lessons] confirmando aula", { userId: user?.id, lessonId: l.id, teacherId: l.teacher_id, unitId: l.unit_id });
    const { error } = await supabase
      .from("school_lessons")
      .update({ status: "CONFIRMED", teacher_confirmed_at: new Date().toISOString() })
      .eq("id", l.id);
    setBusy(null);
    if (error) {
      console.error("[teacher-lessons] erro ao confirmar aula", { userId: user?.id, lessonId: l.id, error });
      if (user) void logTeacherAppEvent({ userId: user.id, event: "teacher_lesson_confirm_error", status: "ERROR", message: error.message, teacherId: l.teacher_id, unitId: l.unit_id, details: { lesson_id: l.id } });
      return toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
    if (user) void logTeacherAppEvent({ userId: user.id, event: "teacher_lesson_confirmed", teacherId: l.teacher_id, unitId: l.unit_id, details: { lesson_id: l.id } });
    toast({ title: "Aula confirmada", description: "Aguardando validação do administrador." });
    load();
  };

  const cancel = async () => {
    if (!cancelOpen) return;
    setBusy(cancelOpen.id);
    const { error } = await supabase
      .from("school_lessons")
      .update({
        status: "CANCELED",
        canceled_at: new Date().toISOString(),
        cancel_reason: cancelReason || "Cancelada pelo professor",
      })
      .eq("id", cancelOpen.id);
    setBusy(null);
    if (error) {
      console.error("[teacher-lessons] erro ao cancelar aula", { userId: user?.id, lessonId: cancelOpen.id, error });
      if (user) void logTeacherAppEvent({ userId: user.id, event: "teacher_lesson_cancel_error", status: "ERROR", message: error.message, teacherId: cancelOpen.teacher_id, unitId: cancelOpen.unit_id, details: { lesson_id: cancelOpen.id } });
      return toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
    if (user) void logTeacherAppEvent({ userId: user.id, event: "teacher_lesson_canceled", teacherId: cancelOpen.teacher_id, unitId: cancelOpen.unit_id, details: { lesson_id: cancelOpen.id, has_reason: !!cancelReason } });
    toast({ title: "Aula cancelada" });
    setCancelOpen(null);
    setCancelReason("");
    load();
  };

  if (teachers.length === 0 && !loading) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto mt-12">
        <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <h2 className="font-bold mb-1">{loadError ? "Erro ao carregar aulas" : "Perfil de professor não vinculado"}</h2>
        <p className="text-sm text-muted-foreground break-words">
          {loadError ?? "Solicite ao administrador da sua unidade que vincule seu usuário ao cadastro de professor."}
        </p>
        {loadError && <Button className="mt-4" variant="outline" onClick={() => void load()}>Tentar novamente</Button>}
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Minhas Aulas</h1>
          <p className="text-sm text-muted-foreground">Confirme as aulas dadas e acompanhe a validação.</p>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Horas no mês</p>
          <p className="text-xl font-bold">{totals.monthHours.toFixed(1)}h</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Valor previsto</p>
          <p className="text-xl font-bold">{fmtBRL(totals.monthValue)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Já validado</p>
          <p className="text-xl font-bold text-emerald-600">{fmtBRL(totals.validatedValue)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Pendentes hoje</p>
          <p className="text-xl font-bold text-amber-600">{totals.pending}</p>
        </Card>
      </div>

      <div className="flex gap-2">
        {(["upcoming", "month", "all"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "upcoming" ? "Próximas" : f === "month" ? "Este mês" : "Todas"}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!loading && filtered.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma aula encontrada.</Card>
        )}
        {filtered.map((l) => {
          const meta = STATUS_META[l.status] ?? STATUS_META.SCHEDULED;
          const Icon = meta.icon;
          const isPast = new Date(l.ends_at) <= new Date();
          const canConfirm = l.status === "SCHEDULED" && isPast;
          const canCancel = l.status === "SCHEDULED" || l.status === "CONFIRMED";
          return (
            <Card key={l.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold capitalize">{fmtDate(l.starts_at)}</p>
                    <span className="text-sm text-muted-foreground">
                      {fmtTime(l.starts_at)} – {fmtTime(l.ends_at)}
                    </span>
                    <Badge variant="outline" className={`gap-1 ${meta.cls}`}>
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </Badge>
                    {teachers.length > 1 && unitNameById[l.unit_id] && (
                      <Badge variant="outline" className="gap-1">
                        <Building2 className="h-3 w-3" />
                        {unitNameById[l.unit_id]}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm mt-1">
                    {l.class_id ? classes[l.class_id] : l.course_id ? courses[l.course_id] : "Aula avulsa"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {Number(l.duration_hours).toFixed(2)}h × {fmtBRL(Number(l.hourly_rate_snapshot))} ={" "}
                    <span className="font-semibold text-foreground">{fmtBRL(Number(l.computed_value))}</span>
                  </p>
                  {l.cancel_reason && (
                    <p className="text-xs text-destructive mt-1">Motivo: {l.cancel_reason}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {canConfirm && (
                    <Button size="sm" onClick={() => confirm(l)} disabled={busy === l.id}>
                      Confirmar
                    </Button>
                  )}
                  {canCancel && (
                    <Button size="sm" variant="outline" onClick={() => setCancelOpen(l)} disabled={busy === l.id}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!cancelOpen} onOpenChange={(o) => !o && setCancelOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar aula</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Motivo do cancelamento (opcional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(null)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={cancel} disabled={busy === cancelOpen?.id}>
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
