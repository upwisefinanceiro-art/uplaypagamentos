import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Loader2, Plus, Search } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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

interface ContractLinkRow {
  id: string;
  responsible_id: string;
  description: string;
  status: string;
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
  const [formPassword, setFormPassword] = useState("");
  const [formStudentName, setFormStudentName] = useState("");
  const [formUnitId, setFormUnitId] = useState("");

  const fetchData = async () => {
    setLoading(true);

    const [profilesRes, rolesRes, studentsRes, unitsRes, paymentsRes, contractsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, cpf, phone, unit_id, active, email, address").order("full_name"),
      supabase.from("user_roles").select("user_id").eq("role", "RESPONSAVEL"),
      supabase.from("students").select("id, full_name, responsible_id").order("full_name"),
      supabase.from("units").select("id, name").order("name"),
      supabase
        .from("payments")
        .select("id, responsible_id, contract_id, student_id, description, payment_type, installment_number, due_date, status, value, final_value, unit_id")
        .order("due_date", { ascending: false }),
      supabase.from("contracts").select("id, responsible_id, description, status"),
    ]);

    if (profilesRes.data && rolesRes.data) {
      const responsibleIds = new Set(rolesRes.data.map((row: { user_id: string }) => row.user_id));
      setClients(profilesRes.data.filter((row) => responsibleIds.has(row.id)) as ClientRow[]);
    }

    if (studentsRes.data) setStudents(studentsRes.data as StudentRow[]);
    if (unitsRes.data) setUnits(unitsRes.data as UnitRow[]);
    if (paymentsRes.data) setPayments(paymentsRes.data as PaymentRow[]);
    if (contractsRes.data) setContracts(contractsRes.data as ContractLinkRow[]);
    setLoading(false);
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
    const paymentCount = payments.filter((payment) => payment.responsible_id === client.id).length;
    const contractCount = contracts.filter((contract) => contract.responsible_id === client.id).length;

    if (paymentCount > 0 || contractCount > 0) {
      setDependencyBlocker({ client, paymentCount, contractCount });
      return;
    }

    setActionTarget({ client, action: "permanent_delete" });
  };

  const handleAction = async () => {
    if (!actionTarget) return;
    setActionLoading(true);

    const { client, action } = actionTarget;
    const body: Record<string, unknown> = { user_id: client.id };

    if (action === "reactivate") body.action = "reactivate";
    else if (action === "permanent_delete") body.action = "permanent_delete";

    const { data, error } = await supabase.functions.invoke("delete-user", { body });

    if (error || data?.error) {
      const paymentCount = data?.payment_count ?? 0;
      const contractCount = data?.contract_count ?? 0;
      toast({
        title: "Erro",
        description: data?.has_dependencies
          ? `Este cliente possui ${paymentCount} parcelas/cobranças vinculadas${contractCount ? ` e ${contractCount} contratos` : ""}. Acesse o histórico financeiro antes de excluir.`
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

  const getStudents = (responsibleId: string) =>
    students
      .filter((student) => student.responsible_id === responsibleId)
      .map((student) => student.full_name)
      .join(", ");

  const getClientPayments = (responsibleId: string) => payments.filter((payment) => payment.responsible_id === responsibleId);
  const getClientContracts = (responsibleId: string) => contracts.filter((contract) => contract.responsible_id === responsibleId);

  const filtered = clients.filter((client) => {
    if (!showInactive && !client.active) return false;
    if (!search) return true;

    const q = search.toLowerCase().trim();
    const qDigits = q.replace(/\D/g, "");
    const studentNames = getStudents(client.id).toLowerCase();
    const cpfDigits = (client.cpf || "").replace(/\D/g, "");
    const phoneDigits = (client.phone || "").replace(/\D/g, "");

    return (
      client.full_name.toLowerCase().includes(q) ||
      cpfDigits.includes(qDigits) ||
      (client.cpf || "").includes(q) ||
      (client.email || "").toLowerCase().includes(q) ||
      (client.phone || "").includes(q) ||
      (qDigits.length >= 3 && phoneDigits.includes(qDigits)) ||
      studentNames.includes(q)
    );
  });

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
            const linkedPayments = getClientPayments(client.id);
            const linkedContracts = getClientContracts(client.id);
            const isExpanded = expandedClientId === client.id;

            return (
              <div key={client.id} className={`glass-card p-4 space-y-4 ${!client.active ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground">{client.full_name}</h3>
                      {!client.active && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          Inativo
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {linkedPayments.length} parcelas
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{client.cpf} • {unitMap[client.unit_id || ""] || "—"}</p>
                    {(client.phone || client.email) && (
                      <p className="text-xs text-muted-foreground">{[client.phone, client.email].filter(Boolean).join(" • ")}</p>
                    )}
                    {getStudents(client.id) && <p className="text-xs text-muted-foreground">Aluno(s): {getStudents(client.id)}</p>}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => setExpandedClientId(isExpanded ? null : client.id)}>
                        {isExpanded ? <ChevronUp size={14} className="mr-1" /> : <ChevronDown size={14} className="mr-1" />}
                        Parcelas vinculadas
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/admin/cobrancas?responsible=${client.id}`)}>
                        Abrir financeiro
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/admin/cobrancas?responsible=${client.id}&create=manual`)}>
                        Adicionar parcela
                      </Button>
                    </div>
                  </div>
                  <UserActionButtons
                    active={client.active}
                    onEdit={() => setEditTarget(client)}
                    onDeactivate={() => setActionTarget({ client, action: "deactivate" })}
                    onReactivate={() => setActionTarget({ client, action: "reactivate" })}
                    onPermanentDelete={() => handleDeleteRequest(client)}
                  />
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
              onClick={handleAction}
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

      <Dialog open={!!dependencyBlocker} onOpenChange={(open) => !open && setDependencyBlocker(null)}>
        <DialogContent className="bg-card border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Exclusão bloqueada</DialogTitle>
          </DialogHeader>
          {dependencyBlocker && (
            <div className="space-y-4 text-sm text-muted-foreground">
              <p>
                Este cliente possui {dependencyBlocker.paymentCount} parcelas/cobranças vinculadas{dependencyBlocker.contractCount ? ` e ${dependencyBlocker.contractCount} contratos` : ""}. Acesse o histórico financeiro antes de excluir.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setExpandedClientId(dependencyBlocker.client.id);
                    setDependencyBlocker(null);
                  }}
                >
                  Ver parcelas vinculadas
                </Button>
                <Button
                  onClick={() => {
                    navigate(`/admin/cobrancas?responsible=${dependencyBlocker.client.id}`);
                    setDependencyBlocker(null);
                  }}
                >
                  Abrir histórico financeiro
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminClients;
