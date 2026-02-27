import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy, ExternalLink, QrCode, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const mockPayment = {
  id: "3",
  description: "Parcela 3/12 - Informática",
  student: "João Silva",
  value: 350,
  dueDate: "2026-03-15",
  status: "PENDING" as const,
  method: "PIX",
  pixCode: "00020126580014BR.GOV.BCB.PIX0136a629532e-7693-4846-835d-1dead0",
  boletoLine: "23793.38128 60000.000003 00000.000408 1 84340000035000",
  invoiceUrl: "https://sandbox.asaas.com/i/example",
  checkoutUrl: "https://sandbox.asaas.com/c/example",
};

const AppPaymentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const payment = mockPayment;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copiado!` });
  };

  return (
    <div className="p-4 space-y-6 animate-fade-in">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={18} />
        <span className="text-sm">Voltar</span>
      </button>

      <div className="glass-card p-4">
        <p className="text-xs text-muted-foreground mb-1">Cobrança</p>
        <h1 className="text-base font-bold text-foreground">{payment.description}</h1>
        <p className="text-xs text-muted-foreground mt-1">Aluno: {payment.student}</p>
        <div className="flex items-end justify-between mt-4">
          <div>
            <p className="text-xs text-muted-foreground">Valor</p>
            <p className="text-2xl font-bold text-foreground">
              R$ {payment.value.toFixed(2).replace(".", ",")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Vencimento</p>
            <p className="text-sm font-medium text-foreground">
              {new Date(payment.dueDate).toLocaleDateString("pt-BR")}
            </p>
          </div>
        </div>
        <div className="mt-3">
          <span className="status-pending text-xs px-2 py-1 rounded-full border font-medium">Pendente</span>
        </div>
      </div>

      {/* PIX */}
      {payment.method === "PIX" && (
        <div className="glass-card p-4 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <QrCode size={16} className="text-primary" />
            Pagar via PIX
          </h2>
          <div className="flex justify-center">
            <div className="w-48 h-48 bg-secondary rounded-lg flex items-center justify-center border border-border">
              <div className="text-center">
                <QrCode size={64} className="text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">QR Code PIX</p>
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2">Copia e Cola</p>
            <div className="bg-secondary rounded-md p-3 flex items-center gap-2">
              <code className="text-xs text-foreground flex-1 break-all">{payment.pixCode}</code>
              <button
                onClick={() => copyToClipboard(payment.pixCode, "Código PIX")}
                className="text-primary hover:text-primary/80 transition-colors flex-shrink-0"
              >
                <Copy size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOLETO */}
      {payment.method === "BOLETO" && (
        <div className="glass-card p-4 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Pagar via Boleto</h2>
          <div>
            <p className="text-xs text-muted-foreground mb-2">Linha Digitável</p>
            <div className="bg-secondary rounded-md p-3 flex items-center gap-2">
              <code className="text-xs text-foreground flex-1 break-all">{payment.boletoLine}</code>
              <button
                onClick={() => copyToClipboard(payment.boletoLine, "Linha digitável")}
                className="text-primary hover:text-primary/80 transition-colors flex-shrink-0"
              >
                <Copy size={18} />
              </button>
            </div>
          </div>
          <Button onClick={() => window.open(payment.invoiceUrl, "_blank")} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
            <ExternalLink size={16} className="mr-2" />
            Abrir Boleto
          </Button>
        </div>
      )}

      {/* CARD */}
      {payment.method === "CARD" && (
        <div className="glass-card p-4 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Pagar com Cartão</h2>
          <Button onClick={() => window.open(payment.checkoutUrl, "_blank")} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
            <CreditCard size={16} className="mr-2" />
            Pagar no Cartão
          </Button>
        </div>
      )}
    </div>
  );
};

export default AppPaymentDetail;
