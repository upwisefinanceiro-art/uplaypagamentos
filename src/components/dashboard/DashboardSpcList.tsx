import { useState } from "react";
import { ShieldAlert, MessageCircle, RefreshCw, MoreVertical, ShieldOff } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { DashboardPayment, DashboardStudent } from "@/pages/admin/AdminDashboard";

interface SpcPayment extends DashboardPayment {
  daysOverdue: number;
  dunning_status?: string | null;
  dunning_manual?: boolean;
}

interface Props {
  spcList: SpcPayment[];
  getProfileName: (id: string) => string;
  getStudentByResponsible: (id: string) => DashboardStudent | undefined;
  getUnitName: (id: string) => string;
  formatCurrency: (v: number) => string;
  showUnit: boolean;
  onSendWhatsApp: (payment: DashboardPayment) => void;
  onChanged?: () => void;
}

const statusLabel = (s?: string | null) => {
  switch (s) {
    case "AWAITING_APPROVAL": return "Aguardando aprovação";
    case "IN_PROGRESS": return "Em andamento";
    case "PARTIALLY_PAID": return "Parcialmente pago";
    case "AWAITING_CANCELLATION": return "Aguardando cancelamento";
    case "PENDING": return "Pendente";
    default: return "Em negativação";
  }
};

const DashboardSpcList = ({
  spcList,
  getProfileName,
  getStudentByResponsible,
  getUnitName,
  formatCurrency,
  showUnit,
  onSendWhatsApp,
  onChanged,
}: Props) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("sync-asaas-dunnings", { body: {} });
      if (error) throw error;
      toast({ title: "Sincronização concluída", description: "Lista SPC atualizada com o Asaas." });
      onChanged?.();
    } catch (e) {
      toast({
        title: "Falha na sincronização",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleRemoveFromSpc = async (paymentId: string) => {
    const { error } = await supabase
      .from("payments")
      .update({
        in_dunning: false,
        dunning_manual: false,
        dunning_status: null,
        dunning_synced_at: new Date().toISOString(),
      })
      .eq("id", paymentId);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Removido do SPC" });
      onChanged?.();
    }
  };

  return (
    <div className="glass-card p-4 border-warning/30">
      <div className="flex items-center gap-2 mb-4">
        <ShieldAlert size={16} className="text-warning" />
        <h2 className="text-sm font-semibold text-warning">SPC / Negativação</h2>
        <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-warning/15 text-warning">
          {spcList.length}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={handleSync}
          disabled={syncing}
          title="Sincronizar com Asaas"
        >
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
        </Button>
      </div>
      {spcList.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">
          Nenhum cliente em processo de negativação 👍
        </p>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {spcList.map((p) => {
            const student = getStudentByResponsible(p.responsible_id);
            return (
              <div
                key={p.id}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-warning/5 border border-warning/20 hover:bg-warning/10 transition-colors cursor-pointer"
                onClick={() => navigate('/admin/cobrancas')}
              >
                <div className="flex items-start gap-2 flex-1 min-w-0 mr-2">
                  <ShieldAlert size={14} className="text-warning mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-warning truncate">
                      {getProfileName(p.responsible_id)}
                    </p>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {student && (
                        <span className="text-xs text-muted-foreground truncate">
                          Aluno: {student.full_name}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        Venc: {format(new Date(p.due_date + "T12:00:00"), "dd/MM/yyyy")}
                      </span>
                      <span className="text-[10px] font-medium text-warning">
                        {statusLabel(p.dunning_status)}
                        {p.dunning_manual ? " (manual)" : ""}
                      </span>
                      {showUnit && (
                        <span className="text-[10px] text-primary/70">
                          {getUnitName(p.unit_id)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <div className="text-right">
                    <span className="text-sm font-bold text-warning block">
                      {formatCurrency(p.final_value ?? p.value)}
                    </span>
                    <span className="text-[10px] font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded-full inline-block mt-0.5">
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-7 w-7">
                        <MoreVertical size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleRemoveFromSpc(p.id)}>
                        <ShieldOff size={14} className="mr-2" />
                        Remover do SPC
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DashboardSpcList;
