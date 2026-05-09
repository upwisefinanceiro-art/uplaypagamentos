import { useEffect, useMemo, useState } from "react";
import { startOfDay, isBefore, differenceInDays } from "date-fns";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Ban,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import WhatsAppDialog from "@/components/WhatsAppDialog";
import { resolveWhatsAppChargeData } from "@/lib/asaas-payment";
import ManualChargeDialog from "@/components/admin/ManualChargeDialog";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";

type PaymentStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
type BillingType = "PIX" | "BOLETO" | "CARD";
type PaymentType = "MENSALIDADE" | "APOSTILA" | "AVULSA" | "MATRICULA";

type ManagedPaymentAction = "delete" | "cancel";

const statusLabels: Record<PaymentStatus, string> = {
  PENDING: "Pendente",
  PAID: "Pago",
  OVERDUE: "Vencido",
  CANCELLED: "Cancelado",
};

const statusClasses: Record<PaymentStatus, string> = {
  PENDING: "status-pending",
  PAID: "status-paid",
  OVERDUE: "status-overdue",
  CANCELLED: "status-cancelled",
};

const typeLabels: Record<PaymentType, string> = {
  MENSALIDADE: "Mensalidade",
  APOSTILA: "Apostila",
  AVULSA: "Avulsa",
  MATRICULA: "Matrícula",
};

interface PaymentRow {
  id: string;
  value: number;
  final_value: number | null;
  due_date: string;
  status: string;
  payment_method: string | null;
  pix_copy_paste: string | null;
  invoice_url: string | null;
  checkout_url: string | null;
  boleto_url: string | null;
  pix_qr_code: string | null;
  asaas_payment_id: string | null;
  responsible_id: string;
  unit_id: string;
  installment_number: number;
  contract_id: string | null;
  student_id: string | null;
  description: string;
  payment_type: string;
  cora_invoice_id?: string | null;
  gateway?: string | null;
  payment_provider?: string | null;
  emission_status?: string | null;
  emission_error_code?: string | null;
  emission_error_message?: string | null;
  emission_attempts?: number | null;
  emission_last_attempt_at?: string | null;
  emission_payload?: any;
  emission_response?: any;
}

interface ContractRow {
  id: string;
  description: string;
  contract_number: string | null;
  responsible_id: string;
  student_id: string;
  unit_id: string;
  status: string;
}

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

interface UnitRow {
  id: string;
  name: string;
  partnership_plan?: string | null;
  preferred_bank?: string | null;
}

interface ChargeResult {
  payment_id: string;
  asaas_charge_id: string;
  invoice_url: string | null;
}

interface ManualFormState {
  responsibleId: string;
  studentId: string;
  contractId: string;
  paymentType: PaymentType;
  description: string;
  value: string;
  dueDate: string;
}

interface EditFormState {
  paymentId: string;
  value: string;
  dueDate: string;
  description: string;
  status: PaymentStatus;
}

const emptyManualForm: ManualFormState = {
  responsibleId: "",
  studentId: "NONE",
  contractId: "NONE",
  paymentType: "AVULSA",
  description: "",
  value: "",
  dueDate: "",
};

const emptyEditForm: EditFormState = {
  paymentId: "",
  value: "",
  dueDate: "",
  description: "",
  status: "PENDING",
};

const AdminCharges = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [responsibles, setResponsibles] = useState<ResponsibleRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ResponsibleRow>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [stockItems, setStockItems] = useState<{ id: string; name: string; unit_id: string; quantity: number }[]>([]);

  const [chargeDialogOpen, setChargeDialogOpen] = useState(false);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [creatingCharge, setCreatingCharge] = useState(false);
  const [creatingManual, setCreatingManual] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [chargeResult, setChargeResult] = useState<ChargeResult | null>(null);
  const [manualForm, setManualForm] = useState<ManualFormState>(emptyManualForm);
  const [editForm, setEditForm] = useState<EditFormState>(emptyEditForm);
  const [actionTarget, setActionTarget] = useState<{ payment: PaymentRow; action: ManagedPaymentAction } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [syncingPaymentId, setSyncingPaymentId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [importingAsaas, setImportingAsaas] = useState(false);
  const [updatingNotifs, setUpdatingNotifs] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"delete" | "cancel" | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const [selectedResponsible, setSelectedResponsible] = useState("");
  const [selectedStudent, setSelectedStudent] = useState("NONE");
  const [selectedContract, setSelectedContract] = useState("NONE");
  const [chargeValue, setChargeValue] = useState("");
  const [chargeDueDate, setChargeDueDate] = useState("");
  const [billingType, setBillingType] = useState<BillingType>("PIX");
  const [chargeGateway, setChargeGateway] = useState<"ASAAS" | "CORA">("ASAAS");
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargePaymentType, setChargePaymentType] = useState<PaymentType>("AVULSA");

  const [waDialogOpen, setWaDialogOpen] = useState(false);
  const [waPayment, setWaPayment] = useState<PaymentRow | null>(null);
  const [waResponsible, setWaResponsible] = useState<{ full_name: string; phone: string | null } | null>(null);
  const [waStudent, setWaStudent] = useState<string | undefined>(undefined);
  const [waDescription, setWaDescription] = useState("");
  const [boletoViewerUrl, setBoletoViewerUrl] = useState<string | null>(null);

  const scopedResponsibleId = new URLSearchParams(location.search).get("responsible");
  const scopedContractId = new URLSearchParams(location.search).get("contract");
  const shouldOpenManual = new URLSearchParams(location.search).get("create") === "manual";

  const fetchData = async () => {
    setLoadingData(true);

    const [payments, studentsRes, unitsRes, profilesRes, rolesRes, contracts, stockRes] = await Promise.all([
      fetchAllPaginated<PaymentRow>((from, to) =>
        supabase
          .from("payments")
          .select("id, value, final_value, due_date, status, payment_method, pix_copy_paste, invoice_url, checkout_url, boleto_url, pix_qr_code, asaas_payment_id, responsible_id, unit_id, installment_number, contract_id, student_id, description, payment_type, cora_invoice_id, gateway, payment_provider, emission_status, emission_error_code, emission_error_message, emission_attempts, emission_last_attempt_at, emission_payload, emission_response")
          .order("due_date", { ascending: false })
          .range(from, to),
      ),
      supabase.from("students").select("id, full_name, responsible_id").order("full_name"),
      supabase.from("units").select("id, name, partnership_plan, preferred_bank").order("name"),
      supabase.from("profiles").select("id, full_name, unit_id, active, phone").order("full_name"),
      supabase.from("user_roles").select("user_id").eq("role", "RESPONSAVEL"),
      fetchAllPaginated<ContractRow>((from, to) =>
        supabase
          .from("contracts")
          .select("id, description, contract_number, responsible_id, student_id, unit_id, status")
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
      supabase.from("stock_items").select("id, name, unit_id, quantity").eq("active", true).order("name"),
    ]);

    setPayments(payments);
    if (studentsRes.data) setStudents(studentsRes.data as StudentRow[]);
    if (unitsRes.data) setUnits(unitsRes.data as UnitRow[]);
    setContracts(contracts);
    if (stockRes.data) setStockItems(stockRes.data as { id: string; name: string; unit_id: string; quantity: number }[]);

    if (profilesRes.data) {
      const profileMap = Object.fromEntries(
        profilesRes.data.map((profile) => [
          profile.id,
          {
            id: profile.id,
            full_name: profile.full_name,
            unit_id: profile.unit_id,
            active: profile.active,
            phone: profile.phone,
          },
        ]),
      );
      setProfiles(profileMap);

      if (rolesRes.data) {
        const responsibleIds = new Set(rolesRes.data.map((role: { user_id: string }) => role.user_id));
        setResponsibles(
          profilesRes.data
            .filter((profile) => responsibleIds.has(profile.id) && profile.active)
            .map((profile) => ({
              id: profile.id,
              full_name: profile.full_name,
              unit_id: profile.unit_id,
              active: profile.active,
              phone: profile.phone,
            })),
        );
      }
    }

    setLoadingData(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Realtime: atualiza a lista quando o webhook do Asaas alterar pagamentos
  useEffect(() => {
    const channel = supabase
      .channel("admin-charges-payments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        (payload) => {
          setPayments((current) => {
            if (payload.eventType === "DELETE") {
              return current.filter((p) => p.id !== (payload.old as PaymentRow).id);
            }
            const newRow = payload.new as PaymentRow;
            const exists = current.some((p) => p.id === newRow.id);
            if (payload.eventType === "INSERT" && !exists) {
              return [newRow, ...current];
            }
            return current.map((p) => (p.id === newRow.id ? { ...p, ...newRow } : p));
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (loadingData) return;
    if (!shouldOpenManual) return;

    const contract = scopedContractId ? contracts.find((item) => item.id === scopedContractId) : null;
    const nextResponsibleId = contract?.responsible_id || scopedResponsibleId || "";

    setManualForm({
      responsibleId: nextResponsibleId,
      studentId: contract?.student_id || "NONE",
      contractId: contract?.id || "NONE",
      paymentType: contract?.description?.toLowerCase().includes("apostila") ? "APOSTILA" : contract ? "MENSALIDADE" : "AVULSA",
      description: contract?.description || "",
      value: "",
      dueDate: "",
    });
    setManualDialogOpen(true);
  }, [contracts, loadingData, scopedContractId, scopedResponsibleId, shouldOpenManual]);

  const unitMap = useMemo(() => Object.fromEntries(units.map((unit) => [unit.id, unit.name])), [units]);
  const studentMap = useMemo(() => Object.fromEntries(students.map((student) => [student.id, student.full_name])), [students]);
  const contractMap = useMemo(() => Object.fromEntries(contracts.map((contract) => [contract.id, contract])), [contracts]);

  const chargeContracts = selectedResponsible
    ? contracts.filter((contract) => contract.responsible_id === selectedResponsible)
    : [];

  const chargeStudents = selectedResponsible
    ? students.filter((student) => student.responsible_id === selectedResponsible)
    : [];

  const manualContracts = manualForm.responsibleId
    ? contracts.filter((contract) => contract.responsible_id === manualForm.responsibleId)
    : [];

  const manualStudents = manualForm.responsibleId
    ? students.filter((student) => student.responsible_id === manualForm.responsibleId)
    : [];

  const currentChargeUnit = selectedResponsible ? unitMap[profiles[selectedResponsible]?.unit_id || ""] || "—" : "—";
  const currentManualUnit = manualForm.responsibleId ? unitMap[profiles[manualForm.responsibleId]?.unit_id || ""] || "—" : "—";

  const filtered = payments.filter((payment) => {
    if (statusFilter !== "ALL" && payment.status !== statusFilter) return false;
    if (unitFilter !== "ALL" && payment.unit_id !== unitFilter) return false;
    if (typeFilter !== "ALL" && payment.payment_type !== typeFilter) return false;
    if (scopedResponsibleId && payment.responsible_id !== scopedResponsibleId) return false;
    if (scopedContractId && payment.contract_id !== scopedContractId) return false;

    if (search) {
      const q = search.toLowerCase();
      const responsibleName = profiles[payment.responsible_id]?.full_name.toLowerCase() || "";
      const studentName = payment.student_id ? studentMap[payment.student_id]?.toLowerCase() || "" : "";
      const contractName = payment.contract_id ? contractMap[payment.contract_id]?.description.toLowerCase() || "" : "";
      const description = payment.description.toLowerCase();
      const type = (typeLabels[payment.payment_type as PaymentType] || payment.payment_type).toLowerCase();

      if (![responsibleName, studentName, contractName, description, type].some((value) => value.includes(q))) {
        return false;
      }
    }

    return true;
  });

  const resetOnlineForm = () => {
    setSelectedResponsible("");
    setSelectedStudent("NONE");
    setSelectedContract("NONE");
    setChargeValue("");
    setChargeDueDate("");
    setBillingType("PIX");
    setChargeGateway("ASAAS");
    setChargeDescription("");
    setChargePaymentType("AVULSA");
    setChargeResult(null);
  };

  const resetManualForm = () => {
    setManualForm(emptyManualForm);
  };

  const openManualDialog = (prefill?: Partial<ManualFormState>) => {
    setManualForm({ ...emptyManualForm, ...prefill });
    setManualDialogOpen(true);
  };

  const handleCreateCharge = async () => {
    if (!selectedResponsible || !chargeValue || !chargeDueDate) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }

    if (chargeGateway === "CORA" && billingType !== "BOLETO") {
      toast({ title: "Banco Cora só emite Boleto", description: "Altere a forma de pagamento para Boleto ou troque o gateway.", variant: "destructive" });
      return;
    }

    setCreatingCharge(true);
    setChargeResult(null);

    const finalProvider = chargeGateway === "CORA" ? "cora" : "asaas";
    console.log("[PAYMENT_PROVIDER_SELECTED]", {
      selectedGateway: chargeGateway,
      billingType,
      responsibleId: selectedResponsible,
      unidadeId: profiles[selectedResponsible]?.unit_id,
      finalProvider,
    });

    if (chargeGateway === "CORA") {
      console.log("[CORA_FLOW_STARTED]", { responsible: selectedResponsible });
      // 1) Cria parcela local marcada como Cora
      const respUnitId = profiles[selectedResponsible]?.unit_id;
      if (!respUnitId) {
        setCreatingCharge(false);
        toast({ title: "Responsável sem unidade vinculada", variant: "destructive" });
        return;
      }
      const insertPayload: Record<string, unknown> = {
        unit_id: respUnitId,
        responsible_id: selectedResponsible,
        student_id: selectedStudent !== "NONE" ? selectedStudent : null,
        contract_id: selectedContract !== "NONE" ? selectedContract : null,
        installment_number: 1,
        due_date: chargeDueDate,
        value: parseFloat(chargeValue),
        original_value: parseFloat(chargeValue),
        final_value: parseFloat(chargeValue),
        status: "PENDING",
        payment_method: "BOLETO",
        gateway: "CORA",
        payment_type: chargePaymentType,
        description: chargeDescription || "Cobrança avulsa",
      };
      const { data: inserted, error: insErr } = await supabase
        .from("payments")
        .insert(insertPayload as never)
        .select("id")
        .single();
      if (insErr || !inserted) {
        setCreatingCharge(false);
        toast({ title: "Erro ao criar parcela local", description: insErr?.message, variant: "destructive" });
        return;
      }
      // 2) Emite boleto na Cora — sem fallback para Asaas
      const { data: coraResp, error: coraErr } = await supabase.functions.invoke("create-cora-charge", {
        body: { payment_id: inserted.id },
      });
      let body: any = coraResp;
      if (coraErr && (coraErr as any)?.context?.json) {
        try { body = await (coraErr as any).context.json(); } catch { /* */ }
      }
      setCreatingCharge(false);
      if (coraErr || body?.error) {
        const status = body?.cora_status ? ` (HTTP ${body.cora_status})` : "";
        const msg = body?.validation_message || body?.error || coraErr?.message || "Falha ao emitir na Cora";
        toast({ title: "Erro Cora — cobrança NÃO criada no Asaas", description: `${msg}${status}`, variant: "destructive", duration: 12000 });
        console.error("[Cora] erro completo:", body);
        // mantém parcela local sem invoice (admin pode reemitir)
        fetchData();
        return;
      }
      setChargeResult({ payment_id: inserted.id, asaas_charge_id: body?.cora_invoice_id || "—", invoice_url: body?.invoice_url || body?.boleto_url || null });
      toast({ title: "Boleto Cora emitido!" });
      fetchData();
      return;
    }

    // Gateway = ASAAS
    console.log("[ASAAS_FLOW_STARTED]", { responsible: selectedResponsible, billingType });
    const { data, error } = await supabase.functions.invoke("create-asaas-charge", {
      body: {
        responsible_id: selectedResponsible,
        student_id: selectedStudent !== "NONE" ? selectedStudent : undefined,
        contract_id: selectedContract !== "NONE" ? selectedContract : undefined,
        value: parseFloat(chargeValue),
        due_date: chargeDueDate,
        billing_type: billingType,
        description: chargeDescription || undefined,
        payment_type: chargePaymentType,
      },
    });

    setCreatingCharge(false);

    if (error || data?.error) {
      toast({
        title: "Erro ao gerar cobrança",
        description: error?.message || data?.error,
        variant: "destructive",
      });
      return;
    }

    setChargeResult(data as ChargeResult);
    toast({ title: "Cobrança online criada com sucesso!" });
    fetchData();
  };

  const handleCreateManual = async () => {
    if (!manualForm.responsibleId || !manualForm.value || !manualForm.dueDate || !manualForm.description.trim()) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }

    setCreatingManual(true);

    const { data, error } = await supabase.functions.invoke("manage-payment", {
      body: {
        action: "create_manual",
        responsible_id: manualForm.responsibleId,
        student_id: manualForm.studentId !== "NONE" ? manualForm.studentId : null,
        contract_id: manualForm.contractId !== "NONE" ? manualForm.contractId : null,
        payment_type: manualForm.paymentType,
        description: manualForm.description,
        value: parseFloat(manualForm.value),
        due_date: manualForm.dueDate,
      },
    });

    setCreatingManual(false);

    if (error || data?.error) {
      toast({
        title: "Erro ao adicionar parcela",
        description: error?.message || data?.error,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Parcela manual adicionada com sucesso!" });
    setManualDialogOpen(false);
    resetManualForm();
    fetchData();
  };

  const handleOpenEdit = (payment: PaymentRow) => {
    setEditForm({
      paymentId: payment.id,
      value: String(payment.final_value ?? payment.value),
      dueDate: payment.due_date,
      description: payment.description,
      status: (payment.status as PaymentStatus) || "PENDING",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm.paymentId || !editForm.value || !editForm.dueDate || !editForm.description.trim()) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }

    setSavingEdit(true);

    const { data, error } = await supabase.functions.invoke("manage-payment", {
      body: {
        action: "update",
        payment_id: editForm.paymentId,
        value: parseFloat(editForm.value),
        due_date: editForm.dueDate,
        description: editForm.description,
        status: editForm.status,
      },
    });

    setSavingEdit(false);

    if (error || data?.error) {
      toast({
        title: "Erro ao salvar parcela",
        description: error?.message || data?.error,
        variant: "destructive",
      });
      return;
    }

    if (data?.warning) {
      toast({
        title: "Parcela atualizada (com aviso)",
        description: data.warning,
      });
    } else {
      toast({ title: "Parcela atualizada com sucesso!" });
    }
    setEditDialogOpen(false);
    setEditForm(emptyEditForm);
    fetchData();
  };

  const handleAction = async () => {
    if (!actionTarget) return;

    setActionLoading(true);

    const { data, error } = await supabase.functions.invoke("manage-payment", {
      body: {
        action: actionTarget.action,
        payment_id: actionTarget.payment.id,
      },
    });

    setActionLoading(false);

    if (error || data?.error) {
      toast({
        title: "Não foi possível concluir a ação",
        description: error?.message || data?.error,
        variant: "destructive",
      });
      return;
    }

    toast({ title: actionTarget.action === "delete" ? "Parcela excluída com sucesso!" : "Parcela cancelada com sucesso!" });
    setActionTarget(null);
    fetchData();
  };

  const handleSyncPayment = async (paymentId: string) => {
    setSyncingPaymentId(paymentId);
    try {
      // Roteia para a função correta conforme gateway da parcela
      const target = payments.find((p) => p.id === paymentId);
      const gw = (target?.gateway || "").toUpperCase();
      const fn = gw === "CORA" ? "sync-cora-payment" : "sync-asaas-payment";
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { payment_id: paymentId },
      });
      setSyncingPaymentId(null);

      if (error) {
        let errorMsg = error.message;
        try {
          // FunctionsHttpError wraps non-2xx responses — extract JSON body
          if ((error as any).context && typeof (error as any).context.json === "function") {
            const body = await (error as any).context.json();
            errorMsg = body?.error || body?.details?.errors?.[0]?.description || errorMsg;
          }
        } catch { /* ignore parse errors */ }
        toast({ title: "Erro ao sincronizar", description: errorMsg, variant: "destructive" });
        return;
      }

      if (data?.error) {
        toast({ title: "Erro ao sincronizar", description: data.error, variant: "destructive" });
        return;
      }

      const target2 = payments.find((p) => p.id === paymentId);
      const isCora = (target2?.gateway || "").toUpperCase() === "CORA";
      if (isCora) {
        if (data?.after === "PAID") {
          toast({ title: "Pagamento confirmado!", description: "Cora retornou como PAGO." });
        } else {
          toast({
            title: "Ainda não confirmado",
            description: data?.message || `Status atual na Cora: ${data?.cora_status_found || data?.cora_status || "desconhecido"}`,
          });
        }
      } else {
        toast({ title: data?.action === "created" ? "Cobrança criada no Asaas!" : "Dados atualizados do Asaas!" });
      }
      fetchData();
    } catch (err: unknown) {
      setSyncingPaymentId(null);
      toast({ title: "Erro inesperado", description: err instanceof Error ? err.message : "Erro desconhecido", variant: "destructive" });
    }
  };

  const handleEmitCora = async (paymentId: string) => {
    setSyncingPaymentId(paymentId);
    try {
      const { data, error } = await supabase.functions.invoke("create-cora-charge", {
        body: { payment_id: paymentId },
      });

      // Tenta extrair body completo do erro (FunctionsHttpError)
      let body: any = data;
      if (error && (error as any)?.context?.json) {
        try { body = await (error as any).context.json(); } catch { /* */ }
      }

      if (error || body?.error) {
        const status = body?.cora_status ? ` (HTTP ${body.cora_status})` : "";
        const validation = body?.validation_message || body?.error || error?.message || "Falha ao emitir boleto Cora";
        const description = `${validation}${status}`;
        toast({
          title: "Erro ao emitir na Cora",
          description,
          variant: "destructive",
          duration: 12000,
        });
        console.error("[Cora] erro completo:", body);
        return;
      }
      toast({ title: body?.already_emitted ? "Boleto já emitido" : "Boleto emitido na Cora!" });
      fetchData();
    } catch (err) {
      toast({ title: "Erro inesperado", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setSyncingPaymentId(null);
    }
  };

  const handleOpenWhatsApp = async (payment: PaymentRow) => {
    try {
      toast({ title: "Sincronizando cobrança no Asaas antes do envio..." });
      const resolved = await resolveWhatsAppChargeData(payment.id);

      setWaPayment(resolved.payment as PaymentRow);
      setWaResponsible(resolved.responsible);
      setWaStudent(resolved.studentName);
      setWaDescription(resolved.description);
      setWaDialogOpen(true);
    } catch (err) {
      toast({
        title: "Envio bloqueado",
        description: err instanceof Error ? err.message : "Não foi possível obter os dados completos da cobrança no Asaas.",
        variant: "destructive",
      });
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const baseBody = unitFilter !== "ALL" ? { unit_id: unitFilter } : {};
      // Sincroniza Asaas e Cora em paralelo
      const [asaasRes, coraRes] = await Promise.all([
        supabase.functions.invoke("sync-all-payments", { body: baseBody }),
        supabase.functions.invoke("sync-cora-payment", { body: { ...baseBody, all: true } }),
      ]);

      const aData: any = asaasRes.data; const aErr = asaasRes.error;
      const cData: any = coraRes.data;  const cErr = coraRes.error;

      const parts: string[] = [];
      if (aErr || aData?.error) parts.push(`Asaas: erro (${aErr?.message || aData?.error})`);
      else parts.push(aData?.message || `Asaas: ${aData?.synced ?? 0}`);
      if (cErr || cData?.error) parts.push(`Cora: erro (${cErr?.message || cData?.error})`);
      else parts.push(`Cora: ${cData?.message || `${cData?.synced ?? 0} sincronizada(s)`}`);

      toast({ title: "Sincronização concluída", description: parts.join(" | ") });
      fetchData();
    } catch (err: unknown) {
      toast({ title: "Erro inesperado", description: err instanceof Error ? err.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setSyncingAll(false);
    }
  };

  const handleUpdateAllWhatsappNotifs = async () => {
    if (!confirm("Atualizar TODOS os clientes para receberem cobranças exclusivamente via WhatsApp no Asaas? Esta ação desabilita Email/SMS no gateway.")) return;
    setUpdatingNotifs(true);
    try {
      const body: Record<string, string> = {};
      if (unitFilter !== "ALL") body.unit_id = unitFilter;
      const { data, error } = await supabase.functions.invoke("update-asaas-notifications", { body });
      if (error) {
        toast({ title: "Erro ao atualizar notificações", description: error.message, variant: "destructive" });
        return;
      }
      if (data?.error) {
        toast({ title: "Erro", description: data.error, variant: "destructive" });
        return;
      }
      toast({
        title: "📱 WhatsApp configurado!",
        description: data?.message || "Notificações atualizadas no gateway.",
      });
    } catch (err: unknown) {
      toast({ title: "Erro inesperado", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    } finally {
      setUpdatingNotifs(false);
    }
  };

  const handleImportAsaas = async () => {
    setImportingAsaas(true);
    try {
      const body: Record<string, string> = {};
      if (unitFilter !== "ALL") body.unit_id = unitFilter;

      const { data, error } = await supabase.functions.invoke("import-asaas-data", { body });

      if (error) {
        const connectionClosed = /Failed to send a request to the Edge Function/i.test(error.message);

        if (connectionClosed) {
          toast({
            title: "Importação em processamento",
            description: "A conexão expirou, mas a importação continuou no backend. Atualizando a lista...",
          });
          await new Promise((resolve) => window.setTimeout(resolve, 8000));
          await fetchData();
          return;
        }

        toast({ title: "Erro na importação", description: error.message, variant: "destructive" });
        return;
      }

      const result = data as { success?: boolean; message?: string; error?: string };
      if (result?.error) {
        toast({ title: "Erro", description: result.error, variant: "destructive" });
        return;
      }

      toast({ title: "Importação concluída", description: result?.message || "Dados importados com sucesso." });
      fetchData();
    } catch (err) {
      toast({ title: "Erro inesperado", description: err instanceof Error ? err.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setImportingAsaas(false);
    }
  };

  const clearScopedFilters = () => {
    navigate("/admin/cobrancas");
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((p) => p.id)));
    }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    setBulkLoading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const id of selectedIds) {
      const { data, error } = await supabase.functions.invoke("manage-payment", {
        body: { action: bulkAction, payment_id: id },
      });
      if (error || data?.error) {
        errorCount++;
      } else {
        successCount++;
      }
    }

    setBulkLoading(false);
    setBulkAction(null);
    setSelectedIds(new Set());

    toast({
      title: bulkAction === "delete" ? "Exclusão em lote concluída" : "Cancelamento em lote concluído",
      description: `${successCount} parcela(s) processada(s)${errorCount > 0 ? `, ${errorCount} erro(s)` : ""}`,
      variant: errorCount > 0 ? "destructive" : "default",
    });
    fetchData();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Cobranças e Parcelas</h1>
          <p className="text-sm text-muted-foreground">Edite, exclua, cancele e gere cobranças online integradas ao Asaas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="default"
            className="gap-1.5"
            disabled={syncingAll}
            onClick={async () => {
              setSyncingAll(true);
              try {
                const baseBody = unitFilter !== "ALL" ? { unit_id: unitFilter } : {};
                const { data, error } = await supabase.functions.invoke("auto-emit-pending-charges", { body: baseBody });
                if (error || (data as any)?.error) {
                  toast({ title: "Erro ao emitir pendentes", description: error?.message || (data as any)?.error, variant: "destructive" });
                } else {
                  toast({ title: "Emissão automática iniciada", description: `${(data as any)?.queued ?? 0} parcela(s) sendo emitida(s) no banco escolhido. Atualize em alguns segundos.` });
                  setTimeout(() => fetchData(), 4000);
                }
              } finally {
                setSyncingAll(false);
              }
            }}
          >
            {syncingAll ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Emitir Pendentes
          </Button>
          <Button
            variant="outline"
            className="gap-1.5"
            disabled={syncingAll}
            onClick={handleSyncAll}
          >
            {syncingAll ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Sincronizar Status
           </Button>
          <Button
            variant="outline"
            className="gap-1.5"
            disabled={importingAsaas}
            onClick={handleImportAsaas}
          >
            {importingAsaas ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Importar do Asaas
          </Button>
          <Button
            variant="outline"
            className="gap-1.5"
            disabled={updatingNotifs}
            onClick={handleUpdateAllWhatsappNotifs}
            title="Configura todos os clientes no Asaas para receberem cobranças apenas via WhatsApp"
          >
            {updatingNotifs ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
            WhatsApp em Massa
          </Button>

          <Dialog
            open={chargeDialogOpen}
            onOpenChange={(open) => {
              setChargeDialogOpen(open);
              if (!open) resetOnlineForm();
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-1.5">
                <RefreshCw size={16} /> Gerar Cobrança Online
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Nova Cobrança Online</DialogTitle>
              </DialogHeader>
              {!chargeResult ? (
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label>Responsável *</Label>
                    <Select
                      value={selectedResponsible}
                      onValueChange={(value) => {
                        setSelectedResponsible(value);
                        setSelectedStudent("NONE");
                        setSelectedContract("NONE");
                        // Pré-define gateway com base na unidade do responsável
                        const respUnitId = profiles[value]?.unit_id;
                        const respUnit = units.find((u) => u.id === respUnitId);
                        const pref = (respUnit?.preferred_bank || "asaas").toLowerCase();
                        setChargeGateway(pref === "cora" ? "CORA" : "ASAAS");
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
                      <SelectContent>
                        {responsibles.map((responsible) => (
                          <SelectItem key={responsible.id} value={responsible.id}>{responsible.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Contrato vinculado</Label>
                      <Select
                        value={selectedContract}
                        onValueChange={(value) => {
                          const contract = contracts.find((item) => item.id === value);
                          setSelectedContract(value);
                          if (contract?.student_id) setSelectedStudent(contract.student_id);
                          if (contract?.description) setChargeDescription(contract.description);
                          if (value !== "NONE") setChargePaymentType(contract?.description?.toLowerCase().includes("apostila") ? "APOSTILA" : "MENSALIDADE");
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Sem contrato" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">Sem contrato</SelectItem>
                          {chargeContracts.map((contract) => (
                            <SelectItem key={contract.id} value={contract.id}>
                              {contract.contract_number ? `${contract.contract_number} - ` : ""}{contract.description}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Aluno</Label>
                      <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                        <SelectTrigger><SelectValue placeholder="Sem aluno" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">Sem aluno</SelectItem>
                          {chargeStudents.map((student) => (
                            <SelectItem key={student.id} value={student.id}>{student.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Tipo *</Label>
                      <Select value={chargePaymentType} onValueChange={(value) => setChargePaymentType(value as PaymentType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MENSALIDADE">Mensalidade</SelectItem>
                          <SelectItem value="APOSTILA">Apostila</SelectItem>
                          <SelectItem value="MATRICULA">Matrícula</SelectItem>
                          <SelectItem value="AVULSA">Avulsa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Forma de pagamento *</Label>
                      <Select value={billingType} onValueChange={(value) => setBillingType(value as BillingType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PIX">PIX</SelectItem>
                          <SelectItem value="BOLETO">Boleto</SelectItem>
                          <SelectItem value="CARD">Cartão</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Gateway de Pagamento *</Label>
                    <Select value={chargeGateway} onValueChange={(v) => setChargeGateway(v as "ASAAS" | "CORA")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ASAAS">Asaas</SelectItem>
                        <SelectItem value="CORA">Banco Cora (somente boleto)</SelectItem>
                      </SelectContent>
                    </Select>
                    {chargeGateway === "CORA" && billingType !== "BOLETO" && (
                      <p className="text-[11px] text-warning">Banco Cora só emite Boleto. Altere a forma de pagamento.</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label>Descrição</Label>
                    <Input value={chargeDescription} onChange={(event) => setChargeDescription(event.target.value)} placeholder="Ex: Mensalidade UPLAY" />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Valor *</Label>
                      <Input type="number" min="10" step="0.01" value={chargeValue} onChange={(event) => setChargeValue(event.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Vencimento *</Label>
                      <Input type="date" value={chargeDueDate} onChange={(event) => setChargeDueDate(event.target.value)} />
                    </div>
                  </div>

                  <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                    Unidade da cobrança: <span className="font-medium text-foreground">{currentChargeUnit}</span>
                  </div>

                  <Button className="w-full" onClick={handleCreateCharge} disabled={creatingCharge}>
                    {creatingCharge ? <><Loader2 size={16} className="animate-spin mr-2" /> Gerando...</> : "Gerar Cobrança"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                    <p className="text-sm font-semibold text-primary">Cobrança criada com sucesso!</p>
                    <p className="text-xs text-muted-foreground">ID financeiro: {chargeResult.asaas_charge_id}</p>
                  </div>
                  {chargeResult.invoice_url && (
                    <Button className="w-full" asChild>
                      <a href={chargeResult.invoice_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={14} /> Abrir fatura
                      </a>
                    </Button>
                  )}
                  <Button variant="secondary" className="w-full" onClick={resetOnlineForm}>Gerar outra cobrança</Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {(scopedResponsibleId || scopedContractId) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          <span>
            Exibindo histórico filtrado
            {scopedResponsibleId && profiles[scopedResponsibleId] ? ` para ${profiles[scopedResponsibleId].full_name}` : ""}
            {scopedContractId && contractMap[scopedContractId] ? ` • ${contractMap[scopedContractId].description}` : ""}
          </span>
          <Button variant="outline" size="sm" onClick={clearScopedFilters}>Limpar filtro</Button>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-4">
        <Input
          className="lg:col-span-1"
          placeholder="Buscar cliente, aluno, contrato ou descrição..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select value={unitFilter} onValueChange={setUnitFilter}>
          <SelectTrigger><SelectValue placeholder="Unidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas as unidades</SelectItem>
            {units.map((unit) => (
              <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os status</SelectItem>
            <SelectItem value="PENDING">Pendente</SelectItem>
            <SelectItem value="PAID">Pago</SelectItem>
            <SelectItem value="OVERDUE">Vencido</SelectItem>
            <SelectItem value="CANCELLED">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os tipos</SelectItem>
            <SelectItem value="MENSALIDADE">Mensalidade</SelectItem>
            <SelectItem value="APOSTILA">Apostila</SelectItem>
            <SelectItem value="MATRICULA">Matrícula</SelectItem>
            <SelectItem value="AVULSA">Avulsa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loadingData ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma parcela encontrada.</div>
      ) : (
        <div className="space-y-3">
          {/* Bulk actions bar */}
          <div className="flex items-center gap-3 px-1">
            <Checkbox
              checked={selectedIds.size === filtered.length && filtered.length > 0}
              onCheckedChange={toggleSelectAll}
              aria-label="Selecionar todas"
            />
            <span className="text-xs text-muted-foreground">
              {selectedIds.size > 0 ? `${selectedIds.size} selecionada(s)` : "Selecionar todas"}
            </span>
            {selectedIds.size > 0 && (
              <div className="flex gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-7 text-warning border-warning/40 hover:bg-warning/10"
                  onClick={() => setBulkAction("cancel")}
                >
                  <Ban size={12} /> Cancelar selecionadas
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-7 text-destructive border-destructive/40 hover:bg-destructive/10"
                  onClick={() => setBulkAction("delete")}
                >
                  <Trash2 size={12} /> Excluir selecionadas
                </Button>
              </div>
            )}
          </div>

          {filtered.map((payment) => {
            const responsible = profiles[payment.responsible_id]?.full_name || "—";
            const contract = payment.contract_id ? contractMap[payment.contract_id]?.description || "—" : "Sem contrato";
            const student = payment.student_id ? studentMap[payment.student_id] || "—" : "Sem aluno";
            const unit = unitMap[payment.unit_id] || "—";
            const paymentValue = Number(payment.final_value ?? payment.value);
            const paymentType = typeLabels[payment.payment_type as PaymentType] || payment.payment_type || "—";
            const status = (payment.status as PaymentStatus) || "PENDING";
            const dueDate = startOfDay(new Date(payment.due_date + "T12:00:00"));
            const today = startOfDay(new Date());
            const isOverdue = (status === "OVERDUE") || (status === "PENDING" && isBefore(dueDate, today));
            const daysOverdue = isOverdue ? differenceInDays(today, dueDate) : 0;

            return (
              <div key={payment.id} className={`glass-card p-4 space-y-4 ${isOverdue ? "border-destructive/50 bg-destructive/5" : ""} ${selectedIds.has(payment.id) ? "ring-1 ring-primary/50" : ""}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-3 items-start min-w-0">
                    <Checkbox
                      checked={selectedIds.has(payment.id)}
                      onCheckedChange={() => toggleSelect(payment.id)}
                      className="mt-1 shrink-0"
                      aria-label={`Selecionar ${payment.description}`}
                    />
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`text-sm font-semibold truncate ${isOverdue ? "text-destructive" : "text-foreground"}`}>{payment.description || `Parcela ${payment.installment_number}`}</h3>
                      <Badge variant="secondary">{paymentType}</Badge>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${isOverdue ? "status-overdue" : statusClasses[status]}`}>
                        {isOverdue ? "Vencido" : statusLabels[status]}
                      </span>
                      {isOverdue && (
                        <span className="text-[10px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full animate-pulse">
                          ⚠️ {daysOverdue}d atraso
                        </span>
                      )}
                    </div>
                    <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
                      <p><span className="font-medium text-foreground">Cliente:</span> {responsible}</p>
                      <p><span className="font-medium text-foreground">Aluno:</span> {student}</p>
                      <p><span className="font-medium text-foreground">Contrato:</span> {contract}</p>
                      <p><span className="font-medium text-foreground">Parcela:</span> #{payment.installment_number}</p>
                      <p><span className={`font-medium ${isOverdue ? "text-destructive" : "text-foreground"}`}>Vencimento:</span> {new Date(`${payment.due_date}T12:00:00`).toLocaleDateString("pt-BR")}</p>
                      <p><span className="font-medium text-foreground">Unidade:</span> {unit}</p>
                    </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-3 lg:items-end">
                    <p className={`text-lg font-bold ${isOverdue ? "text-destructive" : "text-foreground"}`}>R$ {paymentValue.toFixed(2).replace(".", ",")}</p>

                    {/* Action buttons row */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Abrir Boleto / Fatura */}
                      {(payment.invoice_url || payment.boleto_url || payment.checkout_url) ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs h-7"
                            onClick={() => setBoletoViewerUrl(payment.invoice_url || payment.boleto_url || payment.checkout_url || null)}
                          >
                            <ExternalLink size={12} /> Ver Boleto
                          </Button>
                          <a
                            href={payment.invoice_url || payment.boleto_url || payment.checkout_url || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7">
                              <ExternalLink size={12} /> Abrir externo
                            </Button>
                          </a>
                        </>
                      ) : (
                        payment.asaas_payment_id && (
                          <span className="text-[10px] text-muted-foreground italic">Sem link disponível</span>
                        )
                      )}

                      {/* Copiar Link */}
                      {(payment.invoice_url || payment.boleto_url || payment.checkout_url) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs h-7"
                          onClick={() => {
                            const link = payment.invoice_url || payment.boleto_url || payment.checkout_url || "";
                            navigator.clipboard.writeText(link);
                            toast({ title: "Link copiado!" });
                          }}
                        >
                          <Copy size={12} /> Copiar Link
                        </Button>
                      )}

                      {/* PIX Copia e Cola */}
                      {payment.pix_copy_paste && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs h-7"
                          onClick={() => {
                            navigator.clipboard.writeText(payment.pix_copy_paste || "");
                            toast({ title: "Código PIX copiado!" });
                          }}
                        >
                          <Copy size={12} /> PIX
                        </Button>
                      )}

                      {/* WhatsApp */}
                      {(payment.status === "PENDING" || payment.status === "OVERDUE") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-xs h-7 text-success hover:text-success hover:bg-success/10"
                          onClick={() => handleOpenWhatsApp(payment)}
                        >
                          <MessageCircle size={12} /> WhatsApp
                        </Button>
                      )}

                      {/* Ver detalhes */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs h-7"
                        onClick={() => navigate(`/app/payment/${payment.id}`)}
                      >
                        <ExternalLink size={12} /> Detalhes
                      </Button>
                    </div>

                    {/* Management icons */}
                    <div className="flex items-center gap-0.5">
                      <button
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        title="Editar parcela"
                        onClick={() => handleOpenEdit(payment)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-warning"
                        title="Cancelar parcela"
                        onClick={() => setActionTarget({ payment, action: "cancel" })}
                      >
                        <Ban size={13} />
                      </button>
                      <button
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                        title="Excluir parcela"
                        onClick={() => setActionTarget({ payment, action: "delete" })}
                      >
                        <Trash2 size={13} />
                      </button>
                      <button
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                        title="Gerar nova parcela"
                        onClick={() => openManualDialog({
                          responsibleId: payment.responsible_id,
                          studentId: payment.student_id || "NONE",
                          contractId: payment.contract_id || "NONE",
                          paymentType: (payment.payment_type as PaymentType) || "AVULSA",
                          description: payment.description,
                          value: String(payment.final_value ?? payment.value),
                        })}
                      >
                        <Plus size={13} />
                      </button>
                    </div>

                    {/* Emissão dinâmica conforme gateway da parcela */}
                    {(() => {
                      if (payment.payment_method === "DINHEIRO") return null;
                      if (payment.status === "PAID" || payment.status === "CANCELLED") return null;
                      const unit = units.find((u) => u.id === payment.unit_id);
                      const unitPref = (unit?.preferred_bank || "").toLowerCase();
                      const gw = (payment.gateway || (unitPref === "cora" ? "CORA" : "ASAAS")).toUpperCase();
                      const hasExternalId = gw === "CORA" ? !!payment.cora_invoice_id : !!payment.asaas_payment_id;
                      const emissionStatus = (payment.emission_status || (hasExternalId ? "EMITTED" : "PENDING")).toUpperCase();
                      const isError = emissionStatus === "ERROR" && !hasExternalId;
                      const isEmitted = hasExternalId || emissionStatus === "EMITTED";

                      // Sucesso → mostra link/sincronizar
                      if (isEmitted) {
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground italic">
                              Banco: {gw === "CORA" ? "Cora" : "Asaas"} · Emitida
                            </span>
                            <Button
                              variant="ghost" size="sm"
                              className="gap-1.5 text-xs h-7"
                              disabled={syncingPaymentId === payment.id}
                              onClick={() => handleSyncPayment(payment.id)}
                            >
                              {syncingPaymentId === payment.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                              Sincronizar
                            </Button>
                          </div>
                        );
                      }

                      // Erro → mostra mensagem real + botão de reemitir
                      if (isError) {
                        const errMsg = payment.emission_error_message || "Erro desconhecido na emissão.";
                        const attempts = payment.emission_attempts ?? 0;
                        return (
                          <div className="flex flex-col gap-1.5 w-full">
                            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
                              <span className="text-[10px] font-semibold text-destructive whitespace-nowrap">
                                ⚠ Erro {gw === "CORA" ? "Cora" : "Asaas"}
                                {attempts > 0 ? ` (${attempts}x)` : ""}:
                              </span>
                              <span className="text-[10px] text-destructive/90 leading-tight">
                                {errMsg}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline" size="sm"
                                className="gap-1.5 text-xs h-7 border-destructive/40 text-destructive hover:bg-destructive/10"
                                disabled={syncingPaymentId === payment.id}
                                onClick={() => gw === "CORA" ? handleEmitCora(payment.id) : handleSyncPayment(payment.id)}
                              >
                                {syncingPaymentId === payment.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                Reemitir cobrança
                              </Button>
                              <Button
                                variant="ghost" size="sm"
                                className="text-[10px] h-7 text-muted-foreground"
                                onClick={() => navigate(`/app/payment/${payment.id}`)}
                              >
                                Ver detalhes
                              </Button>
                            </div>
                          </div>
                        );
                      }

                      // PENDING (ainda não tentou) → emitir
                      return (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground italic">
                            Banco: {gw === "CORA" ? "Cora" : "Asaas"} · Aguardando emissão
                          </span>
                          <Button
                            variant="outline" size="sm"
                            className="gap-1.5 text-xs h-7 border-primary/40 text-primary hover:bg-primary/10"
                            disabled={syncingPaymentId === payment.id}
                            onClick={() => gw === "CORA" ? handleEmitCora(payment.id) : handleSyncPayment(payment.id)}
                          >
                            {syncingPaymentId === payment.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                            Emitir agora
                          </Button>
                        </div>
                      );
                    })()}

                    {payment.asaas_payment_id && !(payment.invoice_url || payment.boleto_url) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs h-7"
                        disabled={syncingPaymentId === payment.id}
                        onClick={() => handleSyncPayment(payment.id)}
                      >
                        {syncingPaymentId === payment.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <RefreshCw size={12} />
                        )}
                        Sincronizar
                      </Button>
                    )}

                    {!payment.asaas_payment_id && payment.payment_method === "DINHEIRO" && (
                      <span className="text-[10px] text-muted-foreground italic">Pagamento em dinheiro</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Parcela</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <Input value={editForm.description} onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Valor *</Label>
                <Input type="number" min="0.01" step="0.01" value={editForm.value} onChange={(event) => setEditForm((current) => ({ ...current, value: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Vencimento *</Label>
                <Input type="date" value={editForm.dueDate} onChange={(event) => setEditForm((current) => ({ ...current, dueDate: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status *</Label>
              <Select value={editForm.status} onValueChange={(value) => setEditForm((current) => ({ ...current, status: value as PaymentStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pendente</SelectItem>
                  <SelectItem value="OVERDUE">Vencido</SelectItem>
                  <SelectItem value="PAID">Pago</SelectItem>
                  <SelectItem value="CANCELLED">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? <><Loader2 size={16} className="animate-spin mr-2" /> Salvando...</> : "Salvar Alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!actionTarget} onOpenChange={(open) => !open && setActionTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{actionTarget?.action === "delete" ? "Excluir parcela" : "Cancelar parcela"}</AlertDialogTitle>
            <AlertDialogDescription>
              {actionTarget?.action === "delete"
                ? "Confirme a exclusão da parcela. Parcelas pagas não podem ser excluídas."
                : "A parcela será mantida no histórico, mas ficará com status cancelado."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleAction} disabled={actionLoading} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {actionLoading ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
              {actionTarget?.action === "delete" ? "Excluir" : "Cancelar parcela"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk action dialog */}
      <AlertDialog open={!!bulkAction} onOpenChange={(open) => !open && setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{bulkAction === "delete" ? "Excluir parcelas selecionadas" : "Cancelar parcelas selecionadas"}</AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === "delete"
                ? `Tem certeza que deseja excluir ${selectedIds.size} parcela(s)? Parcelas pagas não serão excluídas.`
                : `Tem certeza que deseja cancelar ${selectedIds.size} parcela(s)?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkLoading}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkAction} disabled={bulkLoading} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {bulkLoading ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
              {bulkAction === "delete" ? `Excluir ${selectedIds.size}` : `Cancelar ${selectedIds.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {waPayment && waResponsible && (
        <WhatsAppDialog
          open={waDialogOpen}
          onOpenChange={setWaDialogOpen}
          phone={waResponsible.phone}
          responsibleName={waResponsible.full_name}
          studentName={waStudent}
          description={waDescription}
          value={Number(waPayment.final_value ?? waPayment.value)}
          dueDate={waPayment.due_date}
          invoiceUrl={waPayment.invoice_url || waPayment.checkout_url}
          boletoUrl={waPayment.boleto_url}
          pixCopyPaste={waPayment.pix_copy_paste}
          paymentMethod={waPayment.payment_method}
          paymentId={waPayment.id}
          responsibleId={waPayment.responsible_id}
        />
      )}

      {/* Boleto Viewer Dialog */}
      <Dialog open={!!boletoViewerUrl} onOpenChange={(open) => { if (!open) setBoletoViewerUrl(null); }}>
        <DialogContent className="sm:max-w-4xl h-[85vh] flex flex-col p-0">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="flex items-center justify-between">
              Visualizar Boleto / Fatura
              <a href={boletoViewerUrl || "#"} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <ExternalLink size={12} /> Abrir em nova aba
                </Button>
              </a>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 px-4 pb-4">
            {boletoViewerUrl && (
              <iframe
                src={boletoViewerUrl}
                className="w-full h-full rounded-md border"
                title="Boleto / Fatura"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCharges;
