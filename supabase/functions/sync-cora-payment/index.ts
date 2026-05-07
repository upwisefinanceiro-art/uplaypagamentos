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

const PAID_RE = /PAID|RECEIVED|SETTLED|CONFIRMED|COMPLETED|FINISHED|PIX_RECEIVED|PAYMENT_CONFIRMED/i;

function mapCoraStatus(raw: string | undefined | null): "PAID" | "OVERDUE" | "CANCELLED" | "PENDING" | null {
  if (!raw) return null;
  const s = String(raw).toUpperCase();
  if (PAID_RE.test(s)) return "PAID";
  if (/OVERDUE|LATE|EXPIRED/.test(s)) return "OVERDUE";
  if (/CANCEL|VOID/.test(s)) return "CANCELLED";
  if (/OPEN|PENDING|CREATED|WAITING|IN_PROTEST|DRAFT/.test(s)) return "PENDING";
  return null;
}

// Procura confirmação de pagamento em qualquer campo aninhado da resposta da Cora.
// Retorna { paid, paidValue, paidAt, statusFound }
function deepFindPaid(inv: any): { paid: boolean; paidValue: number; paidAt: string | null; statusFound: string | null } {
  let paid = false;
  let paidValue = 0;
  let paidAt: string | null = null;
  let statusFound: string | null = null;

  // Top-level status
  const topStatus = inv?.status || inv?.state;
  if (topStatus && PAID_RE.test(String(topStatus))) {
    paid = true;
    statusFound = String(topStatus);
  }

  // charge.status / payment.status / pix.status
  for (const key of ["charge", "payment", "pix"]) {
    const sub = inv?.[key];
    const s = sub?.status || sub?.state;
    if (s && PAID_RE.test(String(s))) {
      paid = true;
      statusFound = statusFound || `${key}.${s}`;
    }
  }

  // Arrays: transactions / payments / events / pix_transactions
  for (const key of ["transactions", "payments", "events", "pix_transactions", "settlements"]) {
    const arr = inv?.[key];
    if (Array.isArray(arr)) {
      for (const ev of arr) {
        const s = ev?.status || ev?.state || ev?.event || ev?.type;
        if (s && PAID_RE.test(String(s))) {
          paid = true;
          statusFound = statusFound || `${key}[].${s}`;
          const v = Number(ev?.amount ?? ev?.value ?? ev?.paid_amount ?? ev?.total_paid ?? 0);
          if (v > paidValue) paidValue = v;
          const d = ev?.paid_at || ev?.occurrence_date || ev?.payment_date || ev?.date || ev?.created_at;
          if (d && !paidAt) paidAt = d;
        }
      }
    }
  }

  // Top-level paid value
  const topVal = Number(inv?.total_paid ?? inv?.paid_amount ?? inv?.amount_paid ?? 0);
  if (topVal > paidValue) paidValue = topVal;

  // Cora retorna em centavos
  if (paidValue > 0) paidValue = paidValue / 100;

  if (!paidAt) {
    paidAt = inv?.occurrence_date || inv?.paid_at || inv?.payment_date || null;
  }

  return { paid, paidValue, paidAt, statusFound };
}

async function syncOne(admin: any, payment: any, unit: any, opts: { single?: boolean } = {}) {
  if (!payment.cora_invoice_id) {
    return { ok: false, error: "Esta cobrança não possui ID externo da Cora salvo. Não é possível sincronizar." };
  }

  const hasUnitCora = !!(unit?.cora_client_id && unit?.cora_certificate && unit?.cora_private_key);
  const credsOrErr = hasUnitCora ? getUnitCoraCredentials(unit) : getGlobalCoraCredentials();
  if ("error" in credsOrErr) return { ok: false, error: credsOrErr.error };

  const sessionOrErr = await authenticateCora(credsOrErr);
  if ("error" in sessionOrErr) return { ok: false, error: sessionOrErr.error };
  const session = sessionOrErr;

  try {
    console.info("[CORA_SINGLE_SYNC_START]", JSON.stringify({
      parcelaId: payment.id,
      external_charge_id: payment.cora_invoice_id,
      correlation_id: payment.id,
      provider: "cora",
      unidadeId: payment.unit_id,
    }));

    const result = await coraRequest(session, `/v2/invoices/${payment.cora_invoice_id}`, "GET");
    if (!result.ok) {
      console.error("[CORA_SINGLE_SYNC_ERROR]", JSON.stringify({ payment_id: payment.id, status: result.status, body: result.data ?? result.raw }));
      return { ok: false, error: `Cora ${result.status}: ${typeof result.raw === "string" ? result.raw.slice(0, 200) : ""}` };
    }
    const inv = result.data || {};
    const rawStatus = inv?.status || inv?.state;
    const beforeStatus = payment.status;

    // Busca pagamento em qualquer campo aninhado
    const found = deepFindPaid(inv);
    const mapped: "PAID" | "OVERDUE" | "CANCELLED" | "PENDING" | null = found.paid
      ? "PAID"
      : mapCoraStatus(rawStatus);

    console.info("[CORA_SINGLE_SYNC_RESPONSE]", JSON.stringify({
      payment_id: payment.id,
      status_top: rawStatus,
      status_found: found.statusFound,
      paid: found.paid,
      paid_at: found.paidAt,
      amount_paid: found.paidValue,
      raw_keys: Object.keys(inv || {}),
      raw_response: inv,
    }));

    const update: Record<string, unknown> = {
      cora_status: rawStatus || found.statusFound || payment.cora_status,
      cora_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (mapped === "PAID" && payment.status !== "PAID") {
      update.status = "PAID";
      update.paid_at = found.paidAt ? new Date(found.paidAt).toISOString() : new Date().toISOString();
      if (found.paidValue > 0) update.final_value = found.paidValue;
      if (!payment.payment_method) update.payment_method = "PIX";
      update.raw_response = inv;
      console.info("[CORA_PAYMENT_CONFIRMED]", JSON.stringify({
        payment_id: payment.id, paid_value: found.paidValue, paid_at: found.paidAt, source: found.statusFound,
      }));
    } else if (mapped === "OVERDUE" && payment.status !== "PAID") {
      update.status = "OVERDUE";
    } else if (mapped === "CANCELLED" && payment.status !== "PAID") {
      update.status = "CANCELLED";
    }

    await admin.from("payments").update(update).eq("id", payment.id);

    try {
      await admin.from("webhook_logs").insert({
        event: "cora:sync_pull",
        local_payment_id: payment.id,
        payload: {
          before: beforeStatus,
          after: update.status ?? beforeStatus,
          cora_status: rawStatus,
          status_found_in: found.statusFound,
          paid_value: found.paidValue,
          paid_at: found.paidAt,
          raw: inv,
        },
      });
    } catch { /* ignore */ }

    return {
      ok: true,
      before: beforeStatus,
      after: (update.status as string) ?? beforeStatus,
      cora_status: rawStatus,
      cora_status_found: found.statusFound,
      paid: found.paid,
      paid_value: found.paidValue,
    };
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

    // SINGLE: query exata, sem filtro de gateway/status (sempre consulta em tempo real)
    if (payment_id) {
      const { data: p, error: pErr } = await admin
        .from("payments")
        .select("id, unit_id, status, value, final_value, cora_invoice_id, cora_status, gateway, payment_method")
        .eq("id", payment_id)
        .maybeSingle();
      if (pErr) return json({ error: pErr.message }, 500);
      if (!p) return json({ error: "Cobrança não encontrada" }, 404);
      if (!p.cora_invoice_id) {
        return json({ error: "Esta cobrança não possui ID externo da Cora salvo. Não é possível sincronizar." }, 400);
      }
      const { data: unit } = await admin
        .from("units")
        .select("id, partnership_plan, cora_client_id, cora_certificate, cora_private_key, cora_environment")
        .eq("id", p.unit_id)
        .maybeSingle();

      const r = await syncOne(admin, p, unit, { single: true });
      if (!r.ok) return json({ error: r.error }, 500);
      const message = r.after === "PAID"
        ? "Cobrança confirmada como PAGA na Cora."
        : `Status atual na Cora: ${r.cora_status_found || r.cora_status || "desconhecido"}`;
      return json({ ok: true, ...r, message });
    }

    // LOTE
    let q = admin
      .from("payments")
      .select("id, unit_id, status, value, final_value, cora_invoice_id, cora_status, gateway, payment_method")
      .eq("gateway", "CORA")
      .not("cora_invoice_id", "is", null)
      .neq("status", "PAID")
      .neq("status", "CANCELLED");

    if (unit_id) q = q.eq("unit_id", unit_id);
    if (!all) q = q.limit(50); else q = q.limit(500);

    const { data: payments, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const list = payments ?? [];
    if (!list.length) return json({ ok: true, synced: 0, message: "Nenhuma cobrança Cora pendente para sincronizar" });

    const unitIds = Array.from(new Set(list.map((p: any) => p.unit_id)));
    const { data: units } = await admin
      .from("units")
      .select("id, partnership_plan, cora_client_id, cora_certificate, cora_private_key, cora_environment")
      .in("id", unitIds);
    const unitMap = new Map((units || []).map((u: any) => [u.id, u]));

    let ok = 0, fail = 0, paid = 0;
    for (const p of list) {
      const unit = unitMap.get(p.unit_id);
      const r = await syncOne(admin, p, unit);
      if (r.ok) { ok++; if (r.after === "PAID") paid++; } else fail++;
    }

    console.info("[CORA_SYNC_SUCCESS]", JSON.stringify({ ok, fail, paid, total: list.length }));
    return json({
      ok: true,
      synced: ok,
      failed: fail,
      paid_now: paid,
      total: list.length,
      message: `${ok} sincronizada(s), ${paid} confirmada(s) como paga(s), ${fail} falha(s)`,
    });
  } catch (e) {
    console.error("[CORA_SYNC_ERROR]", e);
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
