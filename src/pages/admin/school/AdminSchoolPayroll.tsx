import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolAccess } from "@/hooks/useSchoolAccess";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Wallet, RefreshCcw, CheckCircle2, AlertCircle } from "lucide-react";

interface Teacher {
  id: string;
  full_name: string;
  unit_id: string;
  hourly_rate: number;
  pix_key: string | null;
}
interface Closure {
  id: string;
  teacher_id: string;
  reference_month: string;
  lessons_count: number;
  total_hours: number;
  total_value: number;
  status: string;
  paid_at: string | null;
  payment_proof_url: string | null;
  notes: string | null;
}
interface AggLesson {
  teacher_id: string;
  count: number;
  hours: number;
  value: number;
}

function fmtBRL(n: number) {
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AdminSchoolPayroll() {
  const { units, loading: unitsLoading } = useSchoolAccess();
  const [unitId, setUnitId] = useState<string>("");
  const [month, setMonth] = useState<string>(currentMonth());
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [agg, setAgg] = useState<Record<string, AggLesson>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState<Closure | null>(null);
  const [payProof, setPayProof] = useState("");
  const [payNotes, setPayNotes] = useState("");

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
      const [tRes, cRes, lRes] = await Promise.all([
        supabase.from("school_teachers").select("*").eq("unit_id", unitId).eq("active", true).order("full_name"),
        supabase
          .from("school_payroll_closures")
          .select("*")
          .eq("unit_id", unitId)
          .eq("reference_month", monthStart),
        supabase
          .from("school_lessons")
          .select("teacher_id,status,duration_hours,computed_value,starts_at")
          .eq("unit_id", unitId)
          .eq("status", "VALIDATED")
          .gte("starts_at", monthStart)
          .lt("starts_at", monthEnd),
      ]);
      setTeachers(tRes.data ?? []);
      setClosures(cRes.data ?? []);
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

  const markPaid = async () => {
    if (!payOpen) return;
    setBusy(payOpen.id);
    const { error } = await supabase.rpc("mark_school_payroll_paid", {
      _closure_id: payOpen.id,
      _proof_url: payProof || null,
      _notes: payNotes || null,
    });
    setBusy(null);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Pagamento registrado" });
    setPayOpen(null);
    setPayProof("");
    setPayNotes("");
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

  const totals = teachers.reduce(
    (acc, t) => {
      const a = agg[t.id] || { count: 0, hours: 0, value: 0 };
      const c = closures.find((cl) => cl.teacher_id === t.id);
      acc.hours += a.hours;
      acc.value += a.value;
      if (c?.status === "PAID") acc.paid += Number(c.total_value);
      else if (c?.status === "PENDING") acc.pending += Number(c.total_value);
      return acc;
    },
    { hours: 0, value: 0, paid: 0, pending: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6" />
            Folha de Pagamento
          </h1>
          <p className="text-sm text-muted-foreground">
            Fechamento mensal por professor com base nas aulas validadas.
          </p>
        </div>
        <div className="flex items-end gap-2">
          {units.length > 1 && (
            <div>
              <label className="text-xs text-muted-foreground">Unidade</label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger className="w-[200px]">
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
          <div>
            <label className="text-xs text-muted-foreground">Mês</label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <Button variant="outline" onClick={load}>
            <RefreshCcw className="h-4 w-4" />
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
          <p className="text-[11px] text-muted-foreground uppercase">A pagar (fechado)</p>
          <p className="text-xl font-bold text-amber-600">{fmtBRL(totals.pending)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase">Pago</p>
          <p className="text-xl font-bold text-emerald-600">{fmtBRL(totals.paid)}</p>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={generateAll} disabled={busy === "ALL" || teachers.length === 0}>
          Gerar fechamento de todos
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="divide-y">
          {teachers.map((t) => {
            const a = agg[t.id] || { count: 0, hours: 0, value: 0 };
            const c = closures.find((cl) => cl.teacher_id === t.id);
            const diverged = c && (Number(c.total_value).toFixed(2) !== a.value.toFixed(2));
            return (
              <div key={t.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{t.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    PIX: {t.pix_key || "—"} · Hora: {fmtBRL(Number(t.hourly_rate))}
                  </p>
                </div>
                <div className="text-sm">
                  <p>
                    <span className="text-muted-foreground">Validadas no mês:</span>{" "}
                    <b>{a.count}</b> · {a.hours.toFixed(2)}h ·{" "}
                    <b className="text-foreground">{fmtBRL(a.value)}</b>
                  </p>
                  {c && (
                    <p className="text-xs mt-1">
                      <span className="text-muted-foreground">Fechamento:</span>{" "}
                      <b>{fmtBRL(Number(c.total_value))}</b>{" "}
                      <Badge
                        variant="outline"
                        className={
                          c.status === "PAID"
                            ? "bg-emerald-500/10 text-emerald-700 ml-1"
                            : "bg-amber-500/10 text-amber-700 ml-1"
                        }
                      >
                        {c.status === "PAID" ? "Pago" : "Pendente"}
                      </Badge>
                      {diverged && (
                        <span className="text-amber-600 ml-2">⚠ desatualizado</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {(!c || c.status !== "PAID") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => generate(t.id)}
                      disabled={busy === t.id || a.count === 0}
                    >
                      {c ? "Atualizar" : "Gerar"}
                    </Button>
                  )}
                  {c && c.status === "PENDING" && (
                    <Button size="sm" onClick={() => setPayOpen(c)}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Marcar pago
                    </Button>
                  )}
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

      <Dialog open={!!payOpen} onOpenChange={(o) => !o && setPayOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pagamento</DialogTitle>
          </DialogHeader>
          {payOpen && (
            <div className="space-y-3">
              <p className="text-sm">
                Valor: <b>{fmtBRL(Number(payOpen.total_value))}</b> ({payOpen.lessons_count} aulas ·{" "}
                {Number(payOpen.total_hours).toFixed(2)}h)
              </p>
              <div>
                <label className="text-xs text-muted-foreground">Comprovante (URL)</label>
                <Input value={payProof} onChange={(e) => setPayProof(e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Observações</label>
                <Textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(null)}>Cancelar</Button>
            <Button onClick={markPaid} disabled={busy === payOpen?.id}>Confirmar pagamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
