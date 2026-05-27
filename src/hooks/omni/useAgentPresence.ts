import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useAgentPresence() {
  const { user, profile } = useAuth();

  useEffect(() => {
    if (!user) return;
    const upsert = async (presence: "online" | "offline" | "away") => {
      await supabase.from("omni_agent_status").upsert({
        profile_id: user.id,
        unit_id: profile?.unit_id ?? null,
        presence,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never);
    };
    void upsert("online");
    const interval = setInterval(() => void upsert("online"), 20000);
    const onHide = () => void upsert("away");
    const onShow = () => void upsert("online");
    const onUnload = () => void upsert("offline");
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) onHide(); else onShow();
    });
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", onUnload);
      void upsert("offline");
    };
  }, [user, profile?.unit_id]);
}
