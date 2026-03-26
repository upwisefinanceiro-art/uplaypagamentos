import { Clock, MessageCircle, ExternalLink, Copy, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { DashboardPayment, DashboardStudent } from "@/pages/admin/AdminDashboard";

interface Props {
  dueTodayList: DashboardPayment[];
  getProfileName: (id: string) => string;
  getStudentByResponsible: (id: string) => DashboardStudent | undefined;
  getUnitName: (id: string) => string;
  formatCurrency: (v: number) => string;
  showUnit: boolean;
  onSendWhatsApp: (payment: DashboardPayment) => void;
}

const paymentTypeLabel: Record<string, string> = {
  MENSALIDADE: "Mensalidade",
  APOSTILA: "Apostila",
  AVULSA: "Avulsa",
};

const DashboardDueTodayList = ({
  dueTodayList,
  getProfileName,
  getStudentByResponsible,
  getUnitName,
  formatCurrency,
  showUnit,
  onSendWhatsApp,
}: Props) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const totalValue = dueTodayList.reduce((sum, p) => sum + (p.final_value ?? p.value), 0);

  const copyLink = (url: string | null, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!url) {
      toast({ title: "Sem link", description: "Esta cobrança não possui link disponível." });
      return;
    }
    navigator.clipboard.writeText(url);
    toast({ title: "Link copiado!", description: "O link da cobrança foi copiado." });
  };

  const openLink = (url: string | null, e: React.MouseEvent) => {
    e.stopPropagation();
    if (url) window.open(url, "_blank");
  };

  return (
    <div className="glass-card p-4 border-warning/30">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
        <h2 className="text-sm font-semibold text-foreground">Cobranças Vencendo Hoje</h2>
        <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-warning/15 text-warning">
          {dueTodayList.length}
        </span>
      </div>

      {dueTodayList.length > 0 && (
        <p className="text-xs text-muted-foreground mb-3">
          Total: <span className="font-semibold text-warning">{formatCurrency(totalValue)}</span>
        </p>
      )}

      {dueTodayList.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">Nenhuma cobrança vencendo hoje</p>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {dueTodayList.map((p) => {
            const student = getStudentByResponsible(p.responsible_id);
            const linkUrl = p.checkout_url || p.invoice_url || p.boleto_url;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-warning/5 border border-warning/20 hover:bg-warning/10 transition-colors cursor-pointer"
                onClick={() => navigate('/admin/cobrancas')}
              >
                <div className="flex-1 min-w-0 mr-2">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {getProfileName(p.responsible_id)}
                  </p>
                  <div className="flex flex-col gap-0.5 mt-0.5">
                    {student && (
                      <span className="text-xs text-muted-foreground truncate">Aluno: {student.full_name}</span>
                    )}
                    {showUnit && (
                      <span className="text-[10px] text-primary/70">{getUnitName(p.unit_id)}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {paymentTypeLabel[p.payment_type] ?? p.payment_type}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="text-right mr-1">
                    <span className="text-sm font-bold text-foreground block">
                      {formatCurrency(p.final_value ?? p.value)}
                    </span>
                    <span className="text-[10px] font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded-full inline-block mt-0.5">
                      ⚠️ Vence hoje
                    </span>
                  </div>
                  {linkUrl && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={(e) => openLink(linkUrl, e)}
                        title="Abrir cobrança"
                      >
                        <ExternalLink size={13} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={(e) => copyLink(linkUrl, e)}
                        title="Copiar link"
                      >
                        <Copy size={13} />
                      </Button>
                    </>
                  )}
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

export default DashboardDueTodayList;
