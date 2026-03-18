import { useState, useEffect } from "react";
import { Plus, Loader2, Eye, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
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

type ActionType = "deactivate" | "reactivate" | "permanent_delete";

const AdminClients = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ client: ClientRow; action: ActionType } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<ClientRow | null>(null);
  const { toast } = useToast();
  const { profile, hasRole } = useAuth();

  // Form state
  const [formName, setFormName] = useState("");
  const [formCpf, setFormCpf] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formStudentName, setFormStudentName] = useState("");
  const [formUnitId, setFormUnitId] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const [profilesRes, rolesRes, studentsRes, unitsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, cpf, phone, unit_id, active"),
      supabase.from("user_roles").select("user_id, role").eq("role", "RESPONSAVEL"),
      supabase.from("students").select("id, full_name, responsible_id"),
      supabase.from("units").select("id, name"),
    ]);

    if (rolesRes.data && profilesRes.data) {
      const respIds = new Set(rolesRes.data.map((r: any) => r.user_id));
      setClients(profilesRes.data.filter((p: any) => respIds.has(p.id)) as ClientRow[]);
    }
    if (studentsRes.data) setStudents(studentsRes.data as StudentRow[]);
    if (unitsRes.data) setUnits(unitsRes.data as UnitRow[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (profile?.unit_id && !formUnitId) setFormUnitId(profile.unit_id);
  }, [profile]);

  const resetForm = () => {
    setFormName(""); setFormCpf(""); setFormPhone(""); setFormPassword(""); setFormStudentName("");
    setFormUnitId(profile?.unit_id || "");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formCpf || !formPassword) {
      toast({ title: "Preencha os campos obrigatórios", description: "Nome, CPF e Senha são obrigatórios.", variant: "destructive" });
      return;
    }
    const unitId = hasRole("ADMIN_MASTER") ? formUnitId : profile?.unit_id;
    if (!unitId) { toast({ title: "Selecione uma unidade", variant: "destructive" }); return; }

    setCreating(true);
    const { data, error } = await supabase.functions.invoke("create-user", {
      body: { cpf: formCpf, full_name: formName, phone: formPhone || undefined, password: formPassword, role: "RESPONSAVEL", unit_id: unitId },
    });

    if (error) { toast({ title: "Erro ao criar cliente", description: error.message, variant: "destructive" }); setCreating(false); return; }
    if (data?.error) { toast({ title: "Erro", description: data.error, variant: "destructive" }); setCreating(false); return; }

    if (formStudentName && data?.user_id) {
      await supabase.from("students").insert({ full_name: formStudentName, responsible_id: data.user_id, unit_id: unitId });
    }

    toast({ title: "Cliente criado com sucesso!" });
    setCreating(false); setDialogOpen(false); resetForm(); fetchData();
  };

  const handleAction = async () => {
    if (!actionTarget) return;
    setActionLoading(true);

    const { client, action } = actionTarget;
    const body: Record<string, any> = { user_id: client.id };

    if (action === "reactivate") body.action = "reactivate";
    else if (action === "permanent_delete") body.action = "permanent_delete";

    const { data, error } = await supabase.functions.invoke("delete-user", { body });

    if (error || data?.error) {
      const msg = data?.has_dependencies
        ? "Este cliente possui contratos ou cobranças. Não é possível excluir. Sugerimos desativar."
        : (error?.message || data?.error);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } else {
      const messages: Record<ActionType, string> = {
        deactivate: "Cliente desativado com sucesso",
        reactivate: "Cliente reativado com sucesso",
        permanent_delete: "Cliente excluído permanentemente",
      };
      toast({ title: messages[action] });
    }

    setActionLoading(false); setActionTarget(null); fetchData();
  };

  const unitMap: Record<string, string> = {};
  units.forEach((u) => (unitMap[u.id] = u.name));

  const getStudents = (responsibleId: string) =>
    students.filter((s) => s.responsible_id === responsibleId).map((s) => s.full_name).join(", ");

  const filtered = clients.filter((c) => {
    if (!showInactive && !c.active) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const studentNames = getStudents(c.id).toLowerCase();
    return c.full_name.toLowerCase().includes(q) || c.cpf.includes(q) || studentNames.includes(q);
  });

  const getAlertContent = () => {
    if (!actionTarget) return { title: "", description: "" };
    const { client, action } = actionTarget;
    if (action === "permanent_delete") {
      return {
        title: "Excluir cliente permanentemente",
        description: `⚠️ Essa ação é irreversível! O cliente "${client.full_name}" e todos os dados associados serão removidos definitivamente. Deseja continuar?`,
      };
    }
    if (action === "deactivate") {
      return {
        title: "Desativar cliente",
        description: `Tem certeza que deseja desativar "${client.full_name}"? O cliente não conseguirá mais acessar o sistema, mas o histórico será mantido.`,
      };
    }
    return {
      title: "Reativar cliente",
      description: `Deseja reativar "${client.full_name}"? O cliente voltará a ter acesso ao sistema.`,
    };
  };

  const alertContent = getAlertContent();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Clientes (Responsáveis)</h1>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus size={16} className="mr-2" /> Novo Cliente</Button>
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
                    <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
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
          <Input className="bg-input border-border text-foreground pl-9" placeholder="Buscar por nome, CPF ou aluno..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Mostrar inativos</Label>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.map((client) => (
            <div key={client.id} className={`glass-card p-4 flex items-center justify-between ${!client.active ? 'opacity-60' : ''}`}>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{client.full_name}</h3>
                  {!client.active && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Inativo</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{client.cpf} • {unitMap[client.unit_id || ""] || "—"}</p>
                {getStudents(client.id) && (
                  <p className="text-xs text-muted-foreground">Aluno(s): {getStudents(client.id)}</p>
                )}
              </div>
              <UserActionButtons
                active={client.active}
                onEdit={() => setEditTarget(client)}
                onDeactivate={() => setActionTarget({ client, action: "deactivate" })}
                onReactivate={() => setActionTarget({ client, action: "reactivate" })}
                onPermanentDelete={() => setActionTarget({ client, action: "permanent_delete" })}
              />
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhum cliente encontrado.</div>
          )}
        </div>
      )}

      {/* Edit Dialog */}
      <UserEditDialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        user={editTarget}
        units={units}
        onSaved={fetchData}
        showUnitSelector={hasRole("ADMIN_MASTER")}
      />

      {/* Action Confirmation */}
      <AlertDialog open={!!actionTarget} onOpenChange={(o) => !o && setActionTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">{alertContent.title}</AlertDialogTitle>
            <AlertDialogDescription>{alertContent.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border" disabled={actionLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAction}
              disabled={actionLoading}
              className={actionTarget?.action === "reactivate"
                ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}
            >
              {actionLoading ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
              {actionTarget?.action === "permanent_delete" ? "Excluir Permanentemente" : actionTarget?.action === "deactivate" ? "Desativar" : "Reativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminClients;
