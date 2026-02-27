import { CreditCard, Users, ChevronRight } from "lucide-react";

// Mock data
const mockStudents = [
  { id: "1", name: "João Silva", course: "Informática" },
  { id: "2", name: "Maria Oliveira", course: "Administração" },
];

const mockPendingPayments = [
  { id: "1", description: "Parcela 3/12 - Informática", value: 350, dueDate: "2026-03-15", status: "PENDING" },
  { id: "2", description: "Parcela 4/12 - Informática", value: 350, dueDate: "2026-04-15", status: "PENDING" },
];

const AppHome = () => {
  return (
    <div className="p-4 space-y-6 animate-fade-in">
      {/* Greeting */}
      <div>
        <h1 className="text-lg font-bold text-foreground">Olá, Carlos!</h1>
        <p className="text-sm text-muted-foreground">Unidade Serra Verde</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} className="text-primary" />
            <span className="text-xs text-muted-foreground">Alunos</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{mockStudents.length}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard size={16} className="text-primary" />
            <span className="text-xs text-muted-foreground">Pendentes</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{mockPendingPayments.length}</p>
        </div>
      </div>

      {/* Students */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Alunos Vinculados</h2>
        <div className="space-y-2">
          {mockStudents.map((student) => (
            <div key={student.id} className="glass-card p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{student.name}</p>
                <p className="text-xs text-muted-foreground">{student.course}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Upcoming Payments */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Próximos Vencimentos</h2>
        </div>
        <div className="space-y-2">
          {mockPendingPayments.map((payment) => (
            <div key={payment.id} className="glass-card p-3 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{payment.description}</p>
                <p className="text-xs text-muted-foreground">
                  Vencimento: {new Date(payment.dueDate).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  R$ {payment.value.toFixed(2).replace(".", ",")}
                </span>
                <ChevronRight size={16} className="text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AppHome;
