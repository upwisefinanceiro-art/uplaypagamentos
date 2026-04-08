import { useState } from "react";
import { Copy, Check, MessageCircle, X, User, GraduationCap, KeyRound, Mail, Phone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ClientAccessData {
  responsibleName: string;
  studentName: string;
  cpf: string;
  email?: string | null;
  phone?: string | null;
}

interface ClientAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ClientAccessData | null;
}

const APP_URL = "https://uplaypagamento.com.br/login";
const DEFAULT_PASSWORD = "12345678";

const ClientAccessModal = ({ open, onOpenChange, data }: ClientAccessModalProps) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  if (!data) return null;

  const login = data.cpf
    ? data.cpf.replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : data.email || "";

  const copyText = `Olá! Seu acesso ao aplicativo da UPLAY foi criado:\n\nLogin: ${login}\nSenha: ${DEFAULT_PASSWORD}\n\nAcesse aqui: ${APP_URL}`;

  const whatsappMessage = `Olá! Seu acesso ao app da UPLAY foi liberado.\n\nLogin: ${login}\nSenha: ${DEFAULT_PASSWORD}\n\nAcesse aqui: ${APP_URL}\n\nEm caso de dúvidas, estamos à disposição.`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      toast({ title: "Copiado!", description: "Dados de acesso copiados." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  const handleWhatsApp = () => {
    if (!data.phone) {
      toast({ title: "Cliente não possui telefone cadastrado", variant: "destructive" });
      return;
    }
    const cleanPhone = data.phone.replace(/\D/g, "");
    const fullPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
    const encoded = encodeURIComponent(whatsappMessage);
    window.open(`https://wa.me/${fullPhone}?text=${encoded}`, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-w-[95vw] mx-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Acesso do Cliente Criado
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-lg border bg-muted/40 p-4 space-y-2.5 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Responsável:</span>
              <span className="font-medium truncate">{data.responsibleName}</span>
            </div>
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Aluno:</span>
              <span className="font-medium truncate">{data.studentName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs w-4 text-center font-bold shrink-0">ID</span>
              <span className="text-muted-foreground">CPF:</span>
              <span className="font-medium font-mono">{login}</span>
            </div>
            {data.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">E-mail:</span>
                <span className="font-medium truncate">{data.email}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Senha:</span>
              <span className="font-bold font-mono text-primary">{DEFAULT_PASSWORD}</span>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t">
              <span className="text-muted-foreground text-xs">Link:</span>
              <a href={APP_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline truncate">
                {APP_URL}
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button onClick={handleCopy} variant="outline" className="w-full h-12 text-sm gap-2">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copiado!" : "Copiar dados de acesso"}
            </Button>

            <Button
              onClick={handleWhatsApp}
              className="w-full h-12 text-sm gap-2 bg-green-600 hover:bg-green-700 text-white"
              disabled={!data.phone}
            >
              <MessageCircle className="h-4 w-4" />
              {data.phone ? "Enviar via WhatsApp" : "Sem telefone cadastrado"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ClientAccessModal;
