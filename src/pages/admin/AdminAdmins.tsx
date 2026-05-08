import { useEffect, useState } from "react";
import { Plus, Loader2, Search } from "lucide-react";
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
  email: string | null;
  address: string | null;
  roles: Array<"ADMIN_MASTER" | "ADMIN_UNIDADE">;
}

interface UnitRow { id: string; name: string; }

const AdminAdmins = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [actionTarget, setActionTarget] = useState<{ user: AdminUser; action: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const isMaster = hasRole("ADMIN_MASTER");

  const [formName, setFormName] = useState("");
  const [formCpf, setFormCpf] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formUnitId, setFormUnitId] = useState("");
  const [formRole, setFormRole] = useState<"ADMIN_MASTER" | "ADMIN_UNIDADE">("ADMIN_UNIDADE");

  const fetchData = async () => {
    setLoading(true);
    const [profilesRes, rolesRes, unitsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, cpf, phone, unit_id, active, email, address").order("full_name"),
      supabase.from("user_roles").select("user_id, role").in("role", ["ADMIN_MASTER", "ADMIN_UNIDADE"]),
      supabase.from("units").select("id, name").order("name"),
    ]);

    if (profilesRes.data && rolesRes.data) {
      const rolesMap = new Map<string, AdminUser["roles"]>();
      rolesRes.data.forEach((row) => {
        const cur = rolesMap.get(row.user_id) || [];
        rolesMap.set(row.user_id, [...cur, row.role as "ADMIN_MASTER" | "ADMIN_UNIDADE"]);
      });

      const adminList: AdminUser[] = profilesRes.data
        .filter((p) => rolesMap.has(p.id))
        .map((p) => ({ ...p, roles: rolesMap.get(p.id) || [] }));
      setAdmins(adminList);
    }
    if (unitsRes.data) setUnits(unitsRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!formName.trim() || !formCpf.trim() || !formPassword.trim()) {
      toast({ title: "Preencha nome, CPF e senha", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const cleanCpf = formCpf.replace(/\D/g, "");
      const typedEmail = formEmail.trim();
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          full_name: formName.trim(),
          cpf: cleanCpf,
          phone: formPhone.trim() || null,
          email: typedEmail || undefined,
          password: formPassword,
          unit_id: formUnitId || null,
          role: formRole,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast({ title: "Administrador criado com sucesso!" });
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      toast({ title: err.message || "Erro ao criar", variant: "destructive" });
    }
    setCreating(false);
  };

  const resetForm = () => {
    setFormName(""); setFormCpf(""); setFormPhone(""); setFormEmail("");
    setFormPassword(""); setFormUnitId(""); setFormRole("ADMIN_UNIDADE");
  };

  const handleAction = async () => {
    if (!actionTarget) return;
    setActionLoading(true);
    try {
      const { user, action } = actionTarget;
      if (action === "deactivate") {
        const { error } = await supabase.functions.invoke("delete-user", {
          body: { user_id: user.id, action: "deactivate" },
        });
        if (error) throw error;
        toast({ title: "Administrador desativado" });
      } else if (action === "reactivate") {
        const { error } = await supabase.functions.invoke("delete-user", {
          body: { user_id: user.id, action: "reactivate" },
        });
        if (error) throw error;
        toast({ title: "Administrador reativado" });
      }
      setActionTarget(null);
      fetchData();
    } catch (err: any) {
      toast({ title: err.message || "Erro", variant: "destructive" });
    }
    setActionLoading(false);
  };

  const filtered = admins.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.full_name.toLowerCase().includes(q) || a.cpf.includes(q) || (a.email || "").toLowerCase().includes(q);
  });

  const getRoleBadge = (roles: AdminUser["roles"]) => {
    if (roles.includes("ADMIN_MASTER")) return <Badge className="bg-red-600 text-white text-[10px]">Master</Badge>;
    return <Badge className="bg-blue-600 text-white text-[10px]">Admin Unidade</Badge>;
  };

  if (!isMaster) return <p className="text-muted-foreground p-6">Acesso restrito ao Admin Master.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input placeholder="Buscar administrador..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-input border-border text-foreground" />
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus size={16} className="mr-1" />Novo Admin</Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="text-foreground">Novo Administrador</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-foreground text-xs">Nome completo *</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} className="bg-input border-border text-foreground" />
              </div>
              <div>
                <Label className="text-foreground text-xs">CPF *</Label>
                <Input value={formCpf} onChange={(e) => setFormCpf(e.target.value)} placeholder="000.000.000-00" className="bg-input border-border text-foreground" />
              </div>
              <div>
                <Label className="text-foreground text-xs">E-mail</Label>
                <Input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="email@exemplo.com" className="bg-input border-border text-foreground" />
              </div>
              <div>
                <Label className="text-foreground text-xs">Telefone</Label>
                <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="(31) 99999-9999" className="bg-input border-border text-foreground" />
              </div>
              <div>
                <Label className="text-foreground text-xs">Senha *</Label>
                <Input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} className="bg-input border-border text-foreground" />
              </div>
              <div>
                <Label className="text-foreground text-xs">Perfil *</Label>
                <Select value={formRole} onValueChange={(v) => setFormRole(v as any)}>
                  <SelectTrigger className="bg-input border-border text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="ADMIN_MASTER">Admin Master</SelectItem>
                    <SelectItem value="ADMIN_UNIDADE">Admin Unidade</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-foreground text-xs">Unidade</Label>
                <Select value={formUnitId} onValueChange={setFormUnitId}>
                  <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} disabled={creating} className="w-full">
                {creating ? <Loader2 className="animate-spin mr-2" size={16} /> : null}Criar Administrador
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={24} /></div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">Nenhum administrador encontrado.</p>
      ) : (
        <div className="grid gap-3">
          {filtered.map((admin) => (
            <div key={admin.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground text-sm">{admin.full_name}</span>
                  {getRoleBadge(admin.roles)}
                  {!admin.active && <Badge variant="outline" className="text-[10px] text-destructive border-destructive">Inativo</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">CPF: {admin.cpf} {admin.email ? `• ${admin.email}` : ""}</p>
                {admin.unit_id && (
                  <p className="text-xs text-muted-foreground">Unidade: {units.find(u => u.id === admin.unit_id)?.name || "—"}</p>
                )}
              </div>
              <div className="flex gap-2">
                {admin.active ? (
                  <Button size="sm" variant="outline" className="text-destructive border-destructive hover:bg-destructive/10"
                    onClick={() => setActionTarget({ user: admin, action: "deactivate" })}>
                    Desativar
                  </Button>
                ) : (
                  <Button size="sm" variant="outline"
                    onClick={() => setActionTarget({ user: admin, action: "reactivate" })}>
                    Reativar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!actionTarget} onOpenChange={(open) => !open && setActionTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              {actionTarget?.action === "deactivate" ? "Desativar administrador?" : "Reativar administrador?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionTarget?.action === "deactivate"
                ? `Deseja desativar ${actionTarget?.user.full_name}? O acesso será bloqueado.`
                : `Deseja reativar ${actionTarget?.user.full_name}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleAction} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminAdmins;
