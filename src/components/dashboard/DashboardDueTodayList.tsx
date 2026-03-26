import { Clock, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { DashboardPayment, DashboardStudent } from "@/pages/admin/AdminDashboard";

interface Props {
  dueTodayList: DashboardPayment[];
  getProfileName: (id: string) => string;
  getStudentByResponsible: (id: string) => DashboardStudent | undefined;
  formatCurrency: (v: number) => string;
  onSendWhatsApp: (payment: DashboardPayment) => void;
}

const DashboardDueTodayList = ({
  dueTodayList,
  getProfileName,
  getStudentByResponsible,
  formatCurrency,
  onSendWhatsApp,
}: Props) => {
  const navigate = useNavigate();
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
        <h2 className="text-sm font-semibold text-foreground">Vencendo Hoje</h2>
        <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-warning/15 text-warning">
          {dueTodayList.length}
        </span>
      </div>
      {dueTodayList.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">Nenhuma cobrança vencendo hoje</p>
      ) : (
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {dueTodayList.map((p) => {
            const student = getStudentByResponsible(p.responsible_id);
            return (
              <div key={p.id} className="flex items-center justify-between py-2.5 px-2 rounded-md hover:bg-warning/5 border-b border-border/30 last:border-0 transition-colors">
                <div className="flex-1 min-w-0 mr-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {getProfileName(p.responsible_id)}
                  </p>
                  {student && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      Aluno: {student.full_name}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <span className="text-sm font-semibold text-foreground block">
                      {formatCurrency(p.final_value ?? p.value)}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border status-pending">
                      Hoje
                    </span>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-success hover:text-success hover:bg-success/10"
                    onClick={() => onSendWhatsApp(p)}
                    title="Enviar cobrança"
                  >
                    <MessageCircle size={14} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DashboardDueTodayList;
