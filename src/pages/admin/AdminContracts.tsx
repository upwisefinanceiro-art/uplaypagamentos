import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Loader2, UserPlus, UserCheck, Save, Trash2, ExternalLink, Search, CalendarIcon, Pencil, Ban, AlertTriangle, Bell } from "lucide-react";
import { format, addMonths, lastDayOfMonth, setDate as setDateFns, startOfDay, isBefore, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
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
import UserEditDialog from "@/components/admin/UserEditDialog";
import ContractCancellationDialog from "@/components/admin/ContractCancellationDialog";
import ClientAccessModal from "@/components/admin/ClientAccessModal";
import NotifyClientDialog from "@/components/admin/NotifyClientDialog";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";

interface ContractRow {
  id: string;
  contract_number: string | null;
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
  email: string | null;
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

function sanitizeMoneyInput(value: string): string {
  return value.replace(/[^\d,\.\s]/g, "").replace(/\s+/g, "");
}

function parseMoneyInput(value: string): number {
  const cleaned = sanitizeMoneyInput(value);
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decimalSeparatorIndex = Math.max(lastComma, lastDot);

  if (decimalSeparatorIndex === -1) {
    const parsedInteger = Number.parseFloat(cleaned.replace(/\D/g, ""));
    return Number.isFinite(parsedInteger) ? parsedInteger : 0;
  }

  const integerPart = cleaned.slice(0, decimalSeparatorIndex).replace(/\D/g, "") || "0";
  const decimalPart = cleaned.slice(decimalSeparatorIndex + 1).replace(/\D/g, "").slice(0, 2);
  const normalized = decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
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
  const [editResponsible, setEditResponsible] = useState<{ id: string; full_name: string; cpf: string; phone: string | null; unit_id: string | null; email?: string | null; address?: string | null } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ContractRow | null>(null);
  const [notifyTarget, setNotifyTarget] = useState<{ id: string; name: string; unit_id: string } | null>(null);
  const [contractPayments, setContractPayments] = useState<{ id: string; contract_id: string | null; status: string; due_date: string }[]>([]);
  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [accessModalData, setAccessModalData] = useState<{ responsibleName: string; studentName: string; cpf: string; email?: string | null; phone?: string | null; unitId?: string | null } | null>(null);
  const { toast } = useToast();
  const { profile, hasRole } = useAuth();

  // Responsible mode
  const [responsibleMode, setResponsibleMode] = useState<"new" | "existing">("new");

  // Form state
  const [responsibleId, setResponsibleId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [studentBirthDate, setStudentBirthDate] = useState("");
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
  // dueDay is now derived from firstDueDate
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [password, setPassword] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [saveResponsibleToBase, setSaveResponsibleToBase] = useState(true);

  // Apostilas state
  const [includeApostilas, setIncludeApostilas] = useState(false);
  const [apostilasTotal, setApostilasTotal] = useState("");
  const [apostilasQty, setApostilasQty] = useState("1");
  const [apostilasStartDate, setApostilasStartDate] = useState("");
  const [apostilasInterval, setApostilasInterval] = useState("3");
  const [apostilaStockItemId, setApostilaStockItemId] = useState("");
  const [stockItems, setStockItems] = useState<{ id: string; name: string; unit_id: string; quantity: number }[]>([]);

  // Matrícula state
  const [includeMatricula, setIncludeMatricula] = useState(false);
  const [matriculaValue, setMatriculaValue] = useState("");
  const [matriculaDueDate, setMatriculaDueDate] = useState("");
  const [matriculaDescription, setMatriculaDescription] = useState("Matrícula");

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
  const matriculaValueParsed = parseMoneyInput(matriculaValue);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [contractsRes, studentsRes, responsiblesRes, unitsRes, adminRolesRes, contractPayments, stockItemsRes] = await Promise.all([
      supabase.from("contracts").select("*, units(name), students(full_name)").order("created_at", { ascending: false }),
      supabase.from("students").select("id, full_name, responsible_id, unit_id").eq("active", true),
      supabase.from("profiles").select("id, full_name, cpf, phone, email, unit_id, asaas_customer_id").eq("active", true),
      supabase.from("units").select("id, name").eq("active", true),
      supabase.from("user_roles").select("user_id").in("role", ["ADMIN_MASTER", "ADMIN_UNIDADE"]),
      fetchAllPaginated<{ id: string; contract_id: string | null; status: string; due_date: string }>((from, to) =>
        supabase
          .from("payments")
          .select("id, contract_id, status, due_date")
          .not("contract_id", "is", null)
          .order("due_date", { ascending: false })
          .range(from, to),
      ),
      supabase.from("stock_items").select("id, name, unit_id, quantity").eq("active", true),
    ]);
    if (contractsRes.data) setContracts(contractsRes.data as any);
    if (studentsRes.data) setStudents(studentsRes.data);
    const adminIds = new Set((adminRolesRes.data || []).map((r: any) => r.user_id));
    if (responsiblesRes.data) {
      setResponsibles((responsiblesRes.data as any).filter((p: any) => !adminIds.has(p.id)));
    }
    if (unitsRes.data) setUnits(unitsRes.data);
    setContractPayments(contractPayments as any);
    if (stockItemsRes.data) setStockItems(stockItemsRes.data as any);
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
      setEmail(resp.email || "");
    }
  };

  const resetForm = () => {
    setResponsibleMode("new"); setResponsibleId(""); setStudentId("");
    setResponsibleName(""); setBirthDate(""); setRg(""); setCpf("");
    setPhone(""); setEmail(""); setAddress(""); setAddressNumber("");
    setComplement(""); setNeighborhood(""); setCity(""); setState("");
    setZipCode(""); setUnitId(""); setDescription(""); setStartDate("");
    setFirstDueDate(""); setCourseRealValue(""); setPunctualityDiscount("0");
    setInstallments("1"); setPaymentMethod(""); setNotes("");
    setPassword(""); setContractNumber(""); setStep("form"); setSaveResponsibleToBase(true);
    setIncludeApostilas(false); setApostilasTotal(""); setApostilasQty("1");
    setApostilasStartDate(""); setApostilasInterval("3"); setApostilaStockItemId("");
    setIncludeMatricula(false); setMatriculaValue(""); setMatriculaDueDate(""); setMatriculaDescription("Matrícula");
    setNewStudentName(""); setStudentBirthDate("");
  };

  const validateForm = (): string | null => {
    if (!responsibleName.trim()) return "Nome do responsável é obrigatório";
    if (!birthDate) return "Data de nascimento é obrigatória";
    if (!cpf.trim()) return "CPF é obrigatório";
    if (!validarCPF(cpf)) return "CPF inválido";
    if (!phone.trim()) return "Telefone celular é obrigatório (necessário para notificações via WhatsApp)";
    {
      const ph = phone.replace(/\D/g, "");
      if (ph.length !== 11) return "Telefone celular inválido. Use DDD + 9 dígitos (ex.: 31 99999-9999)";
      if (ph[2] !== "9") return "Telefone deve ser celular (começar com 9 após o DDD)";
    }
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
    if (responsibleMode === "new" && !newStudentName.trim()) return "Nome do aluno é obrigatório";
    // Senha padrão sempre aplicada (12345678) — não é mais campo do formulário
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
    if (includeMatricula) {
      if (!matriculaValue || matriculaValueParsed <= 0) return "Valor da matrícula é obrigatório";
      if (!matriculaDueDate) return "Data de vencimento da matrícula é obrigatória";
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
            password: "12345678",
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

      let finalStudentId = studentId;
      if (responsibleMode === "new") {
        // Create student record first
        const studentInsert: any = {
          full_name: newStudentName.trim(),
          responsible_id: finalResponsibleId,
          unit_id: resolvedUnitId,
        };
        if (studentBirthDate) studentInsert.birth_date = studentBirthDate;
        const { data: newStudent, error: studentErr } = await supabase.from("students").insert(studentInsert).select("id").single();
        if (studentErr) throw new Error("Erro ao criar aluno: " + studentErr.message);
        finalStudentId = newStudent.id;
      }

      // Insert contract (snapshot of all responsible data)
      const generatedNumber = contractNumber.trim() || Date.now().toString().slice(-6);
      const { data: contract, error: contractErr } = await supabase.from("contracts").insert({
        contract_number: generatedNumber,
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
        due_day: firstDueDate ? parseInt(firstDueDate.split("-")[2]) || 1 : 1,
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

      // Generate course installments using clamped dates
      const baseDueDate = new Date(firstDueDate + "T12:00:00");
      const baseDayOfMonth = baseDueDate.getDate();
      const payments: any[] = [];
      for (let i = 0; i < numInstallments; i++) {
        const d = addMonths(baseDueDate, i);
        const lastDay = lastDayOfMonth(d).getDate();
        const clampedDay = Math.min(baseDayOfMonth, lastDay);
        const dueDate = setDateFns(d, clampedDay);
        payments.push({
          contract_id: contract.id,
          unit_id: resolvedUnitId,
          responsible_id: finalResponsibleId,
          student_id: finalStudentId,
          installment_number: i + 1,
          due_date: format(dueDate, "yyyy-MM-dd"),
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
        const apostilasDayOfMonth = apostilasBase.getDate();
        for (let i = 0; i < apostilasCount; i++) {
          const d = addMonths(apostilasBase, i * apostilasIntervalMonths);
          const lastDay = lastDayOfMonth(d).getDate();
          const clampedDay = Math.min(apostilasDayOfMonth, lastDay);
          const dueDate = setDateFns(d, clampedDay);
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
            due_date: format(dueDate, "yyyy-MM-dd"),
            value: parcValue,
            original_value: parcValue,
            punctuality_discount: 0,
            final_value: parcValue,
            payment_method: paymentMethod,
            payment_type: "APOSTILA",
            description: `Apostila ${i + 1}/${apostilasCount}`,
            status: "PENDING",
            stock_item_id: apostilaStockItemId || null,
            stock_quantity: 1,
          });
        }
      }

      // Generate matrícula payment
      if (includeMatricula && matriculaValueParsed > 0 && matriculaDueDate) {
        payments.push({
          contract_id: contract.id,
          unit_id: resolvedUnitId,
          responsible_id: finalResponsibleId,
          student_id: finalStudentId,
          installment_number: payments.length + 1,
          due_date: matriculaDueDate,
          value: matriculaValueParsed,
          original_value: matriculaValueParsed,
          punctuality_discount: 0,
          final_value: matriculaValueParsed,
          payment_method: paymentMethod,
          payment_type: "MATRICULA",
          description: matriculaDescription || "Matrícula",
          status: "PENDING",
        });
      }

      const { data: insertedPayments, error: paymentsErr } = await supabase
        .from("payments")
        .insert(payments)
        .select("id");
      if (paymentsErr) throw paymentsErr;

      const totalParcelas = insertedPayments?.length || payments.length;

      // Fechar diálogo e mostrar progresso da geração no Asaas
      setDialogOpen(false);
      toast({
        title: "Contrato criado!",
        description: `${totalParcelas} parcelas geradas. Enviando para o Asaas...`,
      });

      // Disparar criação automática no Asaas (síncrono, em paralelo controlado)
      if (insertedPayments && insertedPayments.length > 0) {
        const ids = insertedPayments.map((p: any) => p.id);
        const CHUNK_SIZE = 3;
        let asaasOk = 0;
        let asaasErr = 0;

        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
          const chunk = ids.slice(i, i + CHUNK_SIZE);
          const results = await Promise.allSettled(
            chunk.map((payment_id) =>
              supabase.functions.invoke("sync-asaas-payment", {
                body: { payment_id },
              }),
            ),
          );
          for (const r of results) {
            if (r.status === "fulfilled" && !r.value.error && !(r.value.data as any)?.error) {
              asaasOk++;
            } else {
              asaasErr++;
              console.error("[asaas-sync] falha", r);
            }
          }
        }

        if (asaasErr === 0) {
          toast({
            title: "Cobranças enviadas ao Asaas!",
            description: `${asaasOk} parcela(s) registrada(s) com sucesso.`,
          });
        } else {
          toast({
            title: `${asaasOk} de ${ids.length} parcelas enviadas`,
            description: `${asaasErr} falharam. Use 'Sincronizar com Asaas' em Cobranças para reprocessar.`,
            variant: "destructive",
          });
        }
      }


      // Show access modal if user was created
      if (responsibleMode === "new" && saveResponsibleToBase) {
        setAccessModalData({
          responsibleName,
          studentName: newStudentName.trim(),
          cpf: cpf.replace(/\D/g, ""),
          email: email || null,
          phone: phone || null,
          unitId: resolvedUnitId || null,
        });
        setAccessModalOpen(true);
      }

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
          <div className="p-3 rounded-md border border-primary/30 bg-primary/5">
            <div className="flex items-start gap-2">
              <Save size={14} className="text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-medium text-foreground">Cliente será cadastrado automaticamente</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Login pelo CPF. Senha inicial: <span className="font-mono font-semibold text-foreground">12345678</span> (cliente poderá alterar no app).</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {responsibleMode === "new" && (
        <div className="space-y-3 mb-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-foreground text-xs">Nome do Aluno *</Label>
              <Input className="bg-input border-border text-foreground" placeholder="Nome completo do aluno" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-foreground text-xs">Data de Nascimento do Aluno</Label>
              <Input className="bg-input border-border text-foreground" type="date" value={studentBirthDate} onChange={e => setStudentBirthDate(e.target.value)} />
            </div>
          </div>
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
            <Label className="text-foreground text-xs">RG / Identidade</Label>
            <Input className="bg-input border-border text-foreground" value={rg} onChange={e => setRg(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Celular (WhatsApp) *</Label>
            <Input className="bg-input border-border text-foreground" placeholder="(31) 99999-9999" value={phone} onChange={e => setPhone(e.target.value)} />
            <p className="text-[10px] text-muted-foreground mt-1">Obrigatório – usado para enviar cobranças via WhatsApp.</p>
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
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Nº do Contrato</Label>
            <Input className="bg-input border-border text-foreground" placeholder="Ex: 637080" value={contractNumber} onChange={e => setContractNumber(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Identificador para busca. Deixe vazio para gerar automaticamente.</p>
          </div>
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Curso / Descrição *</Label>
            <Input className="bg-input border-border text-foreground" placeholder="Ex: Informática Básica" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
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
            <Label className="text-foreground text-xs">Método de Pagamento *</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="PIX">PIX</SelectItem>
                <SelectItem value="BOLETO">Boleto</SelectItem>
                <SelectItem value="CARD">Cartão</SelectItem>
                <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
                <SelectItem value="ASAAS">Asaas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );

  // Generate installment dates for preview
  const generateInstallmentDates = (baseDateStr: string, count: number) => {
    if (!baseDateStr || count <= 0) return [];
    const baseDate = new Date(baseDateStr + "T12:00:00");
    const dayOfMonth = baseDate.getDate();
    const dates: Date[] = [];
    for (let i = 0; i < count; i++) {
      const d = addMonths(baseDate, i);
      // Clamp to last day of month if needed
      const lastDay = lastDayOfMonth(d).getDate();
      const clampedDay = Math.min(dayOfMonth, lastDay);
      const adjusted = setDateFns(d, clampedDay);
      dates.push(adjusted);
    }
    return dates;
  };

  const installmentDates = useMemo(() => generateInstallmentDates(firstDueDate, numInstallments), [firstDueDate, numInstallments]);

  const firstDueDateObj = firstDueDate ? new Date(firstDueDate + "T12:00:00") : undefined;

  const renderInstallmentSection = () => (
    <div>
      <h3 className="text-sm font-semibold text-primary mb-3">D. Parcelamento</h3>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Data do 1º Vencimento *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal bg-input border-border text-foreground",
                    !firstDueDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {firstDueDateObj ? format(firstDueDateObj, "dd/MM/yyyy", { locale: ptBR }) : <span>Selecione a data</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={firstDueDateObj}
                  onSelect={(date) => {
                    if (date) {
                      const y = date.getFullYear();
                      const m = String(date.getMonth() + 1).padStart(2, "0");
                      const d = String(date.getDate()).padStart(2, "0");
                      setFirstDueDate(`${y}-${m}-${d}`);
                    } else {
                      setFirstDueDate("");
                    }
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {firstDueDate && (
              <p className="text-[11px] text-muted-foreground">
                Dia de vencimento: <span className="font-semibold text-foreground">{new Date(firstDueDate + "T12:00:00").getDate()}</span> (aplicado a todas as parcelas)
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Nº de Parcelas (mensalidades) *</Label>
            <Input className="bg-input border-border text-foreground" type="number" min="1" value={installments} onChange={e => setInstallments(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Valor real por mensalidade *</Label>
            <Input
              className="bg-input border-border text-foreground"
              type="text"
              inputMode="decimal"
              placeholder="219,90"
              value={courseRealValue}
              onChange={e => setCourseRealValue(sanitizeMoneyInput(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Desc. Pontualidade</Label>
            <Input
              className="bg-input border-border text-foreground"
              type="text"
              inputMode="decimal"
              placeholder="30,00"
              value={punctualityDiscount}
              onChange={e => setPunctualityDiscount(sanitizeMoneyInput(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-foreground text-xs">Valor final por mensalidade</Label>
            <div className="flex h-10 w-full items-center rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
              {fmt(finalValue)}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Calculado automaticamente: valor real - desconto por mensalidade.
            </p>
          </div>
        </div>
        {realValue > 0 && numInstallments > 0 && (
          <div className="p-3 rounded-md bg-muted space-y-2">
            <p className="text-xs text-muted-foreground">Parcela sem desconto: <span className="font-semibold text-foreground">{fmt(installmentRealValue)}</span></p>
            {discount > 0 && (
              <p className="text-xs text-muted-foreground">Desc. pontualidade/parcela: <span className="font-semibold text-destructive">-{fmt(installmentDiscount)}</span></p>
            )}
            <p className="text-xs text-muted-foreground">Parcela com desconto: <span className="font-semibold text-primary">{fmt(installmentFinalValue)}</span></p>
            <Separator />
            <p className="text-xs text-muted-foreground">Total sem desconto ({numInstallments}x): <span className="font-semibold text-foreground">{fmt(courseTotalWithoutDiscount)}</span></p>
            <p className="text-xs text-muted-foreground">Total com desconto ({numInstallments}x): <span className="font-semibold text-primary">{fmt(courseTotalWithDiscount)}</span></p>
          </div>
        )}
        {/* Installment dates preview */}
        {installmentDates.length > 0 && realValue > 0 && (
          <div className="p-3 rounded-md border border-border bg-muted/30 space-y-2">
            <p className="text-xs font-medium text-primary">Próximos vencimentos:</p>
            <div className="border border-border rounded-md overflow-hidden">
              <div className="grid grid-cols-3 bg-muted/80 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                <span>#</span>
                <span>Vencimento</span>
                <span className="text-right">Valor</span>
              </div>
              {installmentDates.map((d, i) => (
                <div key={i} className="grid grid-cols-3 px-3 py-1.5 text-xs border-t border-border">
                  <span className="text-foreground">Parcela {i + 1}</span>
                  <span className="text-foreground">{format(d, "dd/MM/yyyy", { locale: ptBR })}</span>
                  <span className="text-right font-medium text-primary">{fmt(installmentFinalValue)}</span>
                </div>
              ))}
            </div>
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
            <div className="space-y-1">
              <Label className="text-foreground text-xs">Item de Estoque vinculado</Label>
              <Select value={apostilaStockItemId} onValueChange={setApostilaStockItemId}>
                <SelectTrigger className="bg-input border-border text-foreground">
                  <SelectValue placeholder="Selecione o item do estoque" />
                </SelectTrigger>
                <SelectContent>
                  {stockItems
                    .filter(si => si.unit_id === resolvedUnitId)
                    .map(si => (
                      <SelectItem key={si.id} value={si.id}>
                        {si.name} (Qtd: {si.quantity})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Vincular para baixa automática no estoque ao pagar</p>
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
                    const base = new Date(apostilasStartDate + "T12:00:00");
                    const dayOfM = base.getDate();
                    const d = addMonths(base, i * apostilasIntervalMonths);
                    const ld = lastDayOfMonth(d).getDate();
                    const adjusted = setDateFns(d, Math.min(dayOfM, ld));
                    let parcValue = Math.floor(apostilasInstallmentValue * 100) / 100;
                    if (i === apostilasCount - 1) {
                      parcValue = Math.round((apostilasTotalValue - parcValue * (apostilasCount - 1)) * 100) / 100;
                    }
                    return (
                      <div key={i} className="grid grid-cols-3 px-3 py-1.5 text-xs border-t border-border">
                        <span className="text-foreground">Apostila {i + 1}</span>
                        <span className="text-foreground">{format(adjusted, "dd/MM/yyyy", { locale: ptBR })}</span>
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

  const renderMatriculaSection = () => (
    <div>
      <h3 className="text-sm font-semibold text-primary mb-3">F. Matrícula</h3>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="include-matricula"
            checked={includeMatricula}
            onCheckedChange={(checked) => setIncludeMatricula(checked === true)}
          />
          <label htmlFor="include-matricula" className="text-xs text-foreground cursor-pointer">
            Incluir cobrança de matrícula no contrato
          </label>
        </div>

        {includeMatricula && (
          <div className="space-y-3 p-3 rounded-md border border-border bg-muted/30">
            <div className="space-y-1">
              <Label className="text-foreground text-xs">Descrição</Label>
              <Input
                className="bg-input border-border text-foreground"
                type="text"
                placeholder="Matrícula"
                value={matriculaDescription}
                onChange={e => setMatriculaDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-foreground text-xs">Valor da Matrícula *</Label>
                <Input
                  className="bg-input border-border text-foreground"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={matriculaValue}
                  onChange={e => setMatriculaValue(sanitizeMoneyInput(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-foreground text-xs">Data de Vencimento *</Label>
                <Input
                  className="bg-input border-border text-foreground"
                  type="date"
                  value={matriculaDueDate}
                  onChange={e => setMatriculaDueDate(e.target.value)}
                />
              </div>
            </div>
            {matriculaValueParsed > 0 && matriculaDueDate && (
              <div className="p-3 rounded-md bg-muted space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Valor:</span>
                  <span className="font-semibold text-primary">{fmt(matriculaValueParsed)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Vencimento:</span>
                  <span className="font-semibold text-foreground">{new Date(matriculaDueDate + "T12:00:00").toLocaleDateString("pt-BR")}</span>
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
    const term = searchTerm.toLowerCase().trim();
    const termDigits = term.replace(/\D/g, "");
    return contracts.filter(c => {
      const cpfDigits = (c.cpf || "").replace(/\D/g, "");
      return (
        c.description?.toLowerCase().includes(term) ||
        c.responsible_name?.toLowerCase().includes(term) ||
        c.cpf?.includes(term) ||
        (termDigits.length >= 3 && cpfDigits.includes(termDigits)) ||
        c.contract_number?.toLowerCase().includes(term) ||
        (c.students as any)?.full_name?.toLowerCase().includes(term)
      );
    });
  }, [contracts, searchTerm]);

  // Compute overdue stats per contract
  const contractOverdueMap = useMemo(() => {
    const today = startOfDay(new Date());
    const map: Record<string, { overdueCount: number; maxDaysOverdue: number }> = {};
    for (const p of contractPayments) {
      if (!p.contract_id) continue;
      const dueDate = startOfDay(new Date(p.due_date + "T00:00:00"));
      const isOverdue = (p.status === "OVERDUE") || (p.status === "PENDING" && isBefore(dueDate, today));
      if (isOverdue) {
        if (!map[p.contract_id]) map[p.contract_id] = { overdueCount: 0, maxDaysOverdue: 0 };
        map[p.contract_id].overdueCount++;
        const days = differenceInDays(today, dueDate);
        if (days > map[p.contract_id].maxDaysOverdue) map[p.contract_id].maxDaysOverdue = days;
      }
    }
    return map;
  }, [contractPayments]);

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
                {renderMatriculaSection()}
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold text-primary mb-3">G. Observações</h3>
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
                    {(contractNumber.trim() || true) && (
                      <>
                        <span className="text-muted-foreground">Nº Contrato:</span>
                        <span className="text-foreground font-mono">{contractNumber.trim() || "(gerado automaticamente)"}</span>
                      </>
                    )}
                    {(responsibleMode === "existing" && selectedStudent) && (
                      <>
                        <span className="text-muted-foreground">Aluno:</span>
                        <span className="text-foreground font-medium">{selectedStudent.full_name}</span>
                      </>
                    )}
                    {responsibleMode === "new" && newStudentName.trim() && (
                      <>
                        <span className="text-muted-foreground">Aluno:</span>
                        <span className="text-foreground font-medium">{newStudentName}</span>
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
                  {includeMatricula && matriculaValueParsed > 0 && matriculaDueDate && (
                    <>
                      <Separator />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Matrícula</p>
                      <div className="grid grid-cols-2 gap-y-2 text-sm">
                        <span className="text-muted-foreground">Valor:</span>
                        <span className="text-foreground">{fmt(matriculaValueParsed)}</span>
                        <span className="text-muted-foreground">Vencimento:</span>
                        <span className="text-foreground">{new Date(matriculaDueDate + "T12:00:00").toLocaleDateString("pt-BR")}</span>
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
          {filteredContracts.map((c) => {
            const overdueInfo = contractOverdueMap[c.id];
            const hasOverdue = !!overdueInfo && overdueInfo.overdueCount > 0;
            return (
            <div key={c.id} className={`glass-card p-4 ${hasOverdue ? "border-destructive/50 bg-destructive/5" : ""}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {c.contract_number && (
                      <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">#{c.contract_number}</span>
                    )}
                    <h3 className="text-sm font-semibold text-foreground">{c.description}</h3>
                    {hasOverdue && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full animate-pulse">
                        <AlertTriangle size={10} />
                        {overdueInfo.overdueCount} parcela{overdueInfo.overdueCount > 1 ? "s" : ""} vencida{overdueInfo.overdueCount > 1 ? "s" : ""} ({overdueInfo.maxDaysOverdue}d)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {c.responsible_name || "—"} • {(c.units as any)?.name || "—"} • Aluno: {(c.students as any)?.full_name || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${c.status === "ACTIVE" ? (hasOverdue ? "status-overdue" : "status-paid") : "status-cancelled"}`}>
                    {c.status === "ACTIVE" ? (hasOverdue ? "Em atraso" : "Ativo") : c.status}
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
                    onClick={async () => {
                      let resp = responsibles.find(r => r.id === c.responsible_id);
                      if (!resp) {
                        const { data } = await supabase
                          .from("profiles")
                          .select("id, full_name, cpf, phone, email, unit_id, address")
                          .eq("id", c.responsible_id)
                          .single();
                        if (data) resp = data as any;
                      }
                      if (resp) {
                        setEditResponsible({
                          id: resp.id,
                          full_name: resp.full_name,
                          cpf: resp.cpf,
                          phone: resp.phone,
                          unit_id: resp.unit_id,
                          email: resp.email,
                        });
                      } else {
                        toast({ title: "Responsável não encontrado na base", variant: "destructive" });
                      }
                    }}
                  >
                    <Pencil size={12} className="mr-1" /> Editar Responsável
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => navigate(`/admin/cobrancas?contract=${c.id}`)}
                  >
                    <ExternalLink size={12} className="mr-1" /> Parcelas
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setNotifyTarget({ id: c.responsible_id, name: c.responsible_name || "Cliente", unit_id: c.unit_id })}
                  >
                    <Bell size={12} className="mr-1" /> Notificar App
                  </Button>
                  {c.status === "ACTIVE" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => setCancelTarget(c)}
                    >
                      <Ban size={12} className="mr-1" /> Cancelar Curso
                    </Button>
                  )}
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
            );
          })}
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

      <UserEditDialog
        open={!!editResponsible}
        onOpenChange={(open) => !open && setEditResponsible(null)}
        user={editResponsible}
        units={units}
        onSaved={fetchData}
        showUnitSelector={hasRole("ADMIN_MASTER")}
      />

      <ContractCancellationDialog
        contract={cancelTarget}
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        onSuccess={fetchData}
      />

      <ClientAccessModal
        open={accessModalOpen}
        onOpenChange={setAccessModalOpen}
        data={accessModalData}
      />

      <NotifyClientDialog
        open={!!notifyTarget}
        onOpenChange={(open) => !open && setNotifyTarget(null)}
        clientId={notifyTarget?.id ?? null}
        clientName={notifyTarget?.name ?? null}
        unitId={notifyTarget?.unit_id ?? null}
      />
    </div>
  );
};

export default AdminContracts;
