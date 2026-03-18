import { useState, useEffect } from "react";
import { RefreshCw, Copy, Plus, QrCode, ExternalLink, Loader2, MessageCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import WhatsAppDialog from "@/components/WhatsAppDialog";

type PaymentStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
type BillingType = "PIX" | "BOLETO" | "CARD";

const statusLabels: Record<PaymentStatus, string> = { PENDING: "Pendente", PAID: "Pago", OVERDUE: "Vencido", CANCELLED: "Cancelado" };
const statusClasses: Record<PaymentStatus, string> = { PENDING: "status-pending", PAID: "status-paid", OVERDUE: "status-overdue", CANCELLED: "status-cancelled" };

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

interface PaymentRow {
  id: string;
  value: number;
  due_date: string;
  status: string;
  payment_method: string | null;
  pix_copy_paste: string | null;
  invoice_url: string | null;
  checkout_url: string | null;
  boleto_url: string | null;
  pix_qr_code: string | null;
  asaas_payment_id: string | null;
  responsible_id: string;
  unit_id: string;
  installment_number: number;
  contract_id: string;
}

interface ResponsibleRow {
  id: string;
  full_name: string;
  unit_id: string | null;
}

interface StudentRow {
  id: string;
  full_name: string;
  responsible_id: string;
}

interface UnitRow {
  id: string;
  name: string;
}

const AdminCharges = () => {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const { session } = useAuth();

  // Real data
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [responsibles, setResponsibles] = useState<ResponsibleRow[]>([]);
  const [unitNames, setUnitNames] = useState<Record<string, string>>({});
  const [loadingData, setLoadingData] = useState(true);

  // New charge dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [chargeResult, setChargeResult] = useState<ChargeResult | null>(null);

  // Form fields
  const [selectedResponsible, setSelectedResponsible] = useState("");
  const [selectedStudent, setSelectedStudent] = useState("");
  const [chargeValue, setChargeValue] = useState("");
  const [chargeDueDate, setChargeDueDate] = useState("");
  const [billingType, setBillingType] = useState<BillingType>("PIX");
  const [chargeDescription, setChargeDescription] = useState("");

  // WhatsApp dialog
  const [waDialogOpen, setWaDialogOpen] = useState(false);
  const [waPayment, setWaPayment] = useState<PaymentRow | null>(null);
  const [waResponsible, setWaResponsible] = useState<{ full_name: string; phone: string | null } | null>(null);
  const [waStudent, setWaStudent] = useState<string | undefined>(undefined);
  const [waDescription, setWaDescription] = useState("");

  const handleOpenWhatsApp = async (p: PaymentRow) => {
    setWaPayment(p);
    const { data: resp } = await supabase.from("profiles").select("full_name, phone").eq("id", p.responsible_id).single();
    setWaResponsible(resp);
    let desc = `Parcela ${p.installment_number}`;
    let studentName: string | undefined;
    if (p.contract_id) {
      const { data: c } = await supabase.from("contracts").select("description, student_id").eq("id", p.contract_id).single();
      if (c) {
        desc = c.description || desc;
        if (c.student_id) {
          const { data: s } = await supabase.from("students").select("full_name").eq("id", c.student_id).single();
          studentName = s?.full_name;
        }
      }
    }
    setWaDescription(desc);
    setWaStudent(studentName);
    setWaDialogOpen(true);
  };

  const fetchData = async () => {
    setLoadingData(true);
    const [paymentsRes, studentsRes, unitsRes, profilesRes] = await Promise.all([
      supabase.from("payments").select("id, value, due_date, status, payment_method, pix_copy_paste, invoice_url, checkout_url, boleto_url, pix_qr_code, asaas_payment_id, responsible_id, unit_id, installment_number, contract_id").order("due_date", { ascending: false }),
      supabase.from("students").select("id, full_name, responsible_id").eq("active", true),
      supabase.from("units").select("id, name"),
      supabase.from("profiles").select("id, full_name, unit_id").eq("active", true),
    ]);

    if (paymentsRes.data) setPayments(paymentsRes.data as PaymentRow[]);
    if (studentsRes.data) setStudents(studentsRes.data as StudentRow[]);
    if (profilesRes.data && studentsRes.data) {
      const respIds = new Set(studentsRes.data.map((s: { responsible_id: string }) => s.responsible_id));
      setResponsibles(
        profilesRes.data
          .filter((profile) => respIds.has(profile.id))
          .map((profile) => ({ id: profile.id, full_name: profile.full_name, unit_id: profile.unit_id }))
      );
    }
    if (unitsRes.data) {
      setUnits(unitsRes.data);
      const map: Record<string, string> = {};
      unitsRes.data.forEach((u) => (map[u.id] = u.name));
      setUnitNames(map);
    }
    if (profilesRes.data) {
      const map: Record<string, string> = {};
      profilesRes.data.forEach((p) => (map[p.id] = p.full_name));
      setProfiles(map);
    }
    setLoadingData(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getResponsibleUnit = (respId: string) => {
    const resp = responsibles.find((r) => r.id === respId);
    return resp?.unit_id ? (unitNames[resp.unit_id] || "—") : "Sem unidade";
  };

  const filtered = payments.filter((p) => {
    if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
    if (unitFilter !== "ALL" && p.unit_id !== unitFilter) return false;
    if (search) {
      const responsibleName = profiles[p.responsible_id]?.toLowerCase() || "";
      if (!responsibleName.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const filteredStudents = selectedResponsible
    ? students.filter((s) => s.responsible_id === selectedResponsible)
    : [];

  const handleCreateCharge = async () => {
    if (!selectedResponsible || !chargeValue || !chargeDueDate) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }

    if (parseFloat(chargeValue) < 10) {
      toast({ title: "O valor mínimo da cobrança é R$ 10,00", variant: "destructive" });
      return;
    }

    const resp = responsibles.find((r) => r.id === selectedResponsible);
    if (!resp?.unit_id) {
      toast({ title: "Responsável sem unidade vinculada", description: "Atualize o cadastro do cliente antes de gerar a cobrança.", variant: "destructive" });
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

    if (error) {
      toast({ title: "Erro ao gerar cobrança", description: error.message, variant: "destructive" });
      return;
    }

    if (data?.error) {
      toast({ title: "Erro", description: data.error, variant: "destructive" });
      return;
    }

    setChargeResult(data as ChargeResult);
    toast({ title: "Cobrança gerada com sucesso!" });
    fetchData();
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
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Cobranças</h1>
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
                    <Input type="number" step="0.01" min="10" value={chargeValue} onChange={(e) => setChargeValue(e.target.value)} placeholder="10,00" />
                    {chargeValue && parseFloat(chargeValue) < 10 && (
                      <p className="text-xs text-destructive">Valor mínimo: R$ 10,00</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Vencimento *</Label>
                    <Input type="date" value={chargeDueDate} onChange={(e) => setChargeDueDate(e.target.value)} />
                  </div>
                </div>

                {/* Show responsible's unit */}
                {selectedResponsible && (
                  <div className="rounded-md border border-border bg-muted/50 p-2.5">
                    <p className="text-xs text-muted-foreground">
                      Unidade: <span className="font-medium text-foreground">{getResponsibleUnit(selectedResponsible)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">A cobrança será gerada na conta Asaas desta unidade.</p>
                  </div>
                )}

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
                    <a href={chargeResult.invoice_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={14} /> Abrir Fatura
                    </a>
                  </Button>
                )}

                {chargeResult.boleto_url && (
                  <Button variant="outline" className="w-full gap-1.5" asChild>
                    <a href={chargeResult.boleto_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={14} /> Abrir Boleto
                    </a>
                  </Button>
                )}

                {chargeResult.checkout_url && (
                  <Button variant="outline" className="w-full gap-1.5" asChild>
                    <a href={chargeResult.checkout_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={14} /> Pagar com Cartão
                    </a>
                  </Button>
                )}

                <Button variant="secondary" className="w-full" onClick={resetForm}>
                  Nova Cobrança
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

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
          <SelectContent>
            <SelectItem value="ALL">Todas</SelectItem>
            {units.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="bg-input border-border text-foreground w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            <SelectItem value="PENDING">Pendente</SelectItem>
            <SelectItem value="PAID">Pago</SelectItem>
            <SelectItem value="OVERDUE">Vencido</SelectItem>
            <SelectItem value="CANCELLED">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Payment list */}
      {loadingData ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <div key={p.id} className="glass-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  Parcela {p.installment_number} {p.payment_method ? `• ${p.payment_method}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {profiles[p.responsible_id] || "—"} • {unitNames[p.unit_id] || "—"}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">R$ {Number(p.value).toFixed(2).replace(".", ",")}</p>
                  <p className="text-xs text-muted-foreground">{new Date(p.due_date + "T12:00:00").toLocaleDateString("pt-BR")}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${statusClasses[p.status as PaymentStatus] || ""}`}>
                  {statusLabels[p.status as PaymentStatus] || p.status}
                </span>
                <div className="flex gap-1">
                  {p.pix_copy_paste && (
                    <button
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                      title="Copiar PIX"
                      onClick={() => { navigator.clipboard.writeText(p.pix_copy_paste!); toast({ title: "PIX copiado!" }); }}
                    >
                      <Copy size={14} />
                    </button>
                  )}
                  {(p.status === "PENDING" || p.status === "OVERDUE") && (
                    <button
                      className="p-1.5 text-success hover:bg-success/10 rounded transition-colors"
                      title="Enviar no WhatsApp"
                      onClick={() => handleOpenWhatsApp(p)}
                    >
                      <MessageCircle size={14} />
                    </button>
                  )}
                  {(p.invoice_url || p.boleto_url || p.checkout_url) && (
                    <a
                      href={p.invoice_url || p.boleto_url || p.checkout_url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                      title="Abrir link"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loadingData && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma cobrança encontrada.</div>
      )}

      {/* WhatsApp Dialog */}
      {waPayment && waResponsible && (
        <WhatsAppDialog
          open={waDialogOpen}
          onOpenChange={setWaDialogOpen}
          phone={waResponsible.phone}
          responsibleName={waResponsible.full_name}
          studentName={waStudent}
          description={waDescription}
          value={Number(waPayment.value)}
          dueDate={waPayment.due_date}
          invoiceUrl={waPayment.invoice_url}
          paymentId={waPayment.id}
          responsibleId={waPayment.responsible_id}
        />
      )}
    </div>
  );
};

export default AdminCharges;
