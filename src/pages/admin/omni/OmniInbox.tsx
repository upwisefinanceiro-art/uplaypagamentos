import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOmniInbox } from "@/hooks/omni/useOmniInbox";
import { useOmniMessages } from "@/hooks/omni/useOmniMessages";
import { useAgentPresence } from "@/hooks/omni/useAgentPresence";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Search, MessageCircle, Phone, Instagram, Globe, Loader2, type LucideIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const channelIcon: Record<string, LucideIcon> = {
  WHATSAPP: Phone,
  INSTAGRAM: Instagram,
  LANDING_PAGE: Globe,
  EMAIL: MessageCircle,
  WEBCHAT: MessageCircle,
};

export default function OmniInbox() {
  useAgentPresence();
  const { profile, hasRole } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>("open");
  const [selected, setSelected] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);

  const filters = useMemo(() => ({
    unitId: hasRole("ADMIN_MASTER") || hasRole("SUPER_ADMIN") ? null : profile?.unit_id ?? null,
    status: statusFilter,
    search,
  }), [profile?.unit_id, statusFilter, search, hasRole]);

  const { data: conversations = [], isLoading } = useOmniInbox(filters);
  const { data: messages = [] } = useOmniMessages(selected);

  const current = conversations.find(c => c.id === selected) ?? null;

  const sendMessage = async () => {
    if (!selected || !composer.trim()) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("omni-send-message", {
        body: { conversation_id: selected, content: composer.trim(), message_type: "text" },
      });
      if (error) throw error;
      setComposer("");
    } catch (e) {
      toast({ title: "Falha ao enviar", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] grid grid-cols-12 gap-3">
      {/* Lista */}
      <aside className="col-span-12 md:col-span-4 xl:col-span-3 bg-card border border-border rounded-lg flex flex-col overflow-hidden">
        <div className="p-3 border-b border-border space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="pl-8 h-9" />
          </div>
          <div className="flex gap-1 text-xs">
            {[
              { v: "open", l: "Abertas" },
              { v: "pending", l: "Pendentes" },
              { v: "closed", l: "Fechadas" },
              { v: null, l: "Todas" },
            ].map(({ v, l }) => (
              <button key={l} onClick={() => setStatusFilter(v)}
                className={`px-2 py-1 rounded ${statusFilter === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <ScrollArea className="flex-1">
          {isLoading && <div className="p-6 text-center text-muted-foreground"><Loader2 className="animate-spin mx-auto" /></div>}
          {!isLoading && conversations.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma conversa ainda.<br />
              Configure uma integração para começar.
            </div>
          )}
          {conversations.map(c => {
            const Icon = channelIcon[c.channel] ?? MessageCircle;
            return (
              <button key={c.id} onClick={() => setSelected(c.id)}
                className={`w-full text-left p-3 border-b border-border/50 hover:bg-muted/40 transition ${selected === c.id ? "bg-muted/60" : ""}`}>
                <div className="flex items-start gap-2">
                  <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center text-primary text-sm font-semibold flex-shrink-0">
                    {c.contact?.full_name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{c.contact?.full_name ?? "Sem nome"}</p>
                      <Icon size={12} className="text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{c.last_message_preview ?? "—"}</p>
                  </div>
                  {c.unread_count > 0 && (
                    <Badge className="bg-primary text-primary-foreground h-5 min-w-5 px-1.5 text-[10px]">{c.unread_count}</Badge>
                  )}
                </div>
              </button>
            );
          })}
        </ScrollArea>
      </aside>

      {/* Thread */}
      <section className="col-span-12 md:col-span-8 xl:col-span-9 bg-card border border-border rounded-lg flex flex-col overflow-hidden">
        {!current ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Selecione uma conversa
          </div>
        ) : (
          <>
            <header className="p-3 border-b border-border flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{current.contact?.full_name}</p>
                <p className="text-xs text-muted-foreground">{current.contact?.phone_e164 ?? "—"} · {current.channel}</p>
              </div>
              <Badge variant="outline" className="text-xs">{current.status}</Badge>
            </header>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-2 max-w-3xl mx-auto">
                {messages.map(m => (
                  <div key={m.id} className={`flex ${m.sender_type === "contact" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      m.sender_type === "contact" ? "bg-muted text-foreground" :
                      m.sender_type === "bot" ? "bg-accent text-accent-foreground" :
                      "bg-primary text-primary-foreground"
                    }`}>
                      {m.message_type === "image" && m.media_url && (
                        <img src={m.media_url} alt="" className="rounded mb-1 max-w-xs" />
                      )}
                      {m.message_type === "audio" && m.media_url && (
                        <audio src={m.media_url} controls className="mb-1" />
                      )}
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                      <div className="text-[10px] opacity-70 mt-1 text-right">
                        {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        {m.delivery_status === "failed" && <span className="ml-1 text-destructive">· falhou</span>}
                        {m.delivery_status === "pending" && <span className="ml-1">· enviando</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="p-3 border-t border-border flex gap-2">
              <Input
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
                placeholder="Escreva uma mensagem..."
                className="flex-1"
              />
              <Button onClick={sendMessage} disabled={sending || !composer.trim()}>
                {sending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
