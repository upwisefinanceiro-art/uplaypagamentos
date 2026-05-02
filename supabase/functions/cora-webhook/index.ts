// Edge Function: cora-webhook (público)
// Recebe notificações do Banco Cora e atualiza payments.
// Status mapeados: PAID/RECEIVED -> PAID, OVERDUE -> OVERDUE, CANCELLED -> CANCELLED.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  let body: any = null;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  // Optional shared-secret check
  const expectedSecret = Deno.env.get("CORA_WEBHOOK_SECRET");
  if (expectedSecret) {
    const got = req.headers.get("x-webhook-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (got !== expectedSecret) {
      await admin.from("webhook_logs").insert({ event: "cora:unauthorized", payload: body }).catch(() => null);
      return json({ error: "unauthorized" }, 401);
    }
  }

  await admin.from("webhook_logs").insert({ event: `cora:${body?.event || body?.type || "unknown"}`, payload: body }).catch(() => null);

  // Cora payload variants: { event, invoice: { id, status } } or top-level { id, status }
  const event = (body?.event || body?.type || "").toString().toLowerCase();
  const invoice = body?.invoice || body?.data?.invoice || body?.data || body;
  const coraId = invoice?.id || invoice?.invoice_id || body?.invoice_id;
  const rawStatus = (invoice?.status || body?.status || event).toString().toUpperCase();

  if (!coraId) return json({ ok: true, ignored: "no invoice id" });

  // Map Cora status -> internal
  let newStatus: string | null = null;
  if (/PAID|RECEIVED|SETTLED|CONFIRMED/.test(rawStatus) || /paid|received|settled/i.test(event)) newStatus = "PAID";
  else if (/OVERDUE|LATE|EXPIRED/.test(rawStatus) || /overdue|expired/i.test(event)) newStatus = "OVERDUE";
  else if (/CANCELLED|CANCELED|VOID/.test(rawStatus) || /cancel/i.test(event)) newStatus = "CANCELLED";

  if (!newStatus) return json({ ok: true, ignored: `status ${rawStatus} not mapped` });

  // Find payment
  const { data: payment } = await admin
    .from("payments")
    .select("id, status, value, final_value")
    .eq("cora_invoice_id", coraId)
    .maybeSingle();

  if (!payment) return json({ ok: true, ignored: "payment not found" });

  // Status guard: PAID must never revert to PENDING
  if (payment.status === "PAID" && newStatus !== "PAID") {
    return json({ ok: true, ignored: "already paid, no downgrade" });
  }

  const update: Record<string, unknown> = {
    cora_status: rawStatus,
    cora_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (newStatus === "PAID") {
    const paidValue = Number(invoice?.paid_amount || invoice?.amount_paid || invoice?.total_amount) / 100;
    update.status = "PAID";
    update.paid_at = new Date().toISOString();
    if (paidValue && Number.isFinite(paidValue) && paidValue > 0) {
      update.final_value = paidValue;
    }
  } else if (newStatus === "OVERDUE" && payment.status !== "PAID") {
    update.status = "OVERDUE";
  } else if (newStatus === "CANCELLED" && payment.status !== "PAID") {
    update.status = "CANCELLED";
  }

  await admin.from("payments").update(update).eq("id", payment.id);

  return json({ ok: true, payment_id: payment.id, new_status: newStatus });
});
