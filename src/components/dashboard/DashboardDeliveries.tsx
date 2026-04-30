import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Package, CheckCircle2, Loader2, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface DeliveryNotification {
  id: string;
  unit_id: string;
  student_name: string | null;
  responsible_name: string | null;
  enrollment_id: string | null;
  item_name: string;
  quantity: number;
  status: string;
  created_at: string;
  payment_id: string;
  payments?: { description: string | null; payment_type: string | null } | null;
}

interface Props {
  unitFilter?: string;
}

const DashboardDeliveries = ({ unitFilter = "all" }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [deliveries, setDeliveries] = useState<DeliveryNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchDeliveries = async () => {
    setLoading(true);
    let query = supabase
      .from("delivery_notifications")
      .select("id, unit_id, student_name, responsible_name, enrollment_id, item_name, quantity, status, created_at, payment_id, payments(description, payment_type)")
      .eq("status", "PENDING")
      .order("created_at", { ascending: false });

    if (unitFilter !== "all") {
      query = query.eq("unit_id", unitFilter);
    }

    const { data } = await query;
    setDeliveries((data as DeliveryNotification[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchDeliveries();
  }, [unitFilter]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("delivery-notifications-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_notifications" }, () => {
        fetchDeliveries();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [unitFilter]);

  const confirmDelivery = async (id: string) => {
    setConfirmingId(id);
    const original = deliveries.find((d) => d.id === id);
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("delivery_notifications")
      .update({
        status: "DELIVERED",
        delivered_at: nowIso,
        delivered_by: user?.id ?? null,
      })
      .eq("id", id)
      .eq("status", "PENDING") // garante idempotência
      .select("id, status, delivered_at, delivered_by")
      .maybeSingle();

    if (error) {
      console.error("[deliveries] confirm error:", error);
      toast({
        title: "Erro ao confirmar entrega",
        description: error.message ?? "Não foi possível atualizar o registro. Tente novamente.",
        variant: "destructive",
      });
      setConfirmingId(null);
      return;
    }

    if (!data) {
      toast({
        title: "Entrega não atualizada",
        description: "O registro pode já ter sido confirmado por outro usuário.",
        variant: "destructive",
      });
      await fetchDeliveries();
      setConfirmingId(null);
      return;
    }

    // Audit log (não bloqueante)
    if (user?.id) {
      supabase.from("audit_logs").insert({
        performed_by: user.id,
        target_id: id,
        target_table: "delivery_notifications",
        action: "DELIVERY_CONFIRMED",
        details: {
          item_name: original?.item_name,
          student_name: original?.student_name,
          responsible_name: original?.responsible_name,
          enrollment_id: original?.enrollment_id,
          quantity: original?.quantity,
          payment_id: original?.payment_id,
          unit_id: original?.unit_id,
          delivered_at: nowIso,
        },
      }).then(({ error: auditError }) => {
        if (auditError) console.warn("[deliveries] audit log failed:", auditError);
      });
    }

    toast({ title: "Entrega confirmada! ✅", description: original?.item_name });
    setDeliveries((prev) => prev.filter((d) => d.id !== id));
    setConfirmingId(null);
  };

  const startEditing = (d: DeliveryNotification) => {
    setEditingId(d.id);
    setEditValue(d.item_name);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValue("");
  };

  const saveEditing = async (id: string) => {
    const newName = editValue.trim();
    const original = deliveries.find((d) => d.id === id);
    if (!original) return cancelEditing();
    if (!newName || newName === original.item_name) return cancelEditing();

    setSavingId(id);
    const { error } = await supabase
      .from("delivery_notifications")
      .update({ item_name: newName })
      .eq("id", id);
    setSavingId(null);

    if (error) {
      toast({ title: "Erro ao renomear", description: error.message, variant: "destructive" });
      return;
    }

    setDeliveries((prev) => prev.map((d) => (d.id === id ? { ...d, item_name: newName } : d)));
    setEditingId(null);
    setEditValue("");
    setSavedId(id);
    setTimeout(() => setSavedId((curr) => (curr === id ? null : curr)), 1500);
  };

  if (loading) return null;
  if (deliveries.length === 0) return null;

  return (
    <div className="glass-card p-4 border-l-4 border-l-primary">
      <div className="flex items-center gap-2 mb-3">
        <Package size={18} className="text-primary" />
        <h3 className="text-sm font-bold text-foreground">
          📦 Entregas Pendentes ({deliveries.length})
        </h3>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {deliveries.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 border border-border"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {editingId === d.id ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-primary bg-primary px-2 py-0.5 ring-2 ring-primary/40 transition-shadow">
                    <input
                      ref={inputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => saveEditing(d.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); saveEditing(d.id); }
                        else if (e.key === "Escape") { e.preventDefault(); cancelEditing(); }
                      }}
                      disabled={savingId === d.id}
                      className="bg-transparent text-[10px] font-semibold text-primary-foreground placeholder:text-primary-foreground/60 outline-none border-0 p-0 m-0 min-w-[80px] w-[160px]"
                    />
                    {savingId === d.id && <Loader2 size={10} className="animate-spin text-primary-foreground" />}
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 group cursor-text"
                    onDoubleClick={() => startEditing(d)}
                    title="Clique duas vezes ou no lápis para editar"
                  >
                    <Badge variant="outline" className="text-[10px] border-primary text-primary">
                      {d.item_name}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => startEditing(d)}
                      className="text-muted-foreground hover:text-primary transition-colors opacity-60 group-hover:opacity-100"
                      aria-label="Editar nome"
                    >
                      <Pencil size={11} />
                    </button>
                    {savedId === d.id && (
                      <Check size={12} className="text-success animate-in fade-in zoom-in duration-300" />
                    )}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">
                  Qtd: {d.quantity}
                </span>
                {d.payments?.description && (
                  <span className="text-[10px] text-muted-foreground italic truncate max-w-[260px]">
                    • {d.payments.description}
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-foreground mt-1 truncate">
                🎓 {d.student_name ?? "Sem aluno"}
                {d.enrollment_id ? (
                  <span className="text-xs text-muted-foreground ml-1">
                    (Mat: {d.enrollment_id})
                  </span>
                ) : (
                  <span className="text-xs text-yellow-500 ml-1">
                    (sem matrícula)
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                👤 Resp: {d.responsible_name ?? "—"}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="flex-shrink-0 border-green-500 text-green-500 hover:bg-green-500/10"
              onClick={() => confirmDelivery(d.id)}
              disabled={confirmingId === d.id}
            >
              {confirmingId === d.id ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <>
                  <CheckCircle2 size={14} className="mr-1" />
                  Entregue
                </>
              )}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DashboardDeliveries;
