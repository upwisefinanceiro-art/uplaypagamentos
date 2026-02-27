import { Building2, Users, CreditCard, FileText, TrendingUp, AlertTriangle } from "lucide-react";

const stats = [
  { label: "Unidades", value: "2", icon: Building2, color: "text-primary" },
  { label: "Clientes", value: "48", icon: Users, color: "text-primary" },
  { label: "Contratos Ativos", value: "35", icon: FileText, color: "text-success" },
  { label: "Cobranças Pendentes", value: "12", icon: CreditCard, color: "text-warning" },
  { label: "Recebido (Mês)", value: "R$ 18.500", icon: TrendingUp, color: "text-success" },
  { label: "Vencidas", value: "3", icon: AlertTriangle, color: "text-destructive" },
];

const AdminDashboard = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-xl font-bold text-foreground">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={16} className={stat.color} />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <p className="text-xl font-bold text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="glass-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-4">Atividade Recente</h2>
        <div className="space-y-3">
          {[
            { text: "Novo contrato criado para Maria Oliveira", time: "Há 2 horas", unit: "Serra Verde" },
            { text: "Pagamento recebido - R$ 350,00", time: "Há 4 horas", unit: "Vespasiano" },
            { text: "Novo cliente cadastrado: Pedro Lima", time: "Há 1 dia", unit: "Serra Verde" },
          ].map((activity, i) => (
            <div key={i} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{activity.text}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{activity.time}</span>
                  <span className="text-xs text-primary/70">• {activity.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
