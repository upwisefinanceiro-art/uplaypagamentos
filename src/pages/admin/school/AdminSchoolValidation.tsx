import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolAccess } from "@/hooks/useSchoolAccess";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface Lesson {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  duration_hours: number;
  computed_value: number;
  teacher_id: string;
  unit_id: string;
  teacher_confirmed_at: string | null;
  notes: string | null;
}

function fmtBRL(n: number) {
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AdminSchoolValidation() {
  const { units, loading: unitsLoading } = useSchoolAccess();
  const [unitId, setUnitId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"CONFIRMED" | "SCHEDULED" | "VALIDATED" | "ALL">("CONFIRMED");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [teachers, setTeachers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!unitId && units.length) setUnitId(units[0].id);
  }, [units, unitId]);

  const load = async () => {
    if (!unitId) return;
    setLoading(true);
    setSelected(new Set());
    let q = supabase
      .from("school_lessons")
      .select("*")
      .eq("unit_id", unitId)
      .order("starts_at", { ascending: false })
      .limit(300);
    if (statusFilter !== "ALL") q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setLessons(data ?? []);
    const ids = Array.from(new Set((data ?? []).map((l: any) => l.teacher_id)));
    if (ids.length) {
      const { data: ts } = await supabase.from("school_teachers").select("id,full_name").in("id", ids);
      setTeachers(Object.fromEntries((ts ?? []).map((t: any) => [t.id, t.full_name])));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [unitId, statusFilter]);

  const totals = useMemo(() => {
    const sel = lessons.filter((l) => selected.has(l.id));
    return {
      count: sel.length,
      hours: sel.reduce((s, l) => s + Number(l.duration_hours), 0),
      value: sel.reduce((s, l) => s + Number(l.computed_value), 0),
    };
  }, [selected, lessons]);

  const toggleAll = () => {
    if (selected.size === lessons.length) setSelected(new Set());
    else setSelected(new Set(lessons.map((l) => l.id)));
  };

  const validate = async () => {
    if (!selected.size) return;
    setBusy(true);
    const ids = Array.from(selected);
    const { error } = await supabase
      .from("school_lessons")
      .update({ status: "VALIDATED", validated_at: new Date().toISOString() })
      .in("id", ids);
    setBusy(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Aulas validadas", description: `${ids.length} aula(s) validadas.` });
    load();
  };

  const reject = async () => {
    if (!selected.size) return;
    setBusy(true);
    const ids = Array.from(selected);
    const { error } = await supabase
      .from("school_lessons")
      .update({
        status: "CANCELED",
        canceled_at: new Date().toISOString(),
        cancel_reason: "Rejeitada pelo administrador",
      })
      .in("id", ids);
    setBusy(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Aulas rejeitadas" });
    load();
  };

  if (!unitsLoading && !units.length) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto">
        <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p>Nenhuma unidade com módulo escolar habilitado.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Validação de Aulas</h1>
        <p className="text-sm text-muted-foreground">
          Confirme as aulas reportadas pelos professores. Apenas aulas <b>validadas</b> entram na folha.
        </p>
      </div>

      <Card className="p-4 flex flex-col md:flex-row gap-3 md:items-end">
        {units.length > 1 && (
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Unidade</label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue />
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
        )}
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CONFIRMED">Confirmadas pelo professor</SelectItem>
              <SelectItem value="SCHEDULED">Agendadas (sem confirmação)</SelectItem>
              <SelectItem value="VALIDATED">Validadas</SelectItem>
              <SelectItem value="ALL">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={load}>Atualizar</Button>
      </Card>

      {selected.size > 0 && (
        <Card className="p-3 flex flex-col md:flex-row md:items-center gap-3 bg-primary/5 border-primary/20">
          <p className="text-sm flex-1">
            <b>{totals.count}</b> selecionada(s) · {totals.hours.toFixed(2)}h · {fmtBRL(totals.value)}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={validate} disabled={busy}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Validar
            </Button>
            <Button size="sm" variant="destructive" onClick={reject} disabled={busy}>
              <XCircle className="h-4 w-4 mr-1" /> Rejeitar
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="p-3 border-b flex items-center gap-3">
          <Checkbox
            checked={lessons.length > 0 && selected.size === lessons.length}
            onCheckedChange={toggleAll}
          />
          <span className="text-xs text-muted-foreground">
            {lessons.length} aula(s){loading && " — carregando..."}
          </span>
        </div>
        <div className="divide-y">
          {lessons.map((l) => {
            const checked = selected.has(l.id);
            return (
              <div key={l.id} className="p-3 flex items-center gap-3 hover:bg-muted/30">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => {
                    const next = new Set(selected);
                    if (v) next.add(l.id);
                    else next.delete(l.id);
                    setSelected(next);
                  }}
                  disabled={l.status === "VALIDATED" || l.status === "CANCELED"}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{teachers[l.teacher_id] ?? "—"}</p>
                    <Badge
                      variant="outline"
                      className={
                        l.status === "VALIDATED"
                          ? "bg-emerald-500/10 text-emerald-700"
                          : l.status === "CONFIRMED"
                          ? "bg-amber-500/10 text-amber-700"
                          : l.status === "CANCELED"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-blue-500/10 text-blue-600"
                      }
                    >
                      {l.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {fmtDateTime(l.starts_at)} → {fmtDateTime(l.ends_at)} · {Number(l.duration_hours).toFixed(2)}h
                  </p>
                </div>
                <p className="text-sm font-semibold">{fmtBRL(Number(l.computed_value))}</p>
              </div>
            );
          })}
          {!loading && lessons.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma aula encontrada.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
