import { PartyPopper, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BirthdayPerson {
  id: string;
  name: string;
  type: "Aluno" | "Responsável";
  birthDate: string;
  unitName: string;
  phone: string | null;
}

interface Props {
  birthdays: BirthdayPerson[];
  onSendGreeting: (person: BirthdayPerson) => void;
}

const DashboardBirthdays = ({ birthdays, onSendGreeting }: Props) => {
  return (
    <div className="glass-card p-4 border-l-4 border-l-primary">
      <div className="flex items-center gap-2 mb-4">
        <PartyPopper size={18} className="text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          Aniversariantes do Dia
        </h2>
        {birthdays.length > 0 && (
          <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary">
            {birthdays.length}
          </span>
        )}
      </div>

      {birthdays.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">
          🎂 Hoje não há aniversariantes
        </p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {birthdays.map((person) => (
            <div
              key={`${person.type}-${person.id}`}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors"
            >
              <div className="flex-1 min-w-0 mr-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {person.name}
                  </p>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary whitespace-nowrap">
                    🎉 Aniversário
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{person.type}</span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">{person.unitName}</span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(person.birthDate + "T12:00:00").toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs h-7 border-success/30 text-success hover:bg-success/10 hover:text-success"
                onClick={() => onSendGreeting(person)}
              >
                <MessageCircle size={12} />
                Parabéns
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DashboardBirthdays;
export type { BirthdayPerson };
