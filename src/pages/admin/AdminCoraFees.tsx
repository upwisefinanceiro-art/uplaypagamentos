import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Receipt, TrendingDown, Calendar, Building2, RefreshCw, Landmark } from "lucide-react";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";

interface FeeRow {
  id: string;
  due_date: string;
  paid_at: string | null;
  value: number;
  fee: number;
  fee_source: "EXTRATO" | "CONFIGURADO";
  payment_method: string | null;
  responsible_id: string;
  unit_id: string;
}

interface ProfileRow { id: string; full_name: string }
interface UnitRow {
  id: string; name: string;
  cora_fee_pix: number | null;
  cora_fee_boleto: number | null;
}

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number.isFinite(n) ? n : 0);

const formatDate = (d: string | null) => {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
};

const detectMethod = (raw: any): "PIX" | "BOLETO" | null => {
  const payments = raw?.payments;
  if (Array.isArray(payments) && payments.length) {
    const m = String(payments[0]?.method || "").toUpperCase();
    if (m.includes("PIX")) return "PIX";
    if (m.includes("BOLETO") || m.includes("SLIP")) return "BOLETO";
  }
  return null;
};

const AdminCoraFees = () => {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const isMaster = hasRole("ADMIN_MASTER");

  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState<"DAY" | "MONTH" | "ALL">("MONTH");

  const load = async () => {
    setLoading(true);

    const payments = await fetchAllPaginated<{
      id: string;
      due_date: string;
      paid_at: string | null;
      value: number;
      final_value: number | null;
      payment_method: string | null;
      raw_response: unknown;
      cora_fee_amount: number | null;
      cora_fee_source: string | null;
      responsible_id: string;
      unit_id: string;
    }>((from, to) =>
      supabase
        .from("payments")
        .select("id, due_date, paid_at, value, final_value, payment_method, raw_response, cora_fee_amount, cora_fee_source, responsible_id, unit_id")
        .eq("gateway", "CORA")
        .in("status", ["PAID", "RECEIVED", "CONFIRMED"])
        .order("paid_at", { ascending: false, nullsFirst: false })
        .range(from, to) as unknown as Promise<{ data: never[]; error: { message: string } | null }>
    );

    const unitIds = Array.from(new Set(payments.map((p) => p.unit_id))).filter(Boolean);
    const responsibleIds = Array.from(new Set(payments.map((p) => p.responsible_id))).filter(Boolean);

    const [profilesRes, unitsRes] = await Promise.all([
      responsibleIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", responsibleIds)
        : Promise.resolve({ data: [] as ProfileRow[], error: null }),
      unitIds.length
        ? supabase.from("units").select("id, name, cora_fee_pix, cora_fee_boleto").in("id", unitIds)
        : Promise.resolve({ data: [] as UnitRow[], error: null }),
    ]);

    const unitsList = (unitsRes.data ?? []) as UnitRow[];
    const unitMap: Record<string, UnitRow> = {};
    unitsList.forEach((u) => { unitMap[u.id] = u; });

    const mapped: FeeRow[] = payments.map((p) => {
      let method: "PIX" | "BOLETO" | null = null;
      const m = String(p.payment_method || "").toUpperCase();
      if (m.includes("PIX")) method = "PIX";
      else if (m.includes("BOLETO")) method = "BOLETO";
      else method = detectMethod(p.raw_response);

      let fee = Number(p.cora_fee_amount ?? 0);
      let source: "EXTRATO" | "CONFIGURADO" = "CONFIGURADO";
      if (p.cora_fee_amount != null && p.cora_fee_source === "EXTRATO") {
        source = "EXTRATO";
      } else {
        const u = unitMap[p.unit_id];
        if (u) {
          fee = method === "BOLETO"
            ? Number(u.cora_fee_boleto ?? 0)
            : Number(u.cora_fee_pix ?? 0);
        }
      }

      return {
        id: p.id,
        due_date: p.due_date,
        paid_at: p.paid_at,
        value: Number(p.final_value ?? p.value),
        fee: Number(fee.toFixed(2)),
        fee_source: source,
        payment_method: method,
        responsible_id: p.responsible_id,
        unit_id: p.unit_id,
      };
    });

    const pMap: Record<string, string> = {};
    ((profilesRes.data ?? []) as ProfileRow[]).forEach((p) => { pMap[p.id] = p.full_name; });

    setProfiles(pMap);
    setUnits(unitsList);
    setRows(mapped);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-cora-fees", {
        body: unitFilter !== "ALL" ? { unit_id: unitFilter } : {},
      });
      if (error) throw error;
      toast({
        title: "Reconciliação concluída",
        description: `${data?.matched ?? 0} taxas atualizadas pelo extrato Cora.`,
      });
      await load();
    } catch (err) {
      toast({
        title: "Erro na reconciliação",
        description: err instanceof Error ? err.message : "Falha ao consultar extrato",
        variant: "destructive",
      });
    } finally {
      setReconciling(false);
    }
  };

  const filtered = useMemo(() => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    return rows.filter((r) => {
      if (unitFilter !== "ALL" && r.unit_id !== unitFilter) return false;
      if (search.trim()) {
        const name = (profiles[r.responsible_id] || "").toLowerCase();
        if (!name.includes(search.trim().toLowerCase())) return false;
      }
      if (periodFilter !== "ALL" && r.paid_at) {
        const paid = new Date(r.paid_at);
        if (periodFilter === "DAY" && paid < startOfDay) return false;
        if (periodFilter === "MONTH" && paid < startOfMonth) return false;
      }
      return true;
    });
  }, [rows, profiles, unitFilter, search, periodFilter]);

  const totals = useMemo(() => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    let dayFee = 0, monthFee = 0, allFee = 0, allGross = 0;
    const perUnit: Record<string, number> = {};

    rows.forEach((r) => {
      allFee += r.fee;
      allGross += r.value;
      perUnit[r.unit_id] = (perUnit[r.unit_id] || 0) + r.fee;
      if (r.paid_at) {
        const paid = new Date(r.paid_at);
        if (paid >= startOfDay) dayFee += r.fee;
        if (paid >= startOfMonth) monthFee += r.fee;
      }
    });
    return { dayFee, monthFee, allFee, allGross, allNet: allGross - allFee, perUnit };
  }, [rows]);

  const unitName = (id: string) => units.find((u) => u.id === id)?.name || "—";

  if (!isMaster && !hasRole("ADMIN_UNIDADE")) {
    return <div className="p-6">Acesso restrito a administradores.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Landmark className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Taxas Cora</h1>
            <p className="text-sm text-muted-foreground">
              Tarifas do Banco Cora (PIX/boleto). Despesa interna — <strong>nunca</strong> exibida ao cliente.
            </p>
          </div>
        </div>
        <Button onClick={handleReconcile} disabled={reconciling} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${reconciling ? "animate-spin" : ""}`} />
          Reconciliar pelo extrato
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Taxas hoje</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatBRL(totals.dayFee)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Taxas no mês</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatBRL(totals.monthFee)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total recebido</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(totals.allGross)}</div>
            <p className="text-xs text-muted-foreground mt-1">Líquido estimado: {formatBRL(totals.allNet)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Custo total taxas</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatBRL(totals.allFee)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Por unidade */}
      {units.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" /> Taxas Cora por unidade (acumulado)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {units.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{u.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      PIX {formatBRL(Number(u.cora_fee_pix ?? 0))} · Boleto {formatBRL(Number(u.cora_fee_boleto ?? 0))}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-destructive">{formatBRL(totals.perUnit[u.id] || 0)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            placeholder="Buscar por cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={unitFilter} onValueChange={setUnitFilter}>
            <SelectTrigger><SelectValue placeholder="Unidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas as unidades</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as "DAY" | "MONTH" | "ALL")}>
            <SelectTrigger><SelectValue placeholder="Período" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="DAY">Hoje</SelectItem>
              <SelectItem value="MONTH">Este mês</SelectItem>
              <SelectItem value="ALL">Todo período</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pagamentos Cora com taxa ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum pagamento Cora com taxa encontrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Pago</TableHead>
                  <TableHead className="text-right">Taxa Cora</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Data pagamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{profiles[r.responsible_id] || "—"}</TableCell>
                    <TableCell>{unitName(r.unit_id)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{r.payment_method || "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatBRL(r.value)}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">- {formatBRL(r.fee)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={r.fee_source === "EXTRATO" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {r.fee_source === "EXTRATO" ? "Extrato" : "Configurado"}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(r.paid_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminCoraFees;
