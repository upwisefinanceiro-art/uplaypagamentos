import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  console.error("[create-saas-charge] ERROR:", message);
  return jsonResponse({ success: false, error: message, message }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { company_id, unit_id: reqUnitId, action } = await req.json();

    if (!company_id && !reqUnitId) {
      return errorResponse("company_id ou unit_id é obrigatório");
    }

    // Resolve unit_id — either passed directly or find first unit of company
    let unitId = reqUnitId || null;
    if (!unitId && company_id) {
      const { data: firstUnit } = await supabase
        .from("units")
        .select("id")
        .eq("company_id", company_id)
        .limit(1)
        .maybeSingle();
      unitId = firstUnit?.id || null;
    }

    // Resolve company_id from unit if only unit_id was passed
    let resolvedCompanyId = company_id;
    if (!resolvedCompanyId && unitId) {
      const { data: unitData } = await supabase
        .from("units")
        .select("company_id")
        .eq("id", unitId)
        .maybeSingle();
      resolvedCompanyId = unitData?.company_id;
    }

    if (!resolvedCompanyId) {
      return errorResponse("Não foi possível resolver a empresa");
    }

    // Get company data
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("*")
      .eq("id", resolvedCompanyId)
      .single();

    if (companyErr || !company) {
      return errorResponse("Empresa não encontrada");
    }

    // Find master company (one with asaas_api_key_master configured)
    const { data: masterCompanies } = await supabase
      .from("companies")
      .select("id, asaas_api_key_master, asaas_base_url_master, valor_mensalidade, dias_bloqueio")
      .not("asaas_api_key_master", "is", null);

    const master = masterCompanies?.find(c => c.asaas_api_key_master) || null;

    if (!master?.asaas_api_key_master) {
      return errorResponse(
        "API Key Asaas Master não configurada. Vá em 'Minha Empresa' e configure a API Key do Asaas Master antes de gerar cobranças."
      );
    }

    const apiKey = master.asaas_api_key_master;
    const baseUrl = master.asaas_base_url_master || "https://api.asaas.com/v3";

    // Validate company data before calling Asaas
    if (!company.name || company.name.trim().length === 0) {
      return errorResponse("A empresa precisa ter um nome cadastrado.");
    }

    const cnpj = company.cnpj?.replace(/\D/g, "") || "";
    if (!cnpj || (cnpj.length !== 11 && cnpj.length !== 14)) {
      return errorResponse(
        `CPF/CNPJ inválido ou não cadastrado para a empresa "${company.name}". Cadastre um CNPJ (14 dígitos) ou CPF (11 dígitos) válido.`
      );
    }

    console.log("[create-saas-charge] Processando empresa:", {
      company_id,
      name: company.name,
      cnpj: cnpj.substring(0, 4) + "***",
      action: action || "generate",
    });

    // Get or create subscription — prefer unit_id lookup
    let { data: subscription } = unitId
      ? await supabase.from("saas_subscriptions").select("*").eq("unit_id", unitId).maybeSingle()
      : await supabase.from("saas_subscriptions").select("*").eq("company_id", resolvedCompanyId).maybeSingle();

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
          company_id: resolvedCompanyId,
          unit_id: unitId,
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
        return errorResponse("Erro ao criar assinatura: " + subErr.message, 500);
      }
      subscription = newSub;
      console.log("[create-saas-charge] Assinatura criada:", subscription.id);
    }

    // ACTION: sync — just return current state
    if (action === "sync") {
      return jsonResponse({ success: true, subscription });
    }

    // Step 1: Create or get Asaas customer
    let asaasCustomerId = subscription.asaas_customer_id;

    if (!asaasCustomerId) {
      console.log("[create-saas-charge] Criando customer no Asaas para:", company.name);

      const customerPayload: Record<string, unknown> = {
        name: company.name,
        cpfCnpj: cnpj,
        externalReference: company_id,
      };

      if (company.email) customerPayload.email = company.email;
      if (company.phone) customerPayload.phone = company.phone.replace(/\D/g, "");

      console.log("[create-saas-charge] Customer payload:", JSON.stringify(customerPayload));

      let custRes: Response;
      try {
        custRes = await fetch(`${baseUrl}/customers`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            access_token: apiKey,
          },
          body: JSON.stringify(customerPayload),
        });
      } catch (fetchErr) {
        console.error("[create-saas-charge] Erro de rede ao chamar Asaas:", fetchErr);
        return errorResponse("Erro de conexão com o Asaas. Verifique a URL e API Key Master.", 502);
      }

      const custText = await custRes.text();
      console.log("[create-saas-charge] Asaas customer response:", custRes.status, custText);

      if (!custRes.ok) {
        let errorMsg = "Erro ao criar cliente no Asaas";
        try {
          const custData = JSON.parse(custText);
          if (custData.errors?.length) {
            errorMsg = custData.errors.map((e: { description?: string }) => e.description || "Erro desconhecido").join(". ");
          } else if (custData.message) {
            errorMsg = custData.message;
          }
        } catch { /* use default */ }

        if (custRes.status === 401) {
          errorMsg = "API Key Asaas Master inválida ou sem permissão. Verifique em 'Minha Empresa'.";
        }

        return errorResponse(errorMsg);
      }

      let custData;
      try {
        custData = JSON.parse(custText);
      } catch {
        return errorResponse("Resposta inválida do Asaas ao criar cliente.");
      }

      asaasCustomerId = custData.id;
      console.log("[create-saas-charge] Customer criado:", asaasCustomerId);

      await supabase
        .from("saas_subscriptions")
        .update({ asaas_customer_id: asaasCustomerId })
        .eq("id", subscription.id);
    }

    // Step 2: Generate charge
    const dueDate = subscription.next_billing_date;
    const today = new Date().toISOString().split("T")[0];
    const adjustedDueDate = (dueDate && dueDate < today) ? today : (dueDate || today);

    const billingType = subscription.billing_type || "UNDEFINED";

    const chargePayload = {
      customer: asaasCustomerId,
      billingType,
      value: subscription.monthly_value,
      dueDate: adjustedDueDate,
      description: `Mensalidade SaaS - ${company.name}`,
      externalReference: `saas_${unitId || resolvedCompanyId}`,
    };

    console.log("[create-saas-charge] Charge payload:", JSON.stringify(chargePayload));

    let chargeRes: Response;
    try {
      chargeRes = await fetch(`${baseUrl}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          access_token: apiKey,
        },
        body: JSON.stringify(chargePayload),
      });
    } catch (fetchErr) {
      console.error("[create-saas-charge] Erro de rede ao criar cobrança:", fetchErr);
      return errorResponse("Erro de conexão com o Asaas ao gerar cobrança.", 502);
    }

    const chargeText = await chargeRes.text();
    console.log("[create-saas-charge] Asaas charge response:", chargeRes.status, chargeText);

    if (!chargeRes.ok) {
      let errorMsg = "Erro ao criar cobrança no Asaas";
      try {
        const chargeData = JSON.parse(chargeText);
        if (chargeData.errors?.length) {
          errorMsg = chargeData.errors.map((e: { description?: string }) => e.description || "Erro").join(". ");
        } else if (chargeData.message) {
          errorMsg = chargeData.message;
        }
      } catch { /* use default */ }

      if (chargeRes.status === 401) {
        errorMsg = "API Key Asaas Master inválida.";
      }

      return errorResponse(errorMsg);
    }

    let chargeData;
    try {
      chargeData = JSON.parse(chargeText);
    } catch {
      return errorResponse("Resposta inválida do Asaas ao criar cobrança.");
    }

    console.log("[create-saas-charge] Cobrança criada:", chargeData.id);

    // Save invoice
    const { data: invoice, error: invoiceErr } = await supabase
      .from("saas_invoices")
      .insert({
        company_id: resolvedCompanyId,
        unit_id: unitId,
        subscription_id: subscription.id,
        value: subscription.monthly_value,
        original_value: subscription.monthly_value,
        punctuality_discount: subscription.punctuality_discount || 0,
        billing_type: billingType,
        due_date: adjustedDueDate,
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
      console.error("[create-saas-charge] Erro ao salvar fatura:", invoiceErr);
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
        } else {
          const pixText = await pixRes.text();
          console.log("[create-saas-charge] PIX não disponível:", pixRes.status, pixText);
        }
      } catch (pixErr) {
        console.log("[create-saas-charge] PIX fetch falhou (não crítico):", pixErr);
      }
    }

    // Update next billing date
    const nextDate = new Date(adjustedDueDate);
    nextDate.setMonth(nextDate.getMonth() + 1);
    await supabase
      .from("saas_subscriptions")
      .update({ next_billing_date: nextDate.toISOString().split("T")[0] })
      .eq("id", subscription.id);

    return jsonResponse({
      success: true,
      message: "Cobrança gerada com sucesso!",
      asaas_customer_id: asaasCustomerId,
      asaas_payment_id: chargeData.id,
      invoice_url: chargeData.invoiceUrl,
      boleto_url: chargeData.bankSlipUrl,
      invoice,
    });
  } catch (err) {
    console.error("[create-saas-charge] Erro inesperado:", err);
    return errorResponse(err.message || "Erro interno ao processar cobrança.", 500);
  }
});
