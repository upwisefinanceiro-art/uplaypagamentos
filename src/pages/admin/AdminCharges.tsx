import { useState } from "react";
import { RefreshCw, Copy, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type PaymentStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";

const statusLabels: Record<PaymentStatus, string> = { PENDING: "Pendente", PAID: "Pago", OVERDUE: "Vencido", CANCELLED: "Cancelado" };
const statusClasses: Record<PaymentStatus, string> = { PENDING: "status-pending", PAID: "status-paid", OVERDUE: "status-overdue", CANCELLED: "status-cancelled" };

const mockCharges = [
  { id: "1", client: "Carlos Santos", description: "Parcela 1/12 - Informática", value: 350, dueDate: "2026-01-15", status: "PAID" as PaymentStatus, method: "PIX", unit: "Serra Verde" },
  { id: "2", client: "Carlos Santos", description: "Parcela 2/12 - Informática", value: 350, dueDate: "2026-02-15", status: "PAID" as PaymentStatus, method: "PIX", unit: "Serra Verde" },
  { id: "3", client: "Carlos Santos", description: "Parcela 3/12 - Informática", value: 350, dueDate: "2026-03-15", status: "PENDING" as PaymentStatus, method: "PIX", unit: "Serra Verde" },
  { id: "4", client: "Fernanda Costa", description: "Parcela 1/6 - Administração", value: 500, dueDate: "2026-02-01", status: "OVERDUE" as PaymentStatus, method: "BOLETO", unit: "Vespasiano" },
  { id: "5", client: "Fernanda Costa", description: "Parcela 2/6 - Administração", value: 500, dueDate: "2026-03-01", status: "PENDING" as PaymentStatus, method: "BOLETO", unit: "Vespasiano" },
];

const AdminCharges = () => {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const filtered = mockCharges.filter((c) => {
    if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
    if (unitFilter !== "ALL" && c.unit !== unitFilter) return false;
    if (search && !c.client.toLowerCase().includes(search.toLowerCase()) && !c.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-xl font-bold text-foreground">Cobranças</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          className="bg-input border-border text-foreground w-full sm:w-56"
          placeholder="Buscar responsável..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={unitFilter} onValueChange={setUnitFilter}>
          <SelectTrigger className="bg-input border-border text-foreground w-full sm:w-40">
            <SelectValue placeholder="Unidade" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="ALL">Todas</SelectItem>
            <SelectItem value="Serra Verde">Serra Verde</SelectItem>
            <SelectItem value="Vespasiano">Vespasiano</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="bg-input border-border text-foreground w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="ALL">Todos</SelectItem>
            <SelectItem value="PENDING">Pendente</SelectItem>
            <SelectItem value="PAID">Pago</SelectItem>
            <SelectItem value="OVERDUE">Vencido</SelectItem>
            <SelectItem value="CANCELLED">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table-like list */}
      <div className="space-y-2">
        {filtered.map((charge) => (
          <div key={charge.id} className="glass-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{charge.description}</p>
              <p className="text-xs text-muted-foreground">{charge.client} • {charge.unit}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">R$ {charge.value.toFixed(2).replace(".", ",")}</p>
                <p className="text-xs text-muted-foreground">{new Date(charge.dueDate).toLocaleDateString("pt-BR")}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${statusClasses[charge.status]}`}>
                {statusLabels[charge.status]}
              </span>
              <div className="flex gap-1">
                <button
                  className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  title="Reemitir"
                  onClick={() => toast({ title: "Cobrança reemitida" })}
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  title="Copiar link"
                  onClick={() => { navigator.clipboard.writeText("https://sandbox.asaas.com/c/example"); toast({ title: "Link copiado!" }); }}
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma cobrança encontrada.</div>
      )}
    </div>
  );
};

export default AdminCharges;
