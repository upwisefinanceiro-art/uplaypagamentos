import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CreditCard, Plus, CheckCircle2, AlertTriangle, Clock, ExternalLink,
  Copy, Building2, Eye, RefreshCw, Send, MessageCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

interface Company {
  id: string;
  name: string;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  plan: string;
  status: string;
  whatsapp_master: string | null;
}

interface Unit {
  id: string;
  company_id: string | null;
  name: string;
  cnpj: string | null;
  cpf: string | null;
  phone: string | null;
  whatsapp: string | null;
  email_empresa: string | null;
}

interface Subscription {
  id: string;
  company_id: string;
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

const AdminSaasBilling = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [masterCompany, setMasterCompany] = useState<Company | null>(null);

  // Detail dialog
  const [detailCompany, setDetailCompany] = useState<Company | null>(null);

  // Generate charge dialog
  const [chargeDialogOpen, setChargeDialogOpen] = useState(false);
  const [chargeCompanyId, setChargeCompanyId] = useState("");
  const [chargeSaving, setChargeSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [compRes, unitRes, subRes, invRes] = await Promise.all([
      supabase.from("companies").select("id, name, cnpj, email, phone, plan, status, whatsapp_master"),
      supabase.from("units").select("id, company_id, name, cnpj, cpf, phone, whatsapp, email_empresa"),
      supabase.from("saas_subscriptions").select("*").order("created_at", { ascending: false }),
      supabase.from("saas_invoices").select("*").order("due_date", { ascending: false }).limit(200),
    ]);
    const comps = (compRes.data ?? []) as Company[];
    setCompanies(comps);
    setUnits((unitRes.data ?? []) as Unit[]);
    setSubscriptions((subRes.data ?? []) as Subscription[]);
    setInvoices((invRes.data ?? []) as Invoice[]);
    // Find master company (the one calling)
    const master = comps.find(c => c.whatsapp_master) || comps[0] || null;
    setMasterCompany(master);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const getCompanyName = (id: string) => companies.find(c => c.id === id)?.name ?? "—";
  const getCompanySub = (id: string) => subscriptions.find(s => s.company_id === id);
  const getCompanyInvoices = (id: string) => invoices.filter(i => i.company_id === id);
  const getCompanyUnit = (companyId: string) => units.find(u => u.company_id === companyId);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      ATIVO: { label: "Ativo", cls: "bg-success/20 text-success border-success/30" },
      ATRASADO: { label: "Atrasado", cls: "bg-warning/20 text-warning border-warning/30" },
      BLOQUEADO: { label: "Bloqueado", cls: "bg-destructive/20 text-destructive border-destructive/30" },
      CANCELADO: { label: "Cancelado", cls: "bg-muted text-muted-foreground border-border" },
      TESTE_GRATIS: { label: "Teste Grátis", cls: "bg-primary/20 text-primary border-primary/30" },
    };
    const s = map[status] ?? map.ATIVO;
    return <Badge variant="outline" className={s.cls}>{s.label}</Badge>;
  };

  const invoiceStatusBadge = (status: string) => {
    const map: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
      PAID: { label: "Pago", icon: <CheckCircle2 size={12} />, cls: "bg-success/20 text-success border-success/30" },
      OVERDUE: { label: "Atrasado", icon: <AlertTriangle size={12} />, cls: "bg-destructive/20 text-destructive border-destructive/30" },
      PENDING: { label: "Pendente", icon: <Clock size={12} />, cls: "bg-warning/20 text-warning border-warning/30" },
    };
    const s = map[status] ?? map.PENDING;
    return <Badge variant="outline" className={`${s.cls} gap-1`}>{s.icon}{s.label}</Badge>;
  };

  const handleGenerateCharge = async () => {
    if (!chargeCompanyId) {
      toast({ title: "Selecione uma empresa", variant: "destructive" });
      return;
    }
    setChargeSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-saas-charge", {
        body: { company_id: chargeCompanyId },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: "Erro", description: data.error, variant: "destructive" });
      } else {
        toast({ title: "Cobrança gerada com sucesso!" });
        setChargeDialogOpen(false);
        fetchData();
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setChargeSaving(false);
    }
  };

  const handleCopyPix = (pix: string) => {
    navigator.clipboard.writeText(pix);
    toast({ title: "PIX copiado!" });
  };

  const handleOpenBoleto = (url: string) => {
    window.open(url, "_blank");
  };

  const handleMarkPaid = async (invoiceId: string) => {
    await supabase.from("saas_invoices").update({ status: "PAID", paid_at: new Date().toISOString() } as any).eq("id", invoiceId);
    toast({ title: "Fatura marcada como paga!" });
    fetchData();
  };

  const buildWhatsAppMessage = (companyName: string, inv: Invoice, isOverdue = false) => {
    const platformName = masterCompany?.name || "EnsinUP";
    if (isOverdue) {
      return `Olá, ${companyName}.\n\nVerificamos que sua mensalidade da plataforma está em atraso.\n\nValor: ${fmt(inv.value)}\nVencimento: ${format(new Date(inv.due_date + "T00:00:00"), "dd/MM/yyyy")}\n\nSegue o link para regularização:\n${inv.invoice_url || "(link não disponível)"}\n\nSe precisar de apoio ou ajuste, fale conosco.`;
    }
    return `Olá, ${companyName}.\n\nAqui é do financeiro da plataforma ${platformName}.\n\nIdentificamos a mensalidade da sua plataforma.\n\nReferência: ${inv.description || "Mensalidade SaaS"}\nValor: ${fmt(inv.value)}\nVencimento: ${format(new Date(inv.due_date + "T00:00:00"), "dd/MM/yyyy")}\n\nSegue o link para pagamento:\n${inv.invoice_url || "(link não disponível)"}\n\nCaso precise adiantar parcelas ou tenha qualquer dúvida, estamos à disposição.`;
  };

  const handleWhatsAppCharge = (companyId: string, inv: Invoice) => {
    const company = companies.find(c => c.id === companyId);
    const unit = getCompanyUnit(companyId);
    const phone = (unit?.whatsapp || unit?.phone || company?.phone || "").replace(/\D/g, "");
    if (!phone) {
      toast({ title: "Telefone/WhatsApp não encontrado para esta empresa", variant: "destructive" });
      return;
    }
    const isOverdue = inv.status === "OVERDUE";
    const msg = buildWhatsAppMessage(company?.name || "", inv, isOverdue);
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const handleCopyChargeMessage = (companyId: string, inv: Invoice) => {
    const company = companies.find(c => c.id === companyId);
    const isOverdue = inv.status === "OVERDUE";
    const msg = buildWhatsAppMessage(company?.name || "", inv, isOverdue);
    navigator.clipboard.writeText(msg);
    toast({ title: "Mensagem de cobrança copiada!" });
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }

  // KPIs
  const activeCompanies = companies.filter(c => c.status === "ATIVO").length;
  const trialCompanies = companies.filter(c => c.status === "TESTE_GRATIS").length;
  const overdueCompanies = companies.filter(c => c.status === "ATRASADO").length;
  const blockedCompanies = companies.filter(c => c.status === "BLOQUEADO").length;
  const totalReceivable = invoices.filter(i => i.status === "PENDING" || i.status === "OVERDUE").reduce((s, i) => s + i.value, 0);
  const paidThisMonth = (() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    return invoices
      .filter(i => i.status === "PAID" && i.paid_at && new Date(i.paid_at).getMonth() === m && new Date(i.paid_at).getFullYear() === y)
      .reduce((s, i) => s + i.value, 0);
  })();

  // Companies with subs for list
  const companyList = companies.map(c => ({
    ...c,
    sub: getCompanySub(c.id),
    invoiceCount: getCompanyInvoices(c.id).length,
    unit: getCompanyUnit(c.id),
  }));

  const detailSub = detailCompany ? getCompanySub(detailCompany.id) : null;
  const detailInvoices = detailCompany ? getCompanyInvoices(detailCompany.id) : [];
  const detailUnit = detailCompany ? getCompanyUnit(detailCompany.id) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard size={20} className="text-primary" />
          <h1 className="text-xl font-bold text-foreground">Cobranças SaaS</h1>
        </div>
        <Button size="sm" variant="outline" onClick={() => fetchData()} className="gap-2">
          <RefreshCw size={14} />
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{trialCompanies}</p>
            <p className="text-[11px] text-muted-foreground">Teste Grátis</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-success">{activeCompanies}</p>
            <p className="text-[11px] text-muted-foreground">Empresas Ativas</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-warning">{overdueCompanies}</p>
            <p className="text-[11px] text-muted-foreground">Em Atraso</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{blockedCompanies}</p>
            <p className="text-[11px] text-muted-foreground">Bloqueadas</p>
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

      {/* Company list */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Empresas / Parceiros</CardTitle>
        </CardHeader>
        <CardContent>
          {companyList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma empresa cadastrada.</p>
          ) : (
            <div className="space-y-2">
              {companyList.map(c => (
                <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-muted/30 border border-border gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Building2 size={16} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.cnpj || c.unit?.cnpj || c.unit?.cpf || "Sem CNPJ"} • {c.sub ? `${fmt(c.sub.monthly_value)}/mês` : "Sem assinatura"}
                        {c.sub?.punctuality_discount > 0 && ` (desc: ${fmt(c.sub.punctuality_discount)})`}
                        {c.sub?.next_billing_date && ` • Próx.: ${format(new Date(c.sub.next_billing_date + "T00:00:00"), "dd/MM/yyyy")}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    {statusBadge(c.status)}
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setDetailCompany(c)}>
                      <Eye size={12} /> Detalhes
                    </Button>
                    <Button size="sm" className="h-7 text-xs gap-1" onClick={() => {
                      setChargeCompanyId(c.id);
                      setChargeDialogOpen(true);
                    }}>
                      <Plus size={12} /> Cobrar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent invoices */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Faturas Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma fatura gerada.</p>
          ) : (
            <div className="space-y-2">
              {invoices.slice(0, 20).map(inv => (
                <div key={inv.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-muted/30 border border-border gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{getCompanyName(inv.company_id)}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt(inv.value)} • Venc.: {format(new Date(inv.due_date + "T00:00:00"), "dd/MM/yyyy")}
                      {inv.paid_at && ` • Pago: ${format(new Date(inv.paid_at), "dd/MM/yyyy")}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                    {invoiceStatusBadge(inv.status)}
                    {inv.invoice_url && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleOpenBoleto(inv.invoice_url!)}>
                        <ExternalLink size={12} /> Fatura
                      </Button>
                    )}
                    {inv.pix_copy_paste && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleCopyPix(inv.pix_copy_paste!)}>
                        <Copy size={12} /> PIX
                      </Button>
                    )}
                    {inv.status !== "PAID" && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleWhatsAppCharge(inv.company_id, inv)}>
                          <MessageCircle size={12} /> WhatsApp
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleCopyChargeMessage(inv.company_id, inv)}>
                          <Copy size={12} /> Copiar msg
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleMarkPaid(inv.id)}>
                          <CheckCircle2 size={12} /> Baixa
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!detailCompany} onOpenChange={(open) => !open && setDetailCompany(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 size={18} />
              {detailCompany?.name}
            </DialogTitle>
          </DialogHeader>
          {detailCompany && (
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
                    <p className="text-sm font-medium">{detailCompany.cnpj || detailUnit?.cnpj || detailUnit?.cpf || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    {statusBadge(detailCompany.status)}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">E-mail</p>
                    <p className="text-sm font-medium">{detailCompany.email || detailUnit?.email_empresa || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone / WhatsApp</p>
                    <p className="text-sm font-medium">{detailUnit?.whatsapp || detailUnit?.phone || detailCompany.phone || "—"}</p>
                  </div>
                </div>
                <Button
                  className="w-full gap-2"
                  onClick={() => {
                    setChargeCompanyId(detailCompany.id);
                    setChargeDialogOpen(true);
                    setDetailCompany(null);
                  }}
                >
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
                          <p className="font-medium">{
                            { UNDEFINED: "Todos", BOLETO: "Boleto", PIX: "PIX", CREDIT_CARD: "Cartão" }[detailSub.billing_type] || detailSub.billing_type
                          }</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Próxima cobrança</p>
                          <p className="font-medium">
                            {detailSub.next_billing_date
                              ? format(new Date(detailSub.next_billing_date + "T00:00:00"), "dd/MM/yyyy")
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Limite bloqueio</p>
                          <p className="font-medium">
                            {detailSub.block_deadline
                              ? format(new Date(detailSub.block_deadline + "T00:00:00"), "dd/MM/yyyy")
                              : "—"}
                          </p>
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
                    <div key={inv.id} className="p-3 rounded-lg bg-muted/30 border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{fmt(inv.value)}</p>
                          <p className="text-xs text-muted-foreground">
                            Venc.: {format(new Date(inv.due_date + "T00:00:00"), "dd/MM/yyyy")}
                            {inv.paid_at && ` • Pago: ${format(new Date(inv.paid_at), "dd/MM/yyyy")}`}
                          </p>
                        </div>
                        {invoiceStatusBadge(inv.status)}
                      </div>
                      {inv.description && (
                        <p className="text-xs text-muted-foreground">{inv.description}</p>
                      )}
                      <div className="flex gap-1.5 flex-wrap">
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
                        {inv.status !== "PAID" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleWhatsAppCharge(inv.company_id, inv)}>
                              <MessageCircle size={12} /> WhatsApp
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleCopyChargeMessage(inv.company_id, inv)}>
                              <Copy size={12} /> Copiar
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleMarkPaid(inv.id)}>
                              <CheckCircle2 size={12} /> Baixa Manual
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
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
              <p className="text-sm font-medium">Empresa</p>
              <p className="text-sm text-muted-foreground">{getCompanyName(chargeCompanyId)}</p>
            </div>
            {(() => {
              const sub = getCompanySub(chargeCompanyId);
              if (sub) return (
                <div className="text-xs space-y-1 p-3 rounded-lg bg-muted/30 border border-border">
                  <p>Valor: <strong>{fmt(sub.monthly_value)}</strong></p>
                  {sub.punctuality_discount > 0 && <p>Desconto pontualidade: <strong>{fmt(sub.punctuality_discount)}</strong></p>}
                  <p>Forma: <strong>{{ UNDEFINED: "Todos", BOLETO: "Boleto", PIX: "PIX", CREDIT_CARD: "Cartão" }[sub.billing_type] || sub.billing_type}</strong></p>
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
