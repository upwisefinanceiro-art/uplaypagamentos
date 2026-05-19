import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { CalendarCheck2, XCircle, CheckCircle2, Clock, AlertCircle } from "lucide-react";

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
}

const STATUS_META: Record<string, { label: string; cls: string; icon: any }> = {
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
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<Record<string, string>>({});
  const [courses, setCourses] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"upcoming" | "month" | "all">("upcoming");
  const [cancelOpen, setCancelOpen] = useState<Lesson | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: teacher } = await supabase
        .from("school_teachers")
        .select("id")
        .eq("profile_id", user.id)
        .maybeSingle();
      if (!teacher) {
        setTeacherId(null);
        setLessons([]);
        return;
      }
      setTeacherId(teacher.id);
      const { data, error } = await supabase
        .from("school_lessons")
        .select("*")
        .eq("teacher_id", teacher.id)
        .order("starts_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setLessons(data ?? []);

      const classIds = Array.from(new Set((data ?? []).map((l: any) => l.class_id).filter(Boolean)));
      const courseIds = Array.from(new Set((data ?? []).map((l: any) => l.course_id).filter(Boolean)));
      if (classIds.length) {
        const { data: cs } = await supabase.from("school_classes").select("id,name").in("id", classIds);
        setClasses(Object.fromEntries((cs ?? []).map((c: any) => [c.id, c.name])));
      }
      if (courseIds.length) {
        const { data: cs } = await supabase.from("courses").select("id,name").in("id", courseIds);
        setCourses(Object.fromEntries((cs ?? []).map((c: any) => [c.id, c.name])));
      }
    } catch (e: any) {
      toast({ title: "Erro ao carregar aulas", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const filtered = useMemo(() => {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return lessons
      .filter((l) => {
        const d = new Date(l.starts_at);
        if (filter === "upcoming") return d >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && l.status !== "CANCELED";
        if (filter === "month") return d >= startMonth && d < endMonth;
        return true;
      })
      .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  }, [lessons, filter]);

  const totals = useMemo(() => {
    const month = new Date();
    const startMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const endMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const monthLessons = lessons.filter((l) => {
      const d = new Date(l.starts_at);
      return d >= startMonth && d < endMonth && l.status !== "CANCELED";
    });
    const validated = monthLessons.filter((l) => l.status === "VALIDATED");
    return {
      monthHours: monthLessons.reduce((s, l) => s + Number(l.duration_hours || 0), 0),
      monthValue: monthLessons.reduce((s, l) => s + Number(l.computed_value || 0), 0),
      validatedValue: validated.reduce((s, l) => s + Number(l.computed_value || 0), 0),
      pending: lessons.filter((l) => l.status === "SCHEDULED" && new Date(l.starts_at) <= new Date()).length,
    };
  }, [lessons]);

  const confirm = async (l: Lesson) => {
    setBusy(l.id);
    const { error } = await supabase
      .from("school_lessons")
      .update({ status: "CONFIRMED", teacher_confirmed_at: new Date().toISOString() })
      .eq("id", l.id);
    setBusy(null);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
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
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Aula cancelada" });
    setCancelOpen(null);
    setCancelReason("");
    load();
  };

  if (!teacherId && !loading) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto mt-12">
        <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <h2 className="font-bold mb-1">Perfil de professor não vinculado</h2>
        <p className="text-sm text-muted-foreground">
          Solicite ao administrador da sua unidade que vincule seu usuário ao cadastro de professor.
        </p>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Minhas Aulas</h1>
        <p className="text-sm text-muted-foreground">Confirme as aulas dadas e acompanhe a validação.</p>
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
