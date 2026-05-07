// Edge Function: sync-cora-payment
// Consulta a API Cora para 1 payment (ou em lote) e atualiza status local.
// Body: { payment_id?: string, unit_id?: string, all?: boolean }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import {
  authenticateCora,
  coraRequest,
  getGlobalCoraCredentials,
  getUnitCoraCredentials,
} from "../_shared/cora-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function mapCoraStatus(raw: string | undefined | null): "PAID" | "OVERDUE" | "CANCELLED" | "PENDING" | null {
  if (!raw) return null;
  const s = String(raw).toUpperCase();
  if (/PAID|RECEIVED|SETTLED|CONFIRMED|PIX_RECEIVED|FINISHED/.test(s)) return "PAID";
  if (/OVERDUE|LATE|EXPIRED/.test(s)) return "OVERDUE";
  if (/CANCEL|VOID/.test(s)) return "CANCELLED";
  if (/OPEN|PENDING|CREATED|WAITING|IN_PROTEST/.test(s)) return "PENDING";
  return null;
}

async function syncOne(admin: any, payment: any, unit: any) {
  const hasUnitCora = !!(unit?.cora_client_id && unit?.cora_certificate && unit?.cora_private_key);
  const credsOrErr = hasUnitCora ? getUnitCoraCredentials(unit) : getGlobalCoraCredentials();
  if ("error" in credsOrErr) return { ok: false, error: credsOrErr.error };

  const sessionOrErr = await authenticateCora(credsOrErr);
  if ("error" in sessionOrErr) return { ok: false, error: sessionOrErr.error };
  const session = sessionOrErr;

  try {
    console.info("[CORA_SYNC_RUNNING]", JSON.stringify({
      payment_id: payment.id, cora_invoice_id: payment.cora_invoice_id, unit_id: payment.unit_id,
    }));
    const result = await coraRequest(session, `/v2/invoices/${payment.cora_invoice_id}`, "GET");
    if (!result.ok) {
      console.error("[CORA_SYNC_ERROR]", JSON.stringify({ payment_id: payment.id, status: result.status, body: result.data ?? result.raw }));
      return { ok: false, error: `Cora ${result.status}` };
    }
    const inv = result.data || {};
    const rawStatus = inv.status || inv.state;
    const mapped = mapCoraStatus(rawStatus);
    const beforeStatus = payment.status;

    const update: Record<string, unknown> = {
      cora_status: rawStatus || payment.cora_status,
      cora_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // valor pago (centavos)
    const totalPaid = Number(inv.total_paid ?? inv.paid_amount ?? 0) / 100;
    const occurrenceDate = inv.occurrence_date || inv.paid_at || inv.payment_date;

    if (mapped === "PAID" && payment.status !== "PAID") {
      update.status = "PAID";
      update.paid_at = occurrenceDate ? new Date(occurrenceDate).toISOString() : new Date().toISOString();
      if (totalPaid > 0) update.final_value = totalPaid;
    } else if (mapped === "OVERDUE" && payment.status !== "PAID") {
      update.status = "OVERDUE";
    } else if (mapped === "CANCELLED" && payment.status !== "PAID") {
      update.status = "CANCELLED";
    }

    await admin.from("payments").update(update).eq("id", payment.id);
    console.info("[CORA_STATUS_UPDATED]", JSON.stringify({
      payment_id: payment.id, before: beforeStatus, after: update.status ?? beforeStatus, cora_status: rawStatus, total_paid: totalPaid,
    }));

    try {
      await admin.from("webhook_logs").insert({
        event: "cora:sync_pull",
        local_payment_id: payment.id,
        payload: { before: beforeStatus, after: update.status ?? beforeStatus, cora_status: rawStatus, total_paid: totalPaid, raw: inv },
      });
    } catch { /* ignore */ }

    return { ok: true, before: beforeStatus, after: update.status ?? beforeStatus, cora_status: rawStatus };
  } finally {
    session.close();
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "Não autorizado" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
    const allowed = roles?.some((r: { role: string }) => ["SUPER_ADMIN", "ADMIN_MASTER", "ADMIN_UNIDADE"].includes(r.role));
    if (!allowed) return json({ error: "Sem permissão" }, 403);

    const body = await req.json().catch(() => ({}));
    const { payment_id, unit_id, all } = body || {};

    let q = admin
      .from("payments")
      .select("id, unit_id, status, value, final_value, cora_invoice_id, cora_status, gateway")
      .eq("gateway", "CORA")
      .not("cora_invoice_id", "is", null)
      .neq("status", "PAID")
      .neq("status", "CANCELLED");

    if (payment_id) {
      q = admin
        .from("payments")
        .select("id, unit_id, status, value, final_value, cora_invoice_id, cora_status, gateway")
        .eq("id", payment_id);
    } else if (unit_id) {
      q = q.eq("unit_id", unit_id);
    }
    if (!payment_id && !all && !unit_id) q = q.limit(50);
    else if (!payment_id) q = q.limit(500);

    const { data: payments, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const list = payments ?? [];
    if (!list.length) return json({ ok: true, synced: 0, message: "Nenhuma cobrança Cora pendente para sincronizar" });

    // Carrega unidades
    const unitIds = Array.from(new Set(list.map((p: any) => p.unit_id)));
    const { data: units } = await admin
      .from("units")
      .select("id, partnership_plan, cora_client_id, cora_certificate, cora_private_key, cora_environment")
      .in("id", unitIds);
    const unitMap = new Map((units || []).map((u: any) => [u.id, u]));

    let ok = 0, fail = 0, paid = 0;
    const details: any[] = [];
    for (const p of list) {
      if (!p.cora_invoice_id) { fail++; continue; }
      const unit = unitMap.get(p.unit_id);
      const r = await syncOne(admin, p, unit);
      if (r.ok) {
        ok++;
        if (r.after === "PAID") paid++;
        details.push({ payment_id: p.id, ...r });
      } else {
        fail++;
        details.push({ payment_id: p.id, ...r });
      }
    }

    console.info("[CORA_SYNC_SUCCESS]", JSON.stringify({ ok, fail, paid, total: list.length }));
    return json({
      ok: true,
      synced: ok,
      failed: fail,
      paid_now: paid,
      total: list.length,
      message: `${ok} sincronizada(s), ${paid} confirmada(s) como paga(s), ${fail} falha(s)`,
      details: payment_id ? details : undefined,
    });
  } catch (e) {
    console.error("[CORA_SYNC_ERROR]", e);
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
