import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Wrench,
} from "lucide-react";

type Incon = {
  id: string;
  payment_id: string | null;
  asaas_payment_id: string | null;
  error_type: string;
  severity: string;
  responsible_name: string | null;
  system_status: string | null;
  asaas_status: string | null;
  system_value: number | null;
  asaas_value: number | null;
  system_due_date: string | null;
  asaas_due_date: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type WebhookLog = {
  id: string;
  event: string;
  asaas_payment_id: string | null;
  processed: boolean;
  error_message: string | null;
  created_at: string;
};

type ReconcileResult = {
  units_processed?: number;
  asaas_charges_fetched?: number;
  local_payments_scanned?: number;
  duplicate_groups_found?: number;
  local_duplicates_cancelled?: number;
  asaas_duplicates_cancelled?: number;
  paid_synced?: number;
  missing_links_repaired?: number;
  missing_charges_created?: number;
  orphans_logged?: number;
  customer_duplicates_detected?: number;
  webhook_failures_marked_for_review?: number;
  errors?: number;
  errors_remaining?: number;
  report?: Array<{
    type: string;
    unit?: string;
    responsible?: string | null;
    message: string;
  }>;
};

const severityColor: Record<string, string> = {
  HIGH: "destructive",
  MEDIUM: "default",
  LOW: "secondary",
};

const errorTypeLabel: Record<string, string> = {
  ORPHAN_NO_CONTRACT: "Cobrança sem contrato",
  DUPLICATE_INSTALLMENT: "Parcela duplicada",
  ASAAS_ORPHAN: "Existe no Asaas, falta no sistema",
  VALUE_MISMATCH: "Valor divergente",
  STATUS_MISMATCH: "Status divergente",
};

export default function AdminAuditoriaAsaas() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [inconsistencies, setInconsistencies] = useState<Incon[]>([]);
  const [webhookFails, setWebhookFails] = useState<WebhookLog[]>([]);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileStep, setReconcileStep] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ReconcileResult | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [inc, wh] = await Promise.all([
      supabase
        .from("payment_inconsistencies")
        .select("*")
        .is("resolved_at", null)
        .order("severity", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("webhook_logs")
        .select(
          "id, event, asaas_payment_id, processed, error_message, created_at",
        )
        .eq("processed", false)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setInconsistencies((inc.data as Incon[]) ?? []);
    setWebhookFails((wh.data as WebhookLog[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function forceReconcile() {
    setReconciling(true);
    setReconcileStep(
      "Varrendo parcelas locais e cobranças do Asaas dos últimos 120 dias…",
    );
    try {
      const { data, error } = await supabase.functions.invoke(
        "asaas-reconcile",
        {
          body: {
            days_back: 120,
            repair_duplicates: true,
            emit_missing: true,
            max_create: 500,
          },
        },
      );
      if (error) throw error;
      setReconcileStep("Atualizando auditoria e webhooks falhos…");
      setLastResult(data as ReconcileResult);
      toast({
        title: "Correção automática concluída",
        description: `${data?.paid_synced ?? 0} baixas · ${data?.missing_charges_created ?? 0} cobranças criadas · ${data?.local_duplicates_cancelled ?? 0} duplicidades canceladas`,
      });
      await fetchData();
    } catch (e) {
      toast({
        title: "Falha na reconciliação",
        description: String((e as Error)?.message ?? e),
        variant: "destructive",
      });
    } finally {
      setReconcileStep(null);
      setReconciling(false);
    }
  }

  async function resolveIncon(id: string, action: string) {
    setResolvingId(id);
    const { error } = await supabase
      .from("payment_inconsistencies")
      .update({
        resolved_at: new Date().toISOString(),
        resolution_action: action,
      })
      .eq("id", id);
    setResolvingId(null);
    if (error) {
      toast({
        title: "Erro ao marcar como resolvida",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setInconsistencies((s) => s.filter((i) => i.id !== id));
  }

  async function resendCharge(payment_id: string) {
    setResolvingId(payment_id);
    try {
      const { data, error } = await supabase.functions.invoke(
        "sync-asaas-payment",
        {
          body: { payment_id },
        },
      );
      if (error) throw error;
      toast({
        title: "Sincronizado",
        description: JSON.stringify(data?.action ?? "ok"),
      });
      await fetchData();
    } catch (e) {
      toast({
        title: "Falha",
        description: String((e as Error)?.message ?? e),
        variant: "destructive",
      });
    } finally {
      setResolvingId(null);
    }
  }

  const byType = inconsistencies.reduce<Record<string, number>>((acc, i) => {
    acc[i.error_type] = (acc[i.error_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Auditoria Asaas</h1>
          <p className="text-sm text-muted-foreground">
            Inconsistências entre o sistema e o Asaas, webhooks falhos e
            ferramentas de reconciliação.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />{" "}
            Atualizar
          </Button>
          <Button onClick={forceReconcile} disabled={reconciling}>
            {reconciling ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4 mr-2" />
            )}
            Corrigir automaticamente
          </Button>
        </div>
      </div>

      {reconciling && (
        <Card>
          <CardContent className="p-4 flex items-center gap-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>{reconcileStep ?? "Executando correção automática…"}</span>
          </CardContent>
        </Card>
      )}

      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" /> Relatório da
              última correção automática
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">
                  Baixas aplicadas
                </div>
                <div className="text-xl font-bold">
                  {lastResult.paid_synced ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Cobranças criadas
                </div>
                <div className="text-xl font-bold">
                  {lastResult.missing_charges_created ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Duplicidades canceladas
                </div>
                <div className="text-xl font-bold">
                  {lastResult.local_duplicates_cancelled ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Erros restantes
                </div>
                <div className="text-xl font-bold">
                  {lastResult.errors_remaining ?? lastResult.errors ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Vínculos reparados
                </div>
                <div className="text-xl font-bold">
                  {lastResult.missing_links_repaired ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Canceladas no Asaas
                </div>
                <div className="text-xl font-bold">
                  {lastResult.asaas_duplicates_cancelled ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Órfãs registradas
                </div>
                <div className="text-xl font-bold">
                  {lastResult.orphans_logged ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Clientes duplicados
                </div>
                <div className="text-xl font-bold">
                  {lastResult.customer_duplicates_detected ?? 0}
                </div>
              </div>
            </div>
            {(lastResult.report?.length ?? 0) > 0 && (
              <div className="space-y-2 max-h-72 overflow-y-auto text-sm">
                {lastResult.report!.slice(0, 80).map((item, idx) => (
                  <div
                    key={`${item.type}-${idx}`}
                    className="border rounded-md p-2"
                  >
                    <div className="font-medium">
                      {item.type}
                      {item.unit ? ` · ${item.unit}` : ""}
                    </div>
                    <div className="text-muted-foreground">
                      {item.responsible ? `${item.responsible} — ` : ""}
                      {item.message}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">
              Inconsistências abertas
            </div>
            <div className="text-2xl font-bold">{inconsistencies.length}</div>
          </CardContent>
        </Card>
        {Object.entries(byType).map(([t, n]) => (
          <Card key={t}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">
                {errorTypeLabel[t] ?? t}
              </div>
              <div className="text-2xl font-bold">{n}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> Inconsistências
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin h-6 w-6" />
            </div>
          ) : inconsistencies.length === 0 ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Nenhuma
              inconsistência aberta.
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {inconsistencies.map((i) => (
                <div
                  key={i.id}
                  className="border rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-sm"
                >
                  <Badge
                    variant={
                      (severityColor[i.severity] ?? "default") as
                        | "default"
                        | "destructive"
                        | "secondary"
                    }
                  >
                    {i.severity}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {errorTypeLabel[i.error_type] ?? i.error_type}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {i.responsible_name ?? "—"} · venc.{" "}
                      {i.system_due_date ?? i.asaas_due_date ?? "—"} · R${" "}
                      {(i.system_value ?? i.asaas_value ?? 0).toFixed(2)}
                      {i.asaas_payment_id
                        ? ` · asaas:${i.asaas_payment_id.slice(0, 16)}…`
                        : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {i.payment_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resolvingId === i.payment_id}
                        onClick={() => resendCharge(i.payment_id!)}
                      >
                        Sincronizar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={resolvingId === i.id}
                      onClick={() => resolveIncon(i.id, "MANUAL_REVIEW")}
                    >
                      Marcar revisada
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhooks falhos (últimos)</CardTitle>
        </CardHeader>
        <CardContent>
          {webhookFails.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Sem falhas recentes.
            </div>
          ) : (
            <div className="space-y-1 text-xs font-mono max-h-72 overflow-y-auto">
              {webhookFails.map((w) => (
                <div key={w.id} className="border-b py-1">
                  <span className="text-muted-foreground">
                    {new Date(w.created_at).toLocaleString("pt-BR")}
                  </span>
                  {" · "}
                  <span className="font-semibold">{w.event}</span>
                  {w.asaas_payment_id ? ` · ${w.asaas_payment_id}` : ""}
                  {w.error_message ? (
                    <div className="text-destructive">{w.error_message}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
