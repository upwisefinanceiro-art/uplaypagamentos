import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy, ExternalLink, QrCode, CreditCard, Loader2, MessageCircle, Calendar, Receipt, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type PaymentStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";

const statusLabels: Record<PaymentStatus, string> = {
  PENDING: "Aguardando Pagamento",
  PAID: "Pago",
  OVERDUE: "Vencido",
  CANCELLED: "Cancelado",
};

const statusDotClasses: Record<PaymentStatus, string> = {
  PENDING: "bg-warning",
  PAID: "bg-success",
  OVERDUE: "bg-destructive",
  CANCELLED: "bg-muted-foreground",
};

const statusTextClasses: Record<PaymentStatus, string> = {
  PENDING: "text-warning",
  PAID: "text-success",
  OVERDUE: "text-destructive",
  CANCELLED: "text-muted-foreground",
};

const AppPaymentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [payment, setPayment] = useState<any>(null);
  const [responsible, setResponsible] = useState<any>(null);
  const [unit, setUnit] = useState<any>(null);
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
        const [respRes, unitRes] = await Promise.all([
          supabase.from("profiles").select("full_name, phone").eq("id", data.responsible_id).single(),
          supabase.from("units").select("name").eq("id", data.unit_id).single(),
        ]);
        if (respRes.data) setResponsible(respRes.data);
        if (unitRes.data) setUnit(unitRes.data);
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
    if (link) msg += `🔗 Pague pelo link:\n${link}\n\n`;
    if (pix) msg += `Ou copie o código PIX abaixo:\n\`\`\`${pix}\`\`\`\n\n`;
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
  const dueDate = new Date(payment.due_date + "T12:00:00");
  const dueDateStr = dueDate.toLocaleDateString("pt-BR");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const daysLabel = diffDays === 0 ? "hoje" : diffDays === 1 ? "amanhã" : diffDays > 0 ? `daqui a ${diffDays} dias` : `${Math.abs(diffDays)} dias atrás`;

  const originalValue = payment.original_value ?? payment.value;
  const discount = payment.punctuality_discount ?? 0;
  const finalValue = payment.final_value ?? payment.value;
  const hasDiscount = discount > 0;

  const formatCurrency = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

  const description = `Parcela ${payment.installment_number}${payment.contract_id ? "" : " - Avulsa"}`;

  return (
    <div className="p-4 space-y-4 animate-fade-in max-w-lg mx-auto">
      {/* Back */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft size={18} /><span className="text-sm">Voltar</span>
      </button>

      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${statusDotClasses[status]}`} />
          <span className={`text-sm font-semibold ${statusTextClasses[status]}`}>
            {statusLabels[status] || status}
          </span>
        </div>
        {unit && (
          <span className="text-xs text-muted-foreground">{unit.name}</span>
        )}
      </div>

      {/* Invoice data card — Asaas style */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Receipt size={16} className="text-primary" />
          <h2 className="text-sm font-bold text-foreground">Dados da fatura</h2>
          {payment.asaas_payment_id && (
            <span className="text-xs text-muted-foreground ml-auto">#{payment.asaas_payment_id}</span>
          )}
        </div>

        {/* 3-column grid like Asaas */}
        <div className="grid grid-cols-3 gap-3">
          {/* Valor total */}
          <div className="rounded-lg border border-border p-3 space-y-1">
            <p className="text-[11px] text-muted-foreground font-medium">Valor total</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(originalValue)}</p>
          </div>

          {/* Valor com desconto */}
          <div className={`rounded-lg border p-3 space-y-1 ${hasDiscount ? "border-success/40 bg-success/5" : "border-border"}`}>
            <p className="text-[11px] text-muted-foreground font-medium">
              {hasDiscount ? "Valor com desconto" : "Valor a pagar"}
            </p>
            <p className={`text-lg font-bold ${hasDiscount ? "text-success" : "text-foreground"}`}>
              {formatCurrency(finalValue)}
            </p>
            {hasDiscount && dueDate >= today && (
              <p className="text-[10px] text-muted-foreground">(Até {dueDateStr})</p>
            )}
          </div>

          {/* Data de vencimento */}
          <div className="rounded-lg border border-border p-3 space-y-1">
            <p className="text-[11px] text-muted-foreground font-medium">Data de vencimento</p>
            <p className="text-lg font-bold text-foreground">{dueDateStr}</p>
            <p className="text-[10px] text-muted-foreground">({daysLabel})</p>
          </div>
        </div>

        {/* Description */}
        <div className="rounded-lg border border-border p-3">
          <p className="text-[11px] text-muted-foreground font-medium mb-1">Descrição</p>
          <p className="text-sm text-foreground">{description}</p>
        </div>

        {/* Responsible */}
        {responsible && (
          <div className="rounded-lg border border-border p-3">
            <p className="text-[11px] text-muted-foreground font-medium mb-1">Responsável</p>
            <p className="text-sm text-foreground">{responsible.full_name}</p>
          </div>
        )}
      </div>

      {/* Payment instruction */}
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

      {/* PIX QR Code */}
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

      {/* PIX Copy & Paste */}
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

      {/* WhatsApp */}
      {status === "PENDING" && (
        <Button
          variant="outline"
          className="w-full gap-2 border-green-500/30 text-green-600 hover:bg-green-50/10 hover:text-green-500"
          onClick={handleWhatsApp}
        >
          <MessageCircle size={16} /> Enviar no WhatsApp
        </Button>
      )}
    </div>
  );
};

export default AppPaymentDetail;
