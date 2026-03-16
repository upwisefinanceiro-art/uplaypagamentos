import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy, ExternalLink, QrCode, CreditCard, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type PaymentStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";

const statusLabels: Record<PaymentStatus, string> = {
  PENDING: "Pendente",
  PAID: "Pago",
  OVERDUE: "Vencido",
  CANCELLED: "Cancelado",
};

const statusClasses: Record<PaymentStatus, string> = {
  PENDING: "status-pending",
  PAID: "status-paid",
  OVERDUE: "status-overdue",
  CANCELLED: "status-cancelled",
};

const AppPaymentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [payment, setPayment] = useState<any>(null);
  const [responsible, setResponsible] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPayment = async () => {
      if (!id) return;
      const { data } = await supabase
        .from("payments")
        .select("*")
        .eq("id", id)
        .single();
      if (data) {
        setPayment(data);
        // Fetch responsible name
        const { data: resp } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", data.responsible_id)
          .single();
        if (resp) setResponsible(resp);
      }
      setLoading(false);
    };
    fetchPayment();
  }, [id]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copiado!` });
  };

  const handleWhatsApp = () => {
    if (!payment) return;
    const nome = responsible?.full_name || "Responsável";
    const valor = `R$ ${Number(payment.value).toFixed(2).replace(".", ",")}`;
    const vencimento = new Date(payment.due_date + "T12:00:00").toLocaleDateString("pt-BR");
    const link = payment.invoice_url || "";
    const pix = payment.pix_copy_paste || "";

    let msg = `Olá, ${nome}! 👋\n\n`;
    msg += `Segue sua cobrança:\n`;
    msg += `💰 Valor: *${valor}*\n`;
    msg += `📅 Vencimento: *${vencimento}*\n\n`;
    if (link) {
      msg += `🔗 Pague pelo link:\n${link}\n\n`;
    }
    if (pix) {
      msg += `Ou copie o código PIX abaixo:\n\`\`\`${pix}\`\`\`\n\n`;
    }
    msg += `Qualquer dúvida, estamos à disposição! 😊`;

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="p-4 space-y-4 animate-fade-in">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} /><span className="text-sm">Voltar</span>
        </button>
        <p className="text-center text-muted-foreground py-12">Pagamento não encontrado.</p>
      </div>
    );
  }

  const status = payment.status as PaymentStatus;
  const method = payment.payment_method;

  return (
    <div className="p-4 space-y-5 animate-fade-in">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft size={18} /><span className="text-sm">Voltar</span>
      </button>

      {/* Header card */}
      <div className="glass-card p-4">
        <p className="text-xs text-muted-foreground mb-1">Cobrança</p>
        <h1 className="text-base font-bold text-foreground">
          Parcela {payment.installment_number} {method ? `• ${method}` : ""}
        </h1>
        {responsible && (
          <p className="text-xs text-muted-foreground mt-1">Responsável: {responsible.full_name}</p>
        )}
        <div className="flex items-end justify-between mt-4">
          <div>
            <p className="text-xs text-muted-foreground">Valor</p>
            <p className="text-2xl font-bold text-foreground">
              R$ {Number(payment.value).toFixed(2).replace(".", ",")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Vencimento</p>
            <p className="text-sm font-medium text-foreground">
              {new Date(payment.due_date + "T12:00:00").toLocaleDateString("pt-BR")}
            </p>
          </div>
        </div>
        <div className="mt-3">
          <span className={`text-xs px-2 py-1 rounded-full border font-medium ${statusClasses[status] || ""}`}>
            {statusLabels[status] || status}
          </span>
        </div>
      </div>

      {/* Payment instruction highlight */}
      {status === "PENDING" && (payment.invoice_url || payment.pix_copy_paste) && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center space-y-1">
          <p className="text-sm font-semibold text-primary">💳 Pague por link ou copie o PIX</p>
          <p className="text-xs text-muted-foreground">Escolha a forma mais prática para você</p>
        </div>
      )}

      {/* Invoice link */}
      {payment.invoice_url && status === "PENDING" && (
        <Button className="w-full gap-2" asChild>
          <a href={payment.invoice_url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} /> Abrir Fatura / Pagar Online
          </a>
        </Button>
      )}

      {/* PIX section */}
      {method === "PIX" && payment.pix_qr_code && (
        <div className="glass-card p-4 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <QrCode size={16} className="text-primary" />
            QR Code PIX
          </h2>
          <div className="flex justify-center p-3 bg-background rounded-lg border border-border">
            <img
              src={`data:image/png;base64,${payment.pix_qr_code}`}
              alt="QR Code PIX"
              className="w-52 h-52"
            />
          </div>
        </div>
      )}

      {method === "PIX" && payment.pix_copy_paste && (
        <div className="glass-card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">PIX Copia e Cola</h2>
          <div className="bg-secondary rounded-md p-3 flex items-center gap-2">
            <code className="text-xs text-foreground flex-1 break-all">{payment.pix_copy_paste}</code>
            <button
              onClick={() => copyToClipboard(payment.pix_copy_paste, "Código PIX")}
              className="text-primary hover:text-primary/80 transition-colors flex-shrink-0"
            >
              <Copy size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Boleto */}
      {method === "BOLETO" && payment.boleto_url && (
        <Button variant="outline" className="w-full gap-2" asChild>
          <a href={payment.boleto_url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} /> Abrir Boleto
          </a>
        </Button>
      )}

      {/* Card */}
      {method === "CARD" && payment.checkout_url && (
        <Button variant="outline" className="w-full gap-2" asChild>
          <a href={payment.checkout_url} target="_blank" rel="noopener noreferrer">
            <CreditCard size={16} /> Pagar com Cartão
          </a>
        </Button>
      )}

      {/* WhatsApp button */}
      {status === "PENDING" && (
        <Button
          variant="outline"
          className="w-full gap-2 border-green-500/30 text-green-600 hover:bg-green-50 hover:text-green-700"
          onClick={handleWhatsApp}
        >
          <MessageCircle size={16} /> Enviar no WhatsApp
        </Button>
      )}
    </div>
  );
};

export default AppPaymentDetail;
