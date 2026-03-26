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
    <div className="glass-card p-4 border-destructive/30">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle size={16} className="text-destructive animate-pulse" />
        <h2 className="text-sm font-semibold text-destructive">Cobranças em Atraso</h2>
        <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive animate-pulse">
          {overdueList.length}
        </span>
      </div>
      {overdueList.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">Nenhuma cobrança em atraso 🎉</p>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {overdueList.map((p) => {
            const student = getStudentByResponsible(p.responsible_id);
            return (
              <div
                key={p.id}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-destructive/5 border border-destructive/20 hover:bg-destructive/10 transition-colors cursor-pointer"
                onClick={() => navigate('/admin/cobrancas')}
              >
                <div className="flex items-start gap-2 flex-1 min-w-0 mr-2">
                  <AlertTriangle size={14} className="text-destructive mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-destructive truncate">
                      {getProfileName(p.responsible_id)}
                    </p>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {student && (
                        <span className="text-xs text-muted-foreground truncate">Aluno: {student.full_name}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        Venc: {format(new Date(p.due_date + "T12:00:00"), "dd/MM/yyyy")}
                      </span>
                      {showUnit && (
                        <span className="text-[10px] text-primary/70">{getUnitName(p.unit_id)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <span className="text-sm font-bold text-destructive block">
                      {formatCurrency(p.final_value ?? p.value)}
                    </span>
                    <span className="text-[10px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full inline-block mt-0.5">
                      ⚠️ {p.daysOverdue}d atraso
                    </span>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-success hover:text-success hover:bg-success/10"
                    onClick={(e) => { e.stopPropagation(); onSendWhatsApp(p); }}
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
