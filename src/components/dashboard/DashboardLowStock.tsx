import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface LowStockItem {
  id: string;
  name: string;
  quantity: number;
  min_quantity: number;
  unit_id: string;
}

interface Props {
  unitFilter?: string;
  units: { id: string; name: string }[];
}

const DashboardLowStock = ({ unitFilter = "all", units }: Props) => {
  const [items, setItems] = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      let query = supabase
        .from("stock_items")
        .select("id, name, quantity, min_quantity, unit_id")
        .eq("active", true)
        .gt("min_quantity", 0)
        .order("quantity", { ascending: true });

      if (unitFilter !== "all") {
        query = query.eq("unit_id", unitFilter);
      }

      const { data } = await query;
      // Filter client-side: quantity <= min_quantity
      const low = (data ?? []).filter((i: any) => i.quantity <= i.min_quantity) as LowStockItem[];
      setItems(low);
      setLoading(false);
    };
    fetch();
  }, [unitFilter]);

  if (loading || items.length === 0) return null;

  const getUnitName = (id: string) => units.find((u) => u.id === id)?.name ?? "";

  return (
    <div className="glass-card p-4 border-l-4 border-l-yellow-500">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={18} className="text-yellow-500" />
        <h3 className="text-sm font-bold text-foreground">
          ⚠️ Estoque Baixo ({items.length})
        </h3>
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-muted/50 border border-border">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
              {units.length > 1 && (
                <p className="text-xs text-muted-foreground">{getUnitName(item.unit_id)}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-sm font-bold ${item.quantity <= 0 ? "text-destructive" : "text-yellow-500"}`}>
                {item.quantity}
              </span>
              <span className="text-[10px] text-muted-foreground">/ mín. {item.min_quantity}</span>
              {item.quantity <= 0 ? (
                <Badge variant="destructive" className="text-[10px]">Esgotado</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] border-yellow-500 text-yellow-500">Baixo</Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DashboardLowStock;
