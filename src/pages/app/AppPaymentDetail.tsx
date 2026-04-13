import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Copy, ExternalLink, QrCode, CreditCard, Loader2,
  MessageCircle, Calendar, Receipt, Clock, CheckCircle2,
  XCircle, AlertTriangle, Link2, FileText, User, MapPin,
  GraduationCap, Building2, Hash, Banknote, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import WhatsAppDialog from "@/components/WhatsAppDialog";
import { resolveWhatsAppChargeData } from "@/lib/asaas-payment";
import { getUnitWhatsAppNumber, DEFAULT_WHATSAPP_FINANCEIRO } from "@/lib/whatsapp-utils";

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
  const { hasRole, profile } = useAuth();
  const [payment, setPayment] = useState<any>(null);
  const [responsible, setResponsible] = useState<any>(null);
  const [unit, setUnit] = useState<any>(null);
  const [contract, setContract] = useState<any>(null);
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [waDialogOpen, setWaDialogOpen] = useState(false);
  const [unitWhatsAppNumber, setUnitWhatsAppNumber] = useState(DEFAULT_WHATSAPP_FINANCEIRO);

  const isAdmin = hasRole("ADMIN_MASTER");

  const needsSync = useCallback((p: any) => {
    if (!p) return false;
    if (p.status === "PAID" || p.status === "CANCELLED") return false;
    if (p.payment_method === "DINHEIRO") return false;
    // Missing links - either has asaas_payment_id but no links, or no asaas_payment_id at all
    if (!(p.invoice_url || p.checkout_url || p.boleto_url)) return true;
    return false;
  }, []);

  const syncPayment = useCallback(async (paymentId: string) => {
    setSyncing(true);
    setSyncError(null);
    console.info("[app-payment-detail] auto-sync iniciado", { paymentId });

    try {
      const { data, error } = await supabase.functions.invoke("sync-asaas-payment", {
        body: { payment_id: paymentId },
      });

      if (error || data?.error) {
        const msg = error?.message || data?.error || "Erro ao sincronizar";
        console.error("[app-payment-detail] erro na sincronização", { paymentId, msg });
        setSyncError(msg);
        return null;
      }

      console.info("[app-payment-detail] sincronização concluída", {
        paymentId,
        action: data?.action,
        invoice_url: Boolean(data?.invoice_url),
        boleto_url: Boolean(data?.boleto_url),
        pix_copy_paste: Boolean(data?.pix_copy_paste),
      });

      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao sincronizar";
      console.error("[app-payment-detail] exceção na sincronização", { paymentId, msg });
      setSyncError(msg);
      return null;
    } finally {
      setSyncing(false);
    }
  }, []);

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
        try {
          const whatsNum = await getUnitWhatsAppNumber(profile?.unit_id || data.unit_id);
          setUnitWhatsAppNumber(whatsNum);
        } catch {
          // fallback already set
        }

        // Auto-sync if payment has asaas_payment_id but missing links
        if (needsSync(data)) {
          const syncResult = await syncPayment(data.id);
          if (syncResult) {
            // Reload payment data after sync
            const { data: refreshed } = await supabase
              .from("payments")
              .select("*")
              .eq("id", id)
              .single();
            if (refreshed) setPayment(refreshed);
          }
        }
      }
      setLoading(false);
    };
    fetchPayment();
  }, [id, profile?.unit_id, needsSync, syncPayment]);

  const handleManualSync = async () => {
    if (!payment?.id) return;
    const syncResult = await syncPayment(payment.id);
    if (syncResult) {
      const { data: refreshed } = await supabase
        .from("payments")
        .select("*")
        .eq("id", payment.id)
        .single();
      if (refreshed) {
        setPayment(refreshed);
        toast({ title: "Dados atualizados!" });
      }
    } else {
      toast({ title: "Erro ao sincronizar", description: syncError || "Tente novamente.", variant: "destructive" });
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copiado!` });
  };

  const handleOpenWhatsApp = async () => {
    if (!payment?.id) return;

    if (isAdmin) {
      try {
        toast({ title: "Sincronizando cobrança no Asaas antes do envio..." });
        const resolved = await resolveWhatsAppChargeData(payment.id);
        setPayment((prev: any) => ({ ...prev, ...resolved.payment }));
        setResponsible(resolved.responsible);
        if (resolved.studentName) setStudent({ full_name: resolved.studentName });
        setWaDialogOpen(true);
      } catch (err) {
        toast({
          title: "Envio bloqueado",
          description: err instanceof Error ? err.message : "Não foi possível obter os dados completos.",
          variant: "destructive",
        });
      }
      return;
    }

    const responsibleName = responsible?.full_name || "Responsável";
    const studentFullName = student?.full_name || "";
    const unitFullName = unit?.name || "";
    const desc = contract?.description || payment.description || `Parcela ${payment.installment_number}`;
    const val = payment.final_value ?? payment.value;
    const parcela = payment.installment_number || 1;
    const tipo = payment.payment_type === "APOSTILA" ? "Apostila" : payment.payment_type === "MENSALIDADE" ? "Mensalidade" : "Avulsa";
    const currentStatus = payment.status as PaymentStatus;
    const statusLabel = (statusConfig[currentStatus] || statusConfig.PENDING).label;

    let msg = `📚 *UPLAY - Área do Cliente* 📚\n\n`;
    msg += `Olá, aqui é *${responsibleName}*.\n\n`;
    msg += `Estou entrando em contato sobre uma cobrança:\n\n`;
    msg += `📋 *${desc}*\n`;
    msg += `🏷️ Tipo: ${tipo} — Parcela ${parcela}\n`;
    msg += `💰 Valor: *R$ ${Number(val).toFixed(2).replace(".", ",")}*\n`;
    msg += `📅 Vencimento: *${new Date(payment.due_date + "T12:00:00").toLocaleDateString("pt-BR")}*\n`;
    msg += `📊 Status: ${statusLabel}\n`;
    if (studentFullName) msg += `👤 Aluno: ${studentFullName}\n`;
    if (unitFullName) msg += `🏫 Unidade: ${unitFullName}\n`;
    if (payment.asaas_payment_id) msg += `🔖 ID: ${payment.asaas_payment_id}\n`;
    msg += `\nPreciso de ajuda com essa cobrança. Podem me orientar? 🙏`;

    const url = `https://wa.me/55${unitWhatsAppNumber}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  const formatCurrency = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
  const formatDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR");

  // Get the best payment URL
  const getPayNowUrl = () => {
    if (payment?.invoice_url) return payment.invoice_url;
    if (payment?.checkout_url) return payment.checkout_url;
    if (payment?.boleto_url) return payment.boleto_url;
    return null;
  };

  const getBoletoUrl = () => {
    if (payment?.boleto_url) return payment.boleto_url;
    if (payment?.invoice_url) return payment.invoice_url;
    return null;
  };

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

  const getChargeType = () => {
    if (!payment.contract_id) return { label: "Avulsa", color: "bg-accent text-accent-foreground" };
    const desc = contract?.description?.toLowerCase() || "";
    if (desc.includes("apostila")) return { label: "Apostila", color: "bg-primary/15 text-primary" };
    return { label: "Mensalidade", color: "bg-primary/15 text-primary" };
  };
  const chargeType = getChargeType();

  const description = (payment.payment_type === "APOSTILA" || payment.payment_type === "MATRICULA")
    ? (payment.description || (payment.payment_type === "MATRICULA" ? "Matrícula" : "Apostila"))
    : (contract?.description || `Parcela ${payment.installment_number}${!payment.contract_id ? " - Avulsa" : ""}`);

  const timeline = [
    { label: "Cobrança criada", date: payment.created_at, icon: Receipt },
    ...(payment.updated_at !== payment.created_at ? [{ label: "Última atualização", date: payment.updated_at, icon: Clock }] : []),
    ...(payment.paid_at ? [{ label: "Pagamento confirmado", date: payment.paid_at, icon: CheckCircle2 }] : []),
  ];

  const payNowUrl = getPayNowUrl();
  const boletoUrl = getBoletoUrl();
  const hasAnyLink = Boolean(payment.invoice_url || payment.checkout_url || payment.boleto_url);

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

      {/* ─── SYNCING INDICATOR ─── */}
      {syncing && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
          <Loader2 size={16} className="animate-spin text-primary" />
          <p className="text-sm text-primary">Buscando dados de pagamento no Asaas...</p>
        </div>
      )}

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
          <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1">
            <p className="text-[11px] text-muted-foreground font-medium">Valor original</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(originalValue)}</p>
          </div>

          <div className={`rounded-lg border p-3 space-y-1 ${hasDiscount ? "border-success/40 bg-success/5" : "border-border bg-secondary/30"}`}>
            <p className="text-[11px] text-muted-foreground font-medium">Desconto pontualidade</p>
            <p className={`text-lg font-bold ${hasDiscount ? "text-success" : "text-muted-foreground"}`}>
              {hasDiscount ? `- ${formatCurrency(discount)}` : "—"}
            </p>
          </div>

          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-1">
            <p className="text-[11px] text-muted-foreground font-medium">Valor a pagar</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(finalValue)}</p>
            {hasDiscount && dueDate >= today && (
              <p className="text-[10px] text-muted-foreground">até {dueDateStr}</p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1">
            <p className="text-[11px] text-muted-foreground font-medium">Vencimento</p>
            <p className="text-lg font-bold text-foreground">{dueDateStr}</p>
            <p className={`text-[10px] font-medium ${diffDays < 0 ? "text-destructive" : diffDays <= 3 ? "text-warning" : "text-muted-foreground"}`}>
              {daysLabel}
            </p>
          </div>
        </div>
      </div>

      {/* ─── OVERDUE ALERT ─── */}
      {(status === "OVERDUE" || (status === "PENDING" && diffDays < 0)) && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3 animate-pulse">
          <AlertTriangle size={20} className="text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-destructive">⚠️ Pagamento em atraso</p>
            <p className="text-xs text-destructive/80 mt-0.5">
              Esta cobrança está com {Math.abs(diffDays)} {Math.abs(diffDays) === 1 ? "dia" : "dias"} de atraso.
              Valor: {formatCurrency(finalValue)} — Vencimento: {dueDateStr}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Tipo: {chargeType.label}
            </p>
          </div>
        </div>
      )}

      {/* ─── PAGAR AGORA (prominent CTA) ─── */}
      {(status === "PENDING" || status === "OVERDUE") && payNowUrl && !syncing && (
        <Button className="w-full gap-2 h-12 text-base font-bold" asChild>
          <a href={payNowUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={18} /> Pagar Agora
          </a>
        </Button>
      )}

      {/* ─── PAYMENT METHODS ─── */}
      {(status === "PENDING" || status === "OVERDUE") && (
        <div className="glass-card p-4 space-y-4">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <CreditCard size={16} className="text-primary" />
            Meios de Pagamento
          </h3>

          {hasAnyLink ? (
            <>
              {/* Invoice / Checkout link */}
              {payment.invoice_url && (
                <Button className="w-full gap-2" variant="outline" asChild>
                  <a href={payment.invoice_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={16} /> Abrir Fatura / Pagar Online
                  </a>
                </Button>
              )}

              {/* Boleto */}
              {(payment.boleto_url || (method === "BOLETO" && payment.invoice_url)) && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText size={14} />
                    <span className="font-medium">Boleto Bancário</span>
                  </div>
                  <Button variant="outline" className="w-full gap-2" asChild>
                    <a href={boletoUrl!} target="_blank" rel="noopener noreferrer">
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

              {/* PIX QR Code */}
              {payment.pix_qr_code && (
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
              {payment.pix_copy_paste && (
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

              {/* Checkout (card) */}
              {payment.checkout_url && !payment.invoice_url && (
                <Button variant="outline" className="w-full gap-2" asChild>
                  <a href={payment.checkout_url} target="_blank" rel="noopener noreferrer">
                    <CreditCard size={16} /> Pagar com Cartão
                  </a>
                </Button>
              )}
            </>
          ) : (
            <div className="text-center py-4 space-y-2">
              {syncError ? (
                <>
                  <AlertTriangle size={20} className="text-destructive mx-auto" />
                  <p className="text-sm text-destructive font-medium">
                    Não foi possível carregar o link de pagamento desta cobrança.
                  </p>
                  <p className="text-xs text-muted-foreground">{syncError}</p>
                </>
              ) : (
                <>
                  <AlertTriangle size={20} className="text-warning mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Esta cobrança ainda não possui link de pagamento.
                  </p>
                </>
              )}
              <p className="text-xs text-muted-foreground">
                Entre em contato com o financeiro pelo WhatsApp para solicitar o boleto ou link de pagamento.
              </p>
              <div className="flex gap-2 justify-center mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs border-success/30 text-success hover:bg-success/10 hover:text-success"
                  onClick={handleOpenWhatsApp}
                >
                  <MessageCircle size={14} /> Solicitar link
                </Button>
                {payment.asaas_payment_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-xs"
                    disabled={syncing}
                    onClick={handleManualSync}
                  >
                    {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Tentar novamente
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── QUICK ACTIONS ─── */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-sm font-bold text-foreground">Ações Rápidas</h3>
        <div className="grid grid-cols-2 gap-2">
          {payment.pix_copy_paste && (status === "PENDING" || status === "OVERDUE") && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs"
              onClick={() => copyToClipboard(payment.pix_copy_paste, "PIX")}
            >
              <Copy size={14} /> PIX Copia e Cola
            </Button>
          )}

          {payment.invoice_url && (status === "PENDING" || status === "OVERDUE") && (
            <Button variant="outline" size="sm" className="gap-2 text-xs" asChild>
              <a href={payment.invoice_url} target="_blank" rel="noopener noreferrer">
                <Link2 size={14} /> Abrir Fatura
              </a>
            </Button>
          )}

          {boletoUrl && (status === "PENDING" || status === "OVERDUE") && (
            <Button variant="outline" size="sm" className="gap-2 text-xs" asChild>
              <a href={boletoUrl} target="_blank" rel="noopener noreferrer">
                <FileText size={14} /> Abrir Boleto
              </a>
            </Button>
          )}

          {(status === "PENDING" || status === "OVERDUE") && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs border-success/30 text-success hover:bg-success/10 hover:text-success"
              onClick={handleOpenWhatsApp}
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

          {/* Sync with Asaas */}
          {isAdmin && !payment.asaas_payment_id && payment.payment_method !== "DINHEIRO" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs border-warning/30 text-warning hover:bg-warning/10"
              disabled={syncing}
              onClick={async () => {
                const syncResult = await syncPayment(payment.id);
                if (syncResult) {
                  const { data: refreshed } = await supabase
                    .from("payments")
                    .select("*")
                    .eq("id", payment.id)
                    .single();
                  if (refreshed) setPayment(refreshed);
                  toast({ title: syncResult.action === "created" ? "Cobrança criada no Asaas!" : "Dados atualizados!" });
                }
              }}
            >
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Enviar ao Asaas
            </Button>
          )}

          {isAdmin && payment.asaas_payment_id && !(payment.invoice_url || payment.boleto_url) && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-xs"
              disabled={syncing}
              onClick={handleManualSync}
            >
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Sincronizar
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

      {/* WhatsApp Dialog */}
      {payment && (
        <WhatsAppDialog
          open={waDialogOpen}
          onOpenChange={setWaDialogOpen}
          phone={responsible?.phone}
          responsibleName={responsible?.full_name || contract?.responsible_name || "Responsável"}
          studentName={student?.full_name}
          description={description}
          value={finalValue}
          dueDate={payment.due_date}
          invoiceUrl={payment.invoice_url || payment.checkout_url}
          boletoUrl={payment.boleto_url}
          pixCopyPaste={payment.pix_copy_paste}
          paymentMethod={payment.payment_method}
          paymentId={payment.id}
          responsibleId={payment.responsible_id}
        />
      )}
    </div>
  );
};

export default AppPaymentDetail;
