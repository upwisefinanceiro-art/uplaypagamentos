import { supabase } from "@/integrations/supabase/client";

type TeacherAppLog = {
  userId: string;
  event: string;
  status?: "INFO" | "WARN" | "ERROR";
  message?: string;
  teacherId?: string | null;
  unitId?: string | null;
  companyId?: string | null;
  details?: Record<string, unknown>;
};

export const logTeacherAppEvent = async ({
  userId,
  event,
  status = "INFO",
  message,
  teacherId = null,
  unitId = null,
  companyId = null,
  details = {},
}: TeacherAppLog) => {
  try {
    const payload = {
      user_id: userId,
      teacher_id: teacherId,
      unit_id: unitId,
      company_id: companyId,
      event,
      route: typeof window !== "undefined" ? window.location.pathname : null,
      status,
      message: message ?? null,
      details,
    };

    const { error } = await (supabase as any).from("teacher_app_logs").insert(payload);
    if (error) console.warn("[teacher-app] falha ao registrar log", { event, error });
  } catch (error) {
    console.warn("[teacher-app] erro inesperado ao registrar log", { event, error });
  }
};