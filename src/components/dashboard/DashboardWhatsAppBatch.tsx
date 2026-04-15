import { useState } from "react";
import { MessageCircle, Send, RefreshCw, Clock, AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface NotificationItem {
  payment_id: string;
  responsible_id: string;
  responsible_name: string;
  responsible_phone: string | null;
  student_name: string | null;
  value: number;
  due_date: string;
  days_until_due: number;
  status: string;
  invoice_url: string | null;
  boleto_url: string | null;
  pix_copy_paste: string | null;
  payment_method: string | null;
  unit_id: string;
  unit_name: string;
  type: "REMINDER" | "OVERDUE";
}

interface Props {
  unitFilter: string;
}

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
};

const buildMessage = (item: NotificationItem): string => {
  const fmtDate = format(new Date(item.due_date + "T12:00:00"), "dd/MM/yyyy");
  const paymentLink = item.invoice_url || item.boleto_url || "";

  if (item.type === "REMINDER") {
    let msg = `📚 *Upwise / EnsinUp — Cursos Profissionalizantes* 📚\n\n`;
    msg += `Olá, ${item.responsible_name}.\n\n`;
    msg += `Aqui é do *setor financeiro*.\n\n`;
    msg += `Estamos passando para lembrar que sua mensalidade vence em breve.\n\n`;
    if (item.student_name) msg += `👤 Aluno: ${item.student_name}\n`;
    msg += `💰 Valor: *${formatCurrency(item.value)}*\n`;
    msg += `📅 Vencimento: *${fmtDate}*\n\n`;
    if (paymentLink) msg += `Segue o link para pagamento:\n${paymentLink}\n\n`;
    msg += `Em caso de dúvidas, estamos à disposição. 😊\n\n`;
    msg += `Atenciosamente,\n*Setor Financeiro*`;
    return msg;
  }

  // OVERDUE
  let msg = `📚 *Upwise / EnsinUp — Cursos Profissionalizantes* 📚\n\n`;
  msg += `Olá, ${item.responsible_name}.\n\n`;
  msg += `Identificamos que existe uma mensalidade em aberto.\n\n`;
  if (item.student_name) msg += `👤 Aluno: ${item.student_name}\n`;
  msg += `💰 Valor: *${formatCurrency(item.value)}*\n`;
  msg += `📅 Vencimento: *${fmtDate}*\n\n`;
  if (paymentLink) msg += `Segue o link para regularização:\n${paymentLink}\n\n`;
  msg += `Por favor, realize o pagamento o quanto antes.\n\n`;
  msg += `Atenciosamente,\n*Setor Financeiro*`;
  return msg;
};

const DashboardWhatsAppBatch = ({ unitFilter }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [reminders, setReminders] = useState<NotificationItem[]>([]);
  const [overdue, setOverdue] = useState<NotificationItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const body: Record<string, string> = {};
      if (unitFilter !== "all") body.unit_id = unitFilter;

      const { data, error } = await supabase.functions.invoke("notify-billing-whatsapp", { body });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setReminders(data.reminders || []);
      setOverdue(data.overdue || []);
      setLoaded(true);

      toast({
        title: "Notificações carregadas",
        description: `${data.reminders?.length || 0} lembretes + ${data.overdue?.length || 0} em atraso`,
      });
    } catch (err) {
      toast({
        title: "Erro ao carregar notificações",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const sendWhatsApp = (item: NotificationItem) => {
    if (!item.responsible_phone) {
      toast({
        title: "Sem telefone",
        description: `${item.responsible_name} não possui telefone cadastrado.`,
        variant: "destructive",
      });
      return;
    }

    const phone = formatPhone(item.responsible_phone);
    const message = buildMessage(item);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
  };

  const renderItem = (item: NotificationItem) => {
    const hasPhone = Boolean(item.responsible_phone);
    const hasLink = Boolean(item.invoice_url || item.boleto_url);
    const fmtDate = format(new Date(item.due_date + "T12:00:00"), "dd/MM/yyyy");

    return (
      <div
        key={item.payment_id}
        className={`flex items-center justify-between py-2.5 px-3 rounded-lg border transition-colors ${
          item.type === "OVERDUE"
            ? "bg-destructive/5 border-destructive/20"
            : "bg-primary/5 border-primary/20"
        }`}
      >
        <div className="flex items-start gap-2 flex-1 min-w-0 mr-2">
          {item.type === "OVERDUE" ? (
            <AlertTriangle size={14} className="text-destructive mt-0.5 flex-shrink-0" />
          ) : (
            <Clock size={14} className="text-primary mt-0.5 flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{item.responsible_name}</p>
            <div className="flex flex-col gap-0.5 mt-0.5">
              {item.student_name && (
                <span className="text-xs text-muted-foreground truncate">Aluno: {item.student_name}</span>
              )}
              <span className="text-[10px] text-muted-foreground">
                Venc: {fmtDate} • {item.unit_name}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <span className="text-sm font-bold block">{formatCurrency(item.value)}</span>
            {!hasLink && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 mt-0.5 text-warning border-warning/30">
                Sem link
              </Badge>
            )}
          </div>
          <Button
            size="icon"
            variant="ghost"
            className={`h-8 w-8 ${hasPhone ? "text-success hover:text-success hover:bg-success/10" : "text-muted-foreground"}`}
            onClick={() => sendWhatsApp(item)}
            disabled={!hasPhone}
            title={hasPhone ? "Enviar WhatsApp" : "Sem telefone"}
          >
            <Send size={14} />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageCircle size={16} className="text-success" />
          <h2 className="text-sm font-semibold">Envio de Cobranças via WhatsApp</h2>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={loadNotifications}
          disabled={loading}
          className="gap-1.5 text-xs"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {loaded ? "Atualizar" : "Carregar"}
        </Button>
      </div>

      {!loaded ? (
        <div className="text-center py-8">
          <MessageCircle size={32} className="mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Clique em <strong>"Carregar"</strong> para buscar cobranças pendentes e em atraso
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Lembretes (5 dias antes) e cobranças vencidas
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Reminders - 5 days before */}
          {reminders.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock size={13} className="text-primary" />
                <span className="text-xs font-semibold text-primary">Lembretes (vencem em 5 dias)</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {reminders.length}
                </Badge>
              </div>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {reminders.map(renderItem)}
              </div>
            </div>
          )}

          {/* Overdue */}
          {overdue.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={13} className="text-destructive" />
                <span className="text-xs font-semibold text-destructive">Em atraso</span>
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  {overdue.length}
                </Badge>
              </div>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {overdue.map(renderItem)}
              </div>
            </div>
          )}

          {reminders.length === 0 && overdue.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              Nenhuma notificação pendente no momento 🎉
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default DashboardWhatsAppBatch;
