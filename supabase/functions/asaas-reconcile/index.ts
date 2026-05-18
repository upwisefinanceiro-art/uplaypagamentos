// Reconciliação Asaas ↔ banco local
// - Lista cobranças do Asaas dos últimos N dias por unit
// - Detecta cobranças no Asaas sem correspondente local → registra em payment_inconsistencies (não cria payment)
// - Sincroniza status de pagamentos locais cujo Asaas marca como PAID e o banco ainda mostra PENDING/OVERDUE
// - Atualiza paid_at e final_value quando aplicável
// Pode ser chamada manualmente (botão "Forçar reconciliação") ou via pg_cron.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAID_ASAAS = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

function decodeJwtUserId(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    return JSON.parse(atob(authHeader.slice(7).split(".")[1])).sub ?? null;
  } catch { return null; }
}

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const isScheduled = body?.scheduled === true;
  const daysBack = Math.max(1, Math.min(60, Number(body?.days_back) || 7));
  const filterUnitId = typeof body?.unit_id === "string" ? body.unit_id : undefined;

  // Authorization (skip if scheduled cron)
  let actingUserId: string | null = null;
  if (!isScheduled) {
    actingUserId = decodeJwtUserId(req.headers.get("Authorization"));
    if (!actingUserId) return respond({ error: "Unauthorized" }, 401);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", actingUserId);
    const ok = (roles ?? []).some((r: { role: string }) =>
      ["SUPER_ADMIN", "ADMIN_MASTER", "ADMIN_UNIDADE"].includes(r.role),
    );
    if (!ok) return respond({ error: "Forbidden" }, 403);
  }

  // Build unit scope
  let unitsQ = admin.from("units")
    .select("id, company_id, name, asaas_api_key, asaas_base_url, active")
    .eq("active", true)
    .not("asaas_api_key", "is", null);
  if (filterUnitId) unitsQ = unitsQ.eq("id", filterUnitId);
  const { data: units, error: uErr } = await unitsQ;
  if (uErr) return respond({ error: uErr.message }, 500);

  const stats = {
    units_processed: 0,
    asaas_charges_fetched: 0,
    orphans_logged: 0,
    paid_synced: 0,
    errors: 0,
  };

  const sinceDate = new Date(Date.now() - daysBack * 24 * 3600 * 1000)
    .toISOString().slice(0, 10);

  for (const u of units ?? []) {
    stats.units_processed++;
    const baseUrl = u.asaas_base_url || "https://api.asaas.com/v3";

    // Paginate /payments
    let offset = 0;
    const limit = 100;
    let hasMore = true;
    while (hasMore) {
      try {
        const url = `${baseUrl}/payments?limit=${limit}&offset=${offset}&dateCreated[ge]=${sinceDate}`;
        const res = await fetch(url, { headers: { access_token: u.asaas_api_key } });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          stats.errors++;
          console.error(`[asaas-reconcile] unit ${u.id} list error`, res.status, json);
          break;
        }
        const items: Array<Record<string, unknown>> = json?.data ?? [];
        stats.asaas_charges_fetched += items.length;
        if (items.length === 0) break;

        const ids = items.map((p) => String(p.id));
        const { data: locals } = await admin
          .from("payments")
          .select("id, asaas_payment_id, status, paid_at, final_value, value, original_value, unit_id, responsible_id, due_date")
          .in("asaas_payment_id", ids);
        const localByAsaas = new Map((locals ?? []).map((p) => [p.asaas_payment_id as string, p]));

        for (const a of items) {
          const aid = String(a.id);
          const local = localByAsaas.get(aid);
          if (!local) {
            // Órfã no Asaas (não existe localmente) → registra inconsistência (não cria payment)
            const { error: insErr } = await admin.from("payment_inconsistencies").insert({
              unit_id: u.id,
              company_id: u.company_id,
              asaas_payment_id: aid,
              error_type: "ASAAS_ORPHAN",
              severity: "MEDIUM",
              asaas_status: String(a.status ?? ""),
              asaas_value: Number(a.value ?? 0),
              asaas_due_date: a.dueDate ?? null,
              asaas_paid_at: a.paymentDate ?? null,
              details: {
                reason: "cobrança existe no Asaas mas não no sistema",
                description: a.description ?? null,
                customer: a.customer ?? null,
                billingType: a.billingType ?? null,
              },
            });
            if (!insErr) stats.orphans_logged++;
            continue;
          }

          // Existe localmente → se Asaas mostra PAID e local não, sincroniza
          if (PAID_ASAAS.has(String(a.status))) {
            if (local.status !== "PAID") {
              const realValue = typeof a.value === "number" ? a.value
                : Number(a.value ?? local.original_value ?? local.value ?? 0);
              const { error: upErr } = await admin.from("payments").update({
                status: "PAID",
                paid_at: a.paymentDate || a.confirmedDate || new Date().toISOString(),
                final_value: Number.isFinite(realValue) && realValue > 0 ? realValue : local.final_value,
              }).eq("id", local.id);
              if (!upErr) stats.paid_synced++;
              else stats.errors++;
            }
          }
        }

        offset += limit;
        hasMore = items.length === limit;
        await sleep(120); // respeitar rate limit Asaas
      } catch (err) {
        stats.errors++;
        console.error(`[asaas-reconcile] unit ${u.id} error`, err);
        break;
      }
    }
  }

  return respond({
    ok: true,
    days_back: daysBack,
    since: sinceDate,
    scheduled: isScheduled,
    ...stats,
  });
});
