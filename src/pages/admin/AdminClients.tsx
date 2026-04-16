import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Loader2, MessageCircle, Plus, RefreshCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { openWhatsApp } from "@/lib/whatsapp-utils";
import { buildClientAccessMessage, isValidEmail } from "@/lib/client-access";
import UserEditDialog from "@/components/admin/UserEditDialog";
import UserActionButtons from "@/components/admin/UserActionButtons";

interface ClientRow {
  id: string;
  full_name: string;
  cpf: string;
  phone: string | null;
  unit_id: string | null;
  active: boolean;
  email: string | null;
  address: string | null;
  source: "profile" | "contract_snapshot";
  contract_ids?: string[];
  student_names?: string[];
}

interface StudentRow {
  id: string;
  full_name: string;
  responsible_id: string;
}

interface UnitRow {
  id: string;
  name: string;
}

interface PaymentRow {
  id: string;
  responsible_id: string;
  contract_id: string | null;
  student_id: string | null;
  description: string;
  payment_type: string;
  installment_number: number;
  due_date: string;
  status: string;
  value: number;
  final_value: number | null;
  unit_id: string;
}

interface PaymentCountRow {
  responsible_id: string;
  count: number;
}

interface ContractLinkRow {
  id: string;
  responsible_id: string;
  responsible_name: string | null;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  address_number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  unit_id: string;
  student_id: string | null;
  description: string;
  status: string;
  contract_number: string | null;
  rg?: string | null;
}

type ActionType = "deactivate" | "reactivate" | "permanent_delete";
type PaymentStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
type PaymentType = "MENSALIDADE" | "APOSTILA" | "AVULSA";

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
};

const AdminClients = () => {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentCounts, setPaymentCounts] = useState<Map<string, number>>(new Map());
  const [expandedPayments, setExpandedPayments] = useState<Map<string, PaymentRow[]>>(new Map());
  const [contracts, setContracts] = useState<ContractLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<{ client: ClientRow; action: ActionType } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<ClientRow | null>(null);
  const [dependencyBlocker, setDependencyBlocker] = useState<{ client: ClientRow; paymentCount: number; contractCount: number } | null>(null);
  const { toast } = useToast();
  const { profile, hasRole } = useAuth();

  const [formName, setFormName] = useState("");
  const [formCpf, setFormCpf] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formStudentName, setFormStudentName] = useState("");
  const [formUnitId, setFormUnitId] = useState("");
  const [syncingClientId, setSyncingClientId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);

    const [profilesRes, rolesRes, studentsRes, unitsRes, contractsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, cpf, phone, unit_id, active, email, address").order("full_name"),
      supabase.from("user_roles").select("user_id").eq("role", "RESPONSAVEL"),
      supabase.from("students").select("id, full_name, responsible_id").order("full_name"),
      supabase.from("units").select("id, name").order("name"),
      supabase.from("contracts").select("id, responsible_id, responsible_name, cpf, email, phone, address, address_number, complement, neighborhood, city, state, zip_code, rg, unit_id, student_id, description, status, contract_number"),
    ]);

    // Fetch ALL payment counts using pagination to avoid 1000 row limit
    const allPaymentRows: Array<{ responsible_id: string }> = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: batch } = await supabase
        .from("payments")
        .select("responsible_id")
        .range(from, from + pageSize - 1);
      if (!batch || batch.length === 0) break;
      allPaymentRows.push(...(batch as Array<{ responsible_id: string }>));
      if (batch.length < pageSize) break;
      from += pageSize;
    }

    const countMap = new Map<string, number>();
    for (const row of allPaymentRows) {
      countMap.set(row.responsible_id, (countMap.get(row.responsible_id) || 0) + 1);
    }
    setPaymentCounts(countMap);

    if (profilesRes.data && rolesRes.data && studentsRes.data && contractsRes.data) {
      const responsibleIds = new Set(rolesRes.data.map((row: { user_id: string }) => row.user_id));
      const studentNamesByResponsible = new Map<string, string[]>();

      (studentsRes.data as StudentRow[]).forEach((student) => {
        const names = studentNamesByResponsible.get(student.responsible_id) || [];
        names.push(student.full_name);
        studentNamesByResponsible.set(student.responsible_id, names);
      });

      const profileClients = (profilesRes.data as ClientRow[])
        .filter((row) => responsibleIds.has(row.id))
        .map((row) => ({
          ...row,
          source: "profile" as const,
          contract_ids: [],
          student_names: studentNamesByResponsible.get(row.id) || [],
        }));

      const profileIds = new Set(profileClients.map((client) => client.id));
      const snapshotClients = (contractsRes.data as ContractLinkRow[])
        .filter((contract) => contract.responsible_id && !profileIds.has(contract.responsible_id))
        .reduce<ClientRow[]>((acc, contract) => {
          const existing = acc.find((client) => client.id === contract.responsible_id);
          const studentName = (studentsRes.data as StudentRow[]).find((student) => student.id === contract.student_id)?.full_name;

          if (existing) {
            existing.contract_ids = [...new Set([...(existing.contract_ids || []), contract.id])];
            existing.student_names = [...new Set([...(existing.student_names || []), ...(studentName ? [studentName] : [])])];
            return acc;
          }

          acc.push({
            id: contract.responsible_id,
            full_name: contract.responsible_name || "Responsável sem nome",
            cpf: contract.cpf || "",
            phone: contract.phone,
            unit_id: contract.unit_id,
            active: true,
            email: contract.email,
            address: contract.address,
            source: "contract_snapshot",
            contract_ids: [contract.id],
            student_names: studentName ? [studentName] : [],
          });

          return acc;
        }, []);

      setClients([...profileClients, ...snapshotClients].sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR")));
    }

    if (studentsRes.data) setStudents(studentsRes.data as StudentRow[]);
    if (unitsRes.data) setUnits(unitsRes.data as UnitRow[]);
    if (contractsRes.data) setContracts(contractsRes.data as ContractLinkRow[]);
    setLoading(false);
  };

  const fetchClientPayments = async (clientId: string, contractIds: string[]) => {
    // Fetch all payments for this specific client with pagination
    const allRows: PaymentRow[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: batch } = await supabase
        .from("payments")
        .select("id, responsible_id, contract_id, student_id, description, payment_type, installment_number, due_date, status, value, final_value, unit_id")
        .eq("responsible_id", clientId)
        .order("due_date", { ascending: false })
        .range(from, from + pageSize - 1);
      if (!batch || batch.length === 0) break;
      allRows.push(...(batch as PaymentRow[]));
      if (batch.length < pageSize) break;
      from += pageSize;
    }

    // Also fetch payments linked to contracts if any
    if (contractIds.length > 0) {
      for (const contractId of contractIds) {
        const { data: contractPayments } = await supabase
          .from("payments")
          .select("id, responsible_id, contract_id, student_id, description, payment_type, installment_number, due_date, status, value, final_value, unit_id")
          .eq("contract_id", contractId)
          .order("due_date", { ascending: false });
        if (contractPayments) {
          const existingIds = new Set(allRows.map(r => r.id));
          for (const p of contractPayments as PaymentRow[]) {
            if (!existingIds.has(p.id)) allRows.push(p);
          }
        }
      }
    }

    return allRows;
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (profile?.unit_id && !formUnitId) setFormUnitId(profile.unit_id);
  }, [profile, formUnitId]);

  const unitMap = useMemo(() => Object.fromEntries(units.map((unit) => [unit.id, unit.name])), [units]);
  const studentMap = useMemo(() => Object.fromEntries(students.map((student) => [student.id, student.full_name])), [students]);

  const resetForm = () => {
    setFormName("");
    setFormCpf("");
    setFormPhone("");
    setFormEmail("");
    setFormPassword("");
    setFormStudentName("");
    setFormUnitId(profile?.unit_id || "");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formName || !formCpf || !formPassword) {
      toast({
        title: "Preencha os campos obrigatórios",
        description: "Nome, CPF e senha são obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    if (formEmail.trim() && !isValidEmail(formEmail.trim())) {
      toast({
        title: "E-mail inválido",
        description: "Informe um e-mail válido para o cliente.",
        variant: "destructive",
      });
      return;
    }

    const unitId = hasRole("ADMIN_MASTER") ? formUnitId : profile?.unit_id;
    if (!unitId) {
      toast({ title: "Selecione uma unidade", variant: "destructive" });
      return;
    }

    setCreating(true);

    const { data, error } = await supabase.functions.invoke("create-user", {
      body: {
        cpf: formCpf,
        full_name: formName,
        phone: formPhone || undefined,
        email: formEmail || undefined,
        password: formPassword,
        role: "RESPONSAVEL",
        unit_id: unitId,
      },
    });

    if (error || data?.error) {
      toast({
        title: "Erro ao criar cliente",
        description: error?.message || data?.error,
        variant: "destructive",
      });
      setCreating(false);
      return;
    }

    if (formStudentName && data?.user_id) {
      const { error: studentError } = await supabase.from("students").insert({
        full_name: formStudentName,
        responsible_id: data.user_id,
        unit_id: unitId,
      });

      if (studentError) {
        toast({
          title: "Cliente criado, mas aluno não foi salvo",
          description: studentError.message,
          variant: "destructive",
        });
      }
    }

    toast({ title: "Cliente criado com sucesso!" });
    setCreating(false);
    setDialogOpen(false);
    resetForm();
    await fetchData();
  };

  const handleDeleteRequest = (client: ClientRow) => {
    // Always go to permanent_delete - the edge function handles cascade logic
    setActionTarget({ client, action: "permanent_delete" });
  };

  const handleAction = async (forceCascade = false) => {
    if (!actionTarget) return;
    setActionLoading(true);

    const { client, action } = actionTarget;
    const body: Record<string, unknown> = { user_id: client.id };

    if (action === "reactivate") body.action = "reactivate";
    else if (action === "permanent_delete") {
      body.action = "permanent_delete";
      if (forceCascade) body.force_cascade = true;
    }

    const { data, error } = await supabase.functions.invoke("delete-user", { body });

    if (error || data?.error) {
      // If has unpaid dependencies, offer cascade option
      if (data?.has_dependencies && !data?.has_paid) {
        setActionLoading(false);
        setActionTarget(null);
        setDependencyBlocker({
          client,
          paymentCount: data.payment_count ?? 0,
          contractCount: data.contract_count ?? 0,
        });
        return;
      }

      toast({
        title: "Erro",
        description: data?.has_paid
          ? `Este cliente possui ${data.paid_count} pagamentos confirmados e não pode ser excluído. Use desativar.`
          : error?.message || data?.error,
        variant: "destructive",
      });
    } else {
      const messages: Record<ActionType, string> = {
        deactivate: "Cliente desativado com sucesso",
        reactivate: "Cliente reativado com sucesso",
        permanent_delete: "Cliente excluído permanentemente",
      };
      toast({ title: messages[action] });
    }

    setActionLoading(false);
    setActionTarget(null);
    await fetchData();
  };

  const getStudents = (responsibleId: string, fallbackNames?: string[]) => {
    const namesFromStudents = students
      .filter((student) => student.responsible_id === responsibleId)
      .map((student) => student.full_name);

    const combined = [...new Set([...(fallbackNames || []), ...namesFromStudents])];
    return combined.join(", ");
  };

  const getClientPayments = (client: ClientRow) => {
    return expandedPayments.get(client.id) || [];
  };

  const getClientPaymentCount = (client: ClientRow) => {
    return paymentCounts.get(client.id) || 0;
  };

  const handleExpandClient = async (clientId: string, contractIds: string[]) => {
    if (expandedClientId === clientId) {
      setExpandedClientId(null);
      return;
    }
    setExpandedClientId(clientId);
    if (!expandedPayments.has(clientId)) {
      const clientPayments = await fetchClientPayments(clientId, contractIds);
      setExpandedPayments(prev => new Map(prev).set(clientId, clientPayments));
    }
  };

  const getClientContracts = (client: ClientRow) => {
    const contractIds = new Set(client.contract_ids || []);
    return contracts.filter((contract) => contract.responsible_id === client.id || contractIds.has(contract.id));
  };

  const formatContractAddress = (contract?: ContractLinkRow) => {
    if (!contract) return "";

    return [
      [contract.address, contract.address_number].filter(Boolean).join(", "),
      contract.complement,
      contract.neighborhood,
      [contract.city, contract.state].filter(Boolean).join("/"),
      contract.zip_code,
    ]
      .filter((value) => !!value && value.trim() !== "")
      .join(" • ");
  };

  const filtered = clients.filter((client) => {
    if (!showInactive && !client.active) return false;
    if (!search.trim()) return true;

    const q = search.toLowerCase().trim();
    const qDigits = q.replace(/\D/g, "");
    const studentNames = getStudents(client.id, client.student_names).toLowerCase();
    const cpfDigits = (client.cpf || "").replace(/\D/g, "");
    const phoneDigits = (client.phone || "").replace(/\D/g, "");
    const normalizedEmail = (client.email || "").toLowerCase();
    const normalizedPhone = (client.phone || "").toLowerCase();

    return (
      client.full_name.toLowerCase().includes(q) ||
      normalizedEmail.includes(q) ||
      studentNames.includes(q) ||
      (qDigits.length > 0 && cpfDigits.includes(qDigits)) ||
      (qDigits.length > 0 && phoneDigits.includes(qDigits)) ||
      normalizedPhone.includes(q)
    );
  });

  const handleSendAccess = (client: ClientRow) => {
    if (!client.phone) {
      toast({ title: "Cliente sem telefone cadastrado", description: "Edite o cliente e adicione um telefone.", variant: "destructive" });
      return;
    }

    const message = buildClientAccessMessage({
      cpf: client.cpf,
      email: client.email,
      fullName: client.full_name,
    });

    if (!client.cpf && !client.email) {
      toast({ title: "Cliente sem login definido", description: "É necessário CPF ou e-mail.", variant: "destructive" });
      return;
    }

    openWhatsApp(client.phone, message);
  };

  const handleManualSync = async (client: ClientRow) => {
    if (client.source !== "profile") {
      toast({
        title: "Sincronização indisponível",
        description: "Esse cadastro existe apenas como snapshot de contrato.",
        variant: "destructive",
      });
      return;
    }

    setSyncingClientId(client.id);

    const { data, error } = await supabase.functions.invoke("sync-client-emails", {
      body: {
        profile_id: client.id,
        unit_id: client.unit_id,
        update_name: true,
        update_phone: true,
      },
    });

    setSyncingClientId(null);

    if (error || data?.error) {
      toast({
        title: "Erro ao sincronizar com Asaas",
        description: error?.message || data?.error,
        variant: "destructive",
      });
      return;
    }

    if (data?.updated > 0) {
      toast({ title: "Cliente sincronizado com Asaas" });
      await fetchData();
      return;
    }

    toast({
      title: "Nenhuma alteração necessária",
      description: data?.protected_conflicts > 0
        ? "Existe um e-mail válido diferente do Asaas e ele foi preservado."
        : "Os dados já estavam consistentes para este cliente.",
    });
  };

  const getAlertContent = () => {
    if (!actionTarget) return { title: "", description: "" };

    const { client, action } = actionTarget;

    if (action === "permanent_delete") {
      return {
        title: "Excluir cliente permanentemente",
        description: `Essa ação é irreversível. Deseja continuar com a exclusão de \"${client.full_name}\"?`,
      };
    }

    if (action === "deactivate") {
      return {
        title: "Desativar cliente",
        description: `Tem certeza que deseja desativar \"${client.full_name}\"? O histórico financeiro será mantido.`,
      };
    }

    return {
      title: "Reativar cliente",
      description: `Deseja reativar \"${client.full_name}\"? O cliente voltará a ficar disponível no sistema.`,
    };
  };

  const alertContent = getAlertContent();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Clientes (Responsáveis)</h1>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus size={16} className="mr-2" /> Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">Novo Cliente</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleCreate}>
              {hasRole("ADMIN_MASTER") && (
                <div className="space-y-2">
                  <Label className="text-foreground">Unidade *</Label>
                  <Select value={formUnitId} onValueChange={setFormUnitId}>
                    <SelectTrigger className="bg-input border-border text-foreground">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {units.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2 col-span-2">
                  <Label className="text-foreground">Nome do Responsável *</Label>
                  <Input className="bg-input border-border text-foreground" placeholder="Nome completo" value={formName} onChange={(e) => setFormName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">CPF *</Label>
                  <Input className="bg-input border-border text-foreground" placeholder="000.000.000-00" value={formCpf} onChange={(e) => setFormCpf(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Telefone</Label>
                  <Input className="bg-input border-border text-foreground" placeholder="(00) 00000-0000" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label className="text-foreground">E-mail</Label>
                  <Input
                    className="bg-input border-border text-foreground"
                    type="email"
                    placeholder="cliente@exemplo.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label className="text-foreground">Nome do Aluno</Label>
                  <Input className="bg-input border-border text-foreground" placeholder="Nome do aluno" value={formStudentName} onChange={(e) => setFormStudentName(e.target.value)} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label className="text-foreground">Senha Provisória *</Label>
                  <Input className="bg-input border-border text-foreground" type="password" placeholder="Senha inicial" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? <><Loader2 size={16} className="animate-spin mr-2" /> Salvando...</> : "Salvar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="bg-input border-border text-foreground pl-9" placeholder="Buscar por nome, CPF, e-mail ou aluno..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Mostrar inativos</Label>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((client) => {
            const paymentCount = getClientPaymentCount(client);
            const linkedPayments = getClientPayments(client);
            const linkedContracts = getClientContracts(client);
            const primaryContract = linkedContracts[0];
            const isExpanded = expandedClientId === client.id;
            const studentNames = getStudents(client.id, client.student_names);
            const displayCpf = client.cpf || primaryContract?.cpf || "CPF não informado";
            const displayPhone = client.phone || primaryContract?.phone;
            const displayEmail = client.email || primaryContract?.email;
            const displayAddress = client.address || formatContractAddress(primaryContract);
            const displayRg = primaryContract?.rg;

            return (
              <div key={`${client.source}-${client.id}-${client.contract_ids?.[0] || "base"}`} className={`glass-card p-4 space-y-4 ${!client.active ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground">{client.full_name}</h3>
                      {client.active ? (
                        <Badge className="text-[10px] px-1.5 py-0 bg-green-500/15 text-green-700 border-green-500/30 hover:bg-green-500/20">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground border-border hover:bg-muted">
                          Inativo
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {paymentCount} parcelas
                      </Badge>
                      {client.source === "contract_snapshot" && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          Snapshot do contrato
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">CPF: {displayCpf} • {unitMap[client.unit_id || ""] || "—"}</p>
                    {(displayPhone || displayEmail) && (
                      <p className="text-xs text-muted-foreground">{[displayPhone ? `Telefone: ${displayPhone}` : null, displayEmail ? `E-mail: ${displayEmail}` : null].filter(Boolean).join(" • ")}</p>
                    )}
                    {displayRg && <p className="text-xs text-muted-foreground">RG: {displayRg}</p>}
                    {displayAddress && <p className="text-xs text-muted-foreground">Endereço: {displayAddress}</p>}
                    {studentNames && <p className="text-xs text-muted-foreground">Aluno(s): {studentNames}</p>}
                    {linkedContracts.length > 0 && (
                      <div className="space-y-1">
                        {linkedContracts.map((contract) => (
                          <div key={contract.id} className="flex items-center gap-2">
                            <p className="text-xs text-muted-foreground">
                              📄 {contract.contract_number ? `Nº ${contract.contract_number} — ` : ""}{contract.description}
                              <span className={`ml-1.5 inline-block text-[10px] px-1.5 py-0 rounded-full border font-medium ${contract.status === "ACTIVE" ? "bg-green-500/15 text-green-700 border-green-500/30" : contract.status === "CANCELLED" ? "bg-destructive/15 text-destructive border-destructive/30" : "bg-muted text-muted-foreground border-border"}`}>
                                {contract.status === "ACTIVE" ? "Ativo" : contract.status === "CANCELLED" ? "Cancelado" : contract.status}
                              </span>
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1.5 text-[10px] text-primary hover:text-primary/80"
                              onClick={() => navigate(`/admin/contratos?contract=${contract.id}`)}
                            >
                              Ver contrato →
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => handleExpandClient(client.id, client.contract_ids || [])}>
                        {isExpanded ? <ChevronUp size={14} className="mr-1" /> : <ChevronDown size={14} className="mr-1" />}
                        Parcelas vinculadas
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/admin/cobrancas?responsible=${client.id}`)}>
                        Abrir financeiro
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/admin/cobrancas?responsible=${client.id}&create=manual`)}>
                        Adicionar parcela
                      </Button>
                      {client.source === "profile" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => handleManualSync(client)}
                          disabled={syncingClientId === client.id}
                        >
                          {syncingClientId === client.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                          Sincronizar com Asaas
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-green-700 border-green-500/30 hover:bg-green-500/10"
                        onClick={() => handleSendAccess(client)}
                        disabled={!client.active || !client.phone || client.source !== "profile"}
                        title={
                          client.source !== "profile"
                            ? "Disponível apenas para clientes com acesso ao app"
                            : !client.active
                              ? "Cliente sem login ativo"
                              : client.phone
                                ? "Enviar credenciais via WhatsApp"
                                : "Sem telefone cadastrado"
                        }
                      >
                        <MessageCircle size={14} />
                        Notificar APP
                      </Button>
                    </div>
                  </div>
                  {client.source === "profile" ? (
                    <UserActionButtons
                      active={client.active}
                      onEdit={() => setEditTarget(client)}
                      onDeactivate={() => setActionTarget({ client, action: "deactivate" })}
                      onReactivate={() => setActionTarget({ client, action: "reactivate" })}
                      onPermanentDelete={() => handleDeleteRequest(client)}
                    />
                  ) : (
                    <div className="text-right text-xs text-muted-foreground">
                      Cadastro disponível apenas no contrato.
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="space-y-3 border-t border-border/60 pt-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">Parcelas vinculadas</h4>
                        <p className="text-xs text-muted-foreground">
                          {linkedPayments.length} parcelas/cobranças • {linkedContracts.length} contratos
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/admin/cobrancas?responsible=${client.id}`)}>
                        Ver no módulo financeiro
                      </Button>
                    </div>

                    {linkedPayments.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                        Nenhuma parcela vinculada a este cliente.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {linkedPayments.map((payment) => (
                          <div key={payment.id} className="rounded-lg border border-border bg-background/50 p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-medium text-foreground">{payment.description || `Parcela ${payment.installment_number}`}</p>
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    {typeLabels[payment.payment_type as PaymentType] || payment.payment_type}
                                  </Badge>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusClasses[payment.status as PaymentStatus] || ""}`}>
                                    {statusLabels[payment.status as PaymentStatus] || payment.status}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Aluno: {payment.student_id ? studentMap[payment.student_id] || "—" : "Sem aluno"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Contrato: {payment.contract_id ? linkedContracts.find((contract) => contract.id === payment.contract_id)?.description || "—" : "Sem contrato"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Unidade: {unitMap[payment.unit_id] || "—"}
                                </p>
                              </div>
                              <div className="text-left sm:text-right">
                                <p className="text-sm font-semibold text-foreground">R$ {Number(payment.final_value ?? payment.value).toFixed(2).replace(".", ",")}</p>
                                <p className="text-xs text-muted-foreground">Vence em {new Date(`${payment.due_date}T12:00:00`).toLocaleDateString("pt-BR")}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhum cliente encontrado.</div>
          )}
        </div>
      )}

      <UserEditDialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        user={editTarget}
        units={units}
        onSaved={fetchData}
        showUnitSelector={hasRole("ADMIN_MASTER")}
      />

      <AlertDialog open={!!actionTarget} onOpenChange={(open) => !open && setActionTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">{alertContent.title}</AlertDialogTitle>
            <AlertDialogDescription>{alertContent.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border" disabled={actionLoading}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleAction()}
              disabled={actionLoading}
              className={
                actionTarget?.action === "reactivate"
                  ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                  : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              }
            >
              {actionLoading ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
              {actionTarget?.action === "permanent_delete"
                ? "Excluir Permanentemente"
                : actionTarget?.action === "deactivate"
                  ? "Desativar"
                  : "Reativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!dependencyBlocker} onOpenChange={(open) => !open && setDependencyBlocker(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Excluir cliente com registros vinculados?</AlertDialogTitle>
            <AlertDialogDescription>
              {dependencyBlocker && (
                <>
                  O cliente <strong>"{dependencyBlocker.client.full_name}"</strong> possui{" "}
                  {dependencyBlocker.paymentCount > 0 && <>{dependencyBlocker.paymentCount} parcelas/cobranças</>}
                  {dependencyBlocker.paymentCount > 0 && dependencyBlocker.contractCount > 0 && " e "}
                  {dependencyBlocker.contractCount > 0 && <>{dependencyBlocker.contractCount} contratos</>}
                  {" "}sem pagamentos confirmados.
                  <br /><br />
                  <span className="text-destructive font-semibold">Essa ação é irreversível.</span> Todos os contratos e cobranças não pagas serão excluídos junto com o cliente.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                if (dependencyBlocker) setExpandedClientId(dependencyBlocker.client.id);
                setDependencyBlocker(null);
              }}
            >
              Ver registros
            </Button>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              disabled={actionLoading}
              onClick={async () => {
                if (!dependencyBlocker) return;
                setActionLoading(true);
                const { data, error } = await supabase.functions.invoke("delete-user", {
                  body: { user_id: dependencyBlocker.client.id, action: "permanent_delete", force_cascade: true },
                });
                if (error || data?.error) {
                  toast({ title: "Erro", description: error?.message || data?.error, variant: "destructive" });
                } else {
                  toast({ title: "Cliente excluído permanentemente" });
                }
                setActionLoading(false);
                setDependencyBlocker(null);
                await fetchData();
              }}
            >
              {actionLoading ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
              Excluir tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminClients;
