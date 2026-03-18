import { useState, useEffect } from "react";
import { Plus, Pencil, Eye, Loader2, Trash2, RotateCcw } from "lucide-react";
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

const AdminClients = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null);
  const [deleting, setDeleting] = useState(false);
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    const action = deleteTarget.active ? "deactivate" : "reactivate";
    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { user_id: deleteTarget.id, action: deleteTarget.active ? undefined : "reactivate" },
    });

    if (error || data?.error) {
      toast({ title: "Erro", description: error?.message || data?.error, variant: "destructive" });
    } else {
      toast({ title: deleteTarget.active ? "Cliente desativado com sucesso" : "Cliente reativado com sucesso" });
    }

    setDeleting(false); setDeleteTarget(null); fetchData();
  };

  const unitMap: Record<string, string> = {};
  units.forEach((u) => (unitMap[u.id] = u.name));

  const getStudents = (responsibleId: string) =>
    students.filter((s) => s.responsible_id === responsibleId).map((s) => s.full_name).join(", ");

  const filtered = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const studentNames = getStudents(c.id).toLowerCase();
    return c.full_name.toLowerCase().includes(q) || c.cpf.includes(q) || studentNames.includes(q);
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Clientes (Responsáveis)</h1>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
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
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={creating}>
                {creating ? <><Loader2 size={16} className="animate-spin mr-2" /> Salvando...</> : "Salvar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Input className="bg-input border-border text-foreground" placeholder="Buscar por nome, CPF ou aluno..." value={search} onChange={(e) => setSearch(e.target.value)} />

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
              <div className="flex gap-1">
                <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Ver"><Eye size={14} /></button>
                <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Editar"><Pencil size={14} /></button>
                {client.active ? (
                  <button className="p-1.5 text-muted-foreground hover:text-destructive transition-colors" title="Desativar" onClick={() => setDeleteTarget(client)}>
                    <Trash2 size={14} />
                  </button>
                ) : (
                  <button className="p-1.5 text-muted-foreground hover:text-primary transition-colors" title="Reativar" onClick={() => setDeleteTarget(client)}>
                    <RotateCcw size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhum cliente encontrado.</div>
          )}
        </div>
      )}

      {/* Delete/Reactivate Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              {deleteTarget?.active ? "Desativar cliente" : "Reativar cliente"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.active
                ? `Tem certeza que deseja desativar "${deleteTarget?.full_name}"? O cliente não conseguirá mais acessar o sistema.`
                : `Deseja reativar "${deleteTarget?.full_name}"? O cliente voltará a ter acesso ao sistema.`}
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

export default AdminClients;
