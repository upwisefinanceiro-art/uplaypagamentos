import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OmniMessageRow {
  id: string;
  conversation_id: string;
  sender_type: "contact" | "agent" | "bot" | "system";
  sender_id: string | null;
  message_type: "text" | "image" | "audio" | "video" | "document" | "system";
  content: string | null;
  media_url: string | null;
  media_mime: string | null;
  is_read: boolean;
  delivery_status: string | null;
  created_at: string;
}

export function useOmniMessages(conversationId: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["omni", "messages", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("omni_messages")
        .select("*")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as OmniMessageRow[];
    },
  });

  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase
      .channel(`omni-msg-${conversationId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "omni_messages", filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ["omni", "messages", conversationId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, qc]);

  // mark as read when opening
  useEffect(() => {
    if (!conversationId) return;
    void supabase.from("omni_conversations").update({ unread_count: 0 }).eq("id", conversationId);
  }, [conversationId]);

  return query;
}
