import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Loader2, UserPlus, UserCheck, Save, Trash2, ExternalLink, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ContractRow {
  id: string;
  description: string;
  responsible_name: string | null;
  cpf: string | null;
  course_real_value: number | null;
  punctuality_discount: number | null;
  final_value_with_discount: number | null;
  total_value: number;
  installments: number;
  first_due_date: string | null;
  start_date: string;
  status: string;
  payment_method: string | null;
  unit_id: string;
  responsible_id: string;
  student_id: string;
  units: { name: string } | null;
  students: { full_name: string } | null;
}

interface StudentRow {
  id: string;
  full_name: string;
  responsible_id: string;
  unit_id: string;
}

interface ResponsibleRow {
  id: string;
  full_name: string;
  cpf: string;
  phone: string | null;
  unit_id: string | null;
  asaas_customer_id: string | null;
}

interface UnitRow {
  id: string;
  name: string;
}

const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
];

function validarCPF(cpf: string): boolean {
  const c = cpf.replace(/\D/g, "");
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(c[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== parseInt(c[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(c[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  return rest === parseInt(c[10]);
}

function validarEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseMoneyInput(value: string): number {
  const normalized = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

const AdminContracts = () => {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [responsibles, setResponsibles] = useState<ResponsibleRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"form" | "summary">("form");
  const [deleteTarget, setDeleteTarget] = useState<ContractRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const { profile, hasRole } = useAuth();

  // Responsible mode
  const [responsibleMode, setResponsibleMode] = useState<"new" | "existing">("new");

  // Form state
  const [responsibleId, setResponsibleId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [responsibleName, setResponsibleName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [rg, setRg] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [unitId, setUnitId] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [firstDueDate, setFirstDueDate] = useState("");
  const [courseRealValue, setCourseRealValue] = useState("");
  const [punctualityDiscount, setPunctualityDiscount] = useState("0");
  const [installments, setInstallments] = useState("1");
  const [dueDay, setDueDay] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [password, setPassword] = useState("");
  const [saveResponsibleToBase, setSaveResponsibleToBase] = useState(false);

  // Apostilas state
  const [includeApostilas, setIncludeApostilas] = useState(false);
  const [apostilasTotal, setApostilasTotal] = useState("");
  const [apostilasQty, setApostilasQty] = useState("1");
  const [apostilasStartDate, setApostilasStartDate] = useState("");
  const [apostilasInterval, setApostilasInterval] = useState("3");

  const selectedResponsible = responsibles.find(r => r.id === responsibleId);
  const selectedStudent = students.find(s => s.id === studentId);
  const resolvedUnitId = responsibleMode === "existing" ? (selectedResponsible?.unit_id || "") : unitId;
  const unitName = units.find(u => u.id === resolvedUnitId)?.name || "";

  const filteredStudents = useMemo(() => {
    if (!responsibleId || responsibleMode !== "existing") return [];
    return students.filter(s => s.responsible_id === responsibleId);
  }, [responsibleId, responsibleMode, students]);

  // valor_real = valor unitário por mensalidade (NÃO é total do curso)
  const realValue = parseMoneyInput(courseRealValue);
  const discount = parseMoneyInput(punctualityDiscount);
  const finalValue = Math.max(0, realValue - discount);
  const numInstallments = parseInt(installments) || 0;
  // Cada mensalidade mantém exatamente o valor informado, sem divisão
  const installmentRealValue = realValue;
  const installmentFinalValue = finalValue;
  const installmentDiscount = discount;
  const courseTotalWithoutDiscount = installmentRealValue * numInstallments;
  const courseTotalWithDiscount = installmentFinalValue * numInstallments;

  // Apostilas computed
  const apostilasTotalValue = parseMoneyInput(apostilasTotal);
  const apostilasCount = parseInt(apostilasQty) || 0;
  const apostilasIntervalMonths = parseInt(apostilasInterval) || 3;
  const apostilasInstallmentValue = apostilasTotalValue > 0 && apostilasCount > 0 ? apostilasTotalValue / apostilasCount : 0;

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [contractsRes, studentsRes, responsiblesRes, unitsRes] = await Promise.all([
      supabase.from("contracts").select("*, units(name), students(full_name)").order("created_at", { ascending: false }),
      supabase.from("students").select("id, full_name, responsible_id, unit_id").eq("active", true),
      supabase.from("profiles").select("id, full_name, cpf, phone, unit_id, asaas_customer_id").eq("active", true),
      supabase.from("units").select("id, name").eq("active", true),
    ]);
    if (contractsRes.data) setContracts(contractsRes.data as any);
    if (studentsRes.data) setStudents(studentsRes.data);
    if (responsiblesRes.data) setResponsibles(responsiblesRes.data as any);
    if (unitsRes.data) setUnits(unitsRes.data);
    setLoading(false);
  };

  const handleResponsibleChange = (id: string) => {
    setResponsibleId(id);
    setStudentId("");
    const resp = responsibles.find(r => r.id === id);
    if (resp) {
      setResponsibleName(resp.full_name);
      setCpf(resp.cpf || "");
      setPhone(resp.phone || "");
    }
  };

  const resetForm = () => {
    setResponsibleMode("new"); setResponsibleId(""); setStudentId("");
    setResponsibleName(""); setBirthDate(""); setRg(""); setCpf("");
    setPhone(""); setEmail(""); setAddress(""); setAddressNumber("");
    setComplement(""); setNeighborhood(""); setCity(""); setState("");
    setZipCode(""); setUnitId(""); setDescription(""); setStartDate("");
    setFirstDueDate(""); setCourseRealValue(""); setPunctualityDiscount("0");
    setInstallments("1"); setDueDay(""); setPaymentMethod(""); setNotes("");
    setPassword(""); setStep("form"); setSaveResponsibleToBase(false);
    setIncludeApostilas(false); setApostilasTotal(""); setApostilasQty("1");
    setApostilasStartDate(""); setApostilasInterval("3");
  };

  const validateForm = (): string | null => {
    if (!responsibleName.trim()) return "Nome do responsável é obrigatório";
    if (!birthDate) return "Data de nascimento é obrigatória";
    if (!cpf.trim()) return "CPF é obrigatório";
    if (!validarCPF(cpf)) return "CPF inválido";
    if (!rg.trim()) return "RG é obrigatório";
    if (!phone.trim()) return "Telefone é obrigatório";
    if (!email.trim()) return "E-mail é obrigatório";
    if (!validarEmail(email)) return "E-mail inválido";
    if (!address.trim()) return "Logradouro é obrigatório";
    if (!addressNumber.trim()) return "Número é obrigatório";
    if (!neighborhood.trim()) return "Bairro é obrigatório";
    if (!city.trim()) return "Cidade é obrigatória";
    if (!state) return "Estado é obrigatório";
    if (!zipCode.trim()) return "CEP é obrigatório";
    if (!resolvedUnitId) return "Unidade é obrigatória";
    if (responsibleMode === "existing" && !studentId) return "Selecione o aluno";
    if (responsibleMode === "new" && saveResponsibleToBase && !password.trim()) return "Senha do responsável é obrigatória para salvar na base";
    if (!description.trim()) return "Curso/descrição é obrigatório";
    if (!startDate) return "Data de início é obrigatória";
    if (!firstDueDate) return "Data do 1º vencimento é obrigatória";
    if (!paymentMethod) return "Método de pagamento é obrigatório";
    if (!courseRealValue || realValue <= 0) return "Valor real do curso é obrigatório";
    if (numInstallments <= 0) return "Nº de parcelas deve ser maior que zero";
    if (includeApostilas) {
      if (!apostilasTotal || apostilasTotalValue <= 0) return "Valor total das apostilas é obrigatório";
      if (apostilasCount <= 0) return "Quantidade de parcelas de apostilas é obrigatória";
      if (!apostilasStartDate) return "Data do 1º vencimento das apostilas é obrigatória";
    }
    return null;
  };

  const handleProceedToSummary = () => {
    const err = validateForm();
    if (err) {
      toast({ title: "Dados incompletos", description: err, variant: "destructive" });
      return;
    }
    setStep("summary");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let finalResponsibleId = responsibleId;

      // If new responsible AND user wants to save to base, create via edge function
      if (responsibleMode === "new" && saveResponsibleToBase) {
        const { data: fnData, error: fnErr } = await supabase.functions.invoke("create-user", {
          body: {
            cpf: cpf.replace(/\D/g, ""),
            full_name: responsibleName,
            phone,
            password,
            role: "RESPONSAVEL",
            unit_id: unitId,
          },
        });
        if (fnErr) throw new Error(fnErr.message || "Erro ao criar responsável");
        if (fnData?.error) throw new Error(fnData.error);
        finalResponsibleId = fnData.user_id;
      }

      // If new mode but NOT saving to base, we need a placeholder responsible_id
      // We'll use a dummy UUID that links the contract data via snapshot only
      if (responsibleMode === "new" && !saveResponsibleToBase) {
        // Use the current admin user as a placeholder responsible
        // The real data is in the contract snapshot fields
        const { data: { user } } = await supabase.auth.getUser();
        finalResponsibleId = user?.id || "";
      }

      if (!finalResponsibleId) throw new Error("ID do responsável não encontrado");

      const finalStudentId = responsibleMode === "existing" ? studentId : finalResponsibleId;

      // Insert contract (snapshot of all responsible data)
      const { data: contract, error: contractErr } = await supabase.from("contracts").insert({
        unit_id: resolvedUnitId,
        responsible_id: finalResponsibleId,
        student_id: finalStudentId,
        description,
        total_value: courseTotalWithoutDiscount,
        installments: numInstallments,
        start_date: startDate,
        first_due_date: firstDueDate,
        course_real_value: installmentRealValue,
        punctuality_discount: installmentDiscount,
        final_value_with_discount: installmentFinalValue,
        due_day: parseInt(dueDay) || parseInt(firstDueDate.split("-")[2]) || 1,
        payment_method: paymentMethod,
        responsible_name: responsibleName,
        birth_date: birthDate,
        rg,
        cpf: cpf.replace(/\D/g, ""),
        phone,
        email,
        address,
        address_number: addressNumber,
        complement,
        neighborhood,
        city,
        state,
        zip_code: zipCode,
        notes,
        status: "ACTIVE",
        apostilas_enabled: includeApostilas,
        apostilas_qty: includeApostilas ? apostilasCount : 0,
        apostilas_total_value: includeApostilas ? apostilasTotalValue : 0,
        apostilas_interval_months: includeApostilas ? apostilasIntervalMonths : 3,
        apostilas_start_date: includeApostilas && apostilasStartDate ? apostilasStartDate : null,
      } as any).select("id").single();

      if (contractErr) throw contractErr;

      // Generate course installments
      const baseDueDate = new Date(firstDueDate + "T12:00:00");
      const payments: any[] = [];
      for (let i = 0; i < numInstallments; i++) {
        const dueDate = new Date(baseDueDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        payments.push({
          contract_id: contract.id,
          unit_id: resolvedUnitId,
          responsible_id: finalResponsibleId,
          student_id: finalStudentId,
          installment_number: i + 1,
          due_date: dueDate.toISOString().split("T")[0],
          value: installmentFinalValue,
          original_value: installmentRealValue,
          punctuality_discount: installmentDiscount,
          final_value: installmentFinalValue,
          payment_method: paymentMethod,
          payment_type: "MENSALIDADE",
          description: `${description} - Parcela ${i + 1}/${numInstallments}`,
          status: "PENDING",
        });
      }

      // Generate apostilas installments (trimestral by default)
      if (includeApostilas && apostilasCount > 0 && apostilasTotalValue > 0 && apostilasStartDate) {
        const apostilasBase = new Date(apostilasStartDate + "T12:00:00");
        for (let i = 0; i < apostilasCount; i++) {
          const dueDate = new Date(apostilasBase);
          dueDate.setMonth(dueDate.getMonth() + (i * apostilasIntervalMonths));
          // Handle rounding: last installment gets remainder
          let parcValue = Math.floor(apostilasInstallmentValue * 100) / 100;
          if (i === apostilasCount - 1) {
            parcValue = Math.round((apostilasTotalValue - parcValue * (apostilasCount - 1)) * 100) / 100;
          }
          payments.push({
            contract_id: contract.id,
            unit_id: resolvedUnitId,
            responsible_id: finalResponsibleId,
            student_id: finalStudentId,
            installment_number: numInstallments + i + 1,
            due_date: dueDate.toISOString().split("T")[0],
            value: parcValue,
            original_value: parcValue,
            punctuality_discount: 0,
            final_value: parcValue,
            payment_method: paymentMethod,
            payment_type: "APOSTILA",
            description: `Apostila ${i + 1}/${apostilasCount}`,
            status: "PENDING",
          });
        }
      }

      const { error: paymentsErr } = await supabase.from("payments").insert(payments);
      if (paymentsErr) throw paymentsErr;

      const totalParcelas = payments.length;
      toast({ title: "Contrato criado!", description: `${totalParcelas} parcelas geradas com sucesso.` });
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      toast({ title: "Erro ao criar contrato", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContract = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    const { data, error } = await supabase.functions.invoke("manage-payment", {
      body: { action: "delete_contract", contract_id: deleteTarget.id },
    });

    setDeleting(false);

    if (error || data?.error) {
      toast({
        title: "Erro ao excluir contrato",
        description: error?.message || data?.error,
        variant: "destructive",
      });
      setDeleteTarget(null);
      return;
    }

    toast({
      title: "Contrato excluído",
      description: data?.message || "Contrato e parcelas removidos com sucesso.",
    });
    setDeleteTarget(null);
    fetchData();
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const renderResponsibleSection = () => (
    <div>
      <h3 className="text-sm font-semibold text-primary mb-3">A. Dados do Responsável</h3>
      <Tabs value={responsibleMode} onValueChange={(v) => { setResponsibleMode(v as any); setResponsibleId(""); setStudentId(""); }} className="mb-4">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="new" className="text-xs gap-1">
            <UserPlus size={14} /> Novo Responsável
          </TabsTrigger>
          <TabsTrigger value="existing" className="text-xs gap-1">
            <UserCheck size={14} /> Responsável Existente
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {responsibleMode === "existing" && (
        <div className="space-y-3 mb-3">
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Responsável *</Label>
            <Select value={responsibleId} onValueChange={handleResponsibleChange}>
              <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                {responsibles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.full_name} - {r.cpf}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {responsibleId && (
            <div className="space-y-1">
              <Label className="text-foreground text-xs">Aluno *</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="Selecione o aluno" /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {filteredStudents.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filteredStudents.length === 0 && (
                <p className="text-xs text-destructive">Nenhum aluno vinculado a este responsável.</p>
              )}
            </div>
          )}
        </div>
      )}

      {responsibleMode === "new" && (
        <div className="space-y-3 mb-3">
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Unidade *</Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                {units.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-md border border-border bg-muted/30">
            <Checkbox
              id="save-responsible"
              checked={saveResponsibleToBase}
              onCheckedChange={(checked) => setSaveResponsibleToBase(checked === true)}
            />
            <label htmlFor="save-responsible" className="text-xs text-foreground cursor-pointer flex items-center gap-1.5">
              <Save size={13} className="text-primary" />
              Salvar responsável na base (para reaproveitar depois)
            </label>
          </div>
          {saveResponsibleToBase && (
            <div className="space-y-1">
              <Label className="text-foreground text-xs">Senha de acesso do responsável *</Label>
              <Input className="bg-input border-border text-foreground" type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
          )}
        </div>
      )}

      {/* Personal data fields - shown in both modes (editable snapshot) */}
      <p className="text-xs font-medium text-muted-foreground mb-2">Dados Pessoais</p>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Nome Completo *</Label>
            <Input className="bg-input border-border text-foreground" value={responsibleName} onChange={e => setResponsibleName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Data de Nascimento *</Label>
            <Input className="bg-input border-border text-foreground" type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-foreground text-xs">CPF *</Label>
            <Input className="bg-input border-border text-foreground" placeholder="000.000.000-00" value={cpf} onChange={e => setCpf(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-foreground text-xs">RG / Identidade *</Label>
            <Input className="bg-input border-border text-foreground" value={rg} onChange={e => setRg(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Telefone *</Label>
            <Input className="bg-input border-border text-foreground" placeholder="(31) 99999-9999" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-foreground text-xs">E-mail *</Label>
            <Input className="bg-input border-border text-foreground" type="email" placeholder="email@exemplo.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );

  const renderAddressSection = () => (
    <div>
      <h3 className="text-sm font-semibold text-primary mb-3">B. Endereço</h3>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1">
            <Label className="text-foreground text-xs">Logradouro *</Label>
            <Input className="bg-input border-border text-foreground" value={address} onChange={e => setAddress(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Número *</Label>
            <Input className="bg-input border-border text-foreground" value={addressNumber} onChange={e => setAddressNumber(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Complemento</Label>
            <Input className="bg-input border-border text-foreground" value={complement} onChange={e => setComplement(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Bairro *</Label>
            <Input className="bg-input border-border text-foreground" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Cidade *</Label>
            <Input className="bg-input border-border text-foreground" value={city} onChange={e => setCity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Estado *</Label>
            <Select value={state} onValueChange={setState}>
              <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                {ESTADOS_BR.map(uf => (
                  <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-foreground text-xs">CEP *</Label>
            <Input className="bg-input border-border text-foreground" placeholder="00000-000" value={zipCode} onChange={e => setZipCode(e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );

  const renderFinancialSection = () => (
    <div>
      <h3 className="text-sm font-semibold text-primary mb-3">C. Dados Financeiros</h3>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-foreground text-xs">Curso / Descrição *</Label>
          <Input className="bg-input border-border text-foreground" placeholder="Ex: Informática Básica" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        {resolvedUnitId && (
          <div className="p-2 rounded-md bg-muted">
            <p className="text-xs text-muted-foreground">Unidade: <span className="font-semibold text-foreground">{unitName}</span></p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Data de Início *</Label>
            <Input className="bg-input border-border text-foreground" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Data do 1º Vencimento *</Label>
            <Input className="bg-input border-border text-foreground" type="date" value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-foreground text-xs">Método de Pagamento *</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="PIX">PIX</SelectItem>
              <SelectItem value="BOLETO">Boleto</SelectItem>
              <SelectItem value="CARD">Cartão</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  const renderInstallmentSection = () => (
    <div>
      <h3 className="text-sm font-semibold text-primary mb-3">D. Parcelamento</h3>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Nº de Parcelas (mensalidades) *</Label>
            <Input className="bg-input border-border text-foreground" type="number" min="1" value={installments} onChange={e => setInstallments(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Dia de Vencimento</Label>
            <Input className="bg-input border-border text-foreground" type="number" min="1" max="28" placeholder="Herda do 1º vencimento" value={dueDay} onChange={e => setDueDay(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Valor real por mensalidade *</Label>
            <Input className="bg-input border-border text-foreground" type="text" inputMode="decimal" placeholder="219,90" value={courseRealValue} onChange={e => setCourseRealValue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Desc. pontualidade por mensalidade</Label>
            <Input className="bg-input border-border text-foreground" type="text" inputMode="decimal" placeholder="30,00" value={punctualityDiscount} onChange={e => setPunctualityDiscount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Valor final por mensalidade</Label>
            <Input className="bg-input border-border text-foreground" readOnly value={fmt(finalValue)} />
          </div>
        </div>
        {realValue > 0 && numInstallments > 0 && (
          <div className="p-3 rounded-md bg-muted space-y-2">
            <p className="text-xs text-muted-foreground">Parcela sem desconto: <span className="font-semibold text-foreground">{fmt(installmentRealValue)}</span></p>
            {discount > 0 && (
              <p className="text-xs text-muted-foreground">Desc. pontualidade/parcela: <span className="font-semibold text-destructive">-{fmt(installmentDiscount)}</span></p>
            )}
            <p className="text-xs text-muted-foreground">Parcela com desconto: <span className="font-semibold text-primary">{fmt(installmentFinalValue)}</span></p>
            <p className="text-xs text-muted-foreground">Mensalidades geradas: <span className="font-semibold text-foreground">{numInstallments} parcelas com esses mesmos valores por parcela</span></p>
            <Separator />
            <p className="text-xs text-muted-foreground">Total sem desconto ({numInstallments}x): <span className="font-semibold text-foreground">{fmt(courseTotalWithoutDiscount)}</span></p>
            <p className="text-xs text-muted-foreground">Total com desconto ({numInstallments}x): <span className="font-semibold text-primary">{fmt(courseTotalWithDiscount)}</span></p>
          </div>
        )}
      </div>
    </div>
  );

  const renderApostilasSection = () => (
    <div>
      <h3 className="text-sm font-semibold text-primary mb-3">E. Apostilas</h3>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="include-apostilas"
            checked={includeApostilas}
            onCheckedChange={(checked) => setIncludeApostilas(checked === true)}
          />
          <label htmlFor="include-apostilas" className="text-xs text-foreground cursor-pointer">
            Incluir parcelas de apostilas no contrato
          </label>
        </div>

        {includeApostilas && (
          <div className="space-y-3 p-3 rounded-md border border-border bg-muted/30">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-foreground text-xs">Valor Total das Apostilas *</Label>
                <Input className="bg-input border-border text-foreground" type="text" inputMode="decimal" placeholder="0,00" value={apostilasTotal} onChange={e => setApostilasTotal(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-foreground text-xs">Quantidade de Parcelas *</Label>
                <Input className="bg-input border-border text-foreground" type="number" min="1" value={apostilasQty} onChange={e => setApostilasQty(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-foreground text-xs">Data do 1º Vencimento *</Label>
                <Input className="bg-input border-border text-foreground" type="date" value={apostilasStartDate} onChange={e => setApostilasStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-foreground text-xs">Intervalo entre parcelas (meses)</Label>
                <Input className="bg-input border-border text-foreground" type="number" min="1" max="12" value={apostilasInterval} onChange={e => setApostilasInterval(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Parcelas das apostilas geradas a cada {apostilasIntervalMonths} {apostilasIntervalMonths === 1 ? "mês" : "meses"}
            </p>
            {apostilasTotalValue > 0 && apostilasCount > 0 && apostilasStartDate && (
              <div className="p-3 rounded-md bg-muted space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Valor total:</span>
                  <span className="font-semibold text-foreground">{fmt(apostilasTotalValue)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Valor unitário/apostila:</span>
                  <span className="font-semibold text-primary">{fmt(apostilasInstallmentValue)}</span>
                </div>
                <Separator />
                <p className="text-xs font-medium text-muted-foreground">Cronograma de vencimentos:</p>
                <div className="border border-border rounded-md overflow-hidden">
                  <div className="grid grid-cols-3 bg-muted/80 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                    <span>#</span>
                    <span>Vencimento</span>
                    <span className="text-right">Valor</span>
                  </div>
                  {Array.from({ length: apostilasCount }).map((_, i) => {
                    const d = new Date(apostilasStartDate + "T12:00:00");
                    d.setMonth(d.getMonth() + (i * apostilasIntervalMonths));
                    let parcValue = Math.floor(apostilasInstallmentValue * 100) / 100;
                    if (i === apostilasCount - 1) {
                      parcValue = Math.round((apostilasTotalValue - parcValue * (apostilasCount - 1)) * 100) / 100;
                    }
                    return (
                      <div key={i} className="grid grid-cols-3 px-3 py-1.5 text-xs border-t border-border">
                        <span className="text-foreground">Apostila {i + 1}</span>
                        <span className="text-foreground">{d.toLocaleDateString("pt-BR")}</span>
                        <span className="text-right font-medium text-primary">{fmt(parcValue)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const filteredContracts = useMemo(() => {
    if (!searchTerm.trim()) return contracts;
    const term = searchTerm.toLowerCase();
    return contracts.filter(c =>
      c.description?.toLowerCase().includes(term) ||
      c.responsible_name?.toLowerCase().includes(term) ||
      c.cpf?.includes(term) ||
      c.id?.toLowerCase().includes(term) ||
      (c.students as any)?.full_name?.toLowerCase().includes(term)
    );
  }, [contracts, searchTerm]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Contratos</h1>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus size={16} className="mr-2" />
              Novo Contrato
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                {step === "form" ? "Novo Contrato" : "Resumo do Contrato"}
              </DialogTitle>
            </DialogHeader>

            {step === "form" ? (
              <div className="space-y-6">
                {renderResponsibleSection()}
                <Separator />
                {renderAddressSection()}
                <Separator />
                {renderFinancialSection()}
                <Separator />
                {renderInstallmentSection()}
                <Separator />
                {renderApostilasSection()}
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold text-primary mb-3">F. Observações</h3>
                  <Textarea className="bg-input border-border text-foreground" placeholder="Observações do contrato..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
                </div>
                <Button
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={handleProceedToSummary}
                >
                  Revisar Contrato
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-muted space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Responsável</p>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Nome:</span>
                    <span className="text-foreground font-medium">{responsibleName}</span>
                    <span className="text-muted-foreground">CPF:</span>
                    <span className="text-foreground">{cpf}</span>
                    <span className="text-muted-foreground">RG:</span>
                    <span className="text-foreground">{rg}</span>
                    <span className="text-muted-foreground">Nascimento:</span>
                    <span className="text-foreground">{birthDate ? new Date(birthDate + "T12:00:00").toLocaleDateString("pt-BR") : ""}</span>
                    <span className="text-muted-foreground">Telefone:</span>
                    <span className="text-foreground">{phone}</span>
                    <span className="text-muted-foreground">E-mail:</span>
                    <span className="text-foreground">{email}</span>
                  </div>
                  <Separator />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Endereço</p>
                  <p className="text-sm text-foreground">
                    {address}, {addressNumber}{complement ? ` - ${complement}` : ""}<br />
                    {neighborhood} - {city}/{state} - CEP: {zipCode}
                  </p>
                  <Separator />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contrato</p>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    {responsibleMode === "existing" && selectedStudent && (
                      <>
                        <span className="text-muted-foreground">Aluno:</span>
                        <span className="text-foreground font-medium">{selectedStudent.full_name}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">Unidade:</span>
                    <span className="text-foreground font-medium">{unitName}</span>
                    <span className="text-muted-foreground">Curso:</span>
                    <span className="text-foreground font-medium">{description}</span>
                    <span className="text-muted-foreground">Parcela s/ desconto:</span>
                    <span className="text-foreground">{fmt(installmentRealValue)}</span>
                    {discount > 0 && (
                      <>
                        <span className="text-muted-foreground">Desc. Pontualidade/parcela:</span>
                        <span className="text-destructive">-{fmt(installmentDiscount)}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">Parcela c/ desconto:</span>
                    <span className="text-primary font-bold">{fmt(installmentFinalValue)}</span>
                    <span className="text-muted-foreground">Mensalidades:</span>
                    <span className="text-foreground">{installments}x de {fmt(installmentFinalValue)}</span>
                    <span className="text-muted-foreground">Total s/ desconto:</span>
                    <span className="text-foreground">{fmt(courseTotalWithoutDiscount)}</span>
                    <span className="text-muted-foreground">Total c/ desconto:</span>
                    <span className="text-primary font-bold">{fmt(courseTotalWithDiscount)}</span>
                    <span className="text-muted-foreground">1º Vencimento:</span>
                    <span className="text-foreground">{firstDueDate ? new Date(firstDueDate + "T12:00:00").toLocaleDateString("pt-BR") : ""}</span>
                    <span className="text-muted-foreground">Pagamento:</span>
                    <span className="text-foreground">{paymentMethod}</span>
                  </div>
                  {includeApostilas && apostilasCount > 0 && apostilasTotalValue > 0 && (
                    <>
                      <Separator />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Apostilas</p>
                      <div className="grid grid-cols-2 gap-y-2 text-sm">
                        <span className="text-muted-foreground">Valor Total:</span>
                        <span className="text-foreground">{fmt(apostilasTotalValue)}</span>
                        <span className="text-muted-foreground">Parcelas:</span>
                        <span className="text-foreground">{apostilasCount}x de {fmt(apostilasInstallmentValue)}</span>
                        <span className="text-muted-foreground">Intervalo:</span>
                        <span className="text-foreground">A cada {apostilasIntervalMonths} {apostilasIntervalMonths === 1 ? "mês" : "meses"}</span>
                        <span className="text-muted-foreground">1º Vencimento:</span>
                        <span className="text-foreground">{apostilasStartDate ? new Date(apostilasStartDate + "T12:00:00").toLocaleDateString("pt-BR") : ""}</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setStep("form")}>
                    Voltar e Editar
                  </Button>
                  <Button
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                    disabled={saving}
                    onClick={handleSave}
                  >
                    {saving ? <><Loader2 className="animate-spin mr-2" size={16} />Salvando...</> : "Confirmar e Gerar Parcelas"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="bg-input border-border text-foreground pl-9"
          placeholder="Buscar por nº do contrato, nome, CPF, aluno..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Contracts List */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={24} /></div>
      ) : filteredContracts.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Nenhum contrato encontrado.</div>
      ) : (
        <div className="space-y-3">
          {filteredContracts.map((c) => (
            <div key={c.id} className="glass-card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">{c.description}</h3>
                  <p className="text-xs text-muted-foreground">
                    {c.responsible_name || "—"} • {(c.units as any)?.name || "—"} • Aluno: {(c.students as any)?.full_name || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${c.status === "ACTIVE" ? "status-paid" : "status-cancelled"}`}>
                    {c.status === "ACTIVE" ? "Ativo" : c.status}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {c.course_real_value && c.punctuality_discount && c.punctuality_discount > 0 ? (
                    <>
                      <span className="line-through">{fmt(c.course_real_value)}</span>
                      <span className="text-primary font-medium">{fmt(c.final_value_with_discount || 0)}</span>
                    </>
                  ) : (
                    <span>{fmt(c.course_real_value || c.total_value || 0)}</span>
                  )}
                  <span>• {c.installments}x</span>
                  <span>• {c.payment_method || "—"}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => navigate(`/admin/cobrancas?contract=${c.id}`)}
                  >
                    <ExternalLink size={12} className="mr-1" /> Parcelas
                  </Button>
                  {hasRole("ADMIN_MASTER") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(c)}
                    >
                      <Trash2 size={12} className="mr-1" /> Excluir
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete contract confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Excluir contrato</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação excluirá o contrato "{deleteTarget?.description}" e todas as parcelas não pagas vinculadas. Parcelas pagas bloqueiam a exclusão. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border" disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteContract}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleting ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
              Excluir Contrato
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminContracts;
