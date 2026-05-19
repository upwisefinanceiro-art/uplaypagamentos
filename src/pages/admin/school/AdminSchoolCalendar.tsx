import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolAccess } from "@/hooks/useSchoolAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, GraduationCap, Plus, Trash2 } from "lucide-react";

type ViewMode = "month" | "week";

interface Lesson {
  id: string;
  unit_id: string;
  teacher_id: string;
  class_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  computed_value: number;
  duration_hours: number;
}

interface Teacher {
  id: string;
  full_name: string;
  unit_id: string;
  company_id: string;
  hourly_rate: number;
}

interface SchoolClass {
  id: string;
  name: string;
  unit_id: string;
  course_id: string | null;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Agendada",
  TEACHER_CONFIRMED: "Confirmada",
  VALIDATED: "Validada",
  CANCELED: "Cancelada",
  REPLACEMENT: "Reposição",
  SUBSTITUTION: "Substituição",
};

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  TEACHER_CONFIRMED: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  VALIDATED: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  CANCELED: "bg-red-500/15 text-red-700 border-red-500/30 line-through",
  REPLACEMENT: "bg-purple-500/15 text-purple-700 border-purple-500/30",
  SUBSTITUTION: "bg-fuchsia-500/15 text-fuchsia-700 border-fuchsia-500/30",
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setDate(d.getDate() - d.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmtDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtMonth(d: Date) {
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export default function AdminSchoolCalendar() {
  const { units, loading: unitsLoading } = useSchoolAccess();
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [teacherFilter, setTeacherFilter] = useState<string>("ALL");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(false);

  // Dialog state
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    unit_id: "",
    teacher_id: "",
    class_id: "NONE",
    date: fmtDateInput(new Date()),
    start_time: "19:00",
    end_time: "21:00",
    notes: "",
    recurring: false,
    weekdays: [] as number[],
    end_date: "",
  });
  const [saving, setSaving] = useState(false);

  // Range
  const range = useMemo(() => {
    if (view === "month") {
      const s = startOfWeek(startOfMonth(cursor));
      const e = addDays(startOfWeek(endOfMonth(cursor)), 6);
      e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    }
    const s = startOfWeek(cursor);
    const e = addDays(s, 7);
    return { start: s, end: e };
  }, [cursor, view]);

  const loadMeta = async () => {
    const [tRes, cRes] = await Promise.all([
      supabase.from("school_teachers").select("id,full_name,unit_id,company_id,hourly_rate").eq("active", true).order("full_name"),
      supabase.from("school_classes").select("id,name,unit_id,course_id").eq("active", true).order("name"),
    ]);
    setTeachers((tRes.data ?? []) as Teacher[]);
    setClasses((cRes.data ?? []) as SchoolClass[]);
  };

  const loadLessons = async () => {
    setLoading(true);
    let q = supabase
      .from("school_lessons")
      .select("id,unit_id,teacher_id,class_id,starts_at,ends_at,status,computed_value,duration_hours")
      .gte("starts_at", range.start.toISOString())
      .lte("starts_at", range.end.toISOString())
      .order("starts_at");
    if (unitFilter !== "ALL") q = q.eq("unit_id", unitFilter);
    if (teacherFilter !== "ALL") q = q.eq("teacher_id", teacherFilter);
    const { data, error } = await q;
    if (error) toast({ title: "Erro ao carregar aulas", description: error.message, variant: "destructive" });
    setLessons((data ?? []) as Lesson[]);
    setLoading(false);
  };

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    loadLessons();
  }, [range.start.toISOString(), range.end.toISOString(), unitFilter, teacherFilter]);

  const openDayDialog = (date: Date) => {
    setForm({
      unit_id: unitFilter !== "ALL" ? unitFilter : units[0]?.id ?? "",
      teacher_id: teacherFilter !== "ALL" ? teacherFilter : "",
      class_id: "NONE",
      date: fmtDateInput(date),
      start_time: "19:00",
      end_time: "21:00",
      notes: "",
      recurring: false,
      weekdays: [date.getDay()],
      end_date: fmtDateInput(addDays(date, 30)),
    });
    setOpen(true);
  };

  const lessonsForDay = (d: Date) => lessons.filter((l) => sameDay(new Date(l.starts_at), d));

  const teachersForUnit = useMemo(
    () => (form.unit_id ? teachers.filter((t) => t.unit_id === form.unit_id) : teachers),
    [teachers, form.unit_id],
  );
  const classesForUnit = useMemo(
    () => (form.unit_id ? classes.filter((c) => c.unit_id === form.unit_id) : []),
    [classes, form.unit_id],
  );

  const buildLessonInserts = () => {
    const unit = units.find((u) => u.id === form.unit_id);
    const teacher = teachers.find((t) => t.id === form.teacher_id);
    if (!unit || !teacher) return [];
    const baseDate = new Date(`${form.date}T00:00:00`);
    const dates: Date[] = [];
    if (!form.recurring) {
      dates.push(baseDate);
    } else {
      if (!form.end_date || form.weekdays.length === 0) return [];
      const endDate = new Date(`${form.end_date}T00:00:00`);
      let d = new Date(baseDate);
      while (d <= endDate) {
        if (form.weekdays.includes(d.getDay())) dates.push(new Date(d));
        d = addDays(d, 1);
      }
    }
    return dates.map((d) => {
      const starts = new Date(`${fmtDateInput(d)}T${form.start_time}:00`);
      const ends = new Date(`${fmtDateInput(d)}T${form.end_time}:00`);
      return {
        unit_id: unit.id,
        company_id: unit.company_id,
        teacher_id: teacher.id,
        class_id: form.class_id === "NONE" ? null : form.class_id,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        status: "SCHEDULED",
        hourly_rate_snapshot: Number(teacher.hourly_rate ?? 0),
        notes: form.notes.trim() || null,
      };
    });
  };

  const save = async () => {
    if (!form.unit_id || !form.teacher_id) {
      toast({ title: "Selecione unidade e professor", variant: "destructive" });
      return;
    }
    if (form.start_time >= form.end_time) {
      toast({ title: "Horário inválido", description: "Fim deve ser após o início", variant: "destructive" });
      return;
    }
    const rows = buildLessonInserts();
    if (rows.length === 0) {
      toast({ title: "Nada a gerar", description: "Verifique os dias da semana e a data final", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("school_lessons").insert(rows);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `${rows.length} aula(s) criada(s)` });
    setOpen(false);
    loadLessons();
  };

  const deleteLesson = async (id: string) => {
    if (!confirm("Excluir esta aula?")) return;
    const { error } = await supabase.from("school_lessons").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    loadLessons();
  };

  const toggleWeekday = (d: number) => {
    setForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d].sort(),
    }));
  };

  if (unitsLoading) return <div className="p-6 text-muted-foreground">Carregando...</div>;

  if (units.length === 0) {
    return (
      <Card className="p-6 flex items-center gap-3 text-muted-foreground">
        <GraduationCap />
        <p>Módulo Escolar não habilitado para nenhuma unidade.</p>
      </Card>
    );
  }

  // Build month grid
  const days: Date[] = [];
  if (view === "month") {
    let d = range.start;
    while (d <= range.end) {
      days.push(new Date(d));
      d = addDays(d, 1);
    }
  } else {
    for (let i = 0; i < 7; i++) days.push(addDays(range.start, i));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Calendário Acadêmico</h1>
          <p className="text-sm text-muted-foreground">Agende aulas clicando em um dia</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {units.length > 1 && (
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas as unidades</SelectItem>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={teacherFilter} onValueChange={setTeacherFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Professor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os professores</SelectItem>
              {teachers
                .filter((t) => unitFilter === "ALL" || t.unit_id === unitFilter)
                .map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.full_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <div className="flex border rounded-md overflow-hidden">
            <Button
              variant={view === "month" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("month")}
              className="rounded-none"
            >
              Mês
            </Button>
            <Button
              variant={view === "week" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("week")}
              className="rounded-none"
            >
              Semana
            </Button>
          </div>
        </div>
      </div>

      <Card className="p-3">
        <div className="flex items-center justify-between mb-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              setCursor(view === "month" ? new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1) : addDays(cursor, -7))
            }
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="font-semibold capitalize">
            {view === "month"
              ? fmtMonth(cursor)
              : `${range.start.toLocaleDateString("pt-BR")} – ${addDays(range.start, 6).toLocaleDateString("pt-BR")}`}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              setCursor(view === "month" ? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1) : addDays(cursor, 7))
            }
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-xs font-medium text-center text-muted-foreground py-1">
              {w}
            </div>
          ))}
          {days.map((d) => {
            const inMonth = view === "week" || d.getMonth() === cursor.getMonth();
            const dayLessons = lessonsForDay(d);
            const today = sameDay(d, new Date());
            return (
              <div
                key={d.toISOString()}
                className={`min-h-[100px] border rounded-md p-1 text-xs flex flex-col gap-1 cursor-pointer hover:bg-muted/50 transition-colors ${
                  inMonth ? "bg-card" : "bg-muted/30 text-muted-foreground"
                } ${today ? "ring-2 ring-primary" : ""}`}
                onClick={() => openDayDialog(d)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{d.getDate()}</span>
                  {dayLessons.length > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{dayLessons.length}</Badge>}
                </div>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {dayLessons.slice(0, 3).map((l) => {
                    const teacher = teachers.find((t) => t.id === l.teacher_id);
                    const s = new Date(l.starts_at);
                    return (
                      <div
                        key={l.id}
                        className={`truncate rounded px-1 py-0.5 border ${STATUS_COLOR[l.status] ?? ""}`}
                        title={`${teacher?.full_name ?? ""} — ${STATUS_LABEL[l.status]}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteLesson(l.id);
                        }}
                      >
                        {String(s.getHours()).padStart(2, "0")}:{String(s.getMinutes()).padStart(2, "0")}{" "}
                        {teacher?.full_name?.split(" ")[0] ?? ""}
                      </div>
                    );
                  })}
                  {dayLessons.length > 3 && (
                    <div className="text-[10px] text-muted-foreground">+{dayLessons.length - 3} mais</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 mt-3 text-xs flex-wrap">
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <div key={k} className={`px-2 py-0.5 rounded border ${STATUS_COLOR[k]}`}>
              {v}
            </div>
          ))}
          {loading && <span className="text-muted-foreground">Carregando aulas...</span>}
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Nova aula</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Unidade *</Label>
              <Select value={form.unit_id} onValueChange={(v) => setForm({ ...form, unit_id: v, teacher_id: "", class_id: "NONE" })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Professor *</Label>
              <Select value={form.teacher_id} onValueChange={(v) => setForm({ ...form, teacher_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {teachersForUnit.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.full_name} — R$ {Number(t.hourly_rate).toFixed(2)}/h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Turma</Label>
              <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">— Sem turma —</SelectItem>
                  {classesForUnit.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data *</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Início</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div>
                <Label>Fim</Label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
            </div>
            <div className="md:col-span-2 flex items-center gap-2 pt-2 border-t">
              <Switch checked={form.recurring} onCheckedChange={(v) => setForm({ ...form, recurring: v })} />
              <Label>Repetir semanalmente</Label>
            </div>
            {form.recurring && (
              <>
                <div className="md:col-span-2">
                  <Label>Dias da semana</Label>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {WEEKDAYS.map((w, i) => (
                      <label key={i} className="flex items-center gap-1 text-sm border rounded-md px-2 py-1 cursor-pointer">
                        <Checkbox checked={form.weekdays.includes(i)} onCheckedChange={() => toggleWeekday(i)} />
                        {w}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Label>Até a data</Label>
                  <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </>
            )}
            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Salvando..." : <><Plus className="w-4 h-4 mr-1" /> Criar aula(s)</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        Dica: clique em um dia para criar aula. Clique em uma aula para excluí-la.
      </p>
    </div>
  );
}
