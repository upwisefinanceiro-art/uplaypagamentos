import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, asaas-access-token",
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

async function logWebhook(
  supabase: ReturnType<typeof createClient>,
  data: {
    event: string;
    asaas_payment_id?: string;
    local_payment_id?: string;
    unit_id?: string;
    old_status?: string;
    new_status?: string;
    payload?: unknown;
    processed: boolean;
    error_message?: string;
  }
) {
  try {
    await supabase.from("webhook_logs").insert({
      event: data.event,
      asaas_payment_id: data.asaas_payment_id || null,
      local_payment_id: data.local_payment_id || null,
      unit_id: data.unit_id || null,
      old_status: data.old_status || null,
      new_status: data.new_status || null,
      payload: data.payload || null,
      processed: data.processed,
      error_message: data.error_message || null,
    });
  } catch (e) {
    console.error("Failed to write webhook log:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json();
    console.log("Asaas webhook received:", JSON.stringify(body));

    const event = body.event;
    const payment = body.payment;

    if (!event || !payment?.id) {
      await logWebhook(supabase, {
        event: event || "UNKNOWN",
        payload: body,
        processed: false,
        error_message: "Missing event or payment.id",
      });
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
      await logWebhook(supabase, {
        event,
        asaas_payment_id: payment.id,
        payload: body,
        processed: false,
        error_message: "Event type not handled",
      });
      return new Response(JSON.stringify({ received: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const asaasPaymentId = payment.id;

    // Check if this is a SaaS invoice payment first
    const { data: saasInvoice } = await supabase
      .from("saas_invoices")
      .select("id, company_id, status, subscription_id")
      .eq("asaas_payment_id", asaasPaymentId)
      .maybeSingle();

    if (saasInvoice) {
      // Handle SaaS invoice payment
      const saasStatus = statusMap[payment.status] || saasInvoice.status;
      
      const saasUpdate: Record<string, unknown> = { status: saasStatus };
      if (saasStatus === "PAID" && payment.paymentDate) {
        saasUpdate.paid_at = payment.paymentDate;
      }
      if (payment.invoiceUrl) saasUpdate.invoice_url = payment.invoiceUrl;
      if (payment.bankSlipUrl) saasUpdate.boleto_url = payment.bankSlipUrl;

      await supabase.from("saas_invoices").update(saasUpdate).eq("id", saasInvoice.id);

      // Auto-reactivate company on payment
      if (saasStatus === "PAID") {
        // Reactivate company
        await supabase.from("companies").update({ status: "ATIVO" }).eq("id", saasInvoice.company_id);

        // Update subscription: set ACTIVE, advance next billing date
        if (saasInvoice.subscription_id) {
          const { data: sub } = await supabase
            .from("saas_subscriptions")
            .select("due_day, next_billing_date")
            .eq("id", saasInvoice.subscription_id)
            .single();

          if (sub) {
            const now = new Date();
            const dueDay = sub.due_day || 10;
            let nextBilling = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
            
            // Get dias_bloqueio from company config
            const { data: masterCo } = await supabase
              .from("companies")
              .select("dias_bloqueio")
              .not("asaas_api_key_master", "is", null)
              .limit(1)
              .maybeSingle();
            
            const diasBloqueio = masterCo?.dias_bloqueio || 10;
            const blockDeadline = new Date(nextBilling);
            blockDeadline.setDate(blockDeadline.getDate() + diasBloqueio);

            await supabase
              .from("saas_subscriptions")
              .update({
                status: "ACTIVE",
                next_billing_date: nextBilling.toISOString().split("T")[0],
                block_deadline: blockDeadline.toISOString().split("T")[0],
              })
              .eq("id", saasInvoice.subscription_id);
          }
        }
      } else if (saasStatus === "OVERDUE") {
        await supabase.from("companies").update({ status: "ATRASADO" }).eq("id", saasInvoice.company_id);
        if (saasInvoice.subscription_id) {
          await supabase.from("saas_subscriptions").update({ status: "OVERDUE" }).eq("id", saasInvoice.subscription_id);
        }
      }

      await logWebhook(supabase, {
        event,
        asaas_payment_id: asaasPaymentId,
        local_payment_id: saasInvoice.id,
        old_status: saasInvoice.status,
        new_status: saasStatus,
        payload: body,
        processed: true,
      });

      console.log(`SaaS invoice ${saasInvoice.id} updated: ${saasInvoice.status} -> ${saasStatus}`);
      return new Response(JSON.stringify({ received: true, updated: true, type: "saas", status: saasStatus }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find payment in our database (regular unit payments)
    const { data: localPayment, error: findErr } = await supabase
      .from("payments")
      .select("id, unit_id, status, paid_at, pix_qr_code, pix_copy_paste, payment_method")
      .eq("asaas_payment_id", asaasPaymentId)
      .maybeSingle();

    if (findErr || !localPayment) {
      await logWebhook(supabase, {
        event,
        asaas_payment_id: asaasPaymentId,
        payload: body,
        processed: false,
        error_message: findErr?.message || "Payment not found locally",
      });
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
        await logWebhook(supabase, {
          event,
          asaas_payment_id: asaasPaymentId,
          local_payment_id: localPayment.id,
          unit_id: localPayment.unit_id,
          payload: body,
          processed: false,
          error_message: "Invalid webhook token",
        });
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Map Asaas status
    const oldStatus = localPayment.status;
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

    // Save billing type from Asaas if we don't have a payment_method yet
    if (payment.billingType && !localPayment.payment_method) {
      const billingTypeMap: Record<string, string> = {
        PIX: "PIX",
        BOLETO: "BOLETO",
        CREDIT_CARD: "CARD",
        UNDEFINED: "BOLETO",
      };
      updateData.payment_method = billingTypeMap[payment.billingType] || payment.billingType;
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
      await logWebhook(supabase, {
        event,
        asaas_payment_id: asaasPaymentId,
        local_payment_id: localPayment.id,
        unit_id: localPayment.unit_id,
        old_status: oldStatus,
        new_status: newStatus,
        payload: body,
        processed: false,
        error_message: updateErr.message,
      });
    } else {
      await logWebhook(supabase, {
        event,
        asaas_payment_id: asaasPaymentId,
        local_payment_id: localPayment.id,
        unit_id: localPayment.unit_id,
        old_status: oldStatus,
        new_status: newStatus,
        payload: body,
        processed: true,
      });
    }

    console.log(`Payment ${localPayment.id} updated: ${oldStatus} -> ${newStatus}`);

    return new Response(JSON.stringify({ received: true, updated: true, status: newStatus }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    await logWebhook(supabase, {
      event: "ERROR",
      payload: null,
      processed: false,
      error_message: err instanceof Error ? err.message : "Internal error",
    });
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 200, // Always 200 to avoid Asaas retries
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
