import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface NotifyClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
  clientName: string | null;
  unitId: string | null;
}

const QUICK_TEMPLATES = [
  { title: "Lembrete de pagamento", message: "Olá! Passando para lembrar do seu pagamento em aberto. Qualquer dúvida, estamos à disposição." },
  { title: "Boleto disponível", message: "Olá! Seu novo boleto já está disponível no app. Acesse a aba Pagamentos para visualizar." },
  { title: "Aviso importante", message: "" },
];

const NotifyClientDialog = ({ open, onOpenChange, clientId, clientName, unitId }: NotifyClientDialogProps) => {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const reset = () => {
    setTitle("");
    setMessage("");
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSend = async () => {
    if (!clientId || !unitId || !user) return;
    if (!title.trim() || !message.trim()) {
      toast({ title: "Preencha título e mensagem", variant: "destructive" });
      return;
    }
    setSending(true);
    const { error } = await supabase.from("client_notifications").insert({
      unit_id: unitId,
      responsible_id: clientId,
      title: title.trim(),
      message: message.trim(),
      sent_by: user.id,
      sent_by_name: profile?.full_name ?? null,
    });
    setSending(false);
    if (error) {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Notificação enviada", description: `Enviada para ${clientName ?? "o cliente"}.` });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Notificar cliente no app</DialogTitle>
          <DialogDescription>
            {clientName ? <>Enviando mensagem in-app para <strong>{clientName}</strong>.</> : "Selecione um cliente."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_TEMPLATES.map((tpl) => (
              <button
                key={tpl.title}
                type="button"
                className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent transition-colors"
                onClick={() => {
                  setTitle(tpl.title);
                  if (tpl.message) setMessage(tpl.message);
                }}
              >
                {tpl.title}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notif-title">Título</Label>
            <Input
              id="notif-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Ex: Lembrete de pagamento"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notif-message">Mensagem</Label>
            <Textarea
              id="notif-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={5}
              placeholder="Escreva a mensagem que aparecerá no app do cliente..."
            />
            <p className="text-xs text-muted-foreground text-right">{message.length}/500</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={sending || !title.trim() || !message.trim()}>
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Enviar notificação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NotifyClientDialog;
