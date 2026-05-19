import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSchoolAccess, SchoolUnit } from "@/hooks/useSchoolAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, GraduationCap, KeyRound, Send, ShieldCheck, Smartphone, Loader2 } from "lucide-react";

interface Teacher {
  id: string;
  unit_id: string;
  company_id: string;
  full_name: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  hourly_rate: number;
  pix_key: string | null;
  payment_type: string | null;
  subjects: string[];
  notes: string | null;
  active: boolean;
  profile_id: string | null;
  must_change_password?: boolean | null;
}

const DEFAULT_PASSWORD = "12345678";

const emptyForm = {
  full_name: "",
  cpf: "",
  email: "",
  phone: "",
  hourly_rate: "0",
  pix_key: "",
  payment_type: "PIX",
  subjects: "",
  notes: "",
  active: true,
  unit_id: "",
  create_access: true,
  initial_password: DEFAULT_PASSWORD,
};


export default function AdminSchoolTeachers() {
  const { hasRole } = useAuth();
  const { units, loading: unitsLoading } = useSchoolAccess();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const fetchTeachers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("school_teachers")
      .select("*")
      .order("full_name");
    if (error) {
      toast({ title: "Erro ao carregar professores", description: error.message, variant: "destructive" });
      setTeachers([]);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as Teacher[];
    const profileIds = rows.map((r) => r.profile_id).filter(Boolean) as string[];
    if (profileIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, must_change_password")
        .in("id", profileIds);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p.must_change_password]));
      rows.forEach((r) => {
        if (r.profile_id) r.must_change_password = map.get(r.profile_id) ?? null;
      });
    }
    setTeachers(rows);
    setLoading(false);
  };

  useEffect(() => {
    fetchTeachers();
  }, []);

  const filtered = useMemo(() => {
    if (unitFilter === "ALL") return teachers;
    return teachers.filter((t) => t.unit_id === unitFilter);
  }, [teachers, unitFilter]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, unit_id: units[0]?.id ?? "" });
    setDialogOpen(true);
  };

  const openEdit = (t: Teacher) => {
    setEditing(t);
    setForm({
      full_name: t.full_name,
      cpf: t.cpf ?? "",
      email: t.email ?? "",
      phone: t.phone ?? "",
      hourly_rate: String(t.hourly_rate ?? 0),
      pix_key: t.pix_key ?? "",
      payment_type: t.payment_type ?? "PIX",
      subjects: (t.subjects ?? []).join(", "),
      notes: t.notes ?? "",
      active: t.active,
      unit_id: t.unit_id,
      create_access: !t.profile_id,
      initial_password: DEFAULT_PASSWORD,
    });
    setDialogOpen(true);
  };


  const save = async () => {
    if (!form.full_name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    if (!form.unit_id) {
      toast({ title: "Selecione a unidade", variant: "destructive" });
      return;
    }
    const wantsAccess = form.create_access;
    if (wantsAccess && !form.email.trim()) {
      toast({ title: "E-mail obrigatório para criar acesso ao app", variant: "destructive" });
      return;
    }
    if (wantsAccess && (form.initial_password ?? "").length < 6) {
      toast({ title: "Senha inicial deve ter ao menos 6 caracteres", variant: "destructive" });
      return;
    }
    const unit = units.find((u) => u.id === form.unit_id);
    if (!unit) {
      toast({ title: "Unidade inválida", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      unit_id: form.unit_id,
      company_id: unit.company_id,
      full_name: form.full_name.trim(),
      cpf: form.cpf.trim() || null,
      email: form.email.trim().toLowerCase() || null,
      phone: form.phone.trim() || null,
      hourly_rate: Number(String(form.hourly_rate).replace(",", ".")) || 0,
      pix_key: form.pix_key.trim() || null,
      payment_type: form.payment_type || null,
      subjects: form.subjects.split(",").map((s) => s.trim()).filter(Boolean),
      notes: form.notes.trim() || null,
      active: form.active,
    };

    let teacherId = editing?.id ?? null;
    if (editing) {
      const { error } = await supabase.from("school_teachers").update(payload).eq("id", editing.id);
      if (error) {
        setSaving(false);
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("school_teachers")
        .insert(payload)
        .select("id")
        .maybeSingle();
      if (error || !data) {
        setSaving(false);
        toast({ title: "Erro ao salvar", description: error?.message, variant: "destructive" });
        return;
      }
      teacherId = data.id;
    }

    // Cria/atualiza acesso ao app
    if (wantsAccess && teacherId && payload.email) {
      const { data: accessRes, error: accessErr } = await supabase.functions.invoke(
        "create-teacher-user",
        {
          body: {
            teacher_id: teacherId,
            email: payload.email,
            full_name: payload.full_name,
            phone: payload.phone,
            password: form.initial_password,
          },
        },
      );
      if (accessErr || (accessRes && (accessRes as { error?: string }).error)) {
        setSaving(false);
        toast({
          title: "Professor salvo, mas falhou ao criar acesso",
          description:
            (accessRes as { error?: string })?.error || accessErr?.message || "Erro desconhecido",
          variant: "destructive",
        });
        fetchTeachers();
        return;
      }
    }

    setSaving(false);
    toast({ title: editing ? "Professor atualizado" : "Professor cadastrado" });
    setDialogOpen(false);
    fetchTeachers();
  };

  const sendAccess = (t: Teacher) => {
    if (!t.email) {
      toast({ title: "Cadastre um e-mail para o professor", variant: "destructive" });
      return;
    }
    if (!t.profile_id) {
      toast({
        title: "Acesso ainda não criado",
        description: "Edite o professor e marque 'Criar acesso ao app'.",
        variant: "destructive",
      });
      return;
    }
    const message =
      `Olá, ${t.full_name}.\n\n` +
      `Seu acesso ao aplicativo Upplay foi liberado.\n\n` +
      `Login: ${t.email}\n` +
      `Senha inicial: ${DEFAULT_PASSWORD}\n\n` +
      `Baixe o aplicativo e acompanhe:\n` +
      `• Calendário de aulas\n• Horários\n• Agenda\n• Pagamentos\n• Aulas confirmadas\n\n` +
      `Após o primeiro acesso, recomendamos alterar sua senha.`;
    const phone = (t.phone ?? "").replace(/\D/g, "");
    if (phone) {
      const intl = phone.length <= 11 ? `55${phone}` : phone;
      window.open(`https://wa.me/${intl}?text=${encodeURIComponent(message)}`, "_blank");
    } else {
      navigator.clipboard?.writeText(message);
      toast({
        title: "Telefone não cadastrado",
        description: "Mensagem de acesso copiada para a área de transferência.",
      });
    }
  };


  const remove = async (t: Teacher) => {
    if (!confirm(`Excluir ${t.full_name}?`)) return;
    const { error } = await supabase.from("school_teachers").delete().eq("id", t.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Professor excluído" });
    fetchTeachers();
  };

  if (unitsLoading) {
    return <div className="p-6 text-muted-foreground">Carregando...</div>;
  }

  if (units.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <GraduationCap />
          <div>
            <p className="font-medium text-foreground">Módulo Escolar não habilitado</p>
            <p className="text-sm">Nenhuma unidade sua tem o módulo escolar ativo.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Professores</h1>
          <p className="text-sm text-muted-foreground">Gestão de professores do módulo escolar</p>
        </div>
        <div className="flex items-center gap-2">
          {units.length > 1 && (
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas as unidades</SelectItem>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> Novo professor
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Hora-aula</TableHead>
              <TableHead>Disciplinas</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[160px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Nenhum professor cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.full_name}</TableCell>
                  <TableCell>{units.find((u) => u.id === t.unit_id)?.name ?? "—"}</TableCell>
                  <TableCell>R$ {Number(t.hourly_rate).toFixed(2)}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{(t.subjects ?? []).join(", ") || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {t.email ?? "—"}
                    {t.phone ? <><br />{t.phone}</> : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {t.active ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
                      {t.profile_id ? (
                        <Badge variant="outline" className="gap-1">
                          <ShieldCheck className="w-3 h-3" /> App
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Sem acesso</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Enviar acesso ao professor"
                        onClick={() => sendAccess(t)}
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(t)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(t)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>

                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar professor" : "Novo professor"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Nome completo *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <Label>Unidade *</Label>
              <Select value={form.unit_id} onValueChange={(v) => setForm({ ...form, unit_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor hora-aula (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.hourly_rate}
                onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
              />
            </div>
            <div>
              <Label>CPF</Label>
              <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Tipo de pagamento</Label>
              <Select value={form.payment_type} onValueChange={(v) => setForm({ ...form, payment_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="TRANSFERENCIA">Transferência</SelectItem>
                  <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
                  <SelectItem value="OUTRO">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Chave PIX</Label>
              <Input value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Disciplinas (separe por vírgula)</Label>
              <Input
                value={form.subjects}
                onChange={(e) => setForm({ ...form, subjects: e.target.value })}
                placeholder="Inglês, Conversação"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Observações internas</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label>Ativo</Label>
            </div>

            <div className="md:col-span-2 mt-2 rounded-lg border border-border bg-muted/30 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" />
                <p className="text-sm font-medium">Acesso ao aplicativo Upplay</p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.create_access}
                  onCheckedChange={(v) => setForm({ ...form, create_access: v })}
                  disabled={!!editing?.profile_id}
                />
                <Label className="text-sm">
                  {editing?.profile_id
                    ? "Acesso já criado — atualize a senha abaixo se quiser redefinir"
                    : "Criar acesso automático após salvar"}
                </Label>
              </div>
              {(form.create_access || editing?.profile_id) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Senha inicial</Label>
                    <Input
                      type="text"
                      value={form.initial_password}
                      onChange={(e) => setForm({ ...form, initial_password: e.target.value })}
                      placeholder={DEFAULT_PASSWORD}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Padrão: <strong>{DEFAULT_PASSWORD}</strong>. O professor será obrigado a trocar no primeiro acesso.
                    </p>
                  </div>
                  <div className="flex items-end text-xs text-muted-foreground">
                    Login do professor: <span className="font-mono ml-1">{form.email || "informe o e-mail"}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
