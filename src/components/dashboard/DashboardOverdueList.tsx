import { AlertTriangle, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { DashboardPayment, DashboardStudent } from "@/pages/admin/AdminDashboard";

interface OverduePayment extends DashboardPayment {
  daysOverdue: number;
}

interface Props {
  overdueList: OverduePayment[];
  getProfileName: (id: string) => string;
  getStudentByResponsible: (id: string) => DashboardStudent | undefined;
  getUnitName: (id: string) => string;
  formatCurrency: (v: number) => string;
  showUnit: boolean;
  onSendWhatsApp: (payment: DashboardPayment) => void;
}

const DashboardOverdueList = ({
  overdueList,
  getProfileName,
  getStudentByResponsible,
  getUnitName,
  formatCurrency,
  showUnit,
  onSendWhatsApp,
}: Props) => {
  const navigate = useNavigate();
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
        <h2 className="text-sm font-semibold text-foreground">Cobranças em Atraso</h2>
        <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">
          {overdueList.length}
        </span>
      </div>
      {overdueList.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">Nenhuma cobrança em atraso 🎉</p>
      ) : (
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {overdueList.map((p) => {
            const student = getStudentByResponsible(p.responsible_id);
            return (
              <div key={p.id} className="flex items-center justify-between py-2.5 px-2 rounded-md hover:bg-destructive/5 border-b border-border/30 last:border-0 transition-colors">
                <div className="flex-1 min-w-0 mr-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {getProfileName(p.responsible_id)}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                    {student && (
                      <span className="truncate">Aluno: {student.full_name}</span>
                    )}
                    {showUnit && student && <span>•</span>}
                    {showUnit && (
                      <span className="text-primary/70">{getUnitName(p.unit_id)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <span className="text-sm font-semibold text-foreground block">
                      {formatCurrency(p.final_value ?? p.value)}
                    </span>
                    <span className="text-[10px] font-medium text-destructive">
                      {p.daysOverdue}d atraso
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

export default DashboardOverdueList;
