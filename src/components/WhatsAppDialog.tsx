import { useState, useEffect } from "react";
import { MessageCircle, AlertTriangle, ExternalLink, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface WhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string | null | undefined;
  responsibleName: string;
  studentName?: string;
  description: string;
  value: number;
  dueDate: string;
  invoiceUrl?: string | null;
  boletoUrl?: string | null;
  pixCopyPaste?: string | null;
  paymentMethod?: string | null;
  paymentId?: string;
  responsibleId?: string;
}

const formatPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  // Remove leading 55 if already present
  const clean = digits.startsWith("55") ? digits.slice(2) : digits;
  return clean;
};

const isValidPhone = (phone: string): boolean => {
  const clean = formatPhone(phone);
  // Brazilian phone: DDD (2 digits) + number (8-9 digits) = 10-11 digits
  return clean.length >= 10 && clean.length <= 11;
};

const buildDefaultMessage = ({
  responsibleName,
  studentName,
  description,
  value,
  dueDate,
  invoiceUrl,
  boletoUrl,
  pixCopyPaste,
  paymentMethod,
}: Omit<WhatsAppDialogProps, "open" | "onOpenChange" | "phone">): string => {
  const formatCurrency = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
  const formatDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
  const paymentLink = invoiceUrl || boletoUrl || null;

  const resolvedMethod = (() => {
    const method = (paymentMethod || "").toUpperCase();
    if (method === "ASAAS") return "BOLETO";
    if (method === "PIX" || method === "BOLETO" || method === "CARD") return method;
    if (pixCopyPaste) return "PIX";
    if (boletoUrl) return "BOLETO";
    if (paymentLink) return "BOLETO";
    return "BOLETO";
  })();

  let msg = `📚 *EnsinUP - Educação que transforma* 📚\n\n`;
  msg += `Olá, ${responsibleName}! 👋\n\n`;
  msg += `Aqui é do *financeiro da EnsinUP*.\n\n`;
  if (studentName) msg += `👤 Aluno: ${studentName}\n`;
  msg += `📋 Referência: ${description}\n`;
  msg += `💰 Valor: *${formatCurrency(value)}*\n`;
  msg += `📅 Vencimento: *${formatDate(dueDate)}*\n\n`;

  if (resolvedMethod === "BOLETO") {
    if (paymentLink) {
      msg += `📄 *Boleto:*\n${link}\n\n`;
    }
  } else if (resolvedMethod === "PIX") {
    if (pixCopyPaste) {
      msg += `💳 *PIX (copia e cola):*\n${pixCopyPaste}\n\n`;
    }
    if (paymentLink) {
      msg += `🔗 *Link para pagamento:*\n${paymentLink}\n\n`;
    }
  } else if (resolvedMethod === "CARD") {
    if (paymentLink) {
      msg += `🔗 *Link para pagamento:*\n${paymentLink}\n\n`;
    }
  } else {
    if (paymentLink) {
      msg += `🔗 *Link para pagamento:*\n${paymentLink}\n\n`;
    }
  }

  msg += `Se tiver qualquer dúvida, estamos à disposição. 😊`;

  return msg;
};

const WhatsAppDialog = ({
  open,
  onOpenChange,
  phone,
  responsibleName,
  studentName,
  description,
  value,
  dueDate,
  invoiceUrl,
  boletoUrl,
  pixCopyPaste,
  paymentMethod,
  paymentId,
  responsibleId,
}: WhatsAppDialogProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [manualPhone, setManualPhone] = useState("");

  const activePhone = manualPhone || (phone ?? "");
  const phoneValid = activePhone ? isValidPhone(activePhone) : false;
  const formattedPhone = activePhone ? formatPhone(activePhone) : "";

  useEffect(() => {
    if (open) {
      setManualPhone(phone && isValidPhone(phone) ? "" : "");
      const nextMessage = buildDefaultMessage({ responsibleName, studentName, description, value, dueDate, invoiceUrl, boletoUrl, pixCopyPaste, paymentMethod, paymentId, responsibleId });
      setMessage(nextMessage);
      console.info("[whatsapp-sync] mensagem pronta para envio", {
        paymentId,
        responsibleId,
        paymentMethod,
        hasInvoiceUrl: Boolean(invoiceUrl),
        hasBoletoUrl: Boolean(boletoUrl),
        hasPixCopyPaste: Boolean(pixCopyPaste),
        messageLength: nextMessage.length,
      });
    }
  }, [open, responsibleName, studentName, description, value, dueDate, invoiceUrl, boletoUrl, pixCopyPaste, paymentMethod, phone]);

  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    await logMessage("COPY_MANUAL");
    toast({ title: "Mensagem copiada!", description: "Cole onde preferir." });
    setTimeout(() => setCopied(false), 2000);
  };

  const logMessage = async (channel: string) => {
    if (!user) return;
    try {
      await supabase.from("whatsapp_message_logs" as any).insert({
        payment_id: paymentId || null,
        responsible_id: responsibleId || user.id,
        phone: phoneValid ? `55${formattedPhone}` : null,
        message_text: message,
        channel,
        sent_by: user.id,
      });
    } catch (e) {
      // non-blocking log
    }
  };

  const handleSend = () => {
    if (!phoneValid) {
      toast({ title: "Telefone inválido", description: "Digite um telefone válido para enviar.", variant: "destructive" });
      return;
    }
    const waUrl = `https://wa.me/55${formattedPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank");
    onOpenChange(false);
    logMessage("WHATSAPP_MANUAL");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle size={18} className="text-success" />
            Enviar no WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Phone info */}
          <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Destinatário</p>
                <p className="text-sm font-medium text-foreground">{responsibleName}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Telefone cadastrado</p>
                {phone && isValidPhone(phone) ? (
                  <p className="text-sm font-medium text-foreground">{phone}</p>
                ) : (
                  <div className="flex items-center gap-1 text-destructive">
                    <AlertTriangle size={12} />
                    <span className="text-xs font-medium">Não cadastrado</span>
                  </div>
                )}
              </div>
            </div>
            {!(phone && isValidPhone(phone)) && (
              <div className="space-y-1">
                <Label className="text-xs">Digite o telefone manualmente</Label>
                <Input
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  placeholder="31999999999"
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Apenas números, com DDD. Ex: 31996726918</p>
              </div>
            )}
          </div>

          {/* Editable message */}
          <div className="space-y-1.5">
            <Label className="text-xs">Mensagem (editável)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={10}
              className="text-sm leading-relaxed resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleCopy}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copiada!" : "Copiar mensagem"}
          </Button>
          <Button
            className="gap-2 bg-success hover:bg-success/90 text-success-foreground"
            onClick={handleSend}
            disabled={!phoneValid}
          >
            <ExternalLink size={14} /> Abrir WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppDialog;
export { buildDefaultMessage, isValidPhone, formatPhone };
