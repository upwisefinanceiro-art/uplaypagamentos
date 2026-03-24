import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await supabaseUser.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const { payment_id, action } = body;

    if (!payment_id) {
      return new Response(JSON.stringify({ error: "payment_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller is admin
    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const isAdmin = callerRoles?.some((r: { role: string }) =>
      r.role === "ADMIN_MASTER" || r.role === "ADMIN_UNIDADE"
    );

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get payment
    const { data: payment, error: payErr } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("id", payment_id)
      .single();

    if (payErr || !payment) {
      return new Response(JSON.stringify({ error: "Pagamento não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get unit with Asaas credentials
    const { data: unit, error: unitErr } = await supabaseAdmin
      .from("units")
      .select("asaas_api_key, asaas_base_url")
      .eq("id", payment.unit_id)
      .single();

    if (unitErr || !unit?.asaas_api_key) {
      return new Response(JSON.stringify({ error: "Unidade sem credenciais Asaas configuradas" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = unit.asaas_base_url || "https://api.asaas.com/v3";

    // ACTION: "refresh" - payment already has asaas_payment_id, just fetch updated data
    if (payment.asaas_payment_id) {
      const asaasRes = await fetch(`${baseUrl}/payments/${payment.asaas_payment_id}`, {
        headers: { access_token: unit.asaas_api_key },
      });

      if (!asaasRes.ok) {
        const errData = await asaasRes.json();
        return new Response(JSON.stringify({ error: "Erro ao consultar Asaas", details: errData }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const asaasData = await asaasRes.json();

      // Fetch PIX data if applicable
      let pixQrCode: string | null = payment.pix_qr_code;
      let pixCopyPaste: string | null = payment.pix_copy_paste;

      if (asaasData.billingType === "PIX" && (!pixQrCode || !pixCopyPaste)) {
        try {
          const pixRes = await fetch(`${baseUrl}/payments/${payment.asaas_payment_id}/pixQrCode`, {
            headers: { access_token: unit.asaas_api_key },
          });
          if (pixRes.ok) {
            const pixData = await pixRes.json();
            pixQrCode = pixData.encodedImage || null;
            pixCopyPaste = pixData.payload || null;
          }
        } catch { /* non-critical */ }
      }

      // Map Asaas status to our status
      const statusMap: Record<string, string> = {
        PENDING: "PENDING",
        RECEIVED: "PAID",
        CONFIRMED: "PAID",
        OVERDUE: "OVERDUE",
        REFUNDED: "CANCELLED",
        DELETED: "CANCELLED",
        RECEIVED_IN_CASH: "PAID",
      };

      const updateData: Record<string, unknown> = {
        invoice_url: asaasData.invoiceUrl || payment.invoice_url,
        boleto_url: asaasData.bankSlipUrl || payment.boleto_url,
        pix_qr_code: pixQrCode,
        pix_copy_paste: pixCopyPaste,
        checkout_url: asaasData.invoiceUrl || payment.checkout_url,
        status: statusMap[asaasData.status] || payment.status,
        raw_response: asaasData,
      };

      if (statusMap[asaasData.status] === "PAID" && !payment.paid_at) {
        updateData.paid_at = asaasData.paymentDate || new Date().toISOString();
      }

      await supabaseAdmin
        .from("payments")
        .update(updateData)
        .eq("id", payment_id);

      return new Response(JSON.stringify({
        success: true,
        action: "refreshed",
        invoice_url: updateData.invoice_url,
        boleto_url: updateData.boleto_url,
        pix_copy_paste: updateData.pix_copy_paste,
        status: updateData.status,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: "create" - payment has no asaas_payment_id, create charge in Asaas
    // Get responsible
    const { data: responsible, error: respErr } = await supabaseAdmin
      .from("profiles")
      .select("full_name, cpf, phone, email, asaas_customer_id")
      .eq("id", payment.responsible_id)
      .single();

    if (respErr || !responsible) {
      return new Response(JSON.stringify({ error: "Responsável não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure customer exists in Asaas
    let asaasCustomerId = responsible.asaas_customer_id;

    if (asaasCustomerId) {
      try {
        const checkRes = await fetch(`${baseUrl}/customers/${asaasCustomerId}`, {
          headers: { access_token: unit.asaas_api_key },
        });
        if (!checkRes.ok) asaasCustomerId = null;
      } catch {
        asaasCustomerId = null;
      }
    }

    if (!asaasCustomerId) {
      const cpfClean = responsible.cpf.replace(/\D/g, "");
      const customerPayload = {
        name: responsible.full_name,
        cpfCnpj: cpfClean,
        email: responsible.email || `${cpfClean}@ensinup.app`,
        mobilePhone: responsible.phone || undefined,
      };

      const customerRes = await fetch(`${baseUrl}/customers`, {
        method: "POST",
        headers: {
          access_token: unit.asaas_api_key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(customerPayload),
      });

      const customerData = await customerRes.json();
      if (!customerRes.ok) {
        return new Response(JSON.stringify({ error: "Erro ao criar customer no Asaas", details: customerData }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      asaasCustomerId = customerData.id;
      await supabaseAdmin.from("profiles").update({ asaas_customer_id: asaasCustomerId }).eq("id", payment.responsible_id);
    }

    // Determine billing type
    const billingTypeMap: Record<string, string> = {
      PIX: "PIX",
      BOLETO: "BOLETO",
      CARD: "CREDIT_CARD",
      ASAAS: "BOLETO", // Default ASAAS to BOLETO
      DINHEIRO: "UNDEFINED",
    };
    const billingType = billingTypeMap[payment.payment_method || "BOLETO"] || "BOLETO";

    // If DINHEIRO, we don't create in Asaas
    if (payment.payment_method === "DINHEIRO") {
      return new Response(JSON.stringify({ error: "Cobranças em dinheiro não são enviadas ao Asaas" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create charge in Asaas
    const chargePayload = {
      customer: asaasCustomerId,
      billingType,
      value: Number(payment.final_value ?? payment.value),
      dueDate: payment.due_date,
      description: payment.description || "Mensalidade EnsinUP",
    };

    const chargeRes = await fetch(`${baseUrl}/payments`, {
      method: "POST",
      headers: {
        access_token: unit.asaas_api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chargePayload),
    });

    const chargeData = await chargeRes.json();

    if (!chargeRes.ok) {
      return new Response(JSON.stringify({ error: "Erro ao criar cobrança no Asaas", details: chargeData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch PIX data if applicable
    let pixQrCode: string | null = null;
    let pixCopyPaste: string | null = null;

    if (billingType === "PIX" && chargeData.id) {
      try {
        const pixRes = await fetch(`${baseUrl}/payments/${chargeData.id}/pixQrCode`, {
          headers: { access_token: unit.asaas_api_key },
        });
        if (pixRes.ok) {
          const pixData = await pixRes.json();
          pixQrCode = pixData.encodedImage || null;
          pixCopyPaste = pixData.payload || null;
        }
      } catch { /* non-critical */ }
    }

    // Update payment record
    const updateData = {
      asaas_payment_id: chargeData.id,
      invoice_url: chargeData.invoiceUrl || null,
      boleto_url: chargeData.bankSlipUrl || null,
      checkout_url: chargeData.invoiceUrl || null,
      pix_qr_code: pixQrCode,
      pix_copy_paste: pixCopyPaste,
      raw_response: chargeData,
      payment_method: payment.payment_method === "ASAAS" ? "BOLETO" : payment.payment_method,
    };

    await supabaseAdmin
      .from("payments")
      .update(updateData)
      .eq("id", payment_id);

    return new Response(JSON.stringify({
      success: true,
      action: "created",
      asaas_payment_id: chargeData.id,
      invoice_url: updateData.invoice_url,
      boleto_url: updateData.boleto_url,
      pix_copy_paste: pixCopyPaste,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
