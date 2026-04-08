import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Plus, Copy, QrCode, ExternalLink, Loader2, MessageCircle, AlertTriangle } from "lucide-react";
import { differenceInDays, startOfDay, isBefore } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import WhatsAppDialog from "@/components/WhatsAppDialog";
import { resolveWhatsAppChargeData } from "@/lib/asaas-payment";
import { getUnitWhatsAppNumber, DEFAULT_WHATSAPP_FINANCEIRO } from "@/lib/whatsapp-utils";

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

  // WhatsApp dialog state
  const [waDialogOpen, setWaDialogOpen] = useState(false);
  const [waPayment, setWaPayment] = useState<any>(null);
  const [waResponsible, setWaResponsible] = useState<{ full_name: string; phone: string | null } | null>(null);
  const [waStudent, setWaStudent] = useState<string | undefined>(undefined);
  const [waDescription, setWaDescription] = useState("");

  const canCreateCharge = hasRole("ADMIN_MASTER") || hasRole("ADMIN_UNIDADE");

  const fetchPayments = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("payments")
      .select("id, value, due_date, status, payment_method, installment_number, pix_copy_paste, invoice_url, boleto_url, checkout_url, contract_id, responsible_id, final_value")
      .order("due_date", { ascending: false });
    if (data) setPayments(data);
    setLoading(false);
  };

  const fetchChargeData = async () => {
    const [profilesRes, studentsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name").eq("active", true),
      supabase.from("students").select("id, full_name, responsible_id").eq("active", true),
    ]);
    if (profilesRes.data) setResponsibles(profilesRes.data);
    if (studentsRes.data) setStudents(studentsRes.data);
  };

  useEffect(() => {
    fetchPayments();
    if (canCreateCharge) fetchChargeData();
  }, []);

  const filtered = filter === "ALL" ? payments : payments.filter((p) => p.status === filter);

  const handleOpenWhatsApp = async (payment: any, e: React.MouseEvent) => {
    e.stopPropagation();

    // Admin: sync and open billing dialog
    if (canCreateCharge) {
      try {
        toast({ title: "Sincronizando cobrança no Asaas antes do envio..." });
        const resolved = await resolveWhatsAppChargeData(payment.id);
        setWaPayment(resolved.payment);
        setWaResponsible(resolved.responsible);
        setWaDescription(resolved.description);
        setWaStudent(resolved.studentName);
        setWaDialogOpen(true);
      } catch (err) {
        toast({
          title: "Envio bloqueado",
          description: err instanceof Error ? err.message : "Não foi possível obter os dados completos.",
          variant: "destructive",
        });
      }
      return;
    }

    // Client: contact financeiro directly
    try {
      const { data: profileData } = await supabase.from("profiles").select("full_name, unit_id").eq("id", payment.responsible_id).single();
      const unitId = profileData?.unit_id;
      const whatsappNumber = unitId ? await getUnitWhatsAppNumber(unitId) : DEFAULT_WHATSAPP_FINANCEIRO;
      const responsibleName = profileData?.full_name || "Responsável";

      let msg = `Olá, aqui é ${responsibleName}.\n\n`;
      msg += `Preciso de ajuda com minha cobrança:\n`;
      msg += `💰 R$ ${Number(payment.final_value ?? payment.value).toFixed(2).replace(".", ",")}\n`;
      msg += `📅 Venc: ${new Date(payment.due_date + "T12:00:00").toLocaleDateString("pt-BR")}\n`;

      const url = `https://wa.me/55${whatsappNumber}?text=${encodeURIComponent(msg)}`;
      window.open(url, "_blank");
    } catch {
      // Fallback with default number
      const url = `https://wa.me/55${DEFAULT_WHATSAPP_FINANCEIRO}`;
      window.open(url, "_blank");
    }
  };

  const handleOpenChargeResultWhatsApp = async () => {
    if (!chargeResult?.payment_id) return;

    try {
      toast({ title: "Sincronizando cobrança no Asaas antes do envio..." });
      const resolved = await resolveWhatsAppChargeData(chargeResult.payment_id);

      setWaPayment(resolved.payment);
      setWaResponsible(resolved.responsible);
      setWaDescription(resolved.description);
      setWaStudent(resolved.studentName);
      setWaDialogOpen(true);
    } catch (err) {
      toast({
        title: "Envio bloqueado",
        description: err instanceof Error ? err.message : "Não foi possível obter os dados completos da cobrança no Asaas.",
        variant: "destructive",
      });
    }
  };

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
                    <Input value={chargeDescription} onChange={(e) => setChargeDescription(e.target.value)} placeholder="Mensalidade UPLAY" />
                  </div>
                  <Button className="w-full" onClick={handleCreateCharge} disabled={creating}>
                    {creating ? <><Loader2 size={16} className="animate-spin mr-2" /> Gerando...</> : "Gerar Cobrança"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center space-y-1">
                    <p className="text-sm font-semibold text-primary">✅ Cobrança criada com sucesso!</p>
                    <p className="text-xs text-muted-foreground">Pague por link ou copie o PIX</p>
                  </div>

                  {chargeResult.invoice_url && (
                    <Button className="w-full gap-1.5" asChild>
                      <a href={chargeResult.invoice_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Abrir Fatura / Pagar Online</a>
                    </Button>
                  )}

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

                  {/* WhatsApp */}
                  <Button
                    variant="outline"
                    className="w-full gap-1.5 border-success/30 text-success hover:bg-success/10 hover:text-success"
                    onClick={handleOpenChargeResultWhatsApp}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Enviar no WhatsApp
                  </Button>

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
          {filtered.map((payment) => {
            const today = startOfDay(new Date());
            const dueDate = new Date(payment.due_date + "T12:00:00");
            const isOverdue = (payment.status === "PENDING" || payment.status === "OVERDUE") && isBefore(dueDate, today);
            const daysOverdue = isOverdue ? differenceInDays(today, dueDate) : 0;

            return (
              <div
                key={payment.id}
                className={`w-full p-3 flex items-center gap-3 text-left transition-colors rounded-lg border ${
                  isOverdue
                    ? "bg-destructive/5 border-destructive/25 hover:bg-destructive/10"
                    : "glass-card hover:bg-secondary/50"
                }`}
              >
                <button
                  onClick={() => navigate(`/app/pagamentos/${payment.id}`)}
                  className="flex-1 flex items-center gap-3 min-w-0"
                >
                  {isOverdue && (
                    <AlertTriangle size={16} className="text-destructive flex-shrink-0 animate-pulse" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isOverdue ? "text-destructive" : "text-foreground"}`}>
                      Parcela {payment.installment_number} {payment.payment_method ? `• ${payment.payment_method}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dueDate.toLocaleDateString("pt-BR")}
                    </p>
                    {isOverdue && (
                      <p className="text-[10px] font-bold text-destructive mt-0.5">
                        ⚠️ Pagamento em atraso — {daysOverdue} {daysOverdue === 1 ? "dia" : "dias"}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-sm font-semibold ${isOverdue ? "text-destructive" : "text-foreground"}`}>
                      R$ {Number(payment.final_value ?? payment.value).toFixed(2).replace(".", ",")}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusClasses[payment.status as PaymentStatus] || ""}`}>
                      {isOverdue ? "Vencido" : (statusLabels[payment.status as PaymentStatus] || payment.status)}
                    </span>
                  </div>
                </button>
                {(payment.status === "PENDING" || isOverdue) && (
                  <button
                    onClick={(e) => handleOpenWhatsApp(payment, e)}
                    className="p-2 rounded-md text-success hover:bg-success/10 transition-colors flex-shrink-0"
                    title="Enviar no WhatsApp"
                  >
                    <MessageCircle size={16} />
                  </button>
                )}
                <button
                  onClick={() => navigate(`/app/pagamentos/${payment.id}`)}
                  className="flex-shrink-0"
                >
                  <ChevronRight size={16} className="text-muted-foreground" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nenhum pagamento encontrado.
        </div>
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
          value={waPayment.final_value ?? waPayment.value}
          dueDate={waPayment.due_date}
          invoiceUrl={waPayment.invoice_url || waPayment.checkout_url}
          boletoUrl={waPayment.boleto_url}
          pixCopyPaste={waPayment.pix_copy_paste}
          paymentMethod={waPayment.payment_method}
          paymentId={waPayment.id}
          responsibleId={waPayment.responsible_id}
        />
      )}
    </div>
  );
};

export default AppPayments;
