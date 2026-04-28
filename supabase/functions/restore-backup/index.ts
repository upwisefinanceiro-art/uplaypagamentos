import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Order matters: parents before children to satisfy foreign keys.
const RESTORE_ORDER = [
  "companies",
  "units",
  "profiles",
  "user_roles",
  "students",
  "contracts",
  "stock_items",
  "payments",
  "stock_movements",
  "delivery_notifications",
  "client_notifications",
  "saas_plans",
  "saas_subscriptions",
  "saas_invoices",
  "unit_financial_costs",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = userData.user.id;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Only SUPER_ADMIN can restore (sensitive operation)
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const isSuper = (roles ?? []).some((r: any) => r.role === "SUPER_ADMIN");
    if (!isSuper) {
      return new Response(JSON.stringify({ error: "Apenas SUPER_ADMIN pode restaurar backups" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const confirmation = body?.confirmation;
    if (confirmation !== "RESTAURAR") {
      return new Response(JSON.stringify({ error: "Confirmação inválida. Digite RESTAURAR." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const backup = body?.backup;
    if (!backup?.data || !backup?.meta) {
      return new Response(JSON.stringify({ error: "Arquivo de backup inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: profSelf } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();

    let restored = 0;
    const summary: Record<string, number> = {};
    const errors: string[] = [];

    for (const table of RESTORE_ORDER) {
      const rows = backup.data[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      // UPSERT in chunks of 500
      const chunkSize = 500;
      let tableCount = 0;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await admin.from(table).upsert(chunk, { onConflict: "id" });
        if (error) {
          errors.push(`${table}: ${error.message}`);
        } else {
          tableCount += chunk.length;
        }
      }
      summary[table] = tableCount;
      restored += tableCount;
    }

    await admin.from("backup_logs").insert({
      performed_by: userId,
      performed_by_name: profSelf?.full_name ?? null,
      scope: backup.meta.scope ?? "GLOBAL",
      company_id: backup.meta.company_id ?? null,
      status: errors.length ? "ERROR" : "RESTORED",
      format: "JSON",
      size_bytes: 0,
      total_records: restored,
      tables_included: RESTORE_ORDER,
      action: "RESTORE",
      error_message: errors.length ? errors.join(" | ").slice(0, 1000) : null,
      metadata: { summary, errors: errors.slice(0, 20) },
    });

    return new Response(JSON.stringify({ ok: true, restored, summary, errors }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[restore-backup] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
