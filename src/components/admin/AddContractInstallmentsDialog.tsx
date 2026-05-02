import { useState, useMemo, useEffect } from "react";
import { format, addMonths, lastDayOfMonth, setDate as setDateFns } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Loader2, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contract: {
    id: string;
    description: string;
    contract_number: string | null;
    responsible_id: string;
    student_id: string | null;
    unit_id: string;
  } | null;
  onSuccess?: () => void;
}

function sanitizeMoney(v: string) {
  return v.replace(/[^\d,\.\s]/g, "").replace(/\s+/g, "");
}
function parseMoney(v: string): number {
  const cleaned = sanitizeMoney(v);
  if (!cleaned) return 0;
  const lc = cleaned.lastIndexOf(",");
  const ld = cleaned.lastIndexOf(".");
  const idx = Math.max(lc, ld);
  if (idx === -1) {
    const n = Number.parseFloat(cleaned.replace(/\D/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  const intPart = cleaned.slice(0, idx).replace(/\D/g, "") || "0";
  const decPart = cleaned.slice(idx + 1).replace(/\D/g, "").slice(0, 2);
  const n = Number.parseFloat(decPart ? `${intPart}.${decPart}` : intPart);
  return Number.isFinite(n) ? n : 0;
}
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function generateDates(firstDue: string, count: number): Date[] {
  if (!firstDue || count <= 0) return [];
  const base = new Date(firstDue + "T12:00:00");
  const day = base.getDate();
  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    const m = addMonths(base, i);
    const last = lastDayOfMonth(m).getDate();
    out.push(setDateFns(m, Math.min(day, last)));
  }
  return out;
}

const AddContractInstallmentsDialog = ({ open, onOpenChange, contract, onSuccess }: Props) => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [generateAsaas, setGenerateAsaas] = useState(true);

  const [paymentMethod, setPaymentMethod] = useState<"PIX" | "BOLETO" | "CARD">("BOLETO");
  const [gateway, setGateway] = useState<"ASAAS" | "CORA">("ASAAS");
  const [firstDueDate, setFirstDueDate] = useState("");
  const [installments, setInstallments] = useState("1");
  const [realValue, setRealValue] = useState("");
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");

  const [includeApostilas, setIncludeApostilas] = useState(false);
  const [apostilasTotal, setApostilasTotal] = useState("");
  const [apostilasQty, setApostilasQty] = useState("1");
  const [apostilasStartDate, setApostilasStartDate] = useState("");
  const [apostilasInterval, setApostilasInterval] = useState("3");

  const [includeMatricula, setIncludeMatricula] = useState(false);
  const [matriculaValue, setMatriculaValue] = useState("");
  const [matriculaDueDate, setMatriculaDueDate] = useState("");
  const [matriculaDescription, setMatriculaDescription] = useState("Matrícula");

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setPaymentMethod("BOLETO");
      setGateway("ASAAS");
      setFirstDueDate("");
      setInstallments("1");
      setRealValue("");
      setDiscount("");
      setNotes("");
      setIncludeApostilas(false);
      setApostilasTotal("");
      setApostilasQty("1");
      setApostilasStartDate("");
      setApostilasInterval("3");
      setIncludeMatricula(false);
      setMatriculaValue("");
      setMatriculaDueDate("");
      setMatriculaDescription("Matrícula");
      setGenerateAsaas(true);
    }
  }, [open]);

  const numInst = parseInt(installments) || 0;
  const real = parseMoney(realValue);
  const desc = parseMoney(discount);
  const finalParc = Math.max(real - desc, 0);
  const apostilasTotalV = parseMoney(apostilasTotal);
  const apostilasCount = parseInt(apostilasQty) || 0;
  const apostilasIntervalM = parseInt(apostilasInterval) || 3;
  const apostilaParc = apostilasTotalV > 0 && apostilasCount > 0 ? apostilasTotalV / apostilasCount : 0;
  const matricula = parseMoney(matriculaValue);

  const dates = useMemo(() => generateDates(firstDueDate, numInst), [firstDueDate, numInst]);

  const validate = (): string | null => {
    if (!paymentMethod) return "Selecione o método de pagamento";
    if (numInst > 0) {
      if (!firstDueDate) return "Informe a data do 1º vencimento";
      if (real <= 0) return "Informe o valor real da mensalidade";
    }
    if (numInst === 0 && !includeApostilas && !includeMatricula) {
      return "Informe ao menos parcelas, apostilas ou matrícula";
    }
    if (includeApostilas) {
      if (apostilasTotalV <= 0) return "Valor total das apostilas é obrigatório";
      if (apostilasCount <= 0) return "Quantidade de apostilas é obrigatória";
      if (!apostilasStartDate) return "Data do 1º vencimento das apostilas é obrigatória";
    }
    if (includeMatricula) {
      if (matricula <= 0) return "Valor da matrícula é obrigatório";
      if (!matriculaDueDate) return "Data de vencimento da matrícula é obrigatória";
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!contract) return;
    const err = validate();
    if (err) {
      toast({ title: "Atenção", description: err, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      // Buscar maior installment_number atual desse contrato
      const { data: existing } = await supabase
        .from("payments")
        .select("installment_number")
        .eq("contract_id", contract.id)
        .order("installment_number", { ascending: false })
        .limit(1);
      let nextNum = ((existing?.[0]?.installment_number as number) || 0) + 1;

      const toInsert: any[] = [];

      // Mensalidades
      for (let i = 0; i < numInst; i++) {
        toInsert.push({
          unit_id: contract.unit_id,
          contract_id: contract.id,
          responsible_id: contract.responsible_id,
          student_id: contract.student_id,
          installment_number: nextNum++,
          due_date: format(dates[i], "yyyy-MM-dd"),
          value: finalParc,
          original_value: real,
          punctuality_discount: desc,
          final_value: finalParc,
          status: "PENDING",
          payment_method: paymentMethod,
          gateway: paymentMethod === "BOLETO" ? gateway : null,
          payment_type: "MENSALIDADE",
          description: contract.description + (notes ? ` — ${notes}` : ""),
        });
      }

      // Apostilas
      if (includeApostilas && apostilasCount > 0 && apostilasTotalV > 0 && apostilasStartDate) {
        const base = new Date(apostilasStartDate + "T12:00:00");
        const day = base.getDate();
        for (let i = 0; i < apostilasCount; i++) {
          const m = addMonths(base, i * apostilasIntervalM);
          const last = lastDayOfMonth(m).getDate();
          const d = setDateFns(m, Math.min(day, last));
          let parc = Math.floor(apostilaParc * 100) / 100;
          if (i === apostilasCount - 1) {
            parc = Math.round((apostilasTotalV - parc * (apostilasCount - 1)) * 100) / 100;
          }
          toInsert.push({
            unit_id: contract.unit_id,
            contract_id: contract.id,
            responsible_id: contract.responsible_id,
            student_id: contract.student_id,
            installment_number: nextNum++,
            due_date: format(d, "yyyy-MM-dd"),
            value: parc,
            original_value: parc,
            final_value: parc,
            status: "PENDING",
            payment_method: paymentMethod,
            gateway: paymentMethod === "BOLETO" ? gateway : null,
            payment_type: "APOSTILA",
            description: `Apostila ${i + 1}/${apostilasCount}`,
          });
        }
      }

      // Matrícula
      if (includeMatricula && matricula > 0 && matriculaDueDate) {
        toInsert.push({
          unit_id: contract.unit_id,
          contract_id: contract.id,
          responsible_id: contract.responsible_id,
          student_id: contract.student_id,
          installment_number: nextNum++,
          due_date: matriculaDueDate,
          value: matricula,
          original_value: matricula,
          final_value: matricula,
          status: "PENDING",
          payment_method: paymentMethod,
          gateway: paymentMethod === "BOLETO" ? gateway : null,
          payment_type: "MATRICULA",
          description: matriculaDescription || "Matrícula",
        });
      }

      if (toInsert.length === 0) {
        toast({ title: "Nada a inserir", variant: "destructive" });
        setSubmitting(false);
        return;
      }

      const { data: inserted, error: insErr } = await supabase
        .from("payments")
        .insert(toInsert)
        .select("id, value, due_date, description, payment_type, stock_item_id, stock_quantity");

      if (insErr) throw insErr;

      toast({
        title: "Parcelas adicionadas",
        description: `${inserted?.length ?? 0} cobrança(s) criada(s) no contrato.`,
      });

      // Geração automática no gateway escolhido (best effort)
      if (generateAsaas && inserted && inserted.length > 0) {
        if (paymentMethod === "BOLETO" && gateway === "CORA") {
          toast({
            title: "Boletos Cora salvos localmente",
            description: "A geração automática via API Cora ainda não está disponível. Os boletos foram salvos como pendentes.",
          });
        } else {
          toast({ title: "Gerando cobranças no Asaas...", description: "Pode levar alguns segundos." });
          let ok = 0;
          let fail = 0;
          for (const p of inserted) {
          try {
            const { error: chErr } = await supabase.functions.invoke("create-asaas-charge", {
              body: {
                responsible_id: contract.responsible_id,
                student_id: contract.student_id,
                contract_id: contract.id,
                value: Number(p.value),
                due_date: p.due_date,
                billing_type: paymentMethod,
                description: p.description,
                payment_type: p.payment_type,
                stock_item_id: p.stock_item_id || undefined,
                stock_quantity: p.stock_quantity || undefined,
                _local_payment_id: p.id,
              },
            });
            if (chErr) {
              fail++;
            } else {
              ok++;
              // Remover o registro local duplicado (a edge function cria o seu próprio)
              await supabase.from("payments").delete().eq("id", p.id);
            }
          } catch {
            fail++;
          }
        }
        toast({
          title: "Sincronização Asaas concluída",
          description: `${ok} gerada(s) no Asaas${fail ? `, ${fail} falha(s) — mantidas como locais` : ""}.`,
        });
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao adicionar parcelas", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Plus size={18} className="text-primary" />
            Adicionar Parcelas / Taxas
            {contract?.contract_number && (
              <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                #{contract.contract_number}
              </span>
            )}
          </DialogTitle>
          {contract && (
            <p className="text-xs text-muted-foreground">{contract.description}</p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {/* Dados Financeiros */}
          <div className="space-y-2">
            <Label className="text-foreground text-sm font-semibold">Método de Pagamento</Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
              <SelectTrigger className="bg-input border-border text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BOLETO">Boleto</SelectItem>
                <SelectItem value="PIX">Pix</SelectItem>
                <SelectItem value="CARD">Cartão de Crédito</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator className="bg-border" />

          {/* Parcelamento */}
          <div className="space-y-3">
            <Label className="text-foreground text-sm font-semibold">Parcelamento (Mensalidades)</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Data do 1º Vencimento</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start bg-input border-border text-foreground", !firstDueDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {firstDueDate ? format(new Date(firstDueDate + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={firstDueDate ? new Date(firstDueDate + "T12:00:00") : undefined}
                      onSelect={(d) => d && setFirstDueDate(format(d, "yyyy-MM-dd"))}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Nº de novas parcelas</Label>
                <Input className="bg-input border-border text-foreground" type="number" min="0" value={installments} onChange={(e) => setInstallments(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Valor real / mensalidade</Label>
                <Input className="bg-input border-border text-foreground" placeholder="0,00" value={realValue} onChange={(e) => setRealValue(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Desconto pontualidade</Label>
                <Input className="bg-input border-border text-foreground" placeholder="0,00" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
            </div>
            {numInst > 0 && real > 0 && (
              <div className="rounded-md border border-border bg-muted/30 p-2 text-xs space-y-0.5">
                <p className="text-muted-foreground">Parcela sem desconto: <span className="font-semibold text-foreground">{fmt(real)}</span></p>
                {desc > 0 && <p className="text-muted-foreground">Desconto/parcela: <span className="font-semibold text-destructive">-{fmt(desc)}</span></p>}
                <p className="text-muted-foreground">Valor final/parcela: <span className="font-semibold text-primary">{fmt(finalParc)}</span></p>
                <p className="text-muted-foreground">Total ({numInst}x): <span className="font-semibold text-primary">{fmt(finalParc * numInst)}</span></p>
              </div>
            )}
          </div>

          <Separator className="bg-border" />

          {/* Apostilas */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox id="apost-add" checked={includeApostilas} onCheckedChange={(v) => setIncludeApostilas(!!v)} />
              <Label htmlFor="apost-add" className="text-foreground text-sm font-semibold cursor-pointer">Incluir parcelas de apostilas</Label>
            </div>
            {includeApostilas && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Valor total apostilas</Label>
                  <Input className="bg-input border-border text-foreground" placeholder="0,00" value={apostilasTotal} onChange={(e) => setApostilasTotal(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Quantidade de parcelas</Label>
                  <Input className="bg-input border-border text-foreground" type="number" min="1" value={apostilasQty} onChange={(e) => setApostilasQty(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">1º vencimento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start bg-input border-border text-foreground", !apostilasStartDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {apostilasStartDate ? format(new Date(apostilasStartDate + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={apostilasStartDate ? new Date(apostilasStartDate + "T12:00:00") : undefined}
                        onSelect={(d) => d && setApostilasStartDate(format(d, "yyyy-MM-dd"))}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Intervalo (meses)</Label>
                  <Input className="bg-input border-border text-foreground" type="number" min="1" value={apostilasInterval} onChange={(e) => setApostilasInterval(e.target.value)} />
                </div>
                {apostilasTotalV > 0 && apostilasCount > 0 && (
                  <div className="col-span-2 rounded-md border border-border bg-muted/30 p-2 text-xs">
                    <p className="text-muted-foreground">Valor por parcela: <span className="font-semibold text-primary">{fmt(apostilaParc)}</span></p>
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator className="bg-border" />

          {/* Matrícula */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox id="matr-add" checked={includeMatricula} onCheckedChange={(v) => setIncludeMatricula(!!v)} />
              <Label htmlFor="matr-add" className="text-foreground text-sm font-semibold cursor-pointer">Incluir taxa de matrícula/rematrícula</Label>
            </div>
            {includeMatricula && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Valor</Label>
                  <Input className="bg-input border-border text-foreground" placeholder="0,00" value={matriculaValue} onChange={(e) => setMatriculaValue(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Vencimento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start bg-input border-border text-foreground", !matriculaDueDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {matriculaDueDate ? format(new Date(matriculaDueDate + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={matriculaDueDate ? new Date(matriculaDueDate + "T12:00:00") : undefined}
                        onSelect={(d) => d && setMatriculaDueDate(format(d, "yyyy-MM-dd"))}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground">Descrição</Label>
                  <Input className="bg-input border-border text-foreground" value={matriculaDescription} onChange={(e) => setMatriculaDescription(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <Separator className="bg-border" />

          {/* Observações */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Observações</Label>
            <Textarea className="bg-input border-border text-foreground" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="gen-asaas" checked={generateAsaas} onCheckedChange={(v) => setGenerateAsaas(!!v)} />
            <Label htmlFor="gen-asaas" className="text-xs text-foreground cursor-pointer">
              Gerar cobranças no Asaas automaticamente após salvar
            </Label>
          </div>

          {/* Preview parcelas */}
          {dates.length > 0 && finalParc > 0 && (
            <div className="rounded-md border border-border bg-muted/20 p-2">
              <p className="text-xs font-semibold text-foreground mb-1">Preview de mensalidades</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                {dates.map((d, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-muted-foreground">Parcela {i + 1}: {format(d, "dd/MM/yyyy")}</span>
                    <span className="font-medium text-primary">{fmt(finalParc)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" className="border-border" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 size={14} className="animate-spin mr-2" /> : <Plus size={14} className="mr-2" />}
            Adicionar Parcelas
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddContractInstallmentsDialog;
