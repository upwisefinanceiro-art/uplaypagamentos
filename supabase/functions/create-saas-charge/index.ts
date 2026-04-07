import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { company_id, action } = await req.json();

    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get company data
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("*")
      .eq("id", company_id)
      .single();

    if (companyErr || !company) {
      return new Response(JSON.stringify({ error: "Empresa não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the MASTER company (the platform owner) — the one with asaas_api_key_master set
    // We need to find which company owns the platform. Look for company with MASTER API key.
    // The caller's company IS the master if they're SUPER_ADMIN,
    // OR we need to find the master company that has api key configured.
    // For SaaS billing, the master company charges OTHER companies.
    // So we need the master company's Asaas credentials.
    
    // Find master company (one with asaas_api_key_master configured)
    const { data: masterCompanies } = await supabase
      .from("companies")
      .select("id, asaas_api_key_master, asaas_base_url_master, valor_mensalidade, dias_bloqueio")
      .not("asaas_api_key_master", "is", null);

    const master = masterCompanies?.find(c => c.asaas_api_key_master) || null;

    if (!master?.asaas_api_key_master) {
      return new Response(JSON.stringify({ error: "API Asaas Master não configurada. Configure em Minha Empresa." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = master.asaas_api_key_master;
    const baseUrl = master.asaas_base_url_master || "https://api.asaas.com/v3";

    // Get or create subscription
    let { data: subscription } = await supabase
      .from("saas_subscriptions")
      .select("*")
      .eq("company_id", company_id)
      .maybeSingle();

    if (!subscription) {
      const dueDay = 10;
      const now = new Date();
      const nextBilling = new Date(now.getFullYear(), now.getMonth(), dueDay);
      if (nextBilling <= now) {
        nextBilling.setMonth(nextBilling.getMonth() + 1);
      }
      const blockDeadline = new Date(nextBilling);
      blockDeadline.setDate(blockDeadline.getDate() + (master.dias_bloqueio || 10));

      const { data: newSub, error: subErr } = await supabase
        .from("saas_subscriptions")
        .insert({
          company_id,
          monthly_value: master.valor_mensalidade || 97,
          due_day: dueDay,
          next_billing_date: nextBilling.toISOString().split("T")[0],
          block_deadline: blockDeadline.toISOString().split("T")[0],
          status: "ACTIVE",
          plan: company.plan || "BASIC",
        })
        .select()
        .single();

      if (subErr) {
        return new Response(JSON.stringify({ error: "Erro ao criar assinatura: " + subErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      subscription = newSub;
    }

    // ACTION: sync — just return current state
    if (action === "sync") {
      return new Response(JSON.stringify({ success: true, subscription }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Create or get Asaas customer
    let asaasCustomerId = subscription.asaas_customer_id;

    if (!asaasCustomerId) {
      const customerPayload: Record<string, unknown> = {
        name: company.name,
        email: company.email || undefined,
        phone: company.phone?.replace(/\D/g, "") || undefined,
        cpfCnpj: company.cnpj?.replace(/\D/g, "") || undefined,
        externalReference: company_id,
      };

      // Remove undefined values
      Object.keys(customerPayload).forEach(k => {
        if (customerPayload[k] === undefined) delete customerPayload[k];
      });

      const custRes = await fetch(`${baseUrl}/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          access_token: apiKey,
        },
        body: JSON.stringify(customerPayload),
      });

      const custData = await custRes.json();

      if (!custRes.ok) {
        return new Response(JSON.stringify({
          error: "Erro ao criar customer no Asaas",
          details: custData,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      asaasCustomerId = custData.id;

      await supabase
        .from("saas_subscriptions")
        .update({ asaas_customer_id: asaasCustomerId })
        .eq("id", subscription.id);
    }

    // Step 2: Generate charge
    const dueDate = subscription.next_billing_date;
    let adjustedDueDate = dueDate;

    // If due date is in the past, set to today
    const today = new Date().toISOString().split("T")[0];
    if (dueDate && dueDate < today) {
      adjustedDueDate = today;
    }

    // Use billing_type from subscription if configured
    const billingType = subscription.billing_type || "UNDEFINED";

    const chargePayload = {
      customer: asaasCustomerId,
      billingType,
      value: subscription.monthly_value,
      dueDate: adjustedDueDate || today,
      description: `Mensalidade SaaS - ${company.name}`,
      externalReference: `saas_${company_id}`,
    };

    const chargeRes = await fetch(`${baseUrl}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: apiKey,
      },
      body: JSON.stringify(chargePayload),
    });

    const chargeData = await chargeRes.json();

    if (!chargeRes.ok) {
      return new Response(JSON.stringify({
        error: "Erro ao criar cobrança no Asaas",
        details: chargeData,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save invoice
    const { data: invoice, error: invoiceErr } = await supabase
      .from("saas_invoices")
      .insert({
        company_id,
        subscription_id: subscription.id,
        value: subscription.monthly_value,
        original_value: subscription.monthly_value,
        punctuality_discount: subscription.punctuality_discount || 0,
        billing_type: billingType,
        due_date: adjustedDueDate || today,
        status: "PENDING",
        asaas_payment_id: chargeData.id,
        invoice_url: chargeData.invoiceUrl || null,
        boleto_url: chargeData.bankSlipUrl || null,
        pix_copy_paste: null,
        description: `Mensalidade SaaS - ${company.name}`,
      })
      .select()
      .single();

    if (invoiceErr) {
      console.error("Error saving invoice:", invoiceErr);
    }

    // Try to fetch PIX data
    if (chargeData.id) {
      try {
        const pixRes = await fetch(`${baseUrl}/payments/${chargeData.id}/pixQrCode`, {
          headers: { access_token: apiKey },
        });
        if (pixRes.ok) {
          const pixData = await pixRes.json();
          if (invoice && (pixData.payload || pixData.encodedImage)) {
            await supabase
              .from("saas_invoices")
              .update({ pix_copy_paste: pixData.payload || null })
              .eq("id", invoice.id);
          }
        }
      } catch { /* non-critical */ }
    }

    return new Response(JSON.stringify({
      success: true,
      asaas_customer_id: asaasCustomerId,
      asaas_payment_id: chargeData.id,
      invoice_url: chargeData.invoiceUrl,
      boleto_url: chargeData.bankSlipUrl,
      invoice,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-saas-charge error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
