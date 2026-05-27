import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function OmniLogs() {
  const { data = [] } = useQuery({
    queryKey: ["omni", "logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("omni_integration_logs").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Logs de Integração</h1>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2">Quando</th>
              <th className="p-2">Evento</th>
              <th className="p-2">Direção</th>
              <th className="p-2">Status</th>
              <th className="p-2">Erro</th>
            </tr>
          </thead>
          <tbody>
            {data.map(l => (
              <tr key={l.id} className="border-t border-border/50">
                <td className="p-2 whitespace-nowrap">{new Date(l.created_at).toLocaleString("pt-BR")}</td>
                <td className="p-2">{l.event}</td>
                <td className="p-2">{l.direction}</td>
                <td className="p-2">{l.http_status ?? "—"}</td>
                <td className="p-2 text-destructive break-all max-w-md">{l.error_message ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
