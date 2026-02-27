import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Plus, Copy, QrCode, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

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

type BillingType = "PIX" | "BOLETO" | "CARD";

interface ChargeResult {
  payment_id: string;
  asaas_charge_id: string;
  status: string;
  invoice_url: string | null;
  pix_qr_code: string | null;
  pix_copy_paste: string | null;
  boleto_url: string | null;
  checkout_url: string | null;
}

interface ResponsibleRow {
  id: string;
  full_name: string;
}

interface StudentRow {
  id: string;
  full_name: string;
  responsible_id: string;
}

const AppPayments = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<PaymentStatus | "ALL">("ALL");
  const { isAdmin, hasRole, user } = useAuth();
  const { toast } = useToast();

  // Real payments data
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Charge dialog (admin only)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [chargeResult, setChargeResult] = useState<ChargeResult | null>(null);
  const [responsibles, setResponsibles] = useState<ResponsibleRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selectedResponsible, setSelectedResponsible] = useState("");
  const [selectedStudent, setSelectedStudent] = useState("");
  const [chargeValue, setChargeValue] = useState("");
  const [chargeDueDate, setChargeDueDate] = useState("");
  const [billingType, setBillingType] = useState<BillingType>("PIX");
  const [chargeDescription, setChargeDescription] = useState("");

  const canCreateCharge = hasRole("ADMIN_MASTER") || hasRole("ADMIN_UNIDADE");

  const fetchPayments = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("payments")
      .select("id, value, due_date, status, payment_method, installment_number, pix_copy_paste, invoice_url, boleto_url, checkout_url, contract_id")
      .order("due_date", { ascending: false });
    if (data) setPayments(data);
    setLoading(false);
  };

  const fetchChargeData = async () => {
    const [profilesRes, studentsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name").eq("active", true),
      supabase.from("students").select("id, full_name, responsible_id"),
    ]);
    if (profilesRes.data) setResponsibles(profilesRes.data);
    if (studentsRes.data) setStudents(studentsRes.data);
  };

  useEffect(() => {
    fetchPayments();
    if (canCreateCharge) fetchChargeData();
  }, []);

  const filtered = filter === "ALL" ? payments : payments.filter((p) => p.status === filter);

  const filteredStudents = selectedResponsible
    ? students.filter((s) => s.responsible_id === selectedResponsible)
    : [];

  const handleCreateCharge = async () => {
    if (!selectedResponsible || !chargeValue || !chargeDueDate) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    setCreating(true);
    setChargeResult(null);

    const { data, error } = await supabase.functions.invoke("create-asaas-charge", {
      body: {
        responsible_id: selectedResponsible,
        student_id: selectedStudent || undefined,
        value: parseFloat(chargeValue),
        due_date: chargeDueDate,
        billing_type: billingType,
        description: chargeDescription || undefined,
      },
    });

    setCreating(false);
    if (error) { toast({ title: "Erro ao gerar cobrança", description: error.message, variant: "destructive" }); return; }
    if (data?.error) { toast({ title: "Erro", description: data.error, variant: "destructive" }); return; }

    setChargeResult(data as ChargeResult);
    toast({ title: "Cobrança gerada com sucesso!" });
    fetchPayments();
  };

  const resetForm = () => {
    setSelectedResponsible("");
    setSelectedStudent("");
    setChargeValue("");
    setChargeDueDate("");
    setBillingType("PIX");
    setChargeDescription("");
    setChargeResult(null);
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">Pagamentos</h1>
        {canCreateCharge && (
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus size={16} /> Gerar Cobrança
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Nova Cobrança</DialogTitle>
              </DialogHeader>

              {!chargeResult ? (
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label>Responsável *</Label>
                    <Select value={selectedResponsible} onValueChange={(v) => { setSelectedResponsible(v); setSelectedStudent(""); }}>
                      <SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
                      <SelectContent>
                        {responsibles.map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {filteredStudents.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>Aluno (opcional)</Label>
                      <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                        <SelectTrigger><SelectValue placeholder="Selecione o aluno" /></SelectTrigger>
                        <SelectContent>
                          {filteredStudents.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Valor (R$) *</Label>
                      <Input type="number" step="0.01" min="1" value={chargeValue} onChange={(e) => setChargeValue(e.target.value)} placeholder="350,00" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Vencimento *</Label>
                      <Input type="date" value={chargeDueDate} onChange={(e) => setChargeDueDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Forma de Pagamento *</Label>
                    <Select value={billingType} onValueChange={(v) => setBillingType(v as BillingType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PIX">PIX</SelectItem>
                        <SelectItem value="BOLETO">Boleto</SelectItem>
                        <SelectItem value="CARD">Cartão de Crédito</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Descrição</Label>
                    <Input value={chargeDescription} onChange={(e) => setChargeDescription(e.target.value)} placeholder="Mensalidade EnsinUP" />
                  </div>
                  <Button className="w-full" onClick={handleCreateCharge} disabled={creating}>
                    {creating ? <><Loader2 size={16} className="animate-spin mr-2" /> Gerando...</> : "Gerar Cobrança"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
                    <p className="text-sm font-medium text-foreground">✅ Cobrança criada!</p>
                    <p className="text-xs text-muted-foreground">ID Asaas: {chargeResult.asaas_charge_id}</p>
                  </div>
                  {chargeResult.pix_qr_code && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1"><QrCode size={14} /> QR Code PIX</Label>
                      <div className="flex justify-center p-4 bg-background rounded-lg border border-border">
                        <img src={`data:image/png;base64,${chargeResult.pix_qr_code}`} alt="QR Code PIX" className="w-48 h-48" />
                      </div>
                    </div>
                  )}
                  {chargeResult.pix_copy_paste && (
                    <div className="space-y-1.5">
                      <Label>PIX Copia e Cola</Label>
                      <div className="flex gap-2">
                        <Input value={chargeResult.pix_copy_paste} readOnly className="text-xs" />
                        <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(chargeResult.pix_copy_paste!); toast({ title: "Copiado!" }); }}>
                          <Copy size={14} />
                        </Button>
                      </div>
                    </div>
                  )}
                  {chargeResult.invoice_url && (
                    <Button variant="outline" className="w-full gap-1.5" asChild>
                      <a href={chargeResult.invoice_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Abrir Fatura</a>
                    </Button>
                  )}
                  {chargeResult.boleto_url && (
                    <Button variant="outline" className="w-full gap-1.5" asChild>
                      <a href={chargeResult.boleto_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Abrir Boleto</a>
                    </Button>
                  )}
                  {chargeResult.checkout_url && (
                    <Button variant="outline" className="w-full gap-1.5" asChild>
                      <a href={chargeResult.checkout_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Pagar com Cartão</a>
                    </Button>
                  )}
                  <Button variant="secondary" className="w-full" onClick={resetForm}>Nova Cobrança</Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>

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
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((payment) => (
            <button
              key={payment.id}
              onClick={() => navigate(`/app/pagamentos/${payment.id}`)}
              className="w-full glass-card p-3 flex items-center gap-3 text-left hover:bg-secondary/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  Parcela {payment.installment_number} {payment.payment_method ? `• ${payment.payment_method}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(payment.due_date + "T12:00:00").toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-sm font-semibold text-foreground">
                  R$ {Number(payment.value).toFixed(2).replace(".", ",")}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusClasses[payment.status as PaymentStatus] || ""}`}>
                  {statusLabels[payment.status as PaymentStatus] || payment.status}
                </span>
              </div>
              <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nenhum pagamento encontrado.
        </div>
      )}
    </div>
  );
};

export default AppPayments;
