import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CreditCard, Plus, CheckCircle2, AlertTriangle, Clock, ExternalLink,
  Copy, Building2, Eye, RefreshCw, MessageCircle, Search, XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

/* ───────── types ───────── */
interface Unit {
  id: string;
  company_id: string | null;
  name: string;
  cnpj: string | null;
  cpf: string | null;
  phone: string | null;
  whatsapp: string | null;
  email_empresa: string | null;
  status: string;
}

interface Subscription {
  id: string;
  company_id: string;
  unit_id: string | null;
  plan: string;
  monthly_value: number;
  punctuality_discount: number;
  total_installments: number;
  billing_type: string;
  first_due_date: string | null;
  status: string;
  due_day: number;
  next_billing_date: string | null;
  block_deadline: string | null;
  asaas_customer_id: string | null;
}

interface Invoice {
  id: string;
  company_id: string;
  unit_id: string | null;
  subscription_id: string | null;
  value: number;
  original_value: number | null;
  punctuality_discount: number;
  status: string;
  due_date: string;
  paid_at: string | null;
  description: string | null;
  asaas_payment_id: string | null;
  invoice_url: string | null;
  boleto_url: string | null;
  pix_copy_paste: string | null;
  billing_type: string;
  created_at: string;
}

interface Company {
  id: string;
  name: string;
  whatsapp_master: string | null;
}

/* ───────── helpers ───────── */
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const billingLabel: Record<string, string> = { UNDEFINED: "Todos", BOLETO: "Boleto", PIX: "PIX", CREDIT_CARD: "Cartão" };
const todayStr = () => new Date().toISOString().split("T")[0];

function classifyInvoice(inv: Invoice): string {
  if (inv.status === "PAID") return "PAID";
  if (inv.status === "CANCELLED") return "CANCELLED";
  if (inv.status === "OVERDUE") return "OVERDUE";
  if (inv.status === "PENDING" && inv.due_date < todayStr()) return "OVERDUE";
  return "PENDING";
}

/* ───────── component ───────── */
const AdminSaasBilling = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<Unit[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [masterCompany, setMasterCompany] = useState<Company | null>(null);
  const [search, setSearch] = useState("");

  const [detailUnitId, setDetailUnitId] = useState<string | null>(null);
  const [chargeDialogOpen, setChargeDialogOpen] = useState(false);
  const [chargeUnitId, setChargeUnitId] = useState("");
  const [chargeSaving, setChargeSaving] = useState(false);

  /* ── fetch ── */
  const fetchData = async () => {
    setLoading(true);
    const [unitRes, subRes, invRes, compRes] = await Promise.all([
      supabase.from("units").select("id, company_id, name, cnpj, cpf, phone, whatsapp, email_empresa, status"),
      supabase.from("saas_subscriptions").select("*").order("created_at", { ascending: false }),
      supabase.from("saas_invoices").select("*").order("due_date", { ascending: false }).limit(500),
      supabase.from("companies").select("id, name, whatsapp_master"),
    ]);
    setUnits((unitRes.data ?? []) as Unit[]);
    setSubscriptions((subRes.data ?? []) as Subscription[]);
    setInvoices((invRes.data ?? []) as Invoice[]);
    const comps = (compRes.data ?? []) as Company[];
    setMasterCompany(comps.find(c => c.whatsapp_master) || comps[0] || null);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel("saas-billing-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "saas_invoices" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "saas_subscriptions" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "units" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  /* ── lookups ── */
  const subByUnit = useMemo(() => {
    const map = new Map<string, Subscription>();
    subscriptions.forEach(s => { if (s.unit_id) map.set(s.unit_id, s); });
    return map;
  }, [subscriptions]);

  const invoicesByUnit = useMemo(() => {
    const map = new Map<string, Invoice[]>();
    invoices.forEach(i => {
      const key = i.unit_id || i.company_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    });
    return map;
  }, [invoices]);

  /* ── classified invoices ── */
  const classifiedInvoices = useMemo(() => {
    return invoices.map(inv => ({ ...inv, displayStatus: classifyInvoice(inv) }));
  }, [invoices]);

  const pendingInvoices = classifiedInvoices.filter(i => i.displayStatus === "PENDING");
  const overdueInvoices = classifiedInvoices.filter(i => i.displayStatus === "OVERDUE");
  const paidInvoices = classifiedInvoices.filter(i => i.displayStatus === "PAID");
  const cancelledInvoices = classifiedInvoices.filter(i => i.displayStatus === "CANCELLED");

  const filterInvoices = (list: typeof classifiedInvoices) => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(inv => {
      const unit = units.find(u => u.id === inv.unit_id);
      const name = unit?.name || "";
      const doc = unit?.cnpj || unit?.cpf || "";
      const email = unit?.email_empresa || "";
      return name.toLowerCase().includes(q) || doc.includes(q) || email.toLowerCase().includes(q);
    });
  };

  /* ── KPIs ── */
  const activePartners = units.filter(u => {
    const s = subByUnit.get(u.id);
    return s && (s.status === "ACTIVE" || s.status === "TRIAL");
  }).length;
  const overduePartners = units.filter(u => subByUnit.get(u.id)?.status === "OVERDUE").length;
  const blockedPartners = units.filter(u => subByUnit.get(u.id)?.status === "BLOCKED").length;
  const totalReceivable = [...pendingInvoices, ...overdueInvoices].reduce((s, i) => s + i.value, 0);
  const paidThisMonth = (() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    return paidInvoices
      .filter(i => i.paid_at && new Date(i.paid_at).getMonth() === m && new Date(i.paid_at).getFullYear() === y)
      .reduce((s, i) => s + i.value, 0);
  })();

  /* ── actions ── */
  const handleGenerateCharge = async () => {
    if (!chargeUnitId) {
      toast({ title: "Selecione um parceiro", variant: "destructive" });
      return;
    }
    setChargeSaving(true);
    try {
      const chargeUnit = units.find(u => u.id === chargeUnitId);
      const { data, error } = await supabase.functions.invoke("create-saas-charge", {
        body: { unit_id: chargeUnitId, company_id: chargeUnit?.company_id || null },
      });
      let errorMsg: string | null = null;
      if (error) {
        try {
          const ctx = (error as any)?.context;
          if (ctx?.json) {
            const body = await ctx.json();
            errorMsg = body?.message || body?.error || error.message;
          } else errorMsg = error.message;
        } catch { errorMsg = error.message; }
      } else if (data && !data.success) errorMsg = data.message || data.error;
      if (errorMsg) {
        toast({ title: "Erro ao gerar cobrança", description: errorMsg, variant: "destructive" });
      } else {
        toast({ title: "Cobrança gerada com sucesso!", description: data?.message || "" });
        setChargeDialogOpen(false);
        fetchData();
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message || "Erro inesperado", variant: "destructive" });
    } finally { setChargeSaving(false); }
  };

  const handleCopyPix = (pix: string) => { navigator.clipboard.writeText(pix); toast({ title: "PIX copiado!" }); };
  const handleOpenBoleto = (url: string) => { window.open(url, "_blank"); };

  const handleMarkPaid = async (invoiceId: string) => {
    await supabase.from("saas_invoices").update({ status: "PAID", paid_at: new Date().toISOString() } as any).eq("id", invoiceId);
    toast({ title: "Fatura marcada como paga!" });
    fetchData();
  };

  const buildWhatsAppMessage = (unitName: string, inv: Invoice, isOverdue = false) => {
    const platformName = masterCompany?.name || "UPLAY";
    if (isOverdue) {
      return `Olá, ${unitName}.\n\nVerificamos que sua mensalidade da plataforma está em atraso.\n\nValor: ${fmt(inv.value)}\nVencimento: ${format(new Date(inv.due_date + "T00:00:00"), "dd/MM/yyyy")}\n\nSegue o link para regularização:\n${inv.invoice_url || "(link não disponível)"}\n\nSe precisar de apoio ou ajuste, fale conosco.`;
    }
    return `Olá, ${unitName}.\n\nAqui é do financeiro da plataforma ${platformName}.\n\nIdentificamos a mensalidade da sua plataforma.\n\nReferência: ${inv.description || "Mensalidade SaaS"}\nValor: ${fmt(inv.value)}\nVencimento: ${format(new Date(inv.due_date + "T00:00:00"), "dd/MM/yyyy")}\n\nSegue o link para pagamento:\n${inv.invoice_url || "(link não disponível)"}\n\nCaso precise adiantar parcelas ou tenha qualquer dúvida, estamos à disposição.`;
  };

  const handleWhatsAppCharge = (inv: Invoice) => {
    const unit = units.find(u => u.id === inv.unit_id);
    const phone = (unit?.whatsapp || unit?.phone || "").replace(/\D/g, "");
    if (!phone) { toast({ title: "WhatsApp não encontrado para este parceiro", variant: "destructive" }); return; }
    const msg = buildWhatsAppMessage(unit?.name || "", inv, classifyInvoice(inv) === "OVERDUE");
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const handleCopyMsg = (inv: Invoice) => {
    const unit = units.find(u => u.id === inv.unit_id);
    const msg = buildWhatsAppMessage(unit?.name || "", inv, classifyInvoice(inv) === "OVERDUE");
    navigator.clipboard.writeText(msg);
    toast({ title: "Mensagem de cobrança copiada!" });
  };

  /* ── badges ── */
  const subStatusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      ACTIVE: { label: "Ativo", cls: "bg-success/20 text-success border-success/30" },
      OVERDUE: { label: "Atrasado", cls: "bg-warning/20 text-warning border-warning/30" },
      BLOCKED: { label: "Bloqueado", cls: "bg-destructive/20 text-destructive border-destructive/30" },
      TRIAL: { label: "Teste Grátis", cls: "bg-primary/20 text-primary border-primary/30" },
    };
    const s = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
    return <Badge variant="outline" className={s.cls}>{s.label}</Badge>;
  };

  const invoiceStatusBadge = (status: string) => {
    const map: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
      PAID: { label: "Recebido", icon: <CheckCircle2 size={12} />, cls: "bg-success/20 text-success border-success/30" },
      OVERDUE: { label: "Vencido", icon: <AlertTriangle size={12} />, cls: "bg-destructive/20 text-destructive border-destructive/30" },
      PENDING: { label: "A pagar", icon: <Clock size={12} />, cls: "bg-warning/20 text-warning border-warning/30" },
      CANCELLED: { label: "Cancelado", icon: <XCircle size={12} />, cls: "bg-muted text-muted-foreground border-border" },
    };
    const s = map[status] ?? map.PENDING;
    return <Badge variant="outline" className={`${s.cls} gap-1`}>{s.icon}{s.label}</Badge>;
  };

  /* ── invoice row ── */
  const InvoiceRow = ({ inv, displayStatus }: { inv: Invoice; displayStatus: string }) => {
    const unit = units.find(u => u.id === inv.unit_id);
    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-muted/30 border border-border gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Building2 size={14} className="text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{unit?.name || "—"}</p>
            <p className="text-xs text-muted-foreground">
              {unit?.cnpj || unit?.cpf || "—"} • {fmt(inv.value)} • Venc.: {format(new Date(inv.due_date + "T00:00:00"), "dd/MM/yyyy")}
              {inv.paid_at && ` • Pago: ${format(new Date(inv.paid_at), "dd/MM/yyyy")}`}
              {inv.billing_type && inv.billing_type !== "UNDEFINED" && ` • ${billingLabel[inv.billing_type] || inv.billing_type}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
          {invoiceStatusBadge(displayStatus)}
          {inv.invoice_url && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleOpenBoleto(inv.invoice_url!)}>
              <ExternalLink size={12} /> Fatura
            </Button>
          )}
          {inv.boleto_url && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleOpenBoleto(inv.boleto_url!)}>
              <ExternalLink size={12} /> Boleto
            </Button>
          )}
          {inv.pix_copy_paste && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleCopyPix(inv.pix_copy_paste!)}>
              <Copy size={12} /> PIX
            </Button>
          )}
          {displayStatus !== "PAID" && displayStatus !== "CANCELLED" && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleWhatsAppCharge(inv)}>
                <MessageCircle size={12} /> WhatsApp
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleCopyMsg(inv)}>
                <Copy size={12} /> Copiar
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleMarkPaid(inv.id)}>
                <CheckCircle2 size={12} /> Baixa
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  /* ── detail dialog data ── */
  const detailUnit = detailUnitId ? units.find(u => u.id === detailUnitId) : null;
  const detailSub = detailUnitId ? subByUnit.get(detailUnitId) : null;
  const detailInvoices = detailUnitId ? (invoicesByUnit.get(detailUnitId) ?? []) : [];

  /* ── loading ── */
  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard size={20} className="text-primary" />
          <h1 className="text-xl font-bold text-foreground">Cobranças SaaS</h1>
        </div>
        <Button size="sm" variant="outline" onClick={() => fetchData()} className="gap-2">
          <RefreshCw size={14} /> Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-success">{activePartners}</p>
            <p className="text-[11px] text-muted-foreground">Parceiros Ativos</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-warning">{overduePartners}</p>
            <p className="text-[11px] text-muted-foreground">Em Atraso</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{blockedPartners}</p>
            <p className="text-[11px] text-muted-foreground">Bloqueados</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{fmt(totalReceivable)}</p>
            <p className="text-[11px] text-muted-foreground">A Receber</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-success">{fmt(paidThisMonth)}</p>
            <p className="text-[11px] text-muted-foreground">Recebido no Mês</p>
          </CardContent>
        </Card>
      </div>

      {/* Partners list */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Parceiros / Unidades</CardTitle>
        </CardHeader>
        <CardContent>
          {partnersWithSub.length === 0 && units.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum parceiro cadastrado.</p>
          ) : partnersWithSub.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum parceiro com contrato SaaS. Cadastre o contrato no menu "Unidades".</p>
          ) : (
            <div className="space-y-2">
              {partnersWithSub.map(u => {
                const sub = subByUnit.get(u.id)!;
                const invCount = invoicesByUnit.get(u.id)?.length ?? 0;
                return (
                  <div key={u.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-muted/30 border border-border gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Building2 size={16} className="text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{u.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {u.cnpj || u.cpf || "Sem doc."} • {fmt(sub.monthly_value)}/mês
                          {sub.punctuality_discount > 0 && ` (desc: ${fmt(sub.punctuality_discount)})`}
                          {sub.next_billing_date && ` • Próx.: ${format(new Date(sub.next_billing_date + "T00:00:00"), "dd/MM/yyyy")}`}
                          {invCount > 0 && ` • ${invCount} fatura(s)`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      {subStatusBadge(sub.status)}
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setDetailUnitId(u.id)}>
                        <Eye size={12} /> Detalhes
                      </Button>
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={() => {
                        setChargeUnitId(u.id);
                        setChargeDialogOpen(true);
                      }}>
                        <Plus size={12} /> Cobrar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoices with tabs */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base">Faturas SaaS</CardTitle>
            <div className="relative max-w-xs w-full">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por empresa, CNPJ ou e-mail…"
                className="pl-9 h-8 text-xs"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending">
            <TabsList className="w-full grid grid-cols-4 mb-4">
              <TabsTrigger value="pending" className="text-xs gap-1">
                🟡 A pagar ({filterInvoices(pendingInvoices).length})
              </TabsTrigger>
              <TabsTrigger value="overdue" className="text-xs gap-1">
                🔴 Vencidos ({filterInvoices(overdueInvoices).length})
              </TabsTrigger>
              <TabsTrigger value="paid" className="text-xs gap-1">
                🟢 Recebidos ({filterInvoices(paidInvoices).length})
              </TabsTrigger>
              <TabsTrigger value="cancelled" className="text-xs gap-1">
                ⚫ Cancelados ({filterInvoices(cancelledInvoices).length})
              </TabsTrigger>
            </TabsList>

            {[
              { key: "pending", list: pendingInvoices, empty: "Nenhuma fatura a pagar." },
              { key: "overdue", list: overdueInvoices, empty: "Nenhuma fatura vencida." },
              { key: "paid", list: paidInvoices, empty: "Nenhuma fatura recebida." },
              { key: "cancelled", list: cancelledInvoices, empty: "Nenhuma fatura cancelada." },
            ].map(tab => (
              <TabsContent key={tab.key} value={tab.key} className="space-y-2 mt-0">
                {filterInvoices(tab.list).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">{tab.empty}</p>
                ) : (
                  filterInvoices(tab.list).map(inv => (
                    <InvoiceRow key={inv.id} inv={inv} displayStatus={inv.displayStatus} />
                  ))
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!detailUnitId} onOpenChange={open => !open && setDetailUnitId(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 size={18} />
              {detailUnit?.name}
            </DialogTitle>
          </DialogHeader>
          {detailUnit && (
            <Tabs defaultValue="dados" className="mt-2">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="dados">Dados</TabsTrigger>
                <TabsTrigger value="contrato">Contrato SaaS</TabsTrigger>
                <TabsTrigger value="historico">Histórico ({detailInvoices.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="dados" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">CNPJ/CPF</p>
                    <p className="text-sm font-medium">{detailUnit.cnpj || detailUnit.cpf || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    {detailSub ? subStatusBadge(detailSub.status) : <Badge variant="outline">Sem assinatura</Badge>}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">E-mail</p>
                    <p className="text-sm font-medium">{detailUnit.email_empresa || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone / WhatsApp</p>
                    <p className="text-sm font-medium">{detailUnit.whatsapp || detailUnit.phone || "—"}</p>
                  </div>
                </div>
                <Button className="w-full gap-2" onClick={() => {
                  setChargeUnitId(detailUnit.id);
                  setChargeDialogOpen(true);
                  setDetailUnitId(null);
                }}>
                  <Plus size={14} /> Gerar Cobrança
                </Button>
              </TabsContent>

              <TabsContent value="contrato" className="space-y-4 mt-4">
                {detailSub ? (
                  <Card className="border-border">
                    <CardContent className="p-4 space-y-3">
                      <p className="text-sm font-semibold">Contrato SaaS</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Valor mensal</p>
                          <p className="font-medium">{fmt(detailSub.monthly_value)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Desc. pontualidade</p>
                          <p className="font-medium">{fmt(detailSub.punctuality_discount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Valor final</p>
                          <p className="font-medium text-success">{fmt(detailSub.monthly_value - detailSub.punctuality_discount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Parcelas</p>
                          <p className="font-medium">{detailSub.total_installments}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Dia vencimento</p>
                          <p className="font-medium">Dia {detailSub.due_day}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Forma pagamento</p>
                          <p className="font-medium">{billingLabel[detailSub.billing_type] || detailSub.billing_type}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Próxima cobrança</p>
                          <p className="font-medium">{detailSub.next_billing_date ? format(new Date(detailSub.next_billing_date + "T00:00:00"), "dd/MM/yyyy") : "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Limite bloqueio</p>
                          <p className="font-medium">{detailSub.block_deadline ? format(new Date(detailSub.block_deadline + "T00:00:00"), "dd/MM/yyyy") : "—"}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem contrato SaaS configurado. Edite o parceiro em "Unidades" para adicionar.</p>
                )}
              </TabsContent>

              <TabsContent value="historico" className="space-y-2 mt-4">
                {detailInvoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhuma fatura encontrada.</p>
                ) : (
                  detailInvoices.map(inv => (
                    <InvoiceRow key={inv.id} inv={inv} displayStatus={classifyInvoice(inv)} />
                  ))
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Generate Charge Dialog */}
      <Dialog open={chargeDialogOpen} onOpenChange={setChargeDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Gerar Cobrança SaaS</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <p className="text-sm font-medium">Parceiro</p>
              <p className="text-sm text-muted-foreground">
                {units.find(u => u.id === chargeUnitId)?.name || "—"}
              </p>
            </div>
            {(() => {
              const sub = chargeUnitId ? subByUnit.get(chargeUnitId) : null;
              if (sub) return (
                <div className="text-xs space-y-1 p-3 rounded-lg bg-muted/30 border border-border">
                  <p>Valor: <strong>{fmt(sub.monthly_value)}</strong></p>
                  {sub.punctuality_discount > 0 && <p>Desconto: <strong>{fmt(sub.punctuality_discount)}</strong></p>}
                  <p>Forma: <strong>{billingLabel[sub.billing_type] || sub.billing_type}</strong></p>
                </div>
              );
              return <p className="text-xs text-muted-foreground">A cobrança será gerada usando o valor e vencimento da assinatura.</p>;
            })()}
            <DialogFooter>
              <Button variant="outline" onClick={() => setChargeDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleGenerateCharge} disabled={chargeSaving}>
                {chargeSaving ? "Gerando..." : "Confirmar"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSaasBilling;
