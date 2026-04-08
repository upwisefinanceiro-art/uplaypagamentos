import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, MessageCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SYSTEM_URL = "https://ensinupapp.lovable.app/login";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partnerName: string;
  adminEmail: string;
  whatsapp: string | null;
}

const UnitAccessModal = ({ open, onOpenChange, partnerName, adminEmail, whatsapp }: Props) => {
  const { toast } = useToast();

  const messageText = `Olá! O acesso da sua empresa/parceiro à plataforma foi criado com sucesso.\n\nLogin: ${adminEmail}\nSenha: 12345678\n\nAcesse aqui:\n${SYSTEM_URL}\n\nEm caso de dúvidas, estamos à disposição.`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`Login: ${adminEmail}\nSenha: 12345678\nLink: ${SYSTEM_URL}`);
      toast({ title: "Dados copiados!" });
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  const handleWhatsApp = () => {
    if (!whatsapp) return;
    const cleaned = whatsapp.replace(/\D/g, "");
    const number = cleaned.startsWith("55") ? cleaned : `55${cleaned}`;
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(messageText)}`, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-600">
            <CheckCircle2 size={20} />
            Acesso do Parceiro Criado
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-2 text-sm">
            <p><span className="text-muted-foreground">Parceiro:</span> <strong>{partnerName}</strong></p>
            <p><span className="text-muted-foreground">Login:</span> <strong>{adminEmail}</strong></p>
            <p><span className="text-muted-foreground">Senha:</span> <strong>12345678</strong></p>
            <p><span className="text-muted-foreground">Acesso:</span>{" "}
              <a href={SYSTEM_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">{SYSTEM_URL}</a>
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button onClick={handleCopy} variant="outline" className="w-full gap-2">
              <Copy size={16} /> Copiar dados de acesso
            </Button>
            {whatsapp ? (
              <Button onClick={handleWhatsApp} className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white">
                <MessageCircle size={16} /> Enviar acesso via WhatsApp
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg">
                <AlertTriangle size={14} />
                WhatsApp não cadastrado. Não é possível enviar.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UnitAccessModal;
