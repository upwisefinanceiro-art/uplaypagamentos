import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Banknote, TrendingUp, Wallet, CheckCircle2, Building2, Filter } from "lucide-react";

interface UplayUnit {
  id: string;
  name: string;
  partnership_plan: string;
  uplay_fee_type: string;
  uplay_fee_value: number;
  uplay_balance: number;
}

interface UplayTx {
  id: string;
  unit_id: string;
  payment_id: string | null;
  responsible_name: string | null;
  description: string | null;
  gross_value: number;
  fee_amount: number;
  net_value: number;
  status: string;
  paid_at: string | null;
  transferred_at: string | null;
  transfer_notes: string | null;
  created_at: string;
}

const fmt = (v: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString("pt-BR") : "-";

const AdminUplayBilling = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<UplayUnit[]>([]);
  const [txs, setTxs] = useState<UplayTx[]>([]);
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [transferDialog, setTransferDialog] = useState<{ open: boolean; unit: UplayUnit | null }>({ open: false, unit: null });
  const [transferNotes, setTransferNotes] = useState("");
  const [transferring, setTransferring] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: u }, { data: t }] = await Promise.all([
      supabase.from("units").select("id, name, partnership_plan, uplay_fee_type, uplay_fee_value, uplay_balance")
        .eq("partnership_plan", "PLANO_UPLAY").order("name"),
      supabase.from("uplay_partner_transactions").select("*").order("paid_at", { ascending: false }).limit(500),
    ]);
    setUnits((u ?? []) as UplayUnit[]);
    setTxs((t ?? []) as UplayTx[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const totals = useMemo(() => {
    const recebido = txs.reduce((s, x) => s + Number(x.gross_value || 0), 0);
    const taxas = txs.reduce((s, x) => s + Number(x.fee_amount || 0), 0);
    const aRepassar = txs.filter(x => x.status === "PENDENTE_REPASSE").reduce((s, x) => s + Number(x.net_value || 0), 0);
    const repassado = txs.filter(x => x.status === "REPASSADO").reduce((s, x) => s + Number(x.net_value || 0), 0);
    return { recebido, taxas, aRepassar, repassado };
  }, [txs]);

  const filteredTxs = useMemo(() => {
    return txs.filter(t => (unitFilter === "ALL" || t.unit_id === unitFilter)
      && (statusFilter === "ALL" || t.status === statusFilter));
  }, [txs, unitFilter, statusFilter]);

  const unitName = (id: string) => units.find(u => u.id === id)?.name || "—";

  const openTransfer = (unit: UplayUnit) => {
    setTransferDialog({ open: true, unit });
    setTransferNotes("");
  };

  const handleTransfer = async () => {
    if (!transferDialog.unit) return;
    setTransferring(true);
    const unitId = transferDialog.unit.id;
    const pendentes = txs.filter(t => t.unit_id === unitId && t.status === "PENDENTE_REPASSE");
    const ids = pendentes.map(p => p.id);
    if (!ids.length) {
      toast({ title: "Nenhuma transação pendente para esta unidade" });
      setTransferring(false);
      return;
    }
    const totalNet = pendentes.reduce((s, p) => s + Number(p.net_value || 0), 0);

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("uplay_partner_transactions").update({
      status: "REPASSADO",
      transferred_at: new Date().toISOString(),
      transferred_by: user?.id,
      transfer_notes: transferNotes || null,
    } as any).in("id", ids);

    if (error) {
      toast({ title: "Erro ao registrar repasse", description: error.message, variant: "destructive" });
      setTransferring(false);
      return;
    }

    // Zera o saldo acumulado da unidade (decresce o que foi repassado)
    await supabase.from("units").update({
      uplay_balance: Math.max(0, Number(transferDialog.unit.uplay_balance || 0) - totalNet),
    } as any).eq("id", unitId);

    toast({ title: `Repasse de ${fmt(totalNet)} registrado!` });
    setTransferDialog({ open: false, unit: null });
    setTransferring(false);
    fetchData();
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-64" />
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2">
        <Banknote size={20} className="text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Boletos UpPlay</h1>
          <p className="text-xs text-muted-foreground">Gestão de boletos intermediados — Plano UpPlay</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] text-muted-foreground">Total recebido</p>
              <TrendingUp size={14} className="text-success" />
            </div>
            <p className="text-lg font-bold text-foreground">{fmt(totals.recebido)}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] text-muted-foreground">Taxas UpPlay</p>
              <Wallet size={14} className="text-primary" />
            </div>
            <p className="text-lg font-bold text-primary">{fmt(totals.taxas)}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] text-muted-foreground">A repassar</p>
              <Banknote size={14} className="text-warning" />
            </div>
            <p className="text-lg font-bold text-warning">{fmt(totals.aRepassar)}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] text-muted-foreground">Já repassado</p>
              <CheckCircle2 size={14} className="text-success" />
            </div>
            <p className="text-lg font-bold text-success">{fmt(totals.repassado)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="parceiros" className="w-full">
        <TabsList>
          <TabsTrigger value="parceiros">Parceiros ({units.length})</TabsTrigger>
          <TabsTrigger value="extrato">Extrato ({filteredTxs.length})</TabsTrigger>
        </TabsList>

        {/* PARCEIROS */}
        <TabsContent value="parceiros" className="mt-3 space-y-3">
          {units.length === 0 ? (
            <Card className="border-border">
              <CardContent className="p-8 text-center">
                <Building2 size={32} className="mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum parceiro no Plano UpPlay ainda.</p>
                <p className="text-xs text-muted-foreground mt-1">Edite uma unidade e selecione "Plano UpPlay" para começar.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {units.map(u => {
                const unitTxs = txs.filter(t => t.unit_id === u.id);
                const pendentes = unitTxs.filter(t => t.status === "PENDENTE_REPASSE");
                const recebidoUnit = unitTxs.reduce((s, t) => s + Number(t.gross_value || 0), 0);
                const taxasUnit = unitTxs.reduce((s, t) => s + Number(t.fee_amount || 0), 0);
                const pendenteUnit = pendentes.reduce((s, t) => s + Number(t.net_value || 0), 0);
                return (
                  <Card key={u.id} className="border-border">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{u.name}</CardTitle>
                        <Badge variant="default" className="text-[10px]">
                          Taxa: {u.uplay_fee_type === "PERCENT" ? `${u.uplay_fee_value}%` : fmt(u.uplay_fee_value)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] text-muted-foreground">Recebido</p>
                          <p className="text-sm font-semibold">{fmt(recebidoUnit)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Taxa</p>
                          <p className="text-sm font-semibold text-primary">{fmt(taxasUnit)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">A repassar</p>
                          <p className="text-sm font-semibold text-warning">{fmt(pendenteUnit)}</p>
                        </div>
                      </div>
                      <Button
                        size="sm" className="w-full gap-2"
                        disabled={pendentes.length === 0}
                        onClick={() => openTransfer(u)}
                      >
                        <CheckCircle2 size={14} />
                        Marcar repasse ({pendentes.length})
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* EXTRATO */}
        <TabsContent value="extrato" className="mt-3 space-y-3">
          <Card className="border-border">
            <CardContent className="p-3 flex flex-col sm:flex-row gap-2">
              <div className="flex items-center gap-2 flex-1">
                <Filter size={14} className="text-muted-foreground" />
                <Select value={unitFilter} onValueChange={setUnitFilter}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos os parceiros</SelectItem>
                    {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os status</SelectItem>
                  <SelectItem value="PENDENTE_REPASSE">Pendente repasse</SelectItem>
                  <SelectItem value="REPASSADO">Repassado</SelectItem>
                  <SelectItem value="CANCELADO">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {filteredTxs.length === 0 ? (
            <Card className="border-border">
              <CardContent className="p-8 text-center">
                <p className="text-sm text-muted-foreground">Nenhuma transação encontrada.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredTxs.map(tx => (
                <Card key={tx.id} className="border-border">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{tx.responsible_name || "—"}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{tx.description || "Sem descrição"}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {unitName(tx.unit_id)} · Pago em {fmtDate(tx.paid_at)}
                          {tx.transferred_at && ` · Repassado em ${fmtDate(tx.transferred_at)}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{fmt(tx.gross_value)}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Taxa <span className="text-primary">{fmt(tx.fee_amount)}</span> · Líquido <span className="text-success font-medium">{fmt(tx.net_value)}</span>
                        </p>
                        <Badge variant={tx.status === "REPASSADO" ? "default" : "secondary"} className="text-[9px] mt-1">
                          {tx.status === "PENDENTE_REPASSE" ? "Pendente" : tx.status === "REPASSADO" ? "Repassado" : "Cancelado"}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Transfer dialog */}
      <Dialog open={transferDialog.open} onOpenChange={(o) => !o && setTransferDialog({ open: false, unit: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar repasse — {transferDialog.unit?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Esta ação marcará todas as transações pendentes desta unidade como repassadas.
              Faça o PIX/transferência manual primeiro e depois confirme aqui.
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Observações (opcional)</Label>
              <Textarea
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                placeholder="Ex: Comprovante PIX 123456 enviado em..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialog({ open: false, unit: null })}>Cancelar</Button>
            <Button onClick={handleTransfer} disabled={transferring}>
              {transferring ? "Registrando..." : "Confirmar repasse"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUplayBilling;
