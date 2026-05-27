import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Users, Clock, Inbox } from "lucide-react";

export default function OmniDashboard() {
  const { data: stats } = useQuery({
    queryKey: ["omni", "dashboard"],
    queryFn: async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [msgs, conv, agents, queue] = await Promise.all([
        supabase.from("omni_messages").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString()),
        supabase.from("omni_conversations").select("id, channel", { count: "exact" }).eq("status", "open"),
        supabase.from("omni_agent_status").select("profile_id", { count: "exact", head: true }).eq("presence", "online"),
        supabase.from("omni_conversations").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      const byChannel: Record<string, number> = {};
      (conv.data ?? []).forEach((c: { channel: string }) => { byChannel[c.channel] = (byChannel[c.channel] ?? 0) + 1; });
      return {
        msgsToday: msgs.count ?? 0,
        openConv: conv.count ?? 0,
        onlineAgents: agents.count ?? 0,
        queueSize: queue.count ?? 0,
        byChannel,
      };
    },
    refetchInterval: 10000,
  });

  const cards = [
    { label: "Mensagens hoje", value: stats?.msgsToday ?? 0, icon: MessageCircle },
    { label: "Conversas abertas", value: stats?.openConv ?? 0, icon: Inbox },
    { label: "Atendentes online", value: stats?.onlineAgents ?? 0, icon: Users },
    { label: "Em fila", value: stats?.queueSize ?? 0, icon: Clock },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard Omnichannel</h1>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <div key={c.label} className="border border-border bg-card rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <c.icon size={16} className="text-primary" />
            </div>
            <p className="text-3xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>
      <div className="border border-border bg-card rounded-lg p-4">
        <p className="text-sm font-semibold mb-3">Conversas abertas por canal</p>
        <div className="space-y-2">
          {Object.entries(stats?.byChannel ?? {}).map(([ch, n]) => (
            <div key={ch} className="flex items-center justify-between text-sm">
              <span>{ch}</span>
              <span className="font-mono">{n}</span>
            </div>
          ))}
          {Object.keys(stats?.byChannel ?? {}).length === 0 && <p className="text-sm text-muted-foreground">Sem dados ainda.</p>}
        </div>
      </div>
    </div>
  );
}
