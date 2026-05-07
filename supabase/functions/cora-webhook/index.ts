// Edge Function: cora-webhook (público)
// Recebe notificações do Banco Cora e atualiza payments.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return json({ ok: true, msg: "cora-webhook alive" });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });

  let body: any = null;
  let raw = "";
  try { raw = await req.text(); body = raw ? JSON.parse(raw) : null; } catch { /* not json */ }

  console.info("[CORA_WEBHOOK_RECEIVED]", JSON.stringify({ headers, body: body ?? raw.slice(0, 1000) }));

  // Optional shared-secret check
  const expectedSecret = Deno.env.get("CORA_WEBHOOK_SECRET");
  if (expectedSecret) {
    const got = headers["x-webhook-secret"] || headers["authorization"]?.replace(/^Bearer\s+/i, "");
    if (got !== expectedSecret) {
      try { await admin.from("webhook_logs").insert({ event: "cora:unauthorized", payload: { headers, body } }); } catch (_) { /* ignore */ }
      return json({ error: "unauthorized" }, 401);
    }
  }

  try { await admin.from("webhook_logs").insert({ event: `cora:${body?.event || body?.type || "unknown"}`, payload: { headers, body } }); } catch (_) { /* ignore */ }

  const event = (body?.event || body?.type || "").toString().toLowerCase();
  const invoice = body?.invoice || body?.data?.invoice || body?.data || body || {};
  const coraId = invoice?.id || invoice?.invoice_id || body?.invoice_id || body?.id;
  const externalCode = invoice?.code || body?.code; // nosso payment.id (enviamos como `code`)
  const rawStatus = (invoice?.status || invoice?.state || body?.status || event).toString().toUpperCase();

  if (!coraId && !externalCode) {
    return json({ ok: true, ignored: "no invoice id/code" });
  }

  // Map Cora status -> internal
  let newStatus: "PAID" | "OVERDUE" | "CANCELLED" | null = null;
  if (/PAID|RECEIVED|SETTLED|CONFIRMED|PIX_RECEIVED|FINISHED/.test(rawStatus) || /paid|received|settled|pix/i.test(event)) newStatus = "PAID";
  else if (/OVERDUE|LATE|EXPIRED/.test(rawStatus) || /overdue|expired/i.test(event)) newStatus = "OVERDUE";
  else if (/CANCEL|VOID/.test(rawStatus) || /cancel/i.test(event)) newStatus = "CANCELLED";

  if (!newStatus) return json({ ok: true, ignored: `status ${rawStatus} not mapped` });

  // Find payment — tenta cora_invoice_id, depois pelo code (payment.id)
  let payment: any = null;
  if (coraId) {
    const r = await admin.from("payments").select("id, status, value, final_value").eq("cora_invoice_id", coraId).maybeSingle();
    payment = r.data;
  }
  if (!payment && externalCode) {
    const r = await admin.from("payments").select("id, status, value, final_value").eq("id", externalCode).maybeSingle();
    payment = r.data;
  }

  if (!payment) {
    console.warn("[CORA_WEBHOOK_NOT_FOUND]", { coraId, externalCode });
    return json({ ok: true, ignored: "payment not found" });
  }

  if (payment.status === "PAID" && newStatus !== "PAID") {
    return json({ ok: true, ignored: "already paid, no downgrade" });
  }

  const update: Record<string, unknown> = {
    cora_status: rawStatus,
    cora_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (newStatus === "PAID") {
    const paidValue = Number(invoice?.total_paid ?? invoice?.paid_amount ?? invoice?.amount_paid ?? invoice?.total_amount ?? 0) / 100;
    const occurrenceDate = invoice?.occurrence_date || invoice?.paid_at || invoice?.payment_date;
    update.status = "PAID";
    update.paid_at = occurrenceDate ? new Date(occurrenceDate).toISOString() : new Date().toISOString();
    if (paidValue && Number.isFinite(paidValue) && paidValue > 0) {
      update.final_value = paidValue;
    }
    if (coraId && !payment.cora_invoice_id) (update as any).cora_invoice_id = coraId;
    console.info("[CORA_PAYMENT_CONFIRMED]", JSON.stringify({ payment_id: payment.id, paidValue, occurrenceDate }));
  } else if (newStatus === "OVERDUE" && payment.status !== "PAID") {
    update.status = "OVERDUE";
  } else if (newStatus === "CANCELLED" && payment.status !== "PAID") {
    update.status = "CANCELLED";
  }

  await admin.from("payments").update(update).eq("id", payment.id);
  console.info("[CORA_STATUS_UPDATED]", JSON.stringify({ payment_id: payment.id, newStatus, rawStatus }));

  return json({ ok: true, payment_id: payment.id, new_status: newStatus });
});
