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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    console.log("Asaas webhook received:", JSON.stringify(body));

    const event = body.event;
    const payment = body.payment;

    if (!event || !payment?.id) {
      return new Response(JSON.stringify({ received: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only process payment-related events
    const paymentEvents = [
      "PAYMENT_RECEIVED",
      "PAYMENT_CONFIRMED",
      "PAYMENT_OVERDUE",
      "PAYMENT_DELETED",
      "PAYMENT_REFUNDED",
      "PAYMENT_UPDATED",
      "PAYMENT_CREATED",
    ];

    if (!paymentEvents.includes(event)) {
      console.log("Event ignored:", event);
      return new Response(JSON.stringify({ received: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const asaasPaymentId = payment.id;

    // Find payment in our database
    const { data: localPayment, error: findErr } = await supabase
      .from("payments")
      .select("id, unit_id, status, paid_at, pix_qr_code, pix_copy_paste")
      .eq("asaas_payment_id", asaasPaymentId)
      .maybeSingle();

    if (findErr || !localPayment) {
      console.log("Payment not found locally for asaas_payment_id:", asaasPaymentId);
      return new Response(JSON.stringify({ received: true, found: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate webhook token if unit has one configured
    const webhookToken = req.headers.get("asaas-access-token");
    if (webhookToken) {
      const { data: unit } = await supabase
        .from("units")
        .select("asaas_webhook_token")
        .eq("id", localPayment.unit_id)
        .single();

      if (unit?.asaas_webhook_token && unit.asaas_webhook_token !== webhookToken) {
        console.error("Invalid webhook token");
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Map Asaas status
    const newStatus = statusMap[payment.status] || localPayment.status;

    const updateData: Record<string, unknown> = {
      status: newStatus,
      invoice_url: payment.invoiceUrl || undefined,
      boleto_url: payment.bankSlipUrl || undefined,
    };

    // Set paid_at if status changed to PAID
    if (newStatus === "PAID" && !localPayment.paid_at) {
      updateData.paid_at = payment.paymentDate || new Date().toISOString();
    }

    // Fetch PIX data if needed
    if (payment.billingType === "PIX" && (!localPayment.pix_qr_code || !localPayment.pix_copy_paste)) {
      try {
        const { data: unit } = await supabase
          .from("units")
          .select("asaas_api_key, asaas_base_url")
          .eq("id", localPayment.unit_id)
          .single();

        if (unit?.asaas_api_key) {
          const baseUrl = unit.asaas_base_url || "https://api.asaas.com/v3";
          const pixRes = await fetch(`${baseUrl}/payments/${asaasPaymentId}/pixQrCode`, {
            headers: { access_token: unit.asaas_api_key },
          });
          if (pixRes.ok) {
            const pixData = await pixRes.json();
            updateData.pix_qr_code = pixData.encodedImage || null;
            updateData.pix_copy_paste = pixData.payload || null;
          }
        }
      } catch { /* non-critical */ }
    }

    // Remove undefined values
    const cleanUpdate = Object.fromEntries(
      Object.entries(updateData).filter(([, v]) => v !== undefined)
    );

    const { error: updateErr } = await supabase
      .from("payments")
      .update(cleanUpdate)
      .eq("id", localPayment.id);

    if (updateErr) {
      console.error("Error updating payment:", updateErr);
    }

    console.log(`Payment ${localPayment.id} updated: ${localPayment.status} -> ${newStatus}`);

    return new Response(JSON.stringify({ received: true, updated: true, status: newStatus }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 200, // Always 200 to avoid Asaas retries
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
