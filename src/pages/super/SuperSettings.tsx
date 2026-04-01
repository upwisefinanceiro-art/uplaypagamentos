import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings } from "lucide-react";

const SuperSettings = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-xl font-bold text-foreground">Configurações</h1>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings size={18} />
            Configurações Globais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Em breve: configurações globais do SaaS, planos de cobrança e personalização da plataforma.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperSettings;
