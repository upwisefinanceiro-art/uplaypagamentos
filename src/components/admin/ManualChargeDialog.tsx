import { useState, useMemo, useEffect } from "react";
import { Loader2, Plus, BookOpen, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type PaymentType = "MENSALIDADE" | "APOSTILA" | "AVULSA";

interface ResponsibleRow {
  id: string;
  full_name: string;
  unit_id: string | null;
  active: boolean;
  phone: string | null;
}

interface StudentRow {
  id: string;
  full_name: string;
  responsible_id: string;
}

interface ContractRow {
  id: string;
  description: string;
  responsible_id: string;
  student_id: string;
  unit_id: string;
  status: string;
}

interface UnitRow {
  id: string;
  name: string;
}

interface ApostilaItem {
  name: string;
}

interface ManualChargeDialogProps {
  responsibles: ResponsibleRow[];
  students: StudentRow[];
  contracts: ContractRow[];
  units: UnitRow[];
  profiles: Record<string, ResponsibleRow>;
  onSuccess: () => void;
  prefill?: {
    responsibleId?: string;
    contractId?: string;
    studentId?: string;
    paymentType?: PaymentType;
    description?: string;
  };
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
}

const clampDay = (year: number, month: number, day: number) => {
  const maxDay = new Date(year, month + 1, 0).getDate();
  return Math.min(day, maxDay);
};

const generateDueDates = (firstDueDate: string, count: number): string[] => {
  if (!firstDueDate || count <= 0) return [];
  const first = new Date(firstDueDate + "T12:00:00");
  const dueDay = first.getDate();
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const y = first.getFullYear();
    const m = first.getMonth() + i;
    const targetYear = y + Math.floor(m / 12);
    const targetMonth = m % 12;
    const day = clampDay(targetYear, targetMonth, dueDay);
    const d = new Date(targetYear, targetMonth, day);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
};

const generateApostilaDates = (startDate: string, count: number, intervalMonths: number): string[] => {
  if (!startDate || count <= 0) return [];
  const first = new Date(startDate + "T12:00:00");
  const dueDay = first.getDate();
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const y = first.getFullYear();
    const m = first.getMonth() + i * intervalMonths;
    const targetYear = y + Math.floor(m / 12);
    const targetMonth = m % 12;
    const day = clampDay(targetYear, targetMonth, dueDay);
    const d = new Date(targetYear, targetMonth, day);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
};

const formatCurrency = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const formatDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR");

const parseBRL = (v: string): number => {
  if (!v) return 0;
  // Remove dots used as thousands separator, replace comma with dot
  const cleaned = v.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
};

const APOSTILAS_INFORMATICA = [
  "Apostila de Windows 11",
  "Apostila de Word",
  "Apostila de Excel",
  "Apostila de PowerPoint",
  "Apostila de Access",
];

const APOSTILAS_INGLES_KIDS = [
  "Apostila de Inglês Kids",
];

const ManualChargeDialog = ({
  responsibles,
  students,
  contracts,
  units,
  profiles,
  onSuccess,
  prefill,
  externalOpen,
  onExternalOpenChange,
}: ManualChargeDialogProps) => {
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const isControlled = externalOpen !== undefined;
  const dialogOpen = isControlled ? externalOpen : open;
  const setDialogOpen = (v: boolean) => {
    if (isControlled) onExternalOpenChange?.(v);
    else setOpen(v);
  };

  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Form state
  const [responsibleId, setResponsibleId] = useState("");
  const [contractId, setContractId] = useState("NONE");
  const [studentId, setStudentId] = useState("NONE");
  const [paymentType, setPaymentType] = useState<PaymentType>("AVULSA");
  const [description, setDescription] = useState("");

  // Financial
  const [installments, setInstallments] = useState("1");
  const [firstDueDate, setFirstDueDate] = useState("");
  const [realValue, setRealValue] = useState("");
  const [discount, setDiscount] = useState("0");

  // Apostilas
  const [apostilasEnabled, setApostilasEnabled] = useState(false);
  const [apostilasTotalValue, setApostilasTotalValue] = useState("");
  const [apostilasQty, setApostilasQty] = useState("1");
  const [apostilasInterval, setApostilasInterval] = useState("3");
  const [apostilasStartDate, setApostilasStartDate] = useState("");
  const [apostilaItems, setApostilaItems] = useState<ApostilaItem[]>([{ name: "" }]);

  // Derived
  const numInstallments = Math.max(1, parseInt(installments) || 1);
  const numRealValue = parseBRL(realValue);
  const numDiscount = parseBRL(discount);
  const finalValue = Math.max(0, numRealValue - numDiscount);

  const numApostilasQty = Math.max(1, parseInt(apostilasQty) || 1);
  const numApostilasTotalValue = parseBRL(apostilasTotalValue);
  const apostilaUnitValue = numApostilasQty > 0 ? numApostilasTotalValue / numApostilasQty : 0;
  const numApostilasInterval = Math.max(1, parseInt(apostilasInterval) || 3);

  const dueDates = useMemo(
    () => generateDueDates(firstDueDate, numInstallments),
    [firstDueDate, numInstallments]
  );

  const apostilaDates = useMemo(
    () => apostilasEnabled ? generateApostilaDates(apostilasStartDate, numApostilasQty, numApostilasInterval) : [],
    [apostilasEnabled, apostilasStartDate, numApostilasQty, numApostilasInterval]
  );

  const filteredContracts = responsibleId
    ? contracts.filter((c) => c.responsible_id === responsibleId)
    : [];
  const filteredStudents = responsibleId
    ? students.filter((s) => s.responsible_id === responsibleId)
    : [];

  const unitMap = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u.name])), [units]);
  const currentUnit = responsibleId ? unitMap[profiles[responsibleId]?.unit_id || ""] || "—" : "—";

  // Apply prefill
  useEffect(() => {
    if (dialogOpen && prefill) {
      if (prefill.responsibleId) setResponsibleId(prefill.responsibleId);
      if (prefill.contractId) setContractId(prefill.contractId);
      if (prefill.studentId) setStudentId(prefill.studentId);
      if (prefill.paymentType) setPaymentType(prefill.paymentType);
      if (prefill.description) setDescription(prefill.description);
    }
  }, [dialogOpen, prefill]);

  // Auto-detect course type and pre-fill apostilas
  useEffect(() => {
    const desc = description.toLowerCase().trim();
    const isInformatica = desc.includes("informática") || desc.includes("informatica");
    const isInglesKids = desc.includes("inglês kids") || desc.includes("ingles kids");

    if (isInformatica) {
      setApostilasEnabled(true);
      setApostilasQty(String(APOSTILAS_INFORMATICA.length));
      setApostilaItems(APOSTILAS_INFORMATICA.map((name) => ({ name })));
    } else if (isInglesKids) {
      setApostilasEnabled(true);
      setApostilasQty(String(APOSTILAS_INGLES_KIDS.length));
      setApostilaItems(APOSTILAS_INGLES_KIDS.map((name) => ({ name })));
    }
  }, [description]);

  // Sync apostila items count with qty (only when not auto-filled by course detection)
  useEffect(() => {
    const desc = description.toLowerCase().trim();
    const isInformatica = desc.includes("informática") || desc.includes("informatica");
    const isInglesKids = desc.includes("inglês kids") || desc.includes("ingles kids");
    // Skip sync if course type auto-fills
    if (isInformatica || isInglesKids) return;

    setApostilaItems((prev) => {
      if (prev.length === numApostilasQty) return prev;
      if (prev.length < numApostilasQty) {
        return [...prev, ...Array(numApostilasQty - prev.length).fill(null).map(() => ({ name: "" }))];
      }
      return prev.slice(0, numApostilasQty);
    });
  }, [numApostilasQty, description]);

  const resetForm = () => {
    setResponsibleId("");
    setContractId("NONE");
    setStudentId("NONE");
    setPaymentType("AVULSA");
    setDescription("");
    setInstallments("1");
    setFirstDueDate("");
    setRealValue("");
    setDiscount("0");
    setApostilasEnabled(false);
    setApostilasTotalValue("");
    setApostilasQty("1");
    setApostilasInterval("3");
    setApostilasStartDate("");
    setApostilaItems([{ name: "" }]);
    setShowPreview(false);
  };

  const handleSave = async () => {
    if (!responsibleId || !realValue || !firstDueDate || !description.trim()) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    if (numRealValue <= 0) {
      toast({ title: "Valor deve ser maior que zero", variant: "destructive" });
      return;
    }

    setSaving(true);
    let hadError = false;

    // Create installment payments
    for (let i = 0; i < dueDates.length; i++) {
      const { data, error } = await supabase.functions.invoke("manage-payment", {
        body: {
          action: "create_manual",
          responsible_id: responsibleId,
          student_id: studentId !== "NONE" ? studentId : null,
          contract_id: contractId !== "NONE" ? contractId : null,
          payment_type: paymentType,
          description: `${description.trim()} - Parcela ${i + 1}/${dueDates.length}`,
          value: finalValue,
          due_date: dueDates[i],
        },
      });
      if (error || data?.error) {
        hadError = true;
        toast({
          title: `Erro na parcela ${i + 1}`,
          description: error?.message || data?.error,
          variant: "destructive",
        });
        break;
      }
    }

    // Create apostila payments
    if (!hadError && apostilasEnabled && apostilaDates.length > 0) {
      for (let i = 0; i < apostilaDates.length; i++) {
        const apostilaName = apostilaItems[i]?.name?.trim() || `Apostila ${i + 1}`;
        const { data, error } = await supabase.functions.invoke("manage-payment", {
          body: {
            action: "create_manual",
            responsible_id: responsibleId,
            student_id: studentId !== "NONE" ? studentId : null,
            contract_id: contractId !== "NONE" ? contractId : null,
            payment_type: "APOSTILA",
            description: apostilaName,
            value: apostilaUnitValue,
            due_date: apostilaDates[i],
          },
        });
        if (error || data?.error) {
          hadError = true;
          toast({
            title: `Erro na apostila ${i + 1}`,
            description: error?.message || data?.error,
            variant: "destructive",
          });
          break;
        }
      }
    }

    setSaving(false);

    if (!hadError) {
      toast({ title: "Parcelas criadas com sucesso!" });
      setDialogOpen(false);
      resetForm();
      onSuccess();
    }
  };

  const totalMensalidades = finalValue * numInstallments;
  const totalApostilas = apostilasEnabled ? numApostilasTotalValue : 0;
  const totalGeral = totalMensalidades + totalApostilas;

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(v) => {
        setDialogOpen(v);
        if (!v) resetForm();
      }}
    >
      {!isControlled && (
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-1.5">
            <Plus size={16} /> Adicionar Parcela Manual
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Parcela Manual</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* ── RESPONSÁVEL ── */}
          <div className="space-y-1.5">
            <Label>Responsável *</Label>
            <Select
              value={responsibleId}
              onValueChange={(v) => {
                setResponsibleId(v);
                setStudentId("NONE");
                setContractId("NONE");
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
              <SelectContent>
                {responsibles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Contrato vinculado</Label>
              <Select
                value={contractId}
                onValueChange={(v) => {
                  const c = contracts.find((x) => x.id === v);
                  setContractId(v);
                  if (c?.student_id) setStudentId(c.student_id);
                  if (c?.description) setDescription(c.description);
                  if (v !== "NONE") setPaymentType("MENSALIDADE");
                }}
              >
                <SelectTrigger><SelectValue placeholder="Sem contrato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Sem contrato</SelectItem>
                  {filteredContracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Aluno</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="Sem aluno" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Sem aluno</SelectItem>
                  {filteredStudents.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={paymentType} onValueChange={(v) => setPaymentType(v as PaymentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MENSALIDADE">Mensalidade</SelectItem>
                  <SelectItem value="APOSTILA">Apostila</SelectItem>
                  <SelectItem value="AVULSA">Avulsa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Input value={currentUnit} readOnly className="bg-muted/40" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Mensalidade EnsinUP 2025"
            />
          </div>

          <Separator />

          {/* ── PARCELAMENTO ── */}
          <div>
            <h3 className="text-sm font-bold text-foreground mb-3">📋 Parcelamento</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nº de Parcelas *</Label>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  value={installments}
                  onChange={(e) => setInstallments(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data do 1º Vencimento *</Label>
                <Input
                  type="date"
                  value={firstDueDate}
                  onChange={(e) => setFirstDueDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 mt-4">
              <div className="space-y-1.5">
                <Label>Valor Real por Mensalidade *</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={realValue}
                  onChange={(e) => setRealValue(e.target.value)}
                  placeholder="219,90"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Desc. Pontualidade</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="30,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Valor Final por Mensalidade</Label>
                <div className="h-10 flex items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-semibold text-primary">
                  {formatCurrency(finalValue)}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* ── APOSTILAS ── */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <Checkbox
                id="apostilas"
                checked={apostilasEnabled}
                onCheckedChange={(v) => setApostilasEnabled(!!v)}
              />
              <label htmlFor="apostilas" className="text-sm font-bold text-foreground flex items-center gap-2 cursor-pointer">
                <BookOpen size={16} className="text-primary" />
                Incluir parcelas de apostilas
              </label>
            </div>

            {apostilasEnabled && (
              <div className="space-y-4 pl-1 border-l-2 border-primary/20 ml-2 mt-2">
                <div className="grid gap-4 sm:grid-cols-2 pl-4">
                  <div className="space-y-1.5">
                    <Label>Valor Total das Apostilas</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={apostilasTotalValue}
                      onChange={(e) => setApostilasTotalValue(e.target.value)}
                      placeholder="450,00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Qtd. de Apostilas</Label>
                    <Input
                      type="number"
                      min="1"
                      max="24"
                      value={apostilasQty}
                      onChange={(e) => setApostilasQty(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 pl-4">
                  <div className="space-y-1.5">
                    <Label>Intervalo (meses)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="12"
                      value={apostilasInterval}
                      onChange={(e) => setApostilasInterval(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Data 1º Venc. Apostila</Label>
                    <Input
                      type="date"
                      value={apostilasStartDate}
                      onChange={(e) => setApostilasStartDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="pl-4 space-y-1.5">
                  <Label>Valor Unitário (calculado)</Label>
                  <div className="h-10 flex items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-semibold text-primary">
                    {formatCurrency(apostilaUnitValue)}
                  </div>
                </div>

                {/* Apostila names */}
                <div className="pl-4 space-y-2">
                  <Label>Nome de cada apostila</Label>
                  {apostilaItems.map((item, i) => (
                    <Input
                      key={i}
                      value={item.name}
                      onChange={(e) => {
                        const updated = [...apostilaItems];
                        updated[i] = { name: e.target.value };
                        setApostilaItems(updated);
                      }}
                      placeholder={`Apostila ${i + 1}`}
                      className="text-sm"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* ── PRÉVIA ── */}
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 mb-3"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
              {showPreview ? "Ocultar prévia" : "Ver prévia do cronograma"}
            </Button>

            {showPreview && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Resumo</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Parcelas</p>
                      <p className="font-semibold">{numInstallments}x {formatCurrency(finalValue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Total Mensalidades</p>
                      <p className="font-semibold">{formatCurrency(totalMensalidades)}</p>
                    </div>
                    {apostilasEnabled && (
                      <>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Apostilas</p>
                          <p className="font-semibold">{numApostilasQty}x {formatCurrency(apostilaUnitValue)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Total Apostilas</p>
                          <p className="font-semibold">{formatCurrency(totalApostilas)}</p>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="border-t border-border pt-2 mt-2">
                    <p className="text-[10px] text-muted-foreground">Total Geral</p>
                    <p className="text-lg font-bold text-primary">{formatCurrency(totalGeral)}</p>
                  </div>
                </div>

                {/* Mensalidades schedule */}
                {dueDates.length > 0 && (
                  <div className="rounded-lg border border-border bg-secondary/30 p-3">
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Cronograma - Mensalidades</h4>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {dueDates.map((d, i) => (
                        <div key={i} className="flex justify-between text-sm py-1 border-b border-border/50 last:border-0">
                          <span className="text-muted-foreground">Parcela {i + 1}</span>
                          <span className="text-foreground">{formatDate(d)}</span>
                          <span className="font-medium text-primary">{formatCurrency(finalValue)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Apostilas schedule */}
                {apostilasEnabled && apostilaDates.length > 0 && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Cronograma - Apostilas</h4>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {apostilaDates.map((d, i) => (
                        <div key={i} className="flex justify-between text-sm py-1 border-b border-border/50 last:border-0">
                          <span className="text-muted-foreground">{apostilaItems[i]?.name?.trim() || `Apostila ${i + 1}`}</span>
                          <span className="text-foreground">{formatDate(d)}</span>
                          <span className="font-medium text-primary">{formatCurrency(apostilaUnitValue)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── SAVE ── */}
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? (
              <><Loader2 size={16} className="animate-spin mr-2" /> Criando parcelas...</>
            ) : (
              `Salvar ${numInstallments} parcela(s)${apostilasEnabled ? ` + ${numApostilasQty} apostila(s)` : ""}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ManualChargeDialog;
