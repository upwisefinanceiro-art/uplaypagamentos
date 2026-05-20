import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logTeacherAppEvent } from "@/lib/teacher-app-logger";

/**
 * Mantém a sessão do professor saudável:
 * - Verifica a cada 5 min se o token vai expirar nos próximos 2 min e força refresh.
 * - Em caso de falha 2x seguidas, registra log mas não desloga.
 */
export function useSessionGuard(userId: string | null | undefined) {
  const failCountRef = useRef(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const tick = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) return;
      const expiresAt = (session.expires_at ?? 0) * 1000;
      const remainingMs = expiresAt - Date.now();
      if (remainingMs > 0 && remainingMs < 1000 * 60 * 2) {
        const { error } = await supabase.auth.refreshSession();
        if (cancelled) return;
        if (error) {
          failCountRef.current++;
          void logTeacherAppEvent({
            userId,
            event: "SESSION_REFRESH_FAIL",
            status: "WARN",
            message: error.message,
            details: { fails: failCountRef.current },
          });
        } else {
          failCountRef.current = 0;
          void logTeacherAppEvent({
            userId,
            event: "SESSION_REFRESHED",
            status: "INFO",
          });
        }
      }
    };

    void tick();
    const id = window.setInterval(tick, 1000 * 60 * 5);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [userId]);
}
