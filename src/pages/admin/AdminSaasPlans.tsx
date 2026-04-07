import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2, Package, ToggleLeft, ToggleRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SaasPlan {
  id: string;
  nome_plano: string;
  descricao: string | null;
  valor_base: number;
  duracao_meses: number;
  desconto_percentual: number;
  ativo: boolean;
  created_at: string;
}

const AdminSaasPlans = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<SaasPlan[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SaasPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; plan: SaasPlan | null }>({ open: false, plan: null });

  const [form, setForm] = useState({
    nome_plano: "",
    descricao: "",
    valor_base: "97",
    duracao_meses: "1",
    desconto_percentual: "0",
    ativo: true,
  });

  const setField = (key: string, value: string | boolean) => setForm(prev => ({ ...prev, [key]: value }));

  const fetchPlans = async () => {
    setLoading(true);
    const { data } = await supabase.from("saas_plans").select("*").order("duracao_meses");
    setPlans((data ?? []) as SaasPlan[]);
    setLoading(false);
  };

  useEffect(() => { fetchPlans(); }, []);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const resetForm = () => {
    setForm({ nome_plano: "", descricao: "", valor_base: "97", duracao_meses: "1", desconto_percentual: "0", ativo: true });
    setEditing(null);
  };

  const openNew = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (plan: SaasPlan) => {
    setEditing(plan);
    setForm({
      nome_plano: plan.nome_plano,
      descricao: plan.descricao || "",
      valor_base: String(plan.valor_base),
      duracao_meses: String(plan.duracao_meses),
      desconto_percentual: String(plan.desconto_percentual),
      ativo: plan.ativo,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome_plano.trim()) {
      toast({ title: "Nome do plano é obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      nome_plano: form.nome_plano.trim(),
      descricao: form.descricao.trim() || null,
      valor_base: parseFloat(form.valor_base) || 97,
      duracao_meses: parseInt(form.duracao_meses) || 1,
      desconto_percentual: parseFloat(form.desconto_percentual) || 0,
      ativo: form.ativo,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from("saas_plans").update(payload as any).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("saas_plans").insert(payload as any));
    }

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editing ? "Plano atualizado!" : "Plano criado!" });
      setDialogOpen(false);
      resetForm();
      fetchPlans();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteConfirm.plan) return;
    const { error } = await supabase.from("saas_plans").delete().eq("id", deleteConfirm.plan.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Plano excluído!" });
      fetchPlans();
    }
    setDeleteConfirm({ open: false, plan: null });
  };

  const handleToggleActive = async (plan: SaasPlan) => {
    await supabase.from("saas_plans").update({ ativo: !plan.ativo } as any).eq("id", plan.id);
    toast({ title: plan.ativo ? "Plano desativado" : "Plano ativado" });
    fetchPlans();
  };

  const valorFinal = (valorBase: number, desconto: number) => {
    return valorBase - (valorBase * desconto / 100);
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-64" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package size={20} className="text-primary" />
          <h1 className="text-xl font-bold text-foreground">Planos SaaS</h1>
        </div>
        <Button size="sm" onClick={openNew} className="gap-2">
          <Plus size={14} /> Novo Plano
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{plans.length}</p>
            <p className="text-[11px] text-muted-foreground">Total de Planos</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-success">{plans.filter(p => p.ativo).length}</p>
            <p className="text-[11px] text-muted-foreground">Ativos</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{plans.filter(p => !p.ativo).length}</p>
            <p className="text-[11px] text-muted-foreground">Inativos</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">
              {plans.filter(p => p.ativo).length > 0
                ? fmt(Math.max(...plans.filter(p => p.ativo).map(p => p.desconto_percentual)))
                : "0"}%
            </p>
            <p className="text-[11px] text-muted-foreground">Maior Desconto</p>
          </CardContent>
        </Card>
      </div>

      {/* Plans list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map(plan => {
          const vf = valorFinal(plan.valor_base, plan.desconto_percentual);
          return (
            <Card key={plan.id} className={`border-border transition-all ${!plan.ativo ? "opacity-60" : ""}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{plan.nome_plano}</CardTitle>
                  <div className="flex items-center gap-1">
                    <Badge variant={plan.ativo ? "default" : "secondary"} className="text-[10px]">
                      {plan.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                </div>
                {plan.descricao && <p className="text-xs text-muted-foreground">{plan.descricao}</p>}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Valor base</p>
                    <p className="font-medium">{fmt(plan.valor_base)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Desconto</p>
                    <p className="font-medium text-primary">{plan.desconto_percentual}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Valor final</p>
                    <p className="font-medium text-success">{fmt(vf)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Duração</p>
                    <p className="font-medium">{plan.duracao_meses} {plan.duracao_meses === 1 ? "mês" : "meses"}</p>
                  </div>
                </div>

                {/* Monthly equivalent */}
                {plan.duracao_meses > 1 && (
                  <div className="p-2 rounded bg-muted/50 text-xs text-center">
                    Equivalente a <strong>{fmt(vf)}/mês</strong> por {plan.duracao_meses} meses
                  </div>
                )}

                <div className="flex items-center gap-1.5 pt-2 border-t border-border">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 flex-1" onClick={() => openEdit(plan)}>
                    <Pencil size={12} /> Editar
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleToggleActive(plan)}>
                    {plan.ativo ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                    {plan.ativo ? "Desativar" : "Ativar"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive" onClick={() => setDeleteConfirm({ open: true, plan })}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {plans.length === 0 && (
        <Card className="border-border">
          <CardContent className="p-8 text-center">
            <Package size={32} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum plano cadastrado. Crie o primeiro plano SaaS.</p>
          </CardContent>
        </Card>
      )}

      {/* Edit/Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetForm(); setDialogOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Plano" : "Novo Plano SaaS"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome do plano *</Label>
              <Input value={form.nome_plano} onChange={e => setField("nome_plano", e.target.value)} placeholder="Ex: Mensal, Trimestral, Anual" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <Textarea value={form.descricao} onChange={e => setField("descricao", e.target.value)} placeholder="Descrição do plano..." rows={2} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Valor base (R$)</Label>
                <Input value={form.valor_base} onChange={e => setField("valor_base", e.target.value)} type="number" step="0.01" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Duração (meses)</Label>
                <Input value={form.duracao_meses} onChange={e => setField("duracao_meses", e.target.value)} type="number" min="1" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Desconto (%)</Label>
                <Input value={form.desconto_percentual} onChange={e => setField("desconto_percentual", e.target.value)} type="number" step="0.01" min="0" max="100" />
              </div>
            </div>

            {/* Preview */}
            {parseFloat(form.valor_base) > 0 && (
              <div className="p-3 rounded-lg bg-muted/50 border border-border text-xs space-y-1">
                <p className="font-semibold text-foreground">📋 Prévia</p>
                <p>Valor base: <strong>{fmt(parseFloat(form.valor_base) || 0)}</strong></p>
                <p>Desconto: <strong>{parseFloat(form.desconto_percentual) || 0}%</strong></p>
                <p>Valor final: <strong className="text-success">{fmt(valorFinal(parseFloat(form.valor_base) || 0, parseFloat(form.desconto_percentual) || 0))}</strong></p>
                <p>Duração: <strong>{form.duracao_meses} {parseInt(form.duracao_meses) === 1 ? "mês" : "meses"}</strong></p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label className="text-xs">Plano ativo</Label>
              <Switch checked={form.ativo as boolean} onCheckedChange={v => setField("ativo", v)} />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : editing ? "Atualizar" : "Criar"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(o) => !o && setDeleteConfirm({ open: false, plan: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir plano?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o plano "{deleteConfirm.plan?.nome_plano}"? Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminSaasPlans;
