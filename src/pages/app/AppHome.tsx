import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CreditCard, Users, ChevronRight, AlertTriangle, Clock, CheckCircle2, Loader2, GraduationCap, Building2, Calendar } from "lucide-react";
import { differenceInDays, startOfDay, isBefore, isEqual } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Student {
  id: string;
  full_name: string;
  enrollment_id: string | null;
}

interface Payment {
  id: string;
  value: number;
  final_value: number | null;
  due_date: string;
  status: string;
  description: string;
  payment_type: string;
  installment_number: number;
  invoice_url: string | null;
  checkout_url: string | null;
}

const parseLocalDate = (d: string) => new Date(d + "T00:00:00");

const AppHome = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [unitName, setUnitName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const [studentsRes, paymentsRes] = await Promise.all([
        supabase.from("students").select("id, full_name, enrollment_id").eq("responsible_id", user.id).eq("active", true),
        supabase.from("payments").select("id, value, final_value, due_date, status, description, payment_type, installment_number, invoice_url, checkout_url").eq("responsible_id", user.id).order("due_date", { ascending: true }),
      ]);
      if (studentsRes.data) setStudents(studentsRes.data);
      if (paymentsRes.data) setPayments(paymentsRes.data as Payment[]);

      if (profile?.unit_id) {
        const { data } = await supabase.from("units").select("name").eq("id", profile.unit_id).single();
        if (data) setUnitName(data.name);
      }
      setLoading(false);
    };
    fetch();
  }, [user, profile]);

  const today = startOfDay(new Date());
  const paidStatuses = ["PAID", "RECEIVED", "CONFIRMED"];

  const overduePayments = payments.filter(p => {
    if (paidStatuses.includes(p.status) || p.status === "CANCELLED") return false;
    return isBefore(parseLocalDate(p.due_date), today);
  });

  const dueTodayPayments = payments.filter(p => {
    if (paidStatuses.includes(p.status) || p.status === "CANCELLED") return false;
    return isEqual(parseLocalDate(p.due_date), today);
  });

  const upcomingPayments = payments.filter(p => {
    if (paidStatuses.includes(p.status) || p.status === "CANCELLED") return false;
    const due = parseLocalDate(p.due_date);
    return due > today;
  }).slice(0, 5);

  const formatCurrency = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
  const formatDate = (d: string) => parseLocalDate(d).toLocaleDateString("pt-BR");

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5 animate-fade-in">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold text-foreground">
          Olá, {profile?.full_name?.split(" ")[0] || "Responsável"}!
        </h1>
        {unitName && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <Building2 size={14} /> {unitName}
          </p>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-3 text-center">
          <Users size={18} className="text-primary mx-auto mb-1" />
          <p className="text-2xl font-bold text-foreground">{students.length}</p>
          <p className="text-[11px] text-muted-foreground">Alunos</p>
        </div>
        <div className="glass-card p-3 text-center">
          <AlertTriangle size={18} className="text-destructive mx-auto mb-1" />
          <p className="text-2xl font-bold text-destructive">{overduePayments.length}</p>
          <p className="text-[11px] text-muted-foreground">Em atraso</p>
        </div>
        <div className="glass-card p-3 text-center">
          <Clock size={18} className="text-warning mx-auto mb-1" />
          <p className="text-2xl font-bold text-foreground">{upcomingPayments.length + dueTodayPayments.length}</p>
          <p className="text-[11px] text-muted-foreground">Pendentes</p>
        </div>
      </div>

      {/* Students */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <GraduationCap size={16} className="text-primary" />
          Alunos Vinculados
        </h2>
        {students.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum aluno vinculado.</p>
        ) : (
          <div className="space-y-2">
            {students.map((s) => (
              <div key={s.id} className="glass-card p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <GraduationCap size={16} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{s.full_name}</p>
                  {s.enrollment_id && (
                    <p className="text-xs text-muted-foreground">Matrícula: {s.enrollment_id}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Overdue */}
      {overduePayments.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-destructive mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="animate-pulse" />
            Cobranças em Atraso
            <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">
              {overduePayments.length}
            </span>
          </h2>
          <div className="space-y-2">
            {overduePayments.map((p) => {
              const days = differenceInDays(today, parseLocalDate(p.due_date));
              return (
                <button
                  key={p.id}
                  onClick={() => navigate(`/app/pagamentos/${p.id}`)}
                  className="w-full glass-card p-4 flex items-center gap-3 text-left border-destructive/25 bg-destructive/5 hover:bg-destructive/10 transition-colors"
                >
                  <AlertTriangle size={18} className="text-destructive flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-destructive truncate">
                      {p.description || `Parcela ${p.installment_number}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Venceu: {formatDate(p.due_date)} · {days}d atraso
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-destructive">
                      {formatCurrency(p.final_value ?? p.value)}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Due today */}
      {dueTodayPayments.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-warning mb-3 flex items-center gap-2">
            <Calendar size={16} />
            Vencendo Hoje
            <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-warning/15 text-warning">
              {dueTodayPayments.length}
            </span>
          </h2>
          <div className="space-y-2">
            {dueTodayPayments.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/app/pagamentos/${p.id}`)}
                className="w-full glass-card p-4 flex items-center gap-3 text-left border-warning/25 bg-warning/5 hover:bg-warning/10 transition-colors"
              >
                <Clock size={18} className="text-warning flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {p.description || `Parcela ${p.installment_number}`}
                  </p>
                  <p className="text-xs text-warning">Vence hoje</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-foreground">
                    {formatCurrency(p.final_value ?? p.value)}
                  </p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CreditCard size={16} className="text-primary" />
            Próximos Vencimentos
          </h2>
          <button
            onClick={() => navigate("/app/pagamentos")}
            className="text-xs text-primary font-medium"
          >
            Ver todos
          </button>
        </div>
        {upcomingPayments.length === 0 ? (
          <div className="glass-card p-6 text-center">
            <CheckCircle2 size={24} className="text-success mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma cobrança pendente 🎉</p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingPayments.map((p) => {
              const days = differenceInDays(parseLocalDate(p.due_date), today);
              return (
                <button
                  key={p.id}
                  onClick={() => navigate(`/app/pagamentos/${p.id}`)}
                  className="w-full glass-card p-4 flex items-center gap-3 text-left hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {p.description || `Parcela ${p.installment_number}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(p.due_date)} · {days === 1 ? "amanhã" : `em ${days} dias`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-foreground">
                      {formatCurrency(p.final_value ?? p.value)}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default AppHome;
