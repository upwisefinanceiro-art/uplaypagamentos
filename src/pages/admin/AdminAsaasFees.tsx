import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, TrendingDown, Calendar, Building2 } from "lucide-react";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";

interface FeeRow {
  id: string;
  due_date: string;
  paid_at: string | null;
  value: number; // bruto exibido
  asaas_value: number; // bruto Asaas
  asaas_net: number; // líquido Asaas
  fee: number;
  responsible_id: string;
  unit_id: string;
}

interface ProfileRow { id: string; full_name: string }
interface UnitRow { id: string; name: string }

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number.isFinite(n) ? n : 0);

const formatDate = (d: string | null) => {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
};

const AdminAsaasFees = () => {
  const { hasRole } = useAuth();
  const isMaster = hasRole("ADMIN_MASTER");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState<"DAY" | "MONTH" | "ALL">("MONTH");

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const payments = await fetchAllPaginated<{
        id: string;
        due_date: string;
        paid_at: string | null;
        value: number;
        final_value: number | null;
        raw_response: Record<string, unknown> | null;
        responsible_id: string;
        unit_id: string;
      }>((from, to) =>
        supabase
          .from("payments")
          .select("id, due_date, paid_at, value, final_value, raw_response, responsible_id, unit_id")
          .in("status", ["PAID", "RECEIVED", "CONFIRMED"])
          .order("paid_at", { ascending: false, nullsFirst: false })
          .range(from, to)
      );

      const mapped: FeeRow[] = payments
        .map((p) => {
          const raw = (p.raw_response || {}) as Record<string, unknown>;
          const asaasValue = typeof raw.value === "number" ? raw.value : Number(raw.value ?? p.final_value ?? p.value);
          const asaasNet = typeof raw.netValue === "number" ? raw.netValue : Number(raw.netValue ?? asaasValue);
          const fee = Number((asaasValue - asaasNet).toFixed(2));
          return {
            id: p.id,
            due_date: p.due_date,
            paid_at: p.paid_at,
            value: Number(p.final_value ?? p.value),
            asaas_value: Number(asaasValue) || 0,
            asaas_net: Number(asaasNet) || 0,
            fee: fee > 0 ? fee : 0,
            responsible_id: p.responsible_id,
            unit_id: p.unit_id,
          } as FeeRow;
        })
        .filter((r) => r.fee > 0);

      const responsibleIds = Array.from(new Set(mapped.map((m) => m.responsible_id))).filter(Boolean);
      const unitIds = Array.from(new Set(mapped.map((m) => m.unit_id))).filter(Boolean);

      const [profilesRes, unitsRes] = await Promise.all([
        responsibleIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", responsibleIds)
          : Promise.resolve({ data: [] as ProfileRow[], error: null }),
        unitIds.length
          ? supabase.from("units").select("id, name").in("id", unitIds)
          : Promise.resolve({ data: [] as UnitRow[], error: null }),
      ]);

      const pMap: Record<string, string> = {};
      ((profilesRes.data ?? []) as ProfileRow[]).forEach((p) => { pMap[p.id] = p.full_name; });

      setProfiles(pMap);
      setUnits((unitsRes.data ?? []) as UnitRow[]);
      setRows(mapped);
      setLoading(false);
    };
    load();
  }, []);

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

    let dayFee = 0, monthFee = 0, allFee = 0, allGross = 0, allNet = 0;
    const perUnit: Record<string, number> = {};

    rows.forEach((r) => {
      allFee += r.fee;
      allGross += r.asaas_value;
      allNet += r.asaas_net;
      perUnit[r.unit_id] = (perUnit[r.unit_id] || 0) + r.fee;
      if (r.paid_at) {
        const paid = new Date(r.paid_at);
        if (paid >= startOfDay) dayFee += r.fee;
        if (paid >= startOfMonth) monthFee += r.fee;
      }
    });
    return { dayFee, monthFee, allFee, allGross, allNet, perUnit };
  }, [rows]);

  const unitName = (id: string) => units.find((u) => u.id === id)?.name || "—";

  if (!isMaster && !hasRole("ADMIN_UNIDADE")) {
    return <div className="p-6">Acesso restrito a administradores.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Receipt className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Taxas Asaas</h1>
          <p className="text-sm text-muted-foreground">
            Despesa interna das cobranças. Esta informação <strong>nunca</strong> é exibida ao cliente.
          </p>
        </div>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Total pago (bruto)</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(totals.allGross)}</div>
            <p className="text-xs text-muted-foreground mt-1">Líquido recebido: {formatBRL(totals.allNet)}</p>
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
              <Building2 className="h-4 w-4" /> Taxas por unidade (total acumulado)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {units.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
                  <span className="text-sm font-medium">{u.name}</span>
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
            Pagamentos com taxa Asaas ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum pagamento com taxa encontrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-right">Cobrança</TableHead>
                  <TableHead className="text-right">Pago (bruto)</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                  <TableHead className="text-right">Taxa Asaas</TableHead>
                  <TableHead>Data pagamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{profiles[r.responsible_id] || "—"}</TableCell>
                    <TableCell>{unitName(r.unit_id)}</TableCell>
                    <TableCell className="text-right">{formatBRL(r.asaas_value)}</TableCell>
                    <TableCell className="text-right font-medium">{formatBRL(r.value)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatBRL(r.asaas_net)}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">- {formatBRL(r.fee)}</TableCell>
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

export default AdminAsaasFees;
