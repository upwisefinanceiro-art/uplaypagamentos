import { useEffect, useState } from "react";
import { Loader2, Send, MessageCircle, Bell } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const APP_URL = "https://uplaypagamento.com.br";

const buildWelcomeMessage = (name: string, email: string | null) => {
  const firstName = (name || "").split(" ")[0] || "Olá";
  return `Olá, ${firstName}! 👋\n\n` +
    `📲 *App de Pagamentos UPLAY*\n\n` +
    `Aqui é da UPLAY Pagamentos. Seu acesso ao aplicativo já está disponível ✅\n\n` +
    `🔗 Acesse pelo link:\n${APP_URL}\n\n` +
    `📧 E-mail: ${email || "(seu e-mail cadastrado)"}\n` +
    `🔑 Senha: 12345678\n\n` +
    `Por favor, acesse o app e acompanhe seus pagamentos.\n\n` +
    `Qualquer dúvida estamos à disposição! 😊`;
};

const NotifyClientDialog = ({ open, onOpenChange, clientId, clientName, unitId }: NotifyClientDialogProps) => {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // WhatsApp tab state
  const [contact, setContact] = useState<{ phone: string | null; email: string | null } | null>(null);
  const [loadingContact, setLoadingContact] = useState(false);
  const [waMessage, setWaMessage] = useState("");

  useEffect(() => {
    if (!open || !clientId) return;
    setLoadingContact(true);
    supabase
      .from("profiles")
      .select("phone, email")
      .eq("id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        const phone = (data?.phone as string | null) || null;
        const email = (data?.email as string | null) || null;
        setContact({ phone, email });
        setWaMessage(buildWelcomeMessage(clientName || "", email));
        setLoadingContact(false);
      });
  }, [open, clientId, clientName]);

  const reset = () => {
    setTitle("");
    setMessage("");
    setWaMessage("");
    setContact(null);
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

  const handleSendWhatsApp = async () => {
    if (!contact?.phone) {
      toast({ title: "Cliente sem telefone cadastrado", variant: "destructive" });
      return;
    }
    const phoneClean = contact.phone.replace(/\D/g, "");
    if (phoneClean.length < 10) {
      toast({ title: "Telefone inválido", description: "Cadastre um celular com DDD.", variant: "destructive" });
      return;
    }
    if (!waMessage.trim()) {
      toast({ title: "Mensagem vazia", variant: "destructive" });
      return;
    }
    const url = `https://wa.me/55${phoneClean}?text=${encodeURIComponent(waMessage)}`;
    window.open(url, "_blank");

    // Log opcional do envio
    if (clientId && user) {
      await supabase.from("whatsapp_message_logs").insert({
        responsible_id: clientId,
        phone: phoneClean,
        message_text: waMessage,
        sent_by: user.id,
        channel: "MANUAL",
        status: "SENT",
      });
    }
    toast({ title: "WhatsApp aberto", description: "Mensagem pronta para envio." });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Notificar cliente</DialogTitle>
          <DialogDescription>
            {clientName ? <>Cliente: <strong>{clientName}</strong>.</> : "Selecione um cliente."}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="app" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="app" className="gap-1.5"><Bell size={14} /> Notificar Cliente</TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-1.5"><MessageCircle size={14} /> WhatsApp</TabsTrigger>
          </TabsList>

          <TabsContent value="app" className="space-y-3 mt-3">
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

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={sending}>
                Cancelar
              </Button>
              <Button onClick={handleSend} disabled={sending || !title.trim() || !message.trim()}>
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Enviar notificação
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="whatsapp" className="space-y-3 mt-3">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent transition-colors"
                onClick={() => setWaMessage(buildWelcomeMessage(clientName || "", contact?.email || null))}
              >
                Boas-vindas (acesso ao app)
              </button>
            </div>

            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs space-y-0.5">
              <p><span className="text-muted-foreground">Telefone:</span> <strong>{loadingContact ? "carregando..." : (contact?.phone || "— não cadastrado —")}</strong></p>
              <p><span className="text-muted-foreground">E-mail:</span> <strong>{contact?.email || "—"}</strong></p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wa-message">Mensagem</Label>
              <Textarea
                id="wa-message"
                value={waMessage}
                onChange={(e) => setWaMessage(e.target.value)}
                rows={10}
                placeholder="Mensagem para o WhatsApp..."
              />
              <p className="text-xs text-muted-foreground">A mensagem abrirá no WhatsApp Web/App pronta para envio.</p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
              <Button
                onClick={handleSendWhatsApp}
                disabled={loadingContact || !contact?.phone || !waMessage.trim()}
                className="bg-success text-success-foreground hover:bg-success/90"
              >
                <MessageCircle size={16} /> Enviar WhatsApp
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default NotifyClientDialog;
