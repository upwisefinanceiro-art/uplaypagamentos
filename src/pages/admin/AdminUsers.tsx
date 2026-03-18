import { useState, useEffect } from "react";
import { Plus, Loader2, Search } from "lucide-react";
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

interface AdminUser {
  id: string;
  full_name: string;
  cpf: string;
  phone: string | null;
  unit_id: string | null;
  active: boolean;
}

interface UnitRow {
  id: string;
  name: string;
}

type ActionType = "deactivate" | "reactivate" | "permanent_delete";

const AdminUsers = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ user: AdminUser; action: ActionType } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const { toast } = useToast();
  const { profile, hasRole } = useAuth();

  // Form state
  const [formName, setFormName] = useState("");
  const [formCpf, setFormCpf] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formUnitId, setFormUnitId] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const [profilesRes, rolesRes, unitsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, cpf, phone, unit_id, active"),
      supabase.from("user_roles").select("user_id, role").eq("role", "ADMIN_UNIDADE"),
      supabase.from("units").select("id, name"),
    ]);

    if (rolesRes.data && profilesRes.data) {
      const adminIds = new Set(rolesRes.data.map((r: any) => r.user_id));
      setAdmins(profilesRes.data.filter((p: any) => adminIds.has(p.id)) as AdminUser[]);
    }
    if (unitsRes.data) setUnits(unitsRes.data as UnitRow[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () => {
    setFormName(""); setFormCpf(""); setFormPhone(""); setFormPassword(""); setFormUnitId("");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formCpf || !formPassword || !formUnitId) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }

    setCreating(true);
    const { data, error } = await supabase.functions.invoke("create-user", {
      body: { cpf: formCpf, full_name: formName, phone: formPhone || undefined, password: formPassword, role: "ADMIN_UNIDADE", unit_id: formUnitId },
    });

    if (error || data?.error) {
      toast({ title: "Erro ao criar admin", description: error?.message || data?.error, variant: "destructive" });
      setCreating(false);
      return;
    }

    toast({ title: "Admin criado com sucesso!" });
    setCreating(false); setDialogOpen(false); resetForm(); fetchData();
  };

  const handleAction = async () => {
    if (!actionTarget) return;
    setActionLoading(true);

    const { user, action } = actionTarget;
    const body: Record<string, any> = { user_id: user.id };

    if (action === "reactivate") body.action = "reactivate";
    else if (action === "permanent_delete") body.action = "permanent_delete";

    const { data, error } = await supabase.functions.invoke("delete-user", { body });

    if (error || data?.error) {
      const msg = data?.has_dependencies
        ? "Este usuário possui contratos ou cobranças vinculados. Não é possível excluir. Sugerimos desativar."
        : (error?.message || data?.error);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } else {
      const messages: Record<ActionType, string> = {
        deactivate: "Colaborador desativado",
        reactivate: "Colaborador reativado",
        permanent_delete: "Colaborador excluído permanentemente",
      };
      toast({ title: messages[action] });
    }

    setActionLoading(false); setActionTarget(null); fetchData();
  };

  const unitMap: Record<string, string> = {};
  units.forEach((u) => (unitMap[u.id] = u.name));

  const filtered = admins.filter((a) => {
    if (!showInactive && !a.active) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return a.full_name.toLowerCase().includes(q) || a.cpf.includes(q);
  });

  const getAlertContent = () => {
    if (!actionTarget) return { title: "", description: "" };
    const { user, action } = actionTarget;
    if (action === "permanent_delete") {
      return {
        title: "Excluir colaborador permanentemente",
        description: `⚠️ Essa ação é irreversível! O colaborador "${user.full_name}" será removido definitivamente do sistema. Deseja continuar?`,
      };
    }
    if (action === "deactivate") {
      return {
        title: "Desativar colaborador",
        description: `Tem certeza que deseja desativar "${user.full_name}"? O acesso ao sistema será bloqueado.`,
      };
    }
    return {
      title: "Reativar colaborador",
      description: `Deseja reativar "${user.full_name}"? O acesso ao sistema será restaurado.`,
    };
  };

  const alertContent = getAlertContent();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Colaboradores (Admins de Unidade)</h1>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus size={16} className="mr-2" /> Novo Admin</Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Novo Admin de Unidade</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleCreate}>
              <div className="space-y-2">
                <Label className="text-foreground">Nome *</Label>
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
              <div className="space-y-2">
                <Label className="text-foreground">Unidade *</Label>
                <Select value={formUnitId} onValueChange={setFormUnitId}>
                  <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Senha Provisória *</Label>
                <Input className="bg-input border-border text-foreground" type="password" placeholder="Senha inicial" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} />
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
          <Input className="bg-input border-border text-foreground pl-9" placeholder="Buscar por nome ou CPF..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
          {filtered.map((admin) => (
            <div key={admin.id} className={`glass-card p-4 flex items-center justify-between ${!admin.active ? 'opacity-60' : ''}`}>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{admin.full_name}</h3>
                  {!admin.active && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Inativo</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{admin.cpf} • {unitMap[admin.unit_id || ""] || "—"}</p>
                {admin.phone && <p className="text-xs text-muted-foreground">{admin.phone}</p>}
              </div>
              <UserActionButtons
                active={admin.active}
                onEdit={() => setEditTarget(admin)}
                onDeactivate={() => setActionTarget({ user: admin, action: "deactivate" })}
                onReactivate={() => setActionTarget({ user: admin, action: "reactivate" })}
                onPermanentDelete={() => setActionTarget({ user: admin, action: "permanent_delete" })}
              />
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhum colaborador encontrado.</div>
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

export default AdminUsers;
