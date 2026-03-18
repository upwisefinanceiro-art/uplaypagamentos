import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const AdminUsers = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { user_id: deleteTarget.id, action: deleteTarget.active ? undefined : "reactivate" },
    });

    if (error || data?.error) {
      toast({ title: "Erro", description: error?.message || data?.error, variant: "destructive" });
    } else {
      toast({ title: deleteTarget.active ? "Admin desativado com sucesso" : "Admin reativado com sucesso" });
    }

    setDeleting(false); setDeleteTarget(null); fetchData();
  };

  const unitMap: Record<string, string> = {};
  units.forEach((u) => (unitMap[u.id] = u.name));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Usuários Admin</h1>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus size={16} className="mr-2" /> Novo Admin
            </Button>
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
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={creating}>
                {creating ? <><Loader2 size={16} className="animate-spin mr-2" /> Salvando...</> : "Salvar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {admins.map((admin) => (
            <div key={admin.id} className={`glass-card p-4 flex items-center justify-between ${!admin.active ? 'opacity-60' : ''}`}>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{admin.full_name}</h3>
                  {!admin.active && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Inativo</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{admin.cpf} • {unitMap[admin.unit_id || ""] || "—"}</p>
                {admin.phone && <p className="text-xs text-muted-foreground">{admin.phone}</p>}
              </div>
              <div className="flex gap-1">
                <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Editar"><Pencil size={14} /></button>
                {admin.active ? (
                  <button className="p-1.5 text-muted-foreground hover:text-destructive transition-colors" title="Desativar" onClick={() => setDeleteTarget(admin)}>
                    <Trash2 size={14} />
                  </button>
                ) : (
                  <button className="p-1.5 text-muted-foreground hover:text-primary transition-colors" title="Reativar" onClick={() => setDeleteTarget(admin)}>
                    <RotateCcw size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {admins.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhum admin encontrado.</div>
          )}
        </div>
      )}

      {/* Delete/Reactivate Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              {deleteTarget?.active ? "Desativar colaborador" : "Reativar colaborador"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.active
                ? `Tem certeza que deseja desativar "${deleteTarget?.full_name}"? O usuário não conseguirá mais acessar o sistema.`
                : `Deseja reativar "${deleteTarget?.full_name}"? O usuário voltará a ter acesso ao sistema.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border" disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className={deleteTarget?.active ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : "bg-primary hover:bg-primary/90 text-primary-foreground"}
            >
              {deleting ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
              {deleteTarget?.active ? "Desativar" : "Reativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminUsers;
