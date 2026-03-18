import { CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import type { DashboardPayment } from "@/pages/admin/AdminDashboard";

interface Props {
  recentPaid: DashboardPayment[];
  getProfileName: (id: string) => string;
  formatCurrency: (v: number) => string;
}

const DashboardRecentPaid = ({ recentPaid, getProfileName, formatCurrency }: Props) => {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-success" />
        <h2 className="text-sm font-semibold text-foreground">Últimos Recebidos</h2>
        <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-success/15 text-success">
          {recentPaid.length}
        </span>
      </div>
      {recentPaid.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">Nenhum pagamento recebido</p>
      ) : (
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {recentPaid.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-2.5 px-2 rounded-md hover:bg-success/5 border-b border-border/30 last:border-0 transition-colors">
              <div className="flex-1 min-w-0 mr-2">
                <p className="text-sm font-medium text-foreground truncate">
                  {getProfileName(p.responsible_id)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {p.paid_at ? format(new Date(p.paid_at), "dd/MM HH:mm") : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-semibold text-foreground">
                  {formatCurrency(p.final_value ?? p.value)}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded border status-paid">Pago</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DashboardRecentPaid;
