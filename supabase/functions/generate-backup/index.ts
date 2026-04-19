import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tables included in the backup. Sensitive credentials columns are stripped below.
const BACKUP_TABLES = [
  "companies",
  "units",
  "profiles",
  "user_roles",
  "students",
  "contracts",
  "payments",
  "stock_items",
  "stock_movements",
  "delivery_notifications",
  "client_notifications",
  "saas_plans",
  "saas_subscriptions",
  "saas_invoices",
  "unit_financial_costs",
  "audit_logs",
  "whatsapp_message_logs",
];

// Columns to remove from each table for security (API keys, tokens).
const SENSITIVE_FIELDS: Record<string, string[]> = {
  units: ["asaas_api_key", "asaas_webhook_token"],
  companies: ["asaas_api_key_master", "asaas_webhook_token_master"],
};

function sanitize(table: string, rows: any[]) {
  const fields = SENSITIVE_FIELDS[table];
  if (!fields || !rows?.length) return rows;
  return rows.map((r) => {
    const copy = { ...r };
    for (const f of fields) delete copy[f];
    return copy;
  });
}

async function fetchAll(supabase: any, table: string, companyIdFilter: string | null) {
  const all: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let q = supabase.from(table).select("*").range(from, from + pageSize - 1);
    // Scope filter for ADMIN_MASTER (company-bound).
    if (companyIdFilter) {
      if (table === "companies") q = q.eq("id", companyIdFilter);
      else if (table === "units") q = q.eq("company_id", companyIdFilter);
      else if (
        ["profiles", "students", "contracts", "payments", "stock_items", "stock_movements",
         "delivery_notifications", "client_notifications", "unit_financial_costs"].includes(table)
      ) {
        const { data: units } = await supabase.from("units").select("id").eq("company_id", companyIdFilter);
        const unitIds = (units ?? []).map((u: any) => u.id);
        if (!unitIds.length) return [];
        q = supabase.from(table).select("*").in("unit_id", unitIds).range(from, from + pageSize - 1);
      } else if (["saas_subscriptions", "saas_invoices"].includes(table)) {
        q = supabase.from(table).select("*").eq("company_id", companyIdFilter).range(from, from + pageSize - 1);
      } else if (table === "user_roles") {
        const { data: prof } = await supabase
          .from("profiles").select("id, units!inner(company_id)").eq("units.company_id", companyIdFilter);
        const ids = (prof ?? []).map((p: any) => p.id);
        if (!ids.length) return [];
        q = supabase.from(table).select("*").in("user_id", ids).range(from, from + pageSize - 1);
      }
    }
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data ?? [];
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUserClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUserClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Check role
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    const isSuper = roleSet.has("SUPER_ADMIN");
    const isMaster = roleSet.has("ADMIN_MASTER");
    if (!isSuper && !isMaster) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Determine scope
    let companyIdFilter: string | null = null;
    let scope: "GLOBAL" | "COMPANY" = "GLOBAL";
    if (!isSuper && isMaster) {
      const { data: prof } = await admin
        .from("profiles").select("unit_id").eq("id", userId).maybeSingle();
      if (prof?.unit_id) {
        const { data: unit } = await admin.from("units").select("company_id").eq("id", prof.unit_id).maybeSingle();
        companyIdFilter = unit?.company_id ?? null;
      }
      scope = "COMPANY";
      if (!companyIdFilter) {
        return new Response(JSON.stringify({ error: "Empresa não localizada" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Get user name
    const { data: profSelf } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();

    // Build backup
    const backup: Record<string, any[]> = {};
    let totalRecords = 0;
    for (const table of BACKUP_TABLES) {
      const rows = await fetchAll(admin, table, companyIdFilter);
      const cleaned = sanitize(table, rows);
      backup[table] = cleaned;
      totalRecords += cleaned.length;
    }

    const payload = {
      meta: {
        generated_at: new Date().toISOString(),
        generated_by: userId,
        generated_by_name: profSelf?.full_name ?? null,
        scope,
        company_id: companyIdFilter,
        version: 1,
        tables: BACKUP_TABLES,
        sensitive_fields_excluded: SENSITIVE_FIELDS,
      },
      data: backup,
    };

    const json = JSON.stringify(payload);
    const sizeBytes = new TextEncoder().encode(json).length;

    // Log
    await admin.from("backup_logs").insert({
      performed_by: userId,
      performed_by_name: profSelf?.full_name ?? null,
      scope,
      company_id: companyIdFilter,
      status: "SUCCESS",
      format: "JSON",
      size_bytes: sizeBytes,
      total_records: totalRecords,
      tables_included: BACKUP_TABLES,
      action: "BACKUP",
    });

    return new Response(json, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="uplay-backup-${new Date().toISOString().slice(0,10)}.json"`,
      },
    });
  } catch (err) {
    console.error("[generate-backup] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
