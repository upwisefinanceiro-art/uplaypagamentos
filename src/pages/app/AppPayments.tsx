import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Filter } from "lucide-react";

type PaymentStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";

const statusLabels: Record<PaymentStatus, string> = {
  PENDING: "Pendente",
  PAID: "Pago",
  OVERDUE: "Vencido",
  CANCELLED: "Cancelado",
};

const statusClasses: Record<PaymentStatus, string> = {
  PENDING: "status-pending",
  PAID: "status-paid",
  OVERDUE: "status-overdue",
  CANCELLED: "status-cancelled",
};

const mockPayments = [
  { id: "1", description: "Parcela 1/12 - Informática", value: 350, dueDate: "2026-01-15", status: "PAID" as PaymentStatus, method: "PIX" },
  { id: "2", description: "Parcela 2/12 - Informática", value: 350, dueDate: "2026-02-15", status: "PAID" as PaymentStatus, method: "BOLETO" },
  { id: "3", description: "Parcela 3/12 - Informática", value: 350, dueDate: "2026-03-15", status: "PENDING" as PaymentStatus, method: "PIX" },
  { id: "4", description: "Parcela 4/12 - Informática", value: 350, dueDate: "2026-04-15", status: "PENDING" as PaymentStatus, method: "PIX" },
  { id: "5", description: "Matrícula - Administração", value: 200, dueDate: "2026-02-01", status: "OVERDUE" as PaymentStatus, method: "BOLETO" },
];

const AppPayments = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<PaymentStatus | "ALL">("ALL");

  const filtered = filter === "ALL" ? mockPayments : mockPayments.filter((p) => p.status === filter);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <h1 className="text-lg font-bold text-foreground">Pagamentos</h1>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {(["ALL", "PENDING", "OVERDUE", "PAID", "CANCELLED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
              filter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary text-secondary-foreground border-border hover:bg-muted"
            }`}
          >
            {s === "ALL" ? "Todos" : statusLabels[s]}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.map((payment) => (
          <button
            key={payment.id}
            onClick={() => navigate(`/app/pagamentos/${payment.id}`)}
            className="w-full glass-card p-3 flex items-center gap-3 text-left hover:bg-secondary/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{payment.description}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(payment.dueDate).toLocaleDateString("pt-BR")} • {payment.method}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-sm font-semibold text-foreground">
                R$ {payment.value.toFixed(2).replace(".", ",")}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusClasses[payment.status]}`}>
                {statusLabels[payment.status]}
              </span>
            </div>
            <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nenhum pagamento encontrado.
        </div>
      )}
    </div>
  );
};

export default AppPayments;
