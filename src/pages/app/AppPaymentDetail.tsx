import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Copy, ExternalLink, QrCode, CreditCard, Loader2,
  MessageCircle, Calendar, Receipt, Clock, CheckCircle2,
  XCircle, AlertTriangle, Link2, FileText, User, MapPin,
  GraduationCap, Building2, Hash, Banknote
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type PaymentStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";

const statusConfig: Record<PaymentStatus, { label: string; icon: any; dotClass: string; textClass: string; bgClass: string }> = {
  PENDING: { label: "Aguardando Pagamento", icon: Clock, dotClass: "bg-warning", textClass: "text-warning", bgClass: "bg-warning/10 border-warning/30" },
  PAID: { label: "Pago", icon: CheckCircle2, dotClass: "bg-success", textClass: "text-success", bgClass: "bg-success/10 border-success/30" },
  OVERDUE: { label: "Vencido", icon: AlertTriangle, dotClass: "bg-destructive", textClass: "text-destructive", bgClass: "bg-destructive/10 border-destructive/30" },
  CANCELLED: { label: "Cancelado", icon: XCircle, dotClass: "bg-muted-foreground", textClass: "text-muted-foreground", bgClass: "bg-muted/50 border-border" },
};

const methodLabels: Record<string, string> = {
  PIX: "PIX",
  BOLETO: "Boleto Bancário",
  CARD: "Cartão de Crédito",
};

const AppPaymentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const [payment, setPayment] = useState<any>(null);
  const [responsible, setResponsible] = useState<any>(null);
  const [unit, setUnit] = useState<any>(null);
  const [contract, setContract] = useState<any>(null);
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = hasRole("ADMIN_MASTER");

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
          supabase.from("profiles").select("full_name, phone, cpf").eq("id", data.responsible_id).single(),
          supabase.from("units").select("name").eq("id", data.unit_id).single(),
        ]);
        if (respRes.data) setResponsible(respRes.data);
        if (unitRes.data) setUnit(unitRes.data);
        if (data.contract_id) {
          const { data: contractData } = await supabase
            .from("contracts")
            .select("description, student_id, responsible_name")
            .eq("id", data.contract_id)
            .single();
          if (contractData) {
            setContract(contractData);
            if (contractData.student_id) {
              const { data: studentData } = await supabase
                .from("students")
                .select("full_name")
                .eq("id", contractData.student_id)
                .single();
              if (studentData) setStudent(studentData);
            }
          }
        }
        if (results[0].data) setResponsible(results[0].data);
        if (results[1].data) setUnit(results[1].data);
        if (results[2]?.data) {
          setContract(results[2].data);
          if (results[2].data.student_id) {
            const { data: studentData } = await supabase
              .from("students")
              .select("full_name")
              .eq("id", results[2].data.student_id)
              .single();
            if (studentData) setStudent(studentData);
          }
        }
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
    const nome = responsible?.full_name || contract?.responsible_name || "Responsável";
    const valor = formatCurrency(payment.final_value ?? payment.value);
    const vencimento = formatDate(payment.due_date);
    const link = payment.invoice_url || "";
    const pix = payment.pix_copy_paste || "";

    let msg = `Olá, ${nome}! 👋\n\n`;
    msg += `Segue sua cobrança do EnsinUP:\n`;
    msg += `💰 Valor: *${valor}*\n`;
    msg += `📅 Vencimento: *${vencimento}*\n\n`;
    if (link) msg += `🔗 Pague pelo link:\n${link}\n\n`;
    if (pix) msg += `Ou copie o código PIX abaixo:\n\`\`\`${pix}\`\`\`\n\n`;
    msg += `Qualquer dúvida, estamos à disposição! 😊`;

    const phone = responsible?.phone?.replace(/\D/g, "") || "";
    const waUrl = phone ? `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, "_blank");
  };

  const formatCurrency = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
  const formatDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR");

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
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
  const cfg = statusConfig[status] || statusConfig.PENDING;
  const StatusIcon = cfg.icon;
  const method = payment.payment_method;
  const dueDate = new Date(payment.due_date + "T12:00:00");
  const dueDateStr = formatDate(payment.due_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const daysLabel = diffDays === 0 ? "Vence hoje" : diffDays === 1 ? "Vence amanhã" : diffDays > 0 ? `Faltam ${diffDays} dias` : `${Math.abs(diffDays)} dias em atraso`;

  const originalValue = payment.original_value ?? payment.value;
  const discount = payment.punctuality_discount ?? 0;
  const finalValue = payment.final_value ?? payment.value;
  const hasDiscount = discount > 0;

  // Determine charge type
  const getChargeType = () => {
    if (!payment.contract_id) return { label: "Avulsa", color: "bg-accent text-accent-foreground" };
    const desc = contract?.description?.toLowerCase() || "";
    if (desc.includes("apostila")) return { label: "Apostila", color: "bg-primary/15 text-primary" };
    return { label: "Mensalidade", color: "bg-primary/15 text-primary" };
  };
  const chargeType = getChargeType();

  const description = contract?.description || `Parcela ${payment.installment_number}${!payment.contract_id ? " - Avulsa" : ""}`;

  // History timeline
  const timeline = [
    { label: "Cobrança criada", date: payment.created_at, icon: Receipt },
    ...(payment.updated_at !== payment.created_at ? [{ label: "Última atualização", date: payment.updated_at, icon: Clock }] : []),
    ...(payment.paid_at ? [{ label: "Pagamento confirmado", date: payment.paid_at, icon: CheckCircle2 }] : []),
  ];

  return (
    <div className="p-4 space-y-5 animate-fade-in max-w-2xl mx-auto pb-8">
      {/* Back */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft size={18} /><span className="text-sm">Voltar</span>
      </button>

      {/* ─── STATUS HEADER ─── */}
      <div className={`rounded-xl border p-4 ${cfg.bgClass}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${cfg.bgClass}`}>
              <StatusIcon size={20} className={cfg.textClass} />
            </div>
            <div>
              <p className={`text-sm font-bold ${cfg.textClass}`}>{cfg.label}</p>
              <p className="text-xs text-muted-foreground">{daysLabel}</p>
            </div>
          </div>
          <Badge className={`${chargeType.color} border-0 text-xs`}>{chargeType.label}</Badge>
        </div>
      </div>

      {/* ─── IDENTIFICATION ─── */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Hash size={12} />
          <span className="font-mono">{payment.asaas_payment_id || payment.id.slice(0, 8)}</span>
          {method && (
            <>
              <span>•</span>
              <span>{methodLabels[method] || method}</span>
            </>
          )}
        </div>

        <h2 className="text-base font-bold text-foreground">{description}</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
          {responsible && (
            <div className="flex items-center gap-2">
              <User size={14} className="text-muted-foreground flex-shrink-0" />
              <span className="text-foreground truncate">{responsible.full_name}</span>
            </div>
          )}
          {student && (
            <div className="flex items-center gap-2">
              <GraduationCap size={14} className="text-muted-foreground flex-shrink-0" />
              <span className="text-foreground truncate">{student.full_name}</span>
            </div>
          )}
          {unit && (
            <div className="flex items-center gap-2">
              <Building2 size={14} className="text-muted-foreground flex-shrink-0" />
              <span className="text-foreground truncate">{unit.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── FINANCIAL SUMMARY ─── */}
      <div className="glass-card p-4 space-y-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Banknote size={16} className="text-primary" />
          Resumo Financeiro
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Valor original */}
          <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1">
            <p className="text-[11px] text-muted-foreground font-medium">Valor original</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(originalValue)}</p>
          </div>

          {/* Desconto */}
          <div className={`rounded-lg border p-3 space-y-1 ${hasDiscount ? "border-success/40 bg-success/5" : "border-border bg-secondary/30"}`}>
            <p className="text-[11px] text-muted-foreground font-medium">Desconto pontualidade</p>
            <p className={`text-lg font-bold ${hasDiscount ? "text-success" : "text-muted-foreground"}`}>
              {hasDiscount ? `- ${formatCurrency(discount)}` : "—"}
            </p>
          </div>

          {/* Valor final */}
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-1">
            <p className="text-[11px] text-muted-foreground font-medium">Valor a pagar</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(finalValue)}</p>
            {hasDiscount && dueDate >= today && (
              <p className="text-[10px] text-muted-foreground">até {dueDateStr}</p>
            )}
          </div>

          {/* Vencimento */}
          <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1">
            <p className="text-[11px] text-muted-foreground font-medium">Vencimento</p>
            <p className="text-lg font-bold text-foreground">{dueDateStr}</p>
            <p className={`text-[10px] font-medium ${diffDays < 0 ? "text-destructive" : diffDays <= 3 ? "text-warning" : "text-muted-foreground"}`}>
              {daysLabel}
            </p>
          </div>
        </div>
      </div>

      {/* ─── PAYMENT METHODS ─── */}
      {status === "PENDING" && (payment.invoice_url || payment.pix_copy_paste || payment.pix_qr_code || payment.boleto_url || payment.checkout_url) && (
        <div className="glass-card p-4 space-y-4">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <CreditCard size={16} className="text-primary" />
            Meios de Pagamento
          </h3>

          {/* Invoice link */}
          {payment.invoice_url && (
            <Button className="w-full gap-2" asChild>
              <a href={payment.invoice_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} /> Abrir Fatura / Pagar Online
              </a>
            </Button>
          )}

          {/* PIX QR Code */}
          {method === "PIX" && payment.pix_qr_code && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <QrCode size={14} />
                <span className="font-medium">QR Code PIX</span>
              </div>
              <div className="flex justify-center p-4 bg-background rounded-lg border border-border">
                <img
                  src={`data:image/png;base64,${payment.pix_qr_code}`}
                  alt="QR Code PIX"
                  className="w-48 h-48"
                />
              </div>
            </div>
          )}

          {/* PIX Copy & Paste */}
          {method === "PIX" && payment.pix_copy_paste && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Copy size={14} />
                <span className="font-medium">PIX Copia e Cola</span>
              </div>
              <div className="bg-secondary rounded-lg p-3 flex items-center gap-2 border border-border">
                <code className="text-xs text-foreground flex-1 break-all leading-relaxed">{payment.pix_copy_paste}</code>
                <Button
                  size="icon"
                  variant="ghost"
                  className="flex-shrink-0 h-8 w-8"
                  onClick={() => copyToClipboard(payment.pix_copy_paste, "Código PIX")}
                >
                  <Copy size={14} />
                </Button>
              </div>
            </div>
          )}

          {/* Boleto */}
          {method === "BOLETO" && payment.boleto_url && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText size={14} />
                <span className="font-medium">Boleto Bancário</span>
              </div>
              <Button variant="outline" className="w-full gap-2" asChild>
                <a href={payment.boleto_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={16} /> Abrir Boleto
                </a>
              </Button>
              {payment.boleto_barcode && (
                <div className="bg-secondary rounded-lg p-3 flex items-center gap-2 border border-border">
                  <code className="text-xs text-foreground flex-1 break-all">{payment.boleto_barcode}</code>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="flex-shrink-0 h-8 w-8"
                    onClick={() => copyToClipboard(payment.boleto_barcode, "Linha digitável")}
                  >
                    <Copy size={14} />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Card */}
          {method === "CARD" && payment.checkout_url && (
            <Button variant="outline" className="w-full gap-2" asChild>
              <a href={payment.checkout_url} target="_blank" rel="noopener noreferrer">
                <CreditCard size={16} /> Pagar com Cartão
              </a>
            </Button>
          )}
        </div>
      )}

      {/* ─── QUICK ACTIONS ─── */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-sm font-bold text-foreground">Ações Rápidas</h3>
        <div className="grid grid-cols-2 gap-2">
          {payment.pix_copy_paste && status === "PENDING" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs"
              onClick={() => copyToClipboard(payment.pix_copy_paste, "PIX")}
            >
              <Copy size={14} /> Copiar PIX
            </Button>
          )}

          {payment.invoice_url && status === "PENDING" && (
            <Button variant="outline" size="sm" className="gap-2 text-xs" asChild>
              <a href={payment.invoice_url} target="_blank" rel="noopener noreferrer">
                <Link2 size={14} /> Abrir Fatura
              </a>
            </Button>
          )}

          {status === "PENDING" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs border-green-500/30 text-green-500 hover:bg-green-500/10 hover:text-green-400"
              onClick={handleWhatsApp}
            >
              <MessageCircle size={14} /> WhatsApp
            </Button>
          )}

          {isAdmin && status === "PENDING" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs border-success/30 text-success hover:bg-success/10"
              onClick={async () => {
                const { error } = await supabase
                  .from("payments")
                  .update({ status: "PAID", paid_at: new Date().toISOString() })
                  .eq("id", payment.id);
                if (!error) {
                  setPayment({ ...payment, status: "PAID", paid_at: new Date().toISOString() });
                  toast({ title: "Pagamento marcado como pago!" });
                } else {
                  toast({ title: "Erro ao atualizar", variant: "destructive" });
                }
              }}
            >
              <CheckCircle2 size={14} /> Marcar Pago
            </Button>
          )}
        </div>
      </div>

      {/* ─── HISTORY TIMELINE ─── */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Clock size={16} className="text-primary" />
          Histórico
        </h3>
        <div className="relative pl-6 space-y-4">
          {/* vertical line */}
          <div className="absolute left-[9px] top-1 bottom-1 w-px bg-border" />

          {timeline.map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className="relative flex items-start gap-3">
                <div className="absolute -left-6 w-[18px] h-[18px] rounded-full bg-card border border-border flex items-center justify-center">
                  <Icon size={10} className="text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.date).toLocaleString("pt-BR", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AppPaymentDetail;
