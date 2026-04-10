import { useState, useEffect, useMemo } from "react";
import { format, startOfMonth, addMonths, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Calculator, Loader2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ContractForCancellation {
  id: string;
  description: string;
  responsible_name: string | null;
  contract_number: string | null;
  unit_id: string;
  responsible_id: string;
  student_id: string;
  students: { full_name: string } | null;
}

interface PaymentRow {
  id: string;
  due_date: string;
  value: number;
  final_value: number | null;
  original_value: number | null;
  status: string;
  payment_type: string;
  installment_number: number;
  description: string;
}

interface Props {
  contract: ContractForCancellation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ContractCancellationDialog({
  contract,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const { toast } = useToast();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingCharge, setGeneratingCharge] = useState(false);
  const [cancellationDate, setCancellationDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [penaltyPercent, setPenaltyPercent] = useState("50");
  const [calculated, setCalculated] = useState(false);

  useEffect(() => {
    if (open && contract) {
      fetchPayments();
      setCalculated(false);
    }
  }, [open, contract]);

  const fetchPayments = async () => {
    if (!contract) return;
    setLoading(true);
    const { data } = await supabase
      .from("payments")
      .select(
        "id, due_date, value, final_value, original_value, status, payment_type, installment_number, description"
      )
      .eq("contract_id", contract.id)
      .order("due_date", { ascending: true });
    setPayments((data as PaymentRow[]) || []);
    setLoading(false);
  };

  const calculation = useMemo(() => {
    if (!cancellationDate || payments.length === 0) {
      return {
        totalInstallments: 0,
        paidInstallments: 0,
        currentMonthInstallments: 0,
        futureInstallments: 0,
        futurePayments: [] as PaymentRow[],
        baseValue: 0,
        penaltyValue: 0,
      };
    }

    const cancelDate = new Date(cancellationDate + "T12:00:00");
    const nextMonthStart = startOfMonth(addMonths(cancelDate, 1));

    // Only MENSALIDADE type
    const mensalidades = payments.filter(
      (p) => p.payment_type === "MENSALIDADE"
    );
    const totalInstallments = mensalidades.length;
    const paidInstallments = mensalidades.filter((p) =>
      ["PAID", "RECEIVED", "CONFIRMED"].includes(p.status)
    ).length;

    // Future: due_date >= first day of next month AND not paid
    const futurePayments = mensalidades.filter((p) => {
      const dueDate = new Date(p.due_date + "T12:00:00");
      const isPaid = ["PAID", "RECEIVED", "CONFIRMED"].includes(p.status);
      const isCancelled = p.status === "CANCELLED";
      return dueDate >= nextMonthStart && !isPaid && !isCancelled;
    });

    // Current month installments (for display)
    const currentMonthStart = startOfMonth(cancelDate);
    const currentMonthInstallments = mensalidades.filter((p) => {
      const dueDate = new Date(p.due_date + "T12:00:00");
      return (
        dueDate >= currentMonthStart &&
        dueDate < nextMonthStart &&
        !["PAID", "RECEIVED", "CONFIRMED", "CANCELLED"].includes(p.status)
      );
    }).length;

    const baseValue = futurePayments.reduce(
      (sum, p) => sum + p.value,
      0
    );
    const percent = parseFloat(penaltyPercent) || 0;
    const penaltyValue = (baseValue * percent) / 100;

    return {
      totalInstallments,
      paidInstallments,
      currentMonthInstallments,
      futureInstallments: futurePayments.length,
      futurePayments,
      baseValue,
      penaltyValue,
    };
  }, [payments, cancellationDate, penaltyPercent]);

  const handleCalculate = () => {
    if (!cancellationDate) {
      toast({
        title: "Informe a data de cancelamento",
        variant: "destructive",
      });
      return;
    }
    setCalculated(true);
  };

  const handleSaveCancellation = async () => {
    if (!contract) return;
    setSaving(true);
    try {
      const percent = parseFloat(penaltyPercent) || 0;

      // Update contract with cancellation data
      const { error } = await supabase
        .from("contracts")
        .update({
          status: "CANCELLED",
          cancellation_date: cancellationDate,
          cancellation_penalty_percent: percent,
          cancellation_installments_count: calculation.futureInstallments,
          cancellation_base_value: calculation.baseValue,
          cancellation_penalty_value: calculation.penaltyValue,
          cancelled_at: new Date().toISOString(),
        } as any)
        .eq("id", contract.id);

      if (error) throw error;

      // Cancel future unpaid payments
      if (calculation.futurePayments.length > 0) {
        const ids = calculation.futurePayments.map((p) => p.id);
        for (const id of ids) {
          await supabase.functions.invoke("manage-payment", {
            body: { action: "cancel", payment_id: id },
          });
        }
      }

      toast({
        title: "Contrato cancelado",
        description: `${calculation.futureInstallments} parcela(s) futura(s) cancelada(s). Multa: ${fmt(calculation.penaltyValue)}`,
      });
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Erro ao cancelar contrato",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateCharge = async () => {
    if (!contract || calculation.penaltyValue <= 0) return;
    setGeneratingCharge(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "manage-payment",
        {
          body: {
            action: "create_manual",
            responsible_id: contract.responsible_id,
            student_id: contract.student_id,
            contract_id: contract.id,
            payment_type: "AVULSA",
            description: `Multa de cancelamento - ${contract.description}`,
            value: Math.round(calculation.penaltyValue * 100) / 100,
            due_date: cancellationDate,
            status: "PENDING",
          },
        }
      );

      if (error || data?.error) {
        throw new Error(error?.message || data?.error);
      }

      toast({
        title: "Cobrança de multa gerada",
        description: `Cobrança de ${fmt(calculation.penaltyValue)} criada com sucesso.`,
      });
    } catch (err: any) {
      toast({
        title: "Erro ao gerar cobrança",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingCharge(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <AlertTriangle size={18} className="text-destructive" />
            Cancelamento de Curso
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-primary" size={24} />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Contract info */}
            <div className="p-3 rounded-lg bg-muted/50 space-y-1">
              <p className="text-sm font-medium text-foreground">
                {contract?.description}
              </p>
              <p className="text-xs text-muted-foreground">
                Responsável: {contract?.responsible_name || "—"} • Aluno:{" "}
                {(contract?.students as any)?.full_name || "—"}
              </p>
              {contract?.contract_number && (
                <p className="text-xs text-muted-foreground">
                  Contrato #{contract.contract_number}
                </p>
              )}
            </div>

            {/* Inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-foreground">
                  Data do Cancelamento *
                </Label>
                <Input
                  type="date"
                  className="bg-input border-border text-foreground"
                  value={cancellationDate}
                  onChange={(e) => {
                    setCancellationDate(e.target.value);
                    setCalculated(false);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-foreground">
                  % Multa de Cancelamento *
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  className="bg-input border-border text-foreground"
                  value={penaltyPercent}
                  onChange={(e) => {
                    setPenaltyPercent(e.target.value);
                    setCalculated(false);
                  }}
                />
              </div>
            </div>

            <Button
              className="w-full"
              variant="outline"
              onClick={handleCalculate}
            >
              <Calculator size={14} className="mr-2" />
              Calcular Cancelamento
            </Button>

            {calculated && (
              <>
                <Separator />

                {/* Results */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Resultado do Cálculo
                  </p>

                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">
                      Total de mensalidades:
                    </span>
                    <span className="text-foreground font-medium">
                      {calculation.totalInstallments}
                    </span>

                    <span className="text-muted-foreground">Já pagas:</span>
                    <span className="text-foreground font-medium">
                      {calculation.paidInstallments}
                    </span>

                    <span className="text-muted-foreground">
                      Mês atual (não entra):
                    </span>
                    <span className="text-foreground font-medium">
                      {calculation.currentMonthInstallments}
                    </span>

                    <span className="text-muted-foreground">
                      Mensalidades futuras:
                    </span>
                    <span className="text-primary font-bold">
                      {calculation.futureInstallments}
                    </span>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">
                      Valor base (soma futuras):
                    </span>
                    <span className="text-foreground font-medium">
                      {fmt(calculation.baseValue)}
                    </span>

                    <span className="text-muted-foreground">
                      Percentual de multa:
                    </span>
                    <span className="text-foreground font-medium">
                      {penaltyPercent}%
                    </span>

                    <span className="text-muted-foreground">
                      Valor da multa:
                    </span>
                    <span className="text-destructive font-bold text-base">
                      {fmt(calculation.penaltyValue)}
                    </span>
                  </div>

                  {/* Explanation */}
                  <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-foreground">
                    <p>
                      ⚠️ Faltam{" "}
                      <strong>
                        {calculation.futureInstallments +
                          calculation.currentMonthInstallments}
                      </strong>{" "}
                      parcela(s) no contrato
                      {calculation.currentMonthInstallments > 0 && (
                        <>
                          , porém{" "}
                          <strong>
                            {calculation.currentMonthInstallments} parcela(s) do
                            mês atual não entra(m) no cálculo
                          </strong>
                        </>
                      )}
                      . Multa calculada sobre{" "}
                      <strong>
                        {calculation.futureInstallments} mensalidade(s)
                        futura(s)
                      </strong>
                      .
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Apostilas e cobranças avulsas não são consideradas.
                    </p>
                  </div>

                  {/* Future payments list */}
                  {calculation.futurePayments.length > 0 && (
                    <div className="border border-border rounded-md overflow-hidden">
                      <div className="grid grid-cols-3 bg-muted/80 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                        <span>#</span>
                        <span>Vencimento</span>
                        <span className="text-right">Valor</span>
                      </div>
                      {calculation.futurePayments.map((p) => (
                        <div
                          key={p.id}
                          className="grid grid-cols-3 px-3 py-1.5 text-xs border-t border-border"
                        >
                          <span className="text-foreground">
                            Parcela {p.installment_number}
                          </span>
                          <span className="text-foreground">
                            {format(
                              new Date(p.due_date + "T12:00:00"),
                              "dd/MM/yyyy",
                              { locale: ptBR }
                            )}
                          </span>
                          <span className="text-right font-medium text-primary">
                            {fmt(p.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <Separator />

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <Button
                      className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      disabled={saving}
                      onClick={handleSaveCancellation}
                    >
                      {saving ? (
                        <Loader2
                          size={14}
                          className="animate-spin mr-2"
                        />
                      ) : (
                        <AlertTriangle size={14} className="mr-2" />
                      )}
                      Confirmar Cancelamento do Contrato
                    </Button>

                    {calculation.penaltyValue > 0 && (
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={generatingCharge || saving}
                        onClick={handleGenerateCharge}
                      >
                        {generatingCharge ? (
                          <Loader2
                            size={14}
                            className="animate-spin mr-2"
                          />
                        ) : (
                          <Receipt size={14} className="mr-2" />
                        )}
                        Gerar Cobrança da Multa ({fmt(calculation.penaltyValue)}
                        )
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
