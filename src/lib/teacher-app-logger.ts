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

type TeacherLogPayload = {
  user_id: string;
  teacher_id: string | null;
  unit_id: string | null;
  company_id: string | null;
  event: string;
  route: string | null;
  status: "INFO" | "WARN" | "ERROR";
  message: string | null;
  details: Record<string, unknown>;
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
    const payload: TeacherLogPayload = {
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

    const client = supabase as unknown as {
      from: (table: "teacher_app_logs") => {
        insert: (value: TeacherLogPayload) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { error } = await client.from("teacher_app_logs").insert(payload);
    if (error) console.warn("[teacher-app] falha ao registrar log", { event, error });
  } catch (error) {
    console.warn("[teacher-app] erro inesperado ao registrar log", { event, error });
  }
};