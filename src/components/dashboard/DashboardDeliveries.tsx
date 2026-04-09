import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Package, CheckCircle2, Loader2 } from "lucide-react";
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

  const fetchDeliveries = async () => {
    setLoading(true);
    let query = supabase
      .from("delivery_notifications")
      .select("id, unit_id, student_name, responsible_name, enrollment_id, item_name, quantity, status, created_at")
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
    const { error } = await supabase
      .from("delivery_notifications")
      .update({
        status: "DELIVERED",
        delivered_at: new Date().toISOString(),
        delivered_by: user?.id,
      })
      .eq("id", id);

    if (error) {
      toast({ title: "Erro ao confirmar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Entrega confirmada! ✅" });
      setDeliveries((prev) => prev.filter((d) => d.id !== id));
    }
    setConfirmingId(null);
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
                <Badge variant="outline" className="text-[10px] border-primary text-primary">
                  {d.item_name}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  Qtd: {d.quantity}
                </span>
              </div>
              <p className="text-sm font-medium text-foreground mt-1 truncate">
                🎓 {d.student_name ?? "Sem aluno"}
                {d.enrollment_id && (
                  <span className="text-xs text-muted-foreground ml-1">
                    (Mat: {d.enrollment_id})
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
