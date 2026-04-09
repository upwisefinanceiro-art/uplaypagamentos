import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Package, Plus, Pencil, Trash2, Loader2, History, ArrowUpCircle, ArrowDownCircle, Settings2 } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface StockItem {
  id: string;
  unit_id: string;
  name: string;
  quantity: number;
  min_quantity: number;
  category: string | null;
  description: string | null;
  active: boolean;
  created_at: string;
}

interface StockMovement {
  id: string;
  item_id: string;
  unit_id: string;
  movement_type: string;
  quantity: number;
  reason: string | null;
  responsible_id: string | null;
  payment_id: string | null;
  created_at: string;
}

interface Unit {
  id: string;
  name: string;
}

const CATEGORIES = [
  "Apostila",
  "Material Didático",
  "Uniforme",
  "Acessório",
  "Equipamento",
  "Outro",
];

const AdminStock = () => {
  const { hasRole, profile } = useAuth();
  const { toast } = useToast();
  const isMaster = hasRole("ADMIN_MASTER");

  const [items, setItems] = useState<StockItem[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<StockItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<StockItem | null>(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");
  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);

  const [unitFilter, setUnitFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Form state
  const [formName, setFormName] = useState("");
  const [formQty, setFormQty] = useState(0);
  const [formMinQty, setFormMinQty] = useState(5);
  const [formCategory, setFormCategory] = useState("");
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

  const fetchMovements = async (itemId: string) => {
    const { data } = await supabase
      .from("stock_movements")
      .select("*")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(50);
    setMovements((data as StockMovement[]) ?? []);
  };

  const openNew = () => {
    setEditingItem(null);
    setFormName("");
    setFormQty(0);
    setFormMinQty(5);
    setFormCategory("");
    setFormDesc("");
    setFormUnitId(units.length === 1 ? units[0].id : "");
    setDialogOpen(true);
  };

  const openEdit = (item: StockItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormQty(item.quantity);
    setFormMinQty(item.min_quantity);
    setFormCategory(item.category ?? "");
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

    const payload = {
      name: formName.trim(),
      quantity: formQty,
      min_quantity: formMinQty,
      category: formCategory || null,
      description: formDesc.trim() || null,
    };

    if (editingItem) {
      const { error } = await supabase.from("stock_items").update(payload).eq("id", editingItem.id);
      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Item atualizado!" });
      }
    } else {
      const { error } = await supabase.from("stock_items").insert({ ...payload, unit_id: formUnitId });
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
    const { error } = await supabase.from("stock_items").update({ active: false }).eq("id", deleteItem.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Item removido do estoque." });
    }
    setDeleteItem(null);
    fetchData();
  };

  const handleAdjust = async () => {
    if (!adjustItem || adjustQty === 0) return;
    setSaving(true);

    const newQty = adjustItem.quantity + adjustQty;
    const { error } = await supabase.from("stock_items").update({ quantity: Math.max(newQty, 0) }).eq("id", adjustItem.id);

    if (!error) {
      await supabase.from("stock_movements").insert({
        item_id: adjustItem.id,
        unit_id: adjustItem.unit_id,
        movement_type: adjustQty > 0 ? "ENTRY" : adjustQty < 0 ? "EXIT" : "ADJUSTMENT",
        quantity: Math.abs(adjustQty),
        reason: adjustReason || "Ajuste manual",
      });
      toast({ title: `Estoque ajustado! Novo saldo: ${Math.max(newQty, 0)}` });
    } else {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }

    setSaving(false);
    setAdjustItem(null);
    setAdjustQty(0);
    setAdjustReason("");
    fetchData();
  };

  const openHistory = async (item: StockItem) => {
    setHistoryItem(item);
    await fetchMovements(item.id);
  };

  const getUnitName = (id: string) => units.find((u) => u.id === id)?.name ?? "—";

  const getStockStatus = (item: StockItem) => {
    if (item.quantity <= 0) return "esgotado";
    if (item.min_quantity > 0 && item.quantity <= item.min_quantity) return "baixo";
    return "ok";
  };

  const filteredItems = items.filter((i) => {
    if (unitFilter !== "all" && i.unit_id !== unitFilter) return false;
    if (categoryFilter !== "all" && (i.category ?? "") !== categoryFilter) return false;
    if (statusFilter === "baixo" && getStockStatus(i) !== "baixo" && getStockStatus(i) !== "esgotado") return false;
    if (statusFilter === "ok" && getStockStatus(i) !== "ok") return false;
    return true;
  });

  const uniqueCategories = [...new Set(items.map((i) => i.category).filter(Boolean))] as string[];

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
        <div className="flex flex-wrap gap-2">
          {isMaster && units.length > 1 && (
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger className="w-[140px] h-9 text-xs bg-card border-border">
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
          {uniqueCategories.length > 0 && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[130px] h-9 text-xs bg-card border-border">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {uniqueCategories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[110px] h-9 text-xs bg-card border-border">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ok">Normal</SelectItem>
              <SelectItem value="baixo">Baixo/Esgotado</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={openNew}>
            <Plus size={16} className="mr-1" /> Novo Item
          </Button>
        </div>
      </div>

      {/* Low stock alert */}
      {items.filter((i) => getStockStatus(i) !== "ok").length > 0 && (
        <div className="glass-card p-3 border-l-4 border-l-yellow-500">
          <p className="text-sm font-semibold text-yellow-500">
            ⚠️ {items.filter((i) => getStockStatus(i) !== "ok").length} item(ns) com estoque baixo ou esgotado
          </p>
        </div>
      )}

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
                <TableHead className="hidden sm:table-cell">Categoria</TableHead>
                <TableHead className="text-center w-20">Qtd.</TableHead>
                <TableHead className="text-center w-20 hidden sm:table-cell">Mín.</TableHead>
                {isMaster && <TableHead className="hidden md:table-cell">Unidade</TableHead>}
                <TableHead className="text-center w-24">Status</TableHead>
                <TableHead className="text-right w-32">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => {
                const status = getStockStatus(item);
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{item.name}</p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground sm:hidden">{item.category ?? "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">{item.category ?? "—"}</TableCell>
                    <TableCell className="text-center">
                      <span className={`font-bold ${status === "esgotado" ? "text-destructive" : status === "baixo" ? "text-yellow-500" : "text-green-500"}`}>
                        {item.quantity}
                      </span>
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell text-xs text-muted-foreground">
                      {item.min_quantity}
                    </TableCell>
                    {isMaster && <TableCell className="text-xs hidden md:table-cell">{getUnitName(item.unit_id)}</TableCell>}
                    <TableCell className="text-center">
                      {status === "esgotado" ? (
                        <Badge variant="destructive" className="text-[10px]">Esgotado</Badge>
                      ) : status === "baixo" ? (
                        <Badge variant="outline" className="text-[10px] border-yellow-500 text-yellow-500">Baixo</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-green-500 text-green-500">OK</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Ajustar quantidade" onClick={() => { setAdjustItem(item); setAdjustQty(0); setAdjustReason(""); }}>
                          <Settings2 size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Histórico" onClick={() => openHistory(item)}>
                          <History size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteItem(item)}>
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
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ex: Apostila de Windows 11" />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input type="number" min={0} value={formQty} onChange={(e) => setFormQty(parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-2">
                <Label>Qtd. mínima</Label>
                <Input type="number" min={0} value={formMinQty} onChange={(e) => setFormMinQty(parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Observações sobre o material" rows={2} />
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

      {/* Adjust quantity dialog */}
      <Dialog open={!!adjustItem} onOpenChange={(open) => !open && setAdjustItem(null)}>
        <DialogContent className="bg-card border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajustar Estoque: {adjustItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Quantidade atual: <strong className="text-foreground">{adjustItem?.quantity}</strong></p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="border-green-500 text-green-500" onClick={() => setAdjustQty((q) => q + 1)}>
                <ArrowUpCircle size={14} className="mr-1" /> +1
              </Button>
              <Button variant="outline" size="sm" className="border-destructive text-destructive" onClick={() => setAdjustQty((q) => q - 1)}>
                <ArrowDownCircle size={14} className="mr-1" /> -1
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Ajuste</Label>
              <Input type="number" value={adjustQty} onChange={(e) => setAdjustQty(parseInt(e.target.value) || 0)} />
              <p className="text-xs text-muted-foreground">
                Novo saldo: <strong>{Math.max((adjustItem?.quantity ?? 0) + adjustQty, 0)}</strong>
              </p>
            </div>
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Ex: Recebimento de fornecedor" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustItem(null)}>Cancelar</Button>
            <Button onClick={handleAdjust} disabled={saving || adjustQty === 0}>
              {saving && <Loader2 size={14} className="animate-spin mr-1" />}
              Confirmar Ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement history dialog */}
      <Dialog open={!!historyItem} onOpenChange={(open) => !open && setHistoryItem(null)}>
        <DialogContent className="bg-card border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Histórico: {historyItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-2">
            {movements.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma movimentação registrada.</p>
            ) : (
              movements.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 border border-border">
                  {m.movement_type === "ENTRY" ? (
                    <ArrowUpCircle size={16} className="text-green-500 flex-shrink-0" />
                  ) : m.movement_type === "EXIT" ? (
                    <ArrowDownCircle size={16} className="text-destructive flex-shrink-0" />
                  ) : (
                    <Settings2 size={16} className="text-yellow-500 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">
                      {m.movement_type === "ENTRY" ? "Entrada" : m.movement_type === "EXIT" ? "Saída" : "Ajuste"}
                      {" "} — {m.quantity} un.
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{m.reason ?? "—"}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">
                    {format(new Date(m.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </span>
                </div>
              ))
            )}
          </div>
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
