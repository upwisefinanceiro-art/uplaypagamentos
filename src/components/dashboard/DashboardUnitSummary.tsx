import { Building2 } from "lucide-react";

interface UnitData {
  id: string;
  name: string;
  received: number;
  overdue: number;
  toReceive: number;
}

interface Props {
  perUnit: UnitData[];
  formatCurrency: (v: number) => string;
}

const DashboardUnitSummary = ({ perUnit, formatCurrency }: Props) => {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <Building2 size={14} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Resumo por Unidade</h2>
      </div>
      <div className="space-y-3">
        {perUnit.map((u) => (
          <div key={u.id} className="p-3 rounded-md bg-secondary/30 border border-border/30">
            <p className="text-sm font-semibold text-foreground mb-2 truncate">{u.name}</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Recebido</p>
                <p className="text-sm font-semibold text-success">{formatCurrency(u.received)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">A receber</p>
                <p className="text-sm font-semibold text-warning">{formatCurrency(u.toReceive)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Em atraso</p>
                <p className="text-sm font-semibold text-destructive">{formatCurrency(u.overdue)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DashboardUnitSummary;
