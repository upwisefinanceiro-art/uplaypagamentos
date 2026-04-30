import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GraduationCap, Plus, Pencil, Trash2, Loader2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface Course {
  id: string;
  unit_id: string;
  name: string;
  description: string | null;
  suggested_value: number;
  suggested_installments: number;
  punctuality_discount: number;
  active: boolean;
}

interface CourseApostila {
  id: string;
  course_id: string;
  stock_item_id: string;
  unit_value: number;
  display_order: number;
}

interface StockItem {
  id: string;
  unit_id: string;
  name: string;
  quantity: number;
  category: string | null;
}

interface Unit {
  id: string;
  name: string;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const AdminCourses = () => {
  const { hasRole, profile } = useAuth();
  const { toast } = useToast();
  const isMaster = hasRole("ADMIN_MASTER");

  const [courses, setCourses] = useState<Course[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [courseApostilas, setCourseApostilas] = useState<CourseApostila[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [deleteCourse, setDeleteCourse] = useState<Course | null>(null);
  const [unitFilter, setUnitFilter] = useState("all");

  // form
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formInstallments, setFormInstallments] = useState("12");
  const [formDiscount, setFormDiscount] = useState("0");
  const [formUnitId, setFormUnitId] = useState("");
  const [selectedApostilas, setSelectedApostilas] = useState<
    { stock_item_id: string; unit_value: string }[]
  >([]);

  const fetchData = async () => {
    setLoading(true);
    const [coursesRes, unitsRes, stockRes, capRes] = await Promise.all([
      supabase.from("courses").select("*").order("name"),
      isMaster
        ? supabase.from("units").select("id, name").eq("active", true)
        : supabase.from("units").select("id, name").eq("id", profile?.unit_id ?? ""),
      supabase.from("stock_items").select("id, name, unit_id, quantity, category").eq("active", true).order("name"),
      supabase.from("course_apostilas").select("*"),
    ]);
    if (coursesRes.data) setCourses(coursesRes.data as Course[]);
    if (unitsRes.data) setUnits(unitsRes.data);
    if (stockRes.data) setStockItems(stockRes.data as StockItem[]);
    if (capRes.data) setCourseApostilas(capRes.data as CourseApostila[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [isMaster, profile?.unit_id]);

  const openNew = () => {
    setEditing(null);
    setFormName("");
    setFormDesc("");
    setFormValue("");
    setFormInstallments("12");
    setFormUnitId(units.length === 1 ? units[0].id : "");
    setSelectedApostilas([]);
    setDialogOpen(true);
  };

  const openEdit = (course: Course) => {
    setEditing(course);
    setFormName(course.name);
    setFormDesc(course.description || "");
    setFormValue(String(course.suggested_value || ""));
    setFormInstallments(String(course.suggested_installments || 12));
    setFormUnitId(course.unit_id);
    const linked = courseApostilas.filter((ca) => ca.course_id === course.id);
    setSelectedApostilas(
      linked.map((l) => ({
        stock_item_id: l.stock_item_id,
        unit_value: String(l.unit_value || ""),
      }))
    );
    setDialogOpen(true);
  };

  const toggleApostila = (stockItemId: string, checked: boolean) => {
    if (checked) {
      const item = stockItems.find((s) => s.id === stockItemId);
      setSelectedApostilas((prev) => [
        ...prev,
        { stock_item_id: stockItemId, unit_value: "" },
      ]);
    } else {
      setSelectedApostilas((prev) =>
        prev.filter((p) => p.stock_item_id !== stockItemId)
      );
    }
  };

  const updateApostilaValue = (stockItemId: string, value: string) => {
    setSelectedApostilas((prev) =>
      prev.map((p) =>
        p.stock_item_id === stockItemId ? { ...p, unit_value: value } : p
      )
    );
  };

  const handleSave = async () => {
    if (!formName.trim() || !formUnitId) {
      toast({ title: "Preencha nome e unidade.", variant: "destructive" });
      return;
    }
    setSaving(true);

    const payload = {
      name: formName.trim(),
      description: formDesc.trim() || null,
      suggested_value: parseFloat(formValue.replace(",", ".")) || 0,
      suggested_installments: parseInt(formInstallments) || 1,
    };

    let courseId = editing?.id;

    if (editing) {
      const { error } = await supabase.from("courses").update(payload).eq("id", editing.id);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("courses")
        .insert({ ...payload, unit_id: formUnitId })
        .select("id")
        .single();
      if (error || !data) {
        toast({ title: "Erro", description: error?.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      courseId = data.id;
    }

    if (!courseId) {
      setSaving(false);
      return;
    }

    // Sync course_apostilas
    await supabase.from("course_apostilas").delete().eq("course_id", courseId);

    if (selectedApostilas.length > 0) {
      const rows = selectedApostilas.map((sa, idx) => ({
        course_id: courseId,
        stock_item_id: sa.stock_item_id,
        unit_value: parseFloat(sa.unit_value.replace(",", ".")) || 0,
        display_order: idx,
      }));
      const { error: insErr } = await supabase.from("course_apostilas").insert(rows);
      if (insErr) {
        toast({ title: "Erro ao vincular apostilas", description: insErr.message, variant: "destructive" });
      }
    }

    toast({ title: editing ? "Curso atualizado!" : "Curso cadastrado!" });
    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteCourse) return;
    const { error } = await supabase.from("courses").delete().eq("id", deleteCourse.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Curso removido." });
    }
    setDeleteCourse(null);
    fetchData();
  };

  const getUnitName = (id: string) => units.find((u) => u.id === id)?.name ?? "—";

  const getCourseApostilasCount = (courseId: string) =>
    courseApostilas.filter((ca) => ca.course_id === courseId).length;

  const filteredCourses = courses.filter((c) => {
    if (unitFilter !== "all" && c.unit_id !== unitFilter) return false;
    return true;
  });

  // Filtra itens de estoque pela unidade selecionada no form
  const availableStockItems = stockItems.filter((s) => s.unit_id === formUnitId);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GraduationCap size={20} className="text-primary" />
          <h1 className="text-xl font-bold text-foreground">Cursos</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {isMaster && units.length > 1 && (
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger className="w-[160px] h-9 text-xs bg-card border-border">
                <SelectValue placeholder="Unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas unidades</SelectItem>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" onClick={openNew}>
            <Plus size={16} className="mr-1" /> Novo Curso
          </Button>
        </div>
      </div>

      <div className="glass-card p-3 border-l-4 border-l-primary">
        <p className="text-xs text-muted-foreground">
          💡 Vincule cada curso aos itens de estoque (apostilas) correspondentes.
          Ao criar um contrato, o sistema irá <strong>auto-preencher</strong> a seção
          de apostilas com os itens vinculados.
        </p>
      </div>

      {filteredCourses.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <GraduationCap size={48} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhum curso cadastrado.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={openNew}>
            <Plus size={14} className="mr-1" /> Cadastrar primeiro curso
          </Button>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Curso</TableHead>
                <TableHead className="hidden sm:table-cell">Apostilas vinculadas</TableHead>
                <TableHead className="text-right hidden md:table-cell">Valor sugerido</TableHead>
                <TableHead className="text-center w-20 hidden md:table-cell">Parcelas</TableHead>
                {isMaster && <TableHead className="hidden lg:table-cell">Unidade</TableHead>}
                <TableHead className="text-right w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCourses.map((c) => {
                const count = getCourseApostilasCount(c.id);
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <p className="font-medium text-sm">{c.name}</p>
                      {c.description && (
                        <p className="text-xs text-muted-foreground">{c.description}</p>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className="text-[10px]">
                        <BookOpen size={10} className="mr-1" /> {count} apostila{count !== 1 ? "s" : ""}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs hidden md:table-cell font-medium">
                      {c.suggested_value > 0 ? fmt(c.suggested_value) : "—"}
                    </TableCell>
                    <TableCell className="text-center text-xs hidden md:table-cell">
                      {c.suggested_installments}x
                    </TableCell>
                    {isMaster && <TableCell className="text-xs hidden lg:table-cell">{getUnitName(c.unit_id)}</TableCell>}
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteCourse(c)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Curso" : "Novo Curso"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editing && units.length > 1 && (
              <div className="space-y-2">
                <Label>Unidade *</Label>
                <Select value={formUnitId} onValueChange={(v) => { setFormUnitId(v); setSelectedApostilas([]); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Nome do curso *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ex: Informática Básica" />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Detalhes do curso" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor mensalidade sugerido</Label>
                <Input type="text" inputMode="decimal" value={formValue} onChange={(e) => setFormValue(e.target.value)} placeholder="219,90" />
              </div>
              <div className="space-y-2">
                <Label>Parcelas sugeridas</Label>
                <Input type="number" min={1} value={formInstallments} onChange={(e) => setFormInstallments(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Apostilas vinculadas (itens de estoque)</Label>
              {!formUnitId ? (
                <p className="text-xs text-muted-foreground">Selecione a unidade primeiro.</p>
              ) : availableStockItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum item de estoque cadastrado nessa unidade.</p>
              ) : (
                <div className="border border-border rounded-md max-h-64 overflow-y-auto">
                  {availableStockItems.map((si) => {
                    const sel = selectedApostilas.find((s) => s.stock_item_id === si.id);
                    const checked = !!sel;
                    return (
                      <div key={si.id} className="flex items-center gap-2 p-2 border-b border-border last:border-b-0">
                        <Checkbox
                          id={`ap-${si.id}`}
                          checked={checked}
                          onCheckedChange={(c) => toggleApostila(si.id, c === true)}
                        />
                        <label htmlFor={`ap-${si.id}`} className="flex-1 text-xs cursor-pointer">
                          <span className="font-medium">{si.name}</span>
                          {si.category && <span className="text-muted-foreground ml-1">({si.category})</span>}
                          <span className="text-muted-foreground ml-1">— Qtd: {si.quantity}</span>
                        </label>
                        {checked && (
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="Valor"
                            className="w-24 h-7 text-xs"
                            value={sel?.unit_value || ""}
                            onChange={(e) => updateApostilaValue(si.id, e.target.value)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {selectedApostilas.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Valor total das apostilas:{" "}
                  <strong className="text-primary">
                    {fmt(
                      selectedApostilas.reduce(
                        (sum, s) => sum + (parseFloat(s.unit_value.replace(",", ".")) || 0),
                        0
                      )
                    )}
                  </strong>
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin mr-1" />}
              {editing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteCourse} onOpenChange={(open) => !open && setDeleteCourse(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover curso?</AlertDialogTitle>
            <AlertDialogDescription>
              O curso "{deleteCourse?.name}" será excluído. Os contratos já criados não serão afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminCourses;
