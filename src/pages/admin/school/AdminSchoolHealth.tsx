import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Activity, RefreshCw, Wand2, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

type Teacher = {
  id: string;
  full_name: string;
  unit_id: string;
  unit_name?: string;
  active: boolean;
};

type LogRow = {
  id: string;
  created_at: string;
  event: string;
  status: string;
  message: string | null;
  unit_id: string | null;
  teacher_id: string | null;
  details: Record<string, unknown> | null;
};

export default function AdminSchoolHealth() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [units, setUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [severity, setSeverity] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    const [tRes, uRes, lRes] = await Promise.all([
      supabase.from("school_teachers").select("id, full_name, unit_id, active").order("full_name"),
      supabase.from("units").select("id, name").order("name"),
      supabase
        .from("teacher_app_logs")
        .select("id, created_at, event, status, message, unit_id, teacher_id, details")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    const unitMap = new Map((uRes.data ?? []).map((u) => [u.id, u.name]));
    setTeachers(
      (tRes.data ?? []).map((t) => ({
        id: t.id,
        full_name: t.full_name,
        unit_id: t.unit_id,
        active: t.active,
        unit_name: unitMap.get(t.unit_id) ?? "—",
      })),
    );
    setUnits(uRes.data ?? []);
    setLogs((lRes.data ?? []) as LogRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void loadAll();
    const ch = supabase
      .channel("admin-school-health")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "teacher_app_logs" }, (payload) => {
        setLogs((prev) => [payload.new as LogRow, ...prev].slice(0, 100));
      })
      .subscribe();
    const poll = window.setInterval(loadAll, 60000);
    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(ch);
    };
  }, []);

  const runReconcile = async () => {
    setBusy("reconcile");
    try {
      const { data, error } = await supabase.functions.invoke("reconcile-teachers", { body: {} });
      if (error) throw error;
      const counts = (data as { counts?: Record<string, number> })?.counts ?? {};
      toast.success("Reconciliação concluída", {
        description: `Achados: ${(data as { findings?: unknown[] })?.findings?.length ?? 0}. ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(", ")}`,
      });
      await loadAll();
    } catch (e) {
      toast.error("Erro ao reconciliar", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const reprocess = async (payload: Record<string, unknown>, label: string) => {
    setBusy(label);
    try {
      const { data, error } = await supabase.functions.invoke("reprocess-teacher", { body: payload });
      if (error) throw error;
      const d = data as { teachers_processed: number; closures_recalculated: number; lessons_touched: number };
      toast.success("Dados reprocessados", {
        description: `${d.teachers_processed} professor(es), ${d.closures_recalculated} fechamento(s), ${d.lessons_touched} aula(s).`,
      });
      await loadAll();
    } catch (e) {
      toast.error("Falha ao reprocessar", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const filteredTeachers = teachers.filter((t) => {
    if (unitFilter !== "ALL" && t.unit_id !== unitFilter) return false;
    if (search && !t.full_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filteredLogs = logs.filter((l) => {
    if (severity !== "ALL" && l.status !== severity) return false;
    if (unitFilter !== "ALL" && l.unit_id !== unitFilter) return false;
    return true;
  });

  const stats = {
    total: teachers.length,
    active: teachers.filter((t) => t.active).length,
    errors24h: logs.filter((l) => l.status === "ERROR" && Date.now() - new Date(l.created_at).getTime() < 86400000).length,
    warns24h: logs.filter((l) => l.status === "WARN" && Date.now() - new Date(l.created_at).getTime() < 86400000).length,
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Saúde da Área do Professor
          </h1>
          <p className="text-sm text-muted-foreground">
            Reconciliação, logs e reprocessamento de dados dos professores.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runReconcile} disabled={busy === "reconcile"} variant="outline">
            {busy === "reconcile" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
            Rodar reconciliação agora
          </Button>
          <Button onClick={() => reprocess({ all: true }, "all")} disabled={busy === "all"}>
            {busy === "all" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Reprocessar todos
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-[11px] uppercase text-muted-foreground">Professores ativos</p>
          <p className="text-2xl font-bold">{stats.active}/{stats.total}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] uppercase text-muted-foreground">Erros (24h)</p>
          <p className="text-2xl font-bold text-destructive">{stats.errors24h}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] uppercase text-muted-foreground">Avisos (24h)</p>
          <p className="text-2xl font-bold text-amber-600">{stats.warns24h}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] uppercase text-muted-foreground">Eventos totais</p>
          <p className="text-2xl font-bold">{logs.length}</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={unitFilter} onValueChange={setUnitFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Unidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas as unidades</SelectItem>
            {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Severidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas</SelectItem>
            <SelectItem value="ERROR">Erros</SelectItem>
            <SelectItem value="WARN">Avisos</SelectItem>
            <SelectItem value="INFO">Informativos</SelectItem>
          </SelectContent>
        </Select>
        {unitFilter !== "ALL" && (
          <Button variant="outline" size="sm" onClick={() => reprocess({ unit_id: unitFilter }, "unit")} disabled={busy === "unit"}>
            {busy === "unit" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Reprocessar unidade
          </Button>
        )}
        <Input
          placeholder="Buscar professor"
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-sm">Professores</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Carregando...</TableCell></TableRow>}
            {!loading && filteredTeachers.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nenhum professor.</TableCell></TableRow>}
            {filteredTeachers.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.full_name}</TableCell>
                <TableCell>{t.unit_name}</TableCell>
                <TableCell>
                  {t.active ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700"><CheckCircle2 className="h-3 w-3 mr-1" />Ativo</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted">Inativo</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => reprocess({ teacher_id: t.id }, t.id)} disabled={busy === t.id}>
                    {busy === t.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                    Reprocessar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Últimos eventos
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Quando</TableHead>
              <TableHead className="w-[90px]">Nível</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Mensagem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Sem eventos.</TableCell></TableRow>}
            {filteredLogs.slice(0, 50).map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-xs">{new Date(l.created_at).toLocaleString("pt-BR")}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={
                    l.status === "ERROR" ? "bg-destructive/10 text-destructive"
                      : l.status === "WARN" ? "bg-amber-500/10 text-amber-700"
                        : "bg-muted"
                  }>{l.status}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{l.event}</TableCell>
                <TableCell className="text-xs">{l.message ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
