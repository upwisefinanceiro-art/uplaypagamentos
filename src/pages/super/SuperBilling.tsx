import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, Plus, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

interface Company {
  id: string;
  name: string;
  plan: string;
}

interface Subscription {
  id: string;
  company_id: string;
  plan: string;
  monthly_value: number;
  status: string;
  next_billing_date: string | null;
}

interface Invoice {
  id: string;
  company_id: string;
  value: number;
  status: string;
  due_date: string;
  paid_at: string | null;
  description: string;
}

const SuperBilling = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);

  // Subscription form
  const [subCompanyId, setSubCompanyId] = useState("");
  const [subPlan, setSubPlan] = useState("BASIC");
  const [subValue, setSubValue] = useState("99.90");
  const [subSaving, setSubSaving] = useState(false);

  // Invoice form
  const [invCompanyId, setInvCompanyId] = useState("");
  const [invValue, setInvValue] = useState("");
  const [invDueDate, setInvDueDate] = useState("");
  const [invDescription, setInvDescription] = useState("");
  const [invSaving, setInvSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [compRes, subRes, invRes] = await Promise.all([
      supabase.from("companies").select("id, name, plan"),
      supabase.from("saas_subscriptions").select("*").order("created_at", { ascending: false }),
      supabase.from("saas_invoices").select("*").order("due_date", { ascending: false }).limit(50),
    ]);
    setCompanies((compRes.data ?? []) as Company[]);
    setSubscriptions((subRes.data ?? []) as Subscription[]);
    setInvoices((invRes.data ?? []) as Invoice[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const getCompanyName = (id: string) => companies.find(c => c.id === id)?.name ?? "—";

  const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleCreateSubscription = async () => {
    if (!subCompanyId) { toast({ title: "Selecione uma empresa", variant: "destructive" }); return; }
    setSubSaving(true);

    const nextBilling = new Date();
    nextBilling.setMonth(nextBilling.getMonth() + 1);

    const { error } = await supabase.from("saas_subscriptions").insert({
      company_id: subCompanyId,
      plan: subPlan,
      monthly_value: parseFloat(subValue) || 0,
      status: "ACTIVE",
      next_billing_date: nextBilling.toISOString().split("T")[0],
    });

    setSubSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Assinatura criada!" });
    setDialogOpen(false);
    fetchData();
  };

  const handleCreateInvoice = async () => {
    if (!invCompanyId || !invDueDate) {
      toast({ title: "Preencha empresa e vencimento", variant: "destructive" });
      return;
    }
    setInvSaving(true);

    const sub = subscriptions.find(s => s.company_id === invCompanyId);

    const { error } = await supabase.from("saas_invoices").insert({
      company_id: invCompanyId,
      subscription_id: sub?.id ?? null,
      value: parseFloat(invValue) || 0,
      due_date: invDueDate,
      description: invDescription || `Fatura SaaS - ${getCompanyName(invCompanyId)}`,
    });

    setInvSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Fatura criada!" });
    setInvoiceDialogOpen(false);
    fetchData();
  };

  const markInvoicePaid = async (invoiceId: string) => {
    await supabase.from("saas_invoices").update({ status: "PAID", paid_at: new Date().toISOString() }).eq("id", invoiceId);
    toast({ title: "Fatura marcada como paga!" });
    fetchData();
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "PAID": return <CheckCircle2 size={14} className="text-success" />;
      case "OVERDUE": return <AlertTriangle size={14} className="text-destructive" />;
      default: return <Clock size={14} className="text-warning" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "PAID": return "Pago";
      case "OVERDUE": return "Atrasado";
      default: return "Pendente";
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }

  const totalMRR = subscriptions.filter(s => s.status === "ACTIVE").reduce((sum, s) => sum + s.monthly_value, 0);
  const pendingInvoices = invoices.filter(i => i.status === "PENDING").length;
  const overdueInvoices = invoices.filter(i => i.status === "OVERDUE").length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground">Cobranças SaaS</h1>
        <div className="flex gap-2">
          <Button onClick={() => setDialogOpen(true)} size="sm" variant="outline" className="gap-2">
            <Plus size={14} />
            Nova Assinatura
          </Button>
          <Button onClick={() => setInvoiceDialogOpen(true)} size="sm" className="gap-2">
            <Plus size={14} />
            Nova Fatura
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-success">{formatCurrency(totalMRR)}</p>
            <p className="text-xs text-muted-foreground">MRR (Receita Mensal)</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-warning">{pendingInvoices}</p>
            <p className="text-xs text-muted-foreground">Faturas Pendentes</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-destructive">{overdueInvoices}</p>
            <p className="text-xs text-muted-foreground">Faturas Atrasadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Active Subscriptions */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Assinaturas Ativas</CardTitle>
        </CardHeader>
        <CardContent>
          {subscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma assinatura criada.</p>
          ) : (
            <div className="space-y-2">
              {subscriptions.map(sub => (
                <div key={sub.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                  <div>
                    <p className="font-semibold text-sm text-foreground">{getCompanyName(sub.company_id)}</p>
                    <p className="text-xs text-muted-foreground">
                      Plano {sub.plan} • {formatCurrency(sub.monthly_value)}/mês
                      {sub.next_billing_date && ` • Próx.: ${format(new Date(sub.next_billing_date + "T00:00:00"), "dd/MM/yyyy")}`}
                    </p>
                  </div>
                  <Badge className={sub.status === "ACTIVE" ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}>
                    {sub.status === "ACTIVE" ? "Ativa" : sub.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoices */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Faturas Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma fatura gerada.</p>
          ) : (
            <div className="space-y-2">
              {invoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                  <div className="flex items-center gap-2">
                    {statusIcon(inv.status)}
                    <div>
                      <p className="font-semibold text-sm text-foreground">{getCompanyName(inv.company_id)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(inv.value)} • Venc.: {format(new Date(inv.due_date + "T00:00:00"), "dd/MM/yyyy")}
                        {inv.paid_at && ` • Pago: ${format(new Date(inv.paid_at), "dd/MM/yyyy")}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={
                      inv.status === "PAID" ? "bg-success/20 text-success" :
                      inv.status === "OVERDUE" ? "bg-destructive/20 text-destructive" :
                      "bg-warning/20 text-warning"
                    }>
                      {statusLabel(inv.status)}
                    </Badge>
                    {inv.status === "PENDING" && (
                      <Button size="sm" variant="outline" onClick={() => markInvoicePaid(inv.id)} className="text-xs h-7">
                        Baixar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Subscription Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Assinatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <Select value={subCompanyId} onValueChange={setSubCompanyId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Plano</Label>
                <Select value={subPlan} onValueChange={setSubPlan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FREE">Free</SelectItem>
                    <SelectItem value="BASIC">Basic</SelectItem>
                    <SelectItem value="PRO">Pro</SelectItem>
                    <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Valor Mensal (R$)</Label>
                <Input type="number" value={subValue} onChange={e => setSubValue(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleCreateSubscription} disabled={subSaving} className="w-full">
              {subSaving ? "Criando..." : "Criar Assinatura"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Invoice Dialog */}
      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Fatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <Select value={invCompanyId} onValueChange={setInvCompanyId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor (R$)</Label>
                <Input type="number" value={invValue} onChange={e => setInvValue(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Vencimento</Label>
                <Input type="date" value={invDueDate} onChange={e => setInvDueDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input value={invDescription} onChange={e => setInvDescription(e.target.value)} placeholder="Fatura mensal..." />
            </div>
            <Button onClick={handleCreateInvoice} disabled={invSaving} className="w-full">
              {invSaving ? "Criando..." : "Criar Fatura"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SuperBilling;
