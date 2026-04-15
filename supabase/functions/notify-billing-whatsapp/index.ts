import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface NotificationItem {
  payment_id: string;
  responsible_id: string;
  responsible_name: string;
  responsible_phone: string | null;
  student_name: string | null;
  value: number;
  due_date: string;
  days_until_due: number;
  status: string;
  invoice_url: string | null;
  boleto_url: string | null;
  pix_copy_paste: string | null;
  payment_method: string | null;
  unit_id: string;
  unit_name: string;
  type: "REMINDER" | "OVERDUE";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get optional unit_id filter from body
    let unitFilter: string | null = null;
    try {
      const body = await req.json();
      unitFilter = body?.unit_id || null;
    } catch { /* no body */ }

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // 5 days from now
    const reminderDate = new Date(today);
    reminderDate.setDate(reminderDate.getDate() + 5);
    const reminderStr = reminderDate.toISOString().split("T")[0];

    // Fetch active units
    let unitsQuery = supabase.from("units").select("id, name").eq("active", true);
    if (unitFilter) unitsQuery = unitsQuery.eq("id", unitFilter);
    const { data: units, error: unitsError } = await unitsQuery;
    if (unitsError) throw unitsError;

    const unitMap = new Map((units || []).map((u: any) => [u.id, u.name]));
    const unitIds = Array.from(unitMap.keys());

    if (unitIds.length === 0) {
      return new Response(JSON.stringify({ reminders: [], overdue: [], total: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch PENDING payments due in exactly 5 days (reminder)
    const { data: reminderPayments } = await supabase
      .from("payments")
      .select("id, responsible_id, student_id, value, final_value, due_date, status, invoice_url, boleto_url, pix_copy_paste, payment_method, unit_id, contract_id, description, payment_type")
      .eq("status", "PENDING")
      .eq("due_date", reminderStr)
      .in("unit_id", unitIds);

    // Fetch OVERDUE payments (due before today, still PENDING/OVERDUE)
    const { data: overduePayments } = await supabase
      .from("payments")
      .select("id, responsible_id, student_id, value, final_value, due_date, status, invoice_url, boleto_url, pix_copy_paste, payment_method, unit_id, contract_id, description, payment_type")
      .in("status", ["PENDING", "OVERDUE"])
      .lt("due_date", todayStr)
      .in("unit_id", unitIds);

    // Collect all responsible_ids and student_ids
    const allPayments = [...(reminderPayments || []), ...(overduePayments || [])];
    const responsibleIds = [...new Set(allPayments.map((p: any) => p.responsible_id))];
    const studentIds = [...new Set(allPayments.filter((p: any) => p.student_id).map((p: any) => p.student_id))];

    // Fetch profiles and students
    const [profilesRes, studentsRes] = await Promise.all([
      responsibleIds.length > 0
        ? supabase.from("profiles").select("id, full_name, phone").in("id", responsibleIds)
        : Promise.resolve({ data: [] }),
      studentIds.length > 0
        ? supabase.from("students").select("id, full_name").in("id", studentIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));
    const studentMap = new Map((studentsRes.data || []).map((s: any) => [s.id, s.full_name]));

    const buildItem = (p: any, type: "REMINDER" | "OVERDUE"): NotificationItem => {
      const profile = profileMap.get(p.responsible_id);
      const dueDate = new Date(p.due_date + "T12:00:00");
      const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      return {
        payment_id: p.id,
        responsible_id: p.responsible_id,
        responsible_name: profile?.full_name || "—",
        responsible_phone: profile?.phone || null,
        student_name: p.student_id ? (studentMap.get(p.student_id) || null) : null,
        value: p.final_value ?? p.value,
        due_date: p.due_date,
        days_until_due: diffDays,
        status: p.status,
        invoice_url: p.invoice_url,
        boleto_url: p.boleto_url,
        pix_copy_paste: p.pix_copy_paste,
        payment_method: p.payment_method,
        unit_id: p.unit_id,
        unit_name: unitMap.get(p.unit_id) || "—",
        type,
      };
    };

    const reminders = (reminderPayments || []).map((p: any) => buildItem(p, "REMINDER"));
    const overdue = (overduePayments || []).map((p: any) => buildItem(p, "OVERDUE"));

    return new Response(JSON.stringify({
      reminders,
      overdue,
      total: reminders.length + overdue.length,
      generated_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-billing-whatsapp error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
