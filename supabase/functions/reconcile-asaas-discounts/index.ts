import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SAFE_STATUSES = new Set(["PENDING", "OVERDUE", "RECEIVED_PENDING_CONFIRMATION"]);
const ASAAS_BLOCKED_STATUSES = new Set([
  "RECEIVED",
  "CONFIRMED",
  "RECEIVED_IN_CASH",
  "REFUNDED",
  "DELETED",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function decodeJwtUserId(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.slice(7);
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const userId = decodeJwtUserId(req.headers.get("Authorization"));
  if (!userId) return respond({ error: "Unauthorized" }, 401);

  // Authorize: SUPER_ADMIN / ADMIN_MASTER / ADMIN_UNIDADE
  const { data: roles } = await admin
    .from("user_roles").select("role").eq("user_id", userId);
  const roleSet = new Set((roles ?? []).map((r: any) => r.role));
  const isSuper = roleSet.has("SUPER_ADMIN");
  const isMaster = roleSet.has("ADMIN_MASTER");
  const isUnit = roleSet.has("ADMIN_UNIDADE");
  if (!isSuper && !isMaster && !isUnit) {
    return respond({ error: "Forbidden" }, 403);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const batchSize = Math.max(1, Math.min(100, Number(body?.batch_size) || 25));
  const dryRun = Boolean(body?.dry_run);
  const filterUnitId: string | undefined = body?.unit_id;
  const filterPaymentIds: string[] | undefined = Array.isArray(body?.payment_ids) ? body.payment_ids : undefined;

  // Restrict scope per role
  let allowedUnitIds: string[] | null = null;
  if (isUnit && !isSuper && !isMaster) {
    const { data: prof } = await admin.from("profiles").select("unit_id").eq("id", userId).single();
    if (!prof?.unit_id) return respond({ error: "User without unit" }, 403);
    allowedUnitIds = [prof.unit_id];
  } else if (isMaster && !isSuper) {
    const { data: prof } = await admin.from("profiles").select("unit_id").eq("id", userId).single();
    if (!prof?.unit_id) return respond({ error: "User without unit" }, 403);
    const { data: u } = await admin.from("units").select("company_id").eq("id", prof.unit_id).single();
    if (!u?.company_id) return respond({ error: "Company not found" }, 403);
    const { data: units } = await admin.from("units").select("id").eq("company_id", u.company_id);
    allowedUnitIds = (units ?? []).map((x: any) => x.id);
  }

  // Build query of eligible payments
  let q = admin
    .from("payments")
    .select("id, unit_id, responsible_id, asaas_payment_id, value, original_value, punctuality_discount, status, sync_status, payment_provider")
    .eq("payment_provider", "ASAAS")
    .in("status", Array.from(SAFE_STATUSES))
    .not("asaas_payment_id", "is", null)
    .gt("punctuality_discount", 0)
    .not("original_value", "is", null)
    .neq("sync_status", "FIXED");

  if (filterPaymentIds?.length) q = q.in("id", filterPaymentIds);
  if (filterUnitId) q = q.eq("unit_id", filterUnitId);
  if (allowedUnitIds) q = q.in("unit_id", allowedUnitIds);

  // Count total remaining (with same filters/scope)
  let countQ = admin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("payment_provider", "ASAAS")
    .in("status", Array.from(SAFE_STATUSES))
    .not("asaas_payment_id", "is", null)
    .gt("punctuality_discount", 0)
    .not("original_value", "is", null)
    .neq("sync_status", "FIXED");
  if (filterPaymentIds?.length) countQ = countQ.in("id", filterPaymentIds);
  if (filterUnitId) countQ = countQ.eq("unit_id", filterUnitId);
  if (allowedUnitIds) countQ = countQ.in("unit_id", allowedUnitIds);
  const { count: totalRemaining } = await countQ;

  const { data: payments, error: pErr } = await q.limit(batchSize);
  if (pErr) return respond({ error: pErr.message }, 500);

  const stats = { checked: 0, fixed: 0, already_ok: 0, errors: 0, skipped: 0 };

  // cache unit credentials
  const unitCache = new Map<string, { key: string; baseUrl: string }>();
  async function getUnit(unitId: string) {
    if (unitCache.has(unitId)) return unitCache.get(unitId)!;
    const { data: u } = await admin
      .from("units").select("asaas_api_key, asaas_base_url").eq("id", unitId).single();
    const cfg = {
      key: u?.asaas_api_key ?? "",
      baseUrl: u?.asaas_base_url || "https://api.asaas.com/v3",
    };
    unitCache.set(unitId, cfg);
    return cfg;
  }

  async function logAction(p: any, action: string, fields: any) {
    await admin.from("payment_sync_logs").insert({
      payment_id: p.id,
      asaas_payment_id: p.asaas_payment_id,
      responsible_id: p.responsible_id,
      unit_id: p.unit_id,
      old_value: fields.old_value ?? null,
      new_value: fields.new_value ?? null,
      old_discount: fields.old_discount ?? null,
      new_discount: fields.new_discount ?? null,
      action,
      request_payload: fields.request ?? null,
      response_payload: fields.response ?? null,
      success: fields.success ?? false,
      error_message: fields.error ?? null,
      performed_by: userId,
    });
  }

  for (const p of payments ?? []) {
    stats.checked++;
    try {
      const unit = await getUnit(p.unit_id);
      if (!unit.key) {
        stats.errors++;
        await admin.from("payments").update({
          sync_status: "ERROR",
          sync_error: "Unidade sem asaas_api_key",
          sync_last_check: new Date().toISOString(),
          sync_attempts: 1,
        }).eq("id", p.id);
        await logAction(p, "ERROR", { error: "Unidade sem asaas_api_key" });
        continue;
      }

      // Fetch current state from Asaas
      const getRes = await fetch(`${unit.baseUrl}/payments/${p.asaas_payment_id}`, {
        headers: { access_token: unit.key },
      });
      const asaas = await getRes.json().catch(() => ({}));

      if (!getRes.ok) {
        stats.errors++;
        await admin.from("payments").update({
          sync_status: "ERROR",
          sync_error: `GET ${getRes.status}: ${asaas?.errors?.[0]?.description ?? "erro"}`,
          sync_last_check: new Date().toISOString(),
          sync_attempts: (p.sync_attempts ?? 0) + 1,
        }).eq("id", p.id);
        await logAction(p, "ERROR", { error: `GET ${getRes.status}`, response: asaas });
        await sleep(150);
        continue;
      }

      // Block if Asaas already paid/cancelled
      if (ASAAS_BLOCKED_STATUSES.has(asaas.status)) {
        stats.skipped++;
        await admin.from("payments").update({
          sync_status: "OK",
          sync_error: null,
          sync_last_check: new Date().toISOString(),
        }).eq("id", p.id);
        await sleep(150);
        continue;
      }

      const expectedValue = Number(p.original_value);
      const expectedDiscount = Number(p.punctuality_discount);
      const currValue = Number(asaas.value ?? 0);
      const currDiscount = Number(asaas?.discount?.value ?? 0);
      const matches =
        Math.abs(currValue - expectedValue) < 0.01 &&
        Math.abs(currDiscount - expectedDiscount) < 0.01;

      if (matches) {
        stats.already_ok++;
        await admin.from("payments").update({
          sync_status: "OK",
          sync_error: null,
          sync_last_check: new Date().toISOString(),
        }).eq("id", p.id);
        await sleep(150);
        continue;
      }

      if (dryRun) {
        await admin.from("payments").update({
          sync_status: "DIVERGENT",
          sync_last_check: new Date().toISOString(),
        }).eq("id", p.id);
        await sleep(150);
        continue;
      }

      // Build update payload
      const payload: any = {
        value: expectedValue,
        discount: {
          value: expectedDiscount,
          dueDateLimitDays: 0,
          type: "FIXED",
        },
      };

      const updRes = await fetch(`${unit.baseUrl}/payments/${p.asaas_payment_id}`, {
        method: "POST",
        headers: { access_token: unit.key, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const updBody = await updRes.json().catch(() => ({}));

      if (updRes.ok) {
        stats.fixed++;
        await admin.from("payments").update({
          sync_status: "FIXED",
          sync_error: null,
          sync_last_check: new Date().toISOString(),
          sync_last_fix: new Date().toISOString(),
          sync_fixed_by: userId,
          sync_attempts: (p.sync_attempts ?? 0) + 1,
          corrected_automatically: true,
          value: expectedValue,
          final_value: expectedValue - expectedDiscount,
        }).eq("id", p.id);
        await logAction(p, "UPDATE_ASAAS", {
          old_value: currValue,
          new_value: expectedValue,
          old_discount: currDiscount,
          new_discount: expectedDiscount,
          request: payload,
          response: updBody,
          success: true,
        });

        // Resolve any matching open inconsistency rows
        await admin.from("payment_inconsistencies").update({
          resolved_at: new Date().toISOString(),
          resolved_by: userId,
          resolution_action: "AUTO_DISCOUNT_FIX",
        }).eq("payment_id", p.id).is("resolved_at", null);
      } else {
        stats.errors++;
        const msg = updBody?.errors?.[0]?.description ?? `HTTP ${updRes.status}`;
        await admin.from("payments").update({
          sync_status: "ERROR",
          sync_error: msg,
          sync_last_check: new Date().toISOString(),
          sync_attempts: (p.sync_attempts ?? 0) + 1,
        }).eq("id", p.id);
        await logAction(p, "ERROR", {
          old_value: currValue,
          new_value: expectedValue,
          old_discount: currDiscount,
          new_discount: expectedDiscount,
          request: payload,
          response: updBody,
          error: msg,
        });
      }

      await sleep(150);
    } catch (err) {
      stats.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      await admin.from("payments").update({
        sync_status: "ERROR",
        sync_error: msg,
        sync_last_check: new Date().toISOString(),
        sync_attempts: (p.sync_attempts ?? 0) + 1,
      }).eq("id", p.id);
      await logAction(p, "ERROR", { error: msg });
    }
  }

  const remaining = Math.max(0, (totalRemaining ?? (payments?.length ?? 0)) - (stats.fixed + stats.already_ok + stats.skipped));

  return respond({
    ok: true,
    batch: payments?.length ?? 0,
    remaining,
    ...stats,
  });
});
