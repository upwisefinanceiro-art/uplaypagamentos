import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const statusMap: Record<string, string> = {
  PENDING: "PENDING",
  RECEIVED: "PAID",
  CONFIRMED: "PAID",
  OVERDUE: "OVERDUE",
  REFUNDED: "CANCELLED",
  DELETED: "CANCELLED",
  RECEIVED_IN_CASH: "PAID",
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function getFaceValue(p: { value?: number | null; originalValue?: number | null }) {
  return roundCurrency(Number(p.originalValue ?? p.value ?? 0));
}

function getPaidAmount(p: { value?: number | null; originalValue?: number | null; receivedValue?: number | null }) {
  return roundCurrency(Number(p.receivedValue ?? p.value ?? p.originalValue ?? 0));
}

function getPunctualityDiscount(p: {
  value?: number | null;
  originalValue?: number | null;
  receivedValue?: number | null;
  discount?: { value?: number | null; type?: string | null } | null;
}) {
  const faceValue = getFaceValue(p);
  const dv = Number(p.discount?.value ?? 0);
  const cd = p.discount?.type === "PERCENTAGE" ? roundCurrency(faceValue * dv / 100) : roundCurrency(dv);
  const id = roundCurrency(Math.max(faceValue - getPaidAmount(p), 0));
  return Math.max(cd, id);
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, headers: Record<string, string>, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      const waitMs = Math.min(2000 * (i + 1), 10000);
      console.log(`[fix] Rate limited, waiting ${waitMs}ms...`);
      await sleep(waitMs);
      continue;
    }
    return res;
  }
  return fetch(url, { headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* */ }
  const unitId = typeof body.unit_id === "string" ? body.unit_id : null;
  const batchSize = typeof body.batch_size === "number" ? body.batch_size : 50;
  const startOffset = typeof body.offset === "number" ? body.offset : 0;

  let unitsQuery = supabase.from("units").select("id, asaas_api_key, asaas_base_url").not("asaas_api_key", "is", null);
  if (unitId) unitsQuery = unitsQuery.eq("id", unitId);
  const { data: units } = await unitsQuery;

  if (!units || units.length === 0) {
    return new Response(JSON.stringify({ error: "No units found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let fixed = 0;
  let errCount = 0;
  let totalProcessed = 0;

  for (const unit of units) {
    const baseUrl = unit.asaas_base_url || "https://api.asaas.com/v3";
    const apiKey = unit.asaas_api_key;

    let offset = startOffset;
    while (true) {
      const { data: payments } = await supabase
        .from("payments")
        .select("id, asaas_payment_id, status, value, final_value, original_value, punctuality_discount, paid_at")
        .eq("unit_id", unit.id)
        .not("asaas_payment_id", "is", null)
        .order("created_at", { ascending: true })
        .range(offset, offset + batchSize - 1);

      if (!payments || payments.length === 0) break;

      for (const payment of payments) {
        try {
          const res = await fetchWithRetry(`${baseUrl}/payments/${payment.asaas_payment_id}`, { access_token: apiKey });
          if (!res.ok) {
            console.log(`[fix] Failed ${payment.asaas_payment_id}: ${res.status}`);
            errCount++;
            continue;
          }

          const asaas = await res.json();
          const newStatus = statusMap[asaas.status] || payment.status;
          const faceValue = getFaceValue(asaas);
          const paidAmount = newStatus === "PAID" ? getPaidAmount(asaas) : faceValue;
          const discount = getPunctualityDiscount(asaas);

          const updateData: Record<string, unknown> = {
            value: faceValue,
            original_value: faceValue,
            final_value: paidAmount,
            punctuality_discount: discount,
            status: newStatus,
            raw_response: asaas,
          };

          if (newStatus === "PAID" && !payment.paid_at) {
            updateData.paid_at = asaas.paymentDate || new Date().toISOString();
          } else if (newStatus !== "PAID" && payment.paid_at) {
            updateData.paid_at = null;
          }

          await supabase.from("payments").update(updateData).eq("id", payment.id);
          fixed++;
        } catch (e) {
          console.log(`[fix] Error ${payment.asaas_payment_id}: ${e}`);
          errCount++;
        }
        totalProcessed++;

        // Rate limit: ~10 requests per second
        if (totalProcessed % 10 === 0) {
          await sleep(1100);
        }
      }

      if (payments.length < batchSize) break;
      offset += batchSize;
    }
  }

  return new Response(JSON.stringify({ success: true, fixed, errors: errCount, processed: totalProcessed }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
