import { Pencil, Trash2, RotateCcw, Ban } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface UserActionButtonsProps {
  active: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onPermanentDelete: () => void;
}

const UserActionButtons = ({ active, onEdit, onDeactivate, onReactivate, onPermanentDelete }: UserActionButtonsProps) => {
  const { hasRole } = useAuth();
  const isMaster = hasRole("ADMIN_MASTER");

  return (
    <div className="flex gap-1">
      <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Editar" onClick={onEdit}>
        <Pencil size={14} />
      </button>
      {active ? (
        <button className="p-1.5 text-muted-foreground hover:text-warning transition-colors" title="Desativar" onClick={onDeactivate}>
          <Ban size={14} />
        </button>
      ) : (
        <button className="p-1.5 text-muted-foreground hover:text-primary transition-colors" title="Reativar" onClick={onReactivate}>
          <RotateCcw size={14} />
        </button>
      )}
      {isMaster && (
        <button className="p-1.5 text-muted-foreground hover:text-destructive transition-colors" title="Excluir permanentemente" onClick={onPermanentDelete}>
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
};

export default UserActionButtons;
