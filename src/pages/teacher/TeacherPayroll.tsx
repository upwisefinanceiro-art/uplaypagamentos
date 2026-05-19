import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, CheckCircle2, Clock } from "lucide-react";

interface Closure {
  id: string;
  reference_month: string;
  lessons_count: number;
  total_hours: number;
  total_value: number;
  paid_amount: number;
  status: string;
  paid_at: string | null;
  due_date: string | null;
  scheduled_payment_date: string | null;
  notes: string | null;
}
interface PaymentRow {
  id: string;
  payment_type: string;
  amount: number;
  payment_date: string;
  description: string | null;
  status: string;
  closure_id: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  FOLHA_MENSAL: "Folha mensal",
  ADIANTAMENTO: "Adiantamento",
  AVULSO: "Avulso",
  REPOSICAO: "Reposição",
  AULA_EXTRA: "Aula extra",
  BONUS: "Bônus",
  AJUDA_CUSTO: "Ajuda de custo",
};

const STATUS_LABEL: Record<string, string> = {
  PAID: "Pago",
  PARTIAL: "Parcial",
  PENDING: "Pendente",
  CANCELED: "Cancelado",
};

function fmtBRL(n: number) {
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR");
}
function fmtMonth(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export default function TeacherPayroll() {
  const { user } = useAuth();
  const [closures, setClosures] = useState<Closure[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: teacher } = await supabase
        .from("school_teachers")
        .select("id")
        .eq("profile_id", user.id)
        .maybeSingle();
      if (!teacher) {
        setLoading(false);
        return;
      }
      const [cRes, pRes] = await Promise.all([
        supabase
          .from("school_payroll_closures")
          .select("*")
          .eq("teacher_id", teacher.id)
          .order("reference_month", { ascending: false }),
        supabase
          .from("school_teacher_payments")
          .select("id,payment_type,amount,payment_date,description,status,closure_id")
          .eq("teacher_id", teacher.id)
          .order("payment_date", { ascending: false }),
      ]);
      setClosures((cRes.data ?? []) as Closure[]);
      setPayments((pRes.data ?? []) as PaymentRow[]);
      setLoading(false);
    })();
  }, [user?.id]);

  const totalPending = closures.reduce((s, c) => {
    if (c.status === "CANCELED") return s;
    return s + Math.max(Number(c.total_value) - Number(c.paid_amount || 0), 0);
  }, 0);
  const totalPaid = payments.filter((p) => p.status === "PAGO").reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Meus Pagamentos</h1>
        <p className="text-sm text-muted-foreground">Folha mensal, adiantamentos e pagamentos avulsos.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <p className="text-xs uppercase">Saldo a receber</p>
          </div>
          <p className="text-2xl font-bold text-amber-600 mt-1">{fmtBRL(totalPending)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" />
            <p className="text-xs uppercase">Total recebido</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{fmtBRL(totalPaid)}</p>
        </Card>
      </div>

      <Tabs defaultValue="closures">
        <TabsList>
          <TabsTrigger value="closures">Folha mensal</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="closures" className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loading && closures.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              <Wallet className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              Nenhum fechamento ainda.
            </Card>
          )}
          {closures.map((c) => {
            const paid = Number(c.paid_amount || 0);
            const total = Number(c.total_value);
            const remaining = Math.max(total - paid, 0);
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold capitalize">{fmtMonth(c.reference_month)}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.lessons_count} aulas · {Number(c.total_hours).toFixed(2)}h
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Vence: {fmtDate(c.due_date)} · Pgto previsto: {fmtDate(c.scheduled_payment_date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{fmtBRL(total)}</p>
                    <p className="text-xs">
                      Pago: <b className="text-emerald-600">{fmtBRL(paid)}</b>
                    </p>
                    <p className="text-xs">
                      Saldo: <b className="text-amber-600">{fmtBRL(remaining)}</b>
                    </p>
                    <Badge
                      variant="outline"
                      className={
                        c.status === "PAID"
                          ? "bg-emerald-500/10 text-emerald-700 mt-1"
                          : c.status === "PARTIAL"
                          ? "bg-blue-500/10 text-blue-700 mt-1"
                          : c.status === "CANCELED"
                          ? "bg-destructive/10 text-destructive mt-1"
                          : "bg-amber-500/10 text-amber-700 mt-1"
                      }
                    >
                      {STATUS_LABEL[c.status] ?? c.status}
                    </Badge>
                  </div>
                </div>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="history" className="space-y-2">
          {payments.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum pagamento registrado.</Card>
          )}
          {payments.map((p) => (
            <Card key={p.id} className="p-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{TYPE_LABEL[p.payment_type] ?? p.payment_type}</p>
                <p className="text-xs text-muted-foreground">{p.description ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground">{fmtDate(p.payment_date)}</p>
              </div>
              <div className="text-right">
                <p className="font-bold">{fmtBRL(Number(p.amount))}</p>
                <Badge variant="outline" className={p.status === "PAGO" ? "bg-emerald-500/10 text-emerald-700" : "bg-muted"}>
                  {p.status}
                </Badge>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
