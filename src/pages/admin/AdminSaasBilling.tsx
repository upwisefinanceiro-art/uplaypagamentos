import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CreditCard, Plus, CheckCircle2, AlertTriangle, Clock, ExternalLink,
  Copy, Building2, Eye, RefreshCw, Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
}

interface Subscription {
  id: string;
  company_id: string;
  plan: string;
  monthly_value: number;
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
  status: string;
  due_date: string;
  paid_at: string | null;
  description: string | null;
  asaas_payment_id: string | null;
  invoice_url: string | null;
  boleto_url: string | null;
  pix_copy_paste: string | null;
  created_at: string;
}

const AdminSaasBilling = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  // Detail dialog
  const [detailCompany, setDetailCompany] = useState<Company | null>(null);

  // Generate charge dialog
  const [chargeDialogOpen, setChargeDialogOpen] = useState(false);
  const [chargeCompanyId, setChargeCompanyId] = useState("");
  const [chargeValue, setChargeValue] = useState("");
  const [chargeDueDate, setChargeDueDate] = useState("");
  const [chargeDesc, setChargeDesc] = useState("");
  const [chargeSaving, setChargeSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [compRes, subRes, invRes] = await Promise.all([
      supabase.from("companies").select("id, name, cnpj, email, phone, plan, status"),
      supabase.from("saas_subscriptions").select("*").order("created_at", { ascending: false }),
      supabase.from("saas_invoices").select("*").order("due_date", { ascending: false }).limit(200),
    ]);
    setCompanies((compRes.data ?? []) as Company[]);
    setSubscriptions((subRes.data ?? []) as Subscription[]);
    setInvoices((invRes.data ?? []) as Invoice[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const getCompanyName = (id: string) => companies.find(c => c.id === id)?.name ?? "—";
  const getCompanySub = (id: string) => subscriptions.find(s => s.company_id === id);
  const getCompanyInvoices = (id: string) => invoices.filter(i => i.company_id === id);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      ATIVO: { label: "Ativo", cls: "bg-success/20 text-success border-success/30" },
      ATRASADO: { label: "Atrasado", cls: "bg-warning/20 text-warning border-warning/30" },
      BLOQUEADO: { label: "Bloqueado", cls: "bg-destructive/20 text-destructive border-destructive/30" },
      CANCELADO: { label: "Cancelado", cls: "bg-muted text-muted-foreground border-border" },
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
    await supabase.from("saas_invoices").update({ status: "PAID", paid_at: new Date().toISOString() }).eq("id", invoiceId);
    toast({ title: "Fatura marcada como paga!" });
    fetchData();
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
  }));

  const detailSub = detailCompany ? getCompanySub(detailCompany.id) : null;
  const detailInvoices = detailCompany ? getCompanyInvoices(detailCompany.id) : [];

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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
                        {c.cnpj || "Sem CNPJ"} • {c.sub ? `${fmt(c.sub.monthly_value)}/mês` : "Sem assinatura"}
                        {c.sub?.next_billing_date && ` • Próx.: ${format(new Date(c.sub.next_billing_date + "T00:00:00"), "dd/MM/yyyy")}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
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
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    {invoiceStatusBadge(inv.status)}
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
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleMarkPaid(inv.id)}>
                        <CheckCircle2 size={12} /> Baixa
                      </Button>
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
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="dados">Dados</TabsTrigger>
                <TabsTrigger value="historico">Histórico ({detailInvoices.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="dados" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">CNPJ/CPF</p>
                    <p className="text-sm font-medium">{detailCompany.cnpj || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    {statusBadge(detailCompany.status)}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">E-mail</p>
                    <p className="text-sm font-medium">{detailCompany.email || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone</p>
                    <p className="text-sm font-medium">{detailCompany.phone || "—"}</p>
                  </div>
                </div>
                {detailSub ? (
                  <Card className="border-border">
                    <CardContent className="p-4 space-y-2">
                      <p className="text-sm font-semibold">Assinatura</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Valor mensal</p>
                          <p className="font-medium">{fmt(detailSub.monthly_value)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Dia vencimento</p>
                          <p className="font-medium">Dia {detailSub.due_day}</p>
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
                  <p className="text-sm text-muted-foreground">Sem assinatura ativa.</p>
                )}
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
                      <div className="flex gap-2 flex-wrap">
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
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleMarkPaid(inv.id)}>
                            <CheckCircle2 size={12} /> Baixa Manual
                          </Button>
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
            <p className="text-xs text-muted-foreground">
              A cobrança será gerada no Asaas MASTER usando o valor e vencimento da assinatura da empresa.
            </p>
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
