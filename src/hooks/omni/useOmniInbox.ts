import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OmniInboxFilters {
  unitId?: string | null;
  channel?: string | null;
  status?: string | null;
  assignedTo?: string | null;
  queueId?: string | null;
  search?: string;
}

export interface OmniConversationRow {
  id: string;
  channel: string;
  status: string;
  priority: number;
  unread_count: number;
  last_message_preview: string | null;
  last_message_at: string | null;
  assigned_to: string | null;
  queue_id: string | null;
  unit_id: string;
  contact: { id: string; full_name: string; phone_e164: string | null; avatar_url: string | null } | null;
}

export function useOmniInbox(filters: OmniInboxFilters) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["omni", "inbox", filters],
    queryFn: async () => {
      let q = supabase
        .from("omni_conversations")
        .select("id,channel,status,priority,unread_count,last_message_preview,last_message_at,assigned_to,queue_id,unit_id, contact:omni_contacts(id,full_name,phone_e164,avatar_url)")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (filters.unitId) q = q.eq("unit_id", filters.unitId);
      if (filters.channel) q = q.eq("channel", filters.channel as never);
      if (filters.status) q = q.eq("status", filters.status as never);
      if (filters.assignedTo) q = q.eq("assigned_to", filters.assignedTo);
      if (filters.queueId) q = q.eq("queue_id", filters.queueId);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as unknown as OmniConversationRow[];
      if (filters.search) {
        const s = filters.search.toLowerCase();
        rows = rows.filter(r =>
          r.contact?.full_name?.toLowerCase().includes(s) ||
          r.contact?.phone_e164?.includes(s) ||
          r.last_message_preview?.toLowerCase().includes(s)
        );
      }
      return rows;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("omni-inbox-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "omni_conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["omni", "inbox"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "omni_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["omni", "inbox"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return query;
}
