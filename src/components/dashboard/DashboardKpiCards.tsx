import { CheckCircle2, Clock, AlertTriangle, Users, TrendingUp, Receipt } from "lucide-react";

interface DashboardKpiCardsProps {
  totalReceived: number;
  totalToReceive: number;
  totalOverdue: number;
  activeStudents: number;
  inadimplencia: number;
  totalAsaasFees?: number;
  formatCurrency: (v: number) => string;
}

function KpiCard({ icon: Icon, label, value, color, bgColor }: {
  icon: any;
  label: string;
  value: string;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-md ${bgColor}`}>
          <Icon size={16} className={color} />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

const DashboardKpiCards = ({
  totalReceived,
  totalToReceive,
  totalOverdue,
  activeStudents,
  inadimplencia,
  totalAsaasFees = 0,
  formatCurrency,
}: DashboardKpiCardsProps) => {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={CheckCircle2}
          label="Recebido"
          value={formatCurrency(totalReceived)}
          color="text-success"
          bgColor="bg-success/10"
        />
        <KpiCard
          icon={Clock}
          label="A receber"
          value={formatCurrency(totalToReceive)}
          color="text-warning"
          bgColor="bg-warning/10"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Em atraso"
          value={formatCurrency(totalOverdue)}
          color="text-destructive"
          bgColor="bg-destructive/10"
        />
        <KpiCard
          icon={Users}
          label="Alunos ativos"
          value={String(activeStudents)}
          color="text-primary"
          bgColor="bg-primary/10"
        />
      </div>

      {/* Custo com taxas Asaas (despesa interna, separado do faturamento) */}
      <div className="glass-card p-4 border-l-4 border-l-destructive">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-destructive/10">
              <Receipt size={16} className="text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Custo com taxas Asaas (despesa)</p>
              <p className="text-xs text-muted-foreground/70">Não confundir com faturamento</p>
            </div>
          </div>
          <span className="text-xl font-bold text-destructive">- {formatCurrency(totalAsaasFees)}</span>
        </div>
      </div>

      {/* Inadimplência indicator */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium">Taxa de Inadimplência</span>
          <TrendingUp size={14} className="text-muted-foreground" />
        </div>
        <div className="flex items-end gap-2">
          <span className={`text-2xl font-bold ${inadimplencia > 20 ? "text-destructive" : inadimplencia > 10 ? "text-warning" : "text-success"}`}>
            {inadimplencia.toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground mb-1">
            (atraso / total a receber)
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${inadimplencia > 20 ? "bg-destructive" : inadimplencia > 10 ? "bg-warning" : "bg-success"}`}
            style={{ width: `${Math.min(inadimplencia, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default DashboardKpiCards;
