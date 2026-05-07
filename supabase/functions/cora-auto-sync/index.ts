// Edge Function: cora-auto-sync (público, chamado por pg_cron a cada 5 min)
// Faz fallback de sincronização: busca cobranças Cora pendentes (últimos 90 dias)
// e consulta a Cora para confirmar pagamentos sem depender do webhook.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import {
  authenticateCora,
  coraRequest,
  getGlobalCoraCredentials,
  getUnitCoraCredentials,
} from "../_shared/cora-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PAID_RE = /PAID|RECEIVED|SETTLED|CONFIRMED|COMPLETED|FINISHED|PIX_RECEIVED|PAYMENT_CONFIRMED/i;

function deepFindPaid(inv: any): { paid: boolean; paidValue: number; paidAt: string | null; statusFound: string | null } {
  let paid = false, paidValue = 0;
  let paidAt: string | null = null;
  let statusFound: string | null = null;
  const topStatus = inv?.status || inv?.state;
  if (topStatus && PAID_RE.test(String(topStatus))) { paid = true; statusFound = String(topStatus); }
  for (const key of ["charge", "payment", "pix"]) {
    const s = inv?.[key]?.status || inv?.[key]?.state;
    if (s && PAID_RE.test(String(s))) { paid = true; statusFound = statusFound || `${key}.${s}`; }
  }
  for (const key of ["transactions", "payments", "events", "pix_transactions", "settlements"]) {
    const arr = inv?.[key];
    if (Array.isArray(arr)) for (const ev of arr) {
      const s = ev?.status || ev?.state || ev?.event || ev?.type;
      if (s && PAID_RE.test(String(s))) {
        paid = true; statusFound = statusFound || `${key}[].${s}`;
        const v = Number(ev?.amount ?? ev?.value ?? ev?.paid_amount ?? ev?.total_paid ?? 0);
        if (v > paidValue) paidValue = v;
        const d = ev?.paid_at || ev?.occurrence_date || ev?.payment_date || ev?.date || ev?.created_at;
        if (d && !paidAt) paidAt = d;
      }
    }
  }
  const topVal = Number(inv?.total_paid ?? inv?.paid_amount ?? inv?.amount_paid ?? 0);
  if (topVal > paidValue) paidValue = topVal;
  if (paidValue > 0) paidValue = paidValue / 100;
  if (!paidAt) paidAt = inv?.occurrence_date || inv?.paid_at || inv?.payment_date || null;
  return { paid, paidValue, paidAt, statusFound };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: payments, error } = await admin
      .from("payments")
      .select("id, unit_id, status, value, final_value, cora_invoice_id, cora_status, gateway, payment_method, due_date")
      .eq("gateway", "CORA")
      .not("cora_invoice_id", "is", null)
      .neq("status", "PAID")
      .neq("status", "CANCELLED")
      .gte("due_date", ninetyDaysAgo.slice(0, 10))
      .limit(500);
    if (error) {
      console.error("[CORA_AUTO_SYNC_ERROR]", error.message);
      return json({ error: error.message }, 500);
    }
    const list = payments ?? [];
    console.info("[CORA_AUTO_SYNC_START]", JSON.stringify({ pending: list.length }));
    if (!list.length) return json({ ok: true, synced: 0, paid: 0 });

    const unitIds = Array.from(new Set(list.map((p: any) => p.unit_id)));
    const { data: units } = await admin
      .from("units")
      .select("id, partnership_plan, cora_client_id, cora_certificate, cora_private_key, cora_environment")
      .in("id", unitIds);
    const unitMap = new Map((units || []).map((u: any) => [u.id, u]));

    // Group by unit to reuse session
    const byUnit = new Map<string, any[]>();
    for (const p of list) {
      const arr = byUnit.get(p.unit_id) || [];
      arr.push(p);
      byUnit.set(p.unit_id, arr);
    }

    let ok = 0, fail = 0, paid = 0;
    for (const [unitId, pays] of byUnit) {
      const unit = unitMap.get(unitId);
      const hasUnitCora = !!(unit?.cora_client_id && unit?.cora_certificate && unit?.cora_private_key);
      const credsOrErr = hasUnitCora ? getUnitCoraCredentials(unit) : getGlobalCoraCredentials();
      if ("error" in credsOrErr) { fail += pays.length; continue; }
      const sessionOrErr = await authenticateCora(credsOrErr);
      if ("error" in sessionOrErr) { fail += pays.length; continue; }
      const session = sessionOrErr;
      try {
        for (const p of pays) {
          try {
            const res = await coraRequest(session, `/v2/invoices/${p.cora_invoice_id}`, "GET");
            if (!res.ok) { fail++; continue; }
            const inv = res.data || {};
            const found = deepFindPaid(inv);
            const rawStatus = inv?.status || inv?.state;
            const update: Record<string, unknown> = {
              cora_status: rawStatus || found.statusFound || p.cora_status,
              cora_synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            if (found.paid && p.status !== "PAID") {
              update.status = "PAID";
              update.paid_at = found.paidAt ? new Date(found.paidAt).toISOString() : new Date().toISOString();
              if (found.paidValue > 0) update.final_value = found.paidValue;
              if (!p.payment_method) update.payment_method = "PIX";
              update.raw_response = inv;
              paid++;
              console.info("[CORA_AUTO_SYNC_PAID]", JSON.stringify({ payment_id: p.id, value: found.paidValue }));
            }
            await admin.from("payments").update(update).eq("id", p.id);
            ok++;
          } catch (e) {
            fail++;
            console.error("[CORA_AUTO_SYNC_ITEM_ERROR]", p.id, e instanceof Error ? e.message : String(e));
          }
        }
      } finally {
        session.close();
      }
    }
    console.info("[CORA_AUTO_SYNC_DONE]", JSON.stringify({ ok, fail, paid, total: list.length }));
    return json({ ok: true, synced: ok, failed: fail, paid_now: paid, total: list.length });
  } catch (e) {
    console.error("[CORA_AUTO_SYNC_FATAL]", e);
    return json({ error: e instanceof Error ? e.message : "erro" }, 500);
  }
});
