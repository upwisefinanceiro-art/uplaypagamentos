import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Package, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface StockItem {
  id: string;
  unit_id: string;
  name: string;
  quantity: number;
  description: string | null;
  active: boolean;
  created_at: string;
}

interface Unit {
  id: string;
  name: string;
}

const AdminStock = () => {
  const { hasRole, profile } = useAuth();
  const { toast } = useToast();
  const isMaster = hasRole("ADMIN_MASTER");

  const [items, setItems] = useState<StockItem[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<StockItem | null>(null);

  const [unitFilter, setUnitFilter] = useState("all");

  // Form state
  const [formName, setFormName] = useState("");
  const [formQty, setFormQty] = useState(0);
  const [formDesc, setFormDesc] = useState("");
  const [formUnitId, setFormUnitId] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const [itemsRes, unitsRes] = await Promise.all([
      supabase.from("stock_items").select("*").eq("active", true).order("name"),
      isMaster
        ? supabase.from("units").select("id, name").eq("active", true)
        : supabase.from("units").select("id, name").eq("id", profile?.unit_id ?? ""),
    ]);

    if (itemsRes.data) setItems(itemsRes.data as StockItem[]);
    if (unitsRes.data) setUnits(unitsRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [isMaster, profile?.unit_id]);

  const openNew = () => {
    setEditingItem(null);
    setFormName("");
    setFormQty(0);
    setFormDesc("");
    setFormUnitId(units.length === 1 ? units[0].id : "");
    setDialogOpen(true);
  };

  const openEdit = (item: StockItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormQty(item.quantity);
    setFormDesc(item.description ?? "");
    setFormUnitId(item.unit_id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formUnitId) {
      toast({ title: "Preencha o nome e selecione a unidade.", variant: "destructive" });
      return;
    }

    setSaving(true);

    if (editingItem) {
      const { error } = await supabase
        .from("stock_items")
        .update({ name: formName.trim(), quantity: formQty, description: formDesc.trim() || null })
        .eq("id", editingItem.id);

      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Item atualizado!" });
      }
    } else {
      const { error } = await supabase
        .from("stock_items")
        .insert({ name: formName.trim(), quantity: formQty, description: formDesc.trim() || null, unit_id: formUnitId });

      if (error) {
        toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Item cadastrado!" });
      }
    }

    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    const { error } = await supabase
      .from("stock_items")
      .update({ active: false })
      .eq("id", deleteItem.id);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Item removido do estoque." });
    }
    setDeleteItem(null);
    fetchData();
  };

  const getUnitName = (id: string) => units.find((u) => u.id === id)?.name ?? "—";

  const filteredItems = unitFilter === "all" ? items : items.filter((i) => i.unit_id === unitFilter);

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
          <Package size={20} className="text-primary" />
          <h1 className="text-xl font-bold text-foreground">Estoque de Materiais</h1>
        </div>
        <div className="flex gap-2">
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
            <Plus size={16} className="mr-1" /> Novo Item
          </Button>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Package size={48} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhum item no estoque.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={openNew}>
            <Plus size={14} className="mr-1" /> Adicionar primeiro item
          </Button>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead className="text-center w-24">Qtd.</TableHead>
                {isMaster && <TableHead>Unidade</TableHead>}
                <TableHead className="text-center w-20">Status</TableHead>
                <TableHead className="text-right w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`font-bold ${item.quantity <= 0 ? "text-destructive" : item.quantity <= 5 ? "text-yellow-500" : "text-green-500"}`}>
                      {item.quantity}
                    </span>
                  </TableCell>
                  {isMaster && <TableCell className="text-xs">{getUnitName(item.unit_id)}</TableCell>}
                  <TableCell className="text-center">
                    {item.quantity <= 0 ? (
                      <Badge variant="destructive" className="text-[10px]">Esgotado</Badge>
                    ) : item.quantity <= 5 ? (
                      <Badge variant="outline" className="text-[10px] border-yellow-500 text-yellow-500">Baixo</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-green-500 text-green-500">OK</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteItem(item)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar Item" : "Novo Item de Estoque"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editingItem && units.length > 1 && (
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Select value={formUnitId} onValueChange={setFormUnitId}>
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
              <Label>Nome do material *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: Apostila de Windows 11"
              />
            </div>
            <div className="space-y-2">
              <Label>Quantidade em estoque</Label>
              <Input
                type="number"
                min={0}
                value={formQty}
                onChange={(e) => setFormQty(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Observações sobre o material"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin mr-1" />}
              {editingItem ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteItem} onOpenChange={(open) => !open && setDeleteItem(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover item do estoque?</AlertDialogTitle>
            <AlertDialogDescription>
              O item "{deleteItem?.name}" será desativado do estoque.
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

export default AdminStock;
