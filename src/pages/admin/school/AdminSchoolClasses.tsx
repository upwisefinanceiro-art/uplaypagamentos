import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolAccess } from "@/hooks/useSchoolAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, GraduationCap } from "lucide-react";

interface SchoolClass {
  id: string;
  unit_id: string;
  company_id: string;
  course_id: string | null;
  name: string;
  notes: string | null;
  active: boolean;
}

export default function AdminSchoolClasses() {
  const { units, loading: unitsLoading } = useSchoolAccess();
  const [list, setList] = useState<SchoolClass[]>([]);
  const [courses, setCourses] = useState<{ id: string; name: string; unit_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolClass | null>(null);
  const [form, setForm] = useState({ name: "", unit_id: "", course_id: "NONE", notes: "" });

  const load = async () => {
    setLoading(true);
    const [classesRes, coursesRes] = await Promise.all([
      supabase.from("school_classes").select("*").order("name"),
      supabase.from("courses").select("id,name,unit_id").eq("active", true).order("name"),
    ]);
    if (classesRes.error)
      toast({ title: "Erro ao carregar turmas", description: classesRes.error.message, variant: "destructive" });
    setList((classesRes.data ?? []) as SchoolClass[]);
    setCourses((coursesRes.data ?? []) as any);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => (unitFilter === "ALL" ? list : list.filter((c) => c.unit_id === unitFilter)),
    [list, unitFilter],
  );

  const coursesForUnit = useMemo(
    () => courses.filter((c) => c.unit_id === form.unit_id),
    [courses, form.unit_id],
  );

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", unit_id: units[0]?.id ?? "", course_id: "NONE", notes: "" });
    setDialogOpen(true);
  };

  const openEdit = (c: SchoolClass) => {
    setEditing(c);
    setForm({ name: c.name, unit_id: c.unit_id, course_id: c.course_id ?? "NONE", notes: c.notes ?? "" });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.unit_id) {
      toast({ title: "Preencha nome e unidade", variant: "destructive" });
      return;
    }
    const unit = units.find((u) => u.id === form.unit_id);
    if (!unit) return;
    const payload = {
      name: form.name.trim(),
      unit_id: form.unit_id,
      company_id: unit.company_id,
      course_id: form.course_id === "NONE" ? null : form.course_id,
      notes: form.notes.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("school_classes").update(payload).eq("id", editing.id)
      : await supabase.from("school_classes").insert(payload);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Turma atualizada" : "Turma cadastrada" });
    setDialogOpen(false);
    load();
  };

  const remove = async (c: SchoolClass) => {
    if (!confirm(`Excluir turma ${c.name}?`)) return;
    const { error } = await supabase.from("school_classes").delete().eq("id", c.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  if (unitsLoading) return <div className="p-6 text-muted-foreground">Carregando...</div>;

  if (units.length === 0) {
    return (
      <Card className="p-6 flex items-center gap-3 text-muted-foreground">
        <GraduationCap />
        <p>Módulo Escolar não habilitado para nenhuma unidade.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Turmas</h1>
          <p className="text-sm text-muted-foreground">Turmas do módulo escolar</p>
        </div>
        <div className="flex items-center gap-2">
          {units.length > 1 && (
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
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
            <Plus className="w-4 h-4 mr-1" /> Nova turma
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Curso</TableHead>
              <TableHead>Observações</TableHead>
              <TableHead className="w-[120px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhuma turma cadastrada.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{units.find((u) => u.id === c.unit_id)?.name ?? "—"}</TableCell>
                  <TableCell>{courses.find((co) => co.id === c.course_id)?.name ?? "—"}</TableCell>
                  <TableCell className="max-w-[300px] truncate">{c.notes ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(c)}>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar turma" : "Nova turma"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Unidade *</Label>
              <Select value={form.unit_id} onValueChange={(v) => setForm({ ...form, unit_id: v, course_id: "NONE" })}>
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
              <Label>Curso vinculado</Label>
              <Select value={form.course_id} onValueChange={(v) => setForm({ ...form, course_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">— Nenhum —</SelectItem>
                  {coursesForUnit.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observações</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
