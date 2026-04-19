import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, RefreshCw, ShieldCheck, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface InconsistencyRow {
  id: string;
  payment_id: string | null;
  unit_id: string;
  responsible_id: string | null;
  responsible_name: string | null;
  asaas_payment_id: string | null;
  error_type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  system_value: number | null;
  asaas_value: number | null;
  system_status: string | null;
  asaas_status: string | null;
  system_due_date: string | null;
  asaas_due_date: string | null;
  system_paid_at: string | null;
  asaas_paid_at: string | null;
  details: Record<string, unknown> | null;
  last_detected_at: string;
  detection_count: number;
}

interface UnitOption {
  id: string;
  name: string;
}

const ERROR_LABELS: Record<string, string> = {
  PAID_IN_ASAAS: "Pago no Asaas, pendente no sistema",
  PAID_IN_SYSTEM: "Pago no sistema, pendente no Asaas",
  VALUE_MISMATCH: "Valores diferentes",
  DUE_DATE_MISMATCH: "Data de vencimento diferente",
  DATE_MISMATCH: "Data de pagamento diferente",
  MISSING_ASAAS_LINK: "Sem vínculo com Asaas",
  DUPLICATE: "Cobrança duplicada",
};

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: "bg-destructive text-destructive-foreground animate-pulse",
  HIGH: "bg-destructive/80 text-destructive-foreground",
  MEDIUM: "bg-yellow-500 text-white",
  LOW: "bg-muted text-muted-foreground",
};

interface Props {
  unitFilter: string;
  units: UnitOption[];
}

const DashboardInconsistencies = ({ unitFilter, units }: Props) => {
  const { toast } = useToast();
  const [issues, setIssues] = useState<InconsistencyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const [detailIssue, setDetailIssue] = useState<InconsistencyRow | null>(null);

  const unitNameMap = new Map(units.map((u) => [u.id, u.name]));

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("payment_inconsistencies")
      .select("*")
      .is("resolved_at", null)
      .order("severity", { ascending: true })
      .order("last_detected_at", { ascending: false })
      .limit(200);
    if (unitFilter !== "all") q = q.eq("unit_id", unitFilter);
    const { data, error } = await q;
    if (error) {
      console.error(error);
    } else {
      setIssues((data ?? []) as InconsistencyRow[]);
    }
    setLoading(false);
  }, [unitFilter]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const runScan = async () => {
    setScanning(true);
    try {
      const body: Record<string, string> = {};
      if (unitFilter !== "all") body.unit_id = unitFilter;
      const { data, error } = await supabase.functions.invoke(
        "detect-payment-inconsistencies",
        { body },
      );
      if (error) throw error;
      const r = data as {
        units_scanned?: number;
        payments_checked?: number;
        issues_found?: number;
        issues_resolved_auto?: number;
      };
      toast({
        title: "Varredura concluída",
        description: `${r.units_scanned ?? 0} unidade(s), ${r.payments_checked ?? 0} cobranças verificadas. ${r.issues_found ?? 0} inconsistências, ${r.issues_resolved_auto ?? 0} auto-resolvidas.`,
      });
      await fetchIssues();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Falha na varredura",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setScanning(false);
    }
  };

  const fixWithAsaas = async (issue: InconsistencyRow) => {
    if (!issue.payment_id) return;
    setFixing(issue.id);
    try {
      const { data, error } = await supabase.functions.invoke(
        "sync-asaas-payment",
        { body: { payment_id: issue.payment_id } },
      );
      if (error) throw error;
      const errBody = (data as { error?: string } | null)?.error;
      if (errBody) throw new Error(errBody);

      // Marcar como resolvida
      await supabase
        .from("payment_inconsistencies")
        .update({
          resolved_at: new Date().toISOString(),
          resolved_by: (await supabase.auth.getUser()).data.user?.id ?? null,
          resolution_action: "ASAAS_OVERRIDE",
        })
        .eq("id", issue.id);

      toast({
        title: "Corrigido",
        description: "Dados do Asaas aplicados ao sistema.",
      });
      await fetchIssues();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Falha ao corrigir",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setFixing(null);
      setDetailIssue(null);
    }
  };

  const fmt = (v: number | null | undefined) =>
    v == null
      ? "—"
      : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const fmtDate = (s: string | null | undefined) => {
    if (!s) return "—";
    try {
      return new Date(s.length === 10 ? `${s}T00:00:00` : s).toLocaleDateString(
        "pt-BR",
      );
    } catch {
      return s;
    }
  };

  const criticalCount = issues.filter(
    (i) => i.severity === "CRITICAL" || i.severity === "HIGH",
  ).length;

  return (
    <>
      <Card
        className={
          criticalCount > 0
            ? "border-destructive border-2 shadow-[0_0_0_1px_hsl(var(--destructive)/0.3)]"
            : "border-border"
        }
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-sm flex items-center gap-2">
              {criticalCount > 0 ? (
                <AlertTriangle
                  size={18}
                  className="text-destructive animate-pulse"
                />
              ) : (
                <ShieldCheck size={18} className="text-success" />
              )}
              <span className="text-foreground">
                Monitoramento Asaas × Sistema
              </span>
              {issues.length > 0 && (
                <Badge variant="destructive" className="ml-1">
                  {issues.length}
                </Badge>
              )}
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={runScan}
              disabled={scanning}
              className="h-8 text-xs"
            >
              {scanning ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <RefreshCw size={14} className="mr-1" />
              )}
              {scanning ? "Verificando..." : "Verificar agora"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <p className="text-xs text-muted-foreground py-2">Carregando...</p>
          ) : issues.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 flex items-center gap-2">
              <ShieldCheck size={14} className="text-success" />
              Nenhuma inconsistência detectada. Sistema sincronizado com Asaas.
            </p>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-y-auto">
              {issues.map((issue) => (
                <div
                  key={issue.id}
                  className={`p-2.5 rounded border text-xs flex items-center justify-between gap-2 ${
                    issue.severity === "CRITICAL"
                      ? "bg-destructive/10 border-destructive/40"
                      : issue.severity === "HIGH"
                        ? "bg-destructive/5 border-destructive/30"
                        : "bg-muted/30 border-border"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        className={`text-[10px] ${SEVERITY_STYLES[issue.severity]}`}
                      >
                        {issue.severity}
                      </Badge>
                      <span className="font-medium text-foreground truncate">
                        {issue.responsible_name ?? "Cliente"}
                      </span>
                      <span className="text-muted-foreground text-[10px]">
                        · {unitNameMap.get(issue.unit_id) ?? "—"}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5">
                      {ERROR_LABELS[issue.error_type] ?? issue.error_type}
                      {issue.error_type === "VALUE_MISMATCH" && (
                        <span className="ml-1">
                          ({fmt(issue.system_value)} → {fmt(issue.asaas_value)})
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setDetailIssue(issue)}
                    >
                      Ver
                    </Button>
                    {issue.payment_id && (
                      <Button
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => fixWithAsaas(issue)}
                        disabled={fixing === issue.id}
                      >
                        {fixing === issue.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          "Corrigir"
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!detailIssue}
        onOpenChange={(open) => !open && setDetailIssue(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes da inconsistência</DialogTitle>
            <DialogDescription>
              {detailIssue && ERROR_LABELS[detailIssue.error_type]}
            </DialogDescription>
          </DialogHeader>
          {detailIssue && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-muted/40 border border-border">
                  <p className="text-muted-foreground mb-1">No sistema</p>
                  <p>Status: <span className="font-medium">{detailIssue.system_status ?? "—"}</span></p>
                  <p>Valor: <span className="font-medium">{fmt(detailIssue.system_value)}</span></p>
                  <p>Vence: <span className="font-medium">{fmtDate(detailIssue.system_due_date)}</span></p>
                  <p>Pago em: <span className="font-medium">{fmtDate(detailIssue.system_paid_at)}</span></p>
                </div>
                <div className="p-2 rounded bg-primary/5 border border-primary/20">
                  <p className="text-primary mb-1 font-medium">No Asaas</p>
                  <p>Status: <span className="font-medium">{detailIssue.asaas_status ?? "—"}</span></p>
                  <p>Valor: <span className="font-medium">{fmt(detailIssue.asaas_value)}</span></p>
                  <p>Vence: <span className="font-medium">{fmtDate(detailIssue.asaas_due_date)}</span></p>
                  <p>Pago em: <span className="font-medium">{fmtDate(detailIssue.asaas_paid_at)}</span></p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Detectado {detailIssue.detection_count}× — última em{" "}
                {fmtDate(detailIssue.last_detected_at)}
              </p>
              {detailIssue.payment_id && (
                <Button
                  className="w-full"
                  onClick={() => fixWithAsaas(detailIssue)}
                  disabled={fixing === detailIssue.id}
                >
                  {fixing === detailIssue.id ? (
                    <>
                      <Loader2 size={14} className="mr-2 animate-spin" />
                      Corrigindo...
                    </>
                  ) : (
                    "Corrigir com Asaas"
                  )}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DashboardInconsistencies;
