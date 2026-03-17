import { useState, useEffect } from "react";
import { MessageCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

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
  pixCopyPaste?: string | null;
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
}: Omit<WhatsAppDialogProps, "open" | "onOpenChange" | "phone">): string => {
  const formatCurrency = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
  const formatDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR");

  let msg = `Olá, ${responsibleName}.\n\n`;
  msg += `Sua cobrança da EnsinUP foi gerada.\n\n`;
  if (studentName) msg += `Aluno: ${studentName}\n`;
  msg += `Referência: ${description}\n`;
  msg += `Valor: *${formatCurrency(value)}*\n`;
  msg += `Vencimento: *${formatDate(dueDate)}*\n\n`;
  if (invoiceUrl) {
    msg += `Você pode pagar pelo link abaixo:\n${invoiceUrl}\n\n`;
  }
  msg += `Se tiver qualquer dúvida, estamos à disposição.`;

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
  pixCopyPaste,
}: WhatsAppDialogProps) => {
  const { toast } = useToast();
  const [message, setMessage] = useState("");

  const phoneValid = phone ? isValidPhone(phone) : false;
  const formattedPhone = phone ? formatPhone(phone) : "";

  useEffect(() => {
    if (open) {
      setMessage(
        buildDefaultMessage({ responsibleName, studentName, description, value, dueDate, invoiceUrl, pixCopyPaste })
      );
    }
  }, [open, responsibleName, studentName, description, value, dueDate, invoiceUrl, pixCopyPaste]);

  const handleSend = () => {
    if (!phoneValid) {
      toast({ title: "Telefone inválido", description: "O responsável não possui um telefone válido cadastrado.", variant: "destructive" });
      return;
    }
    const waUrl = `https://wa.me/55${formattedPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank");
    onOpenChange(false);
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
          <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Destinatário</p>
                <p className="text-sm font-medium text-foreground">{responsibleName}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Telefone</p>
                {phoneValid ? (
                  <p className="text-sm font-medium text-foreground">{phone}</p>
                ) : (
                  <div className="flex items-center gap-1 text-destructive">
                    <AlertTriangle size={12} />
                    <span className="text-xs font-medium">Não cadastrado</span>
                  </div>
                )}
              </div>
            </div>
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
