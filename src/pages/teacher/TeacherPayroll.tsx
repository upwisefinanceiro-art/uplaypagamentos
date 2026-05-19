import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, CheckCircle2, Clock } from "lucide-react";

interface Closure {
  id: string;
  reference_month: string;
  lessons_count: number;
  total_hours: number;
  total_value: number;
  status: string;
  paid_at: string | null;
  notes: string | null;
}

function fmtBRL(n: number) {
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtMonth(d: string) {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export default function TeacherPayroll() {
  const { user } = useAuth();
  const [closures, setClosures] = useState<Closure[]>([]);
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
        setClosures([]);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("school_payroll_closures")
        .select("*")
        .eq("teacher_id", teacher.id)
        .order("reference_month", { ascending: false });
      setClosures(data ?? []);
      setLoading(false);
    })();
  }, [user?.id]);

  const totalPaid = closures.filter((c) => c.status === "PAID").reduce((s, c) => s + Number(c.total_value), 0);
  const totalPending = closures.filter((c) => c.status === "PENDING").reduce((s, c) => s + Number(c.total_value), 0);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Folha de Pagamento</h1>
        <p className="text-sm text-muted-foreground">Fechamentos mensais gerados pelo administrador.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <p className="text-xs uppercase">A receber</p>
          </div>
          <p className="text-2xl font-bold text-amber-600 mt-1">{fmtBRL(totalPending)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" />
            <p className="text-xs uppercase">Já recebido</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{fmtBRL(totalPaid)}</p>
        </Card>
      </div>

      <div className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!loading && closures.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            <Wallet className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            Nenhum fechamento ainda.
          </Card>
        )}
        {closures.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold capitalize">{fmtMonth(c.reference_month)}</p>
                <p className="text-xs text-muted-foreground">
                  {c.lessons_count} aulas · {Number(c.total_hours).toFixed(2)}h
                </p>
                {c.paid_at && (
                  <p className="text-xs text-emerald-600 mt-1">
                    Pago em {new Date(c.paid_at).toLocaleDateString("pt-BR")}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">{fmtBRL(Number(c.total_value))}</p>
                <Badge
                  variant="outline"
                  className={
                    c.status === "PAID"
                      ? "bg-emerald-500/10 text-emerald-700 border-emerald-200"
                      : c.status === "CANCELED"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-amber-500/10 text-amber-700 border-amber-200"
                  }
                >
                  {c.status === "PAID" ? "Pago" : c.status === "CANCELED" ? "Cancelado" : "Pendente"}
                </Badge>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
