import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

// Map form values to Asaas billingType
function resolveAsaasBillingType(bt: string | null | undefined): string {
  if (!bt || bt === "UNDEFINED") return "BOLETO"; // Asaas BOLETO generates boleto+pix automatically
  const map: Record<string, string> = {
    PIX: "PIX",
    BOLETO: "BOLETO",
    CREDIT_CARD: "CREDIT_CARD",
    CARTAO: "CREDIT_CARD",
    CARD: "CREDIT_CARD",
  };
  return map[bt] || "BOLETO";
}

async function fetchPixData(baseUrl: string, paymentId: string, apiKey: string) {
  try {
    // Small delay to let Asaas generate PIX
    await new Promise(r => setTimeout(r, 2000));

    const pixRes = await fetch(`${baseUrl}/payments/${paymentId}/pixQrCode`, {
      headers: { access_token: apiKey },
    });
    if (pixRes.ok) {
      const pixData = await pixRes.json();
      return {
        payload: pixData.payload || null,
        encodedImage: pixData.encodedImage || null,
      };
    }
    const errText = await pixRes.text();
    console.log("[create-saas-charge] PIX QR não disponível:", pixRes.status, errText);
    return { payload: null, encodedImage: null };
  } catch (err) {
    console.log("[create-saas-charge] PIX fetch falhou:", err);
    return { payload: null, encodedImage: null };
  }
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

    // Resolve unit_id and company_id
    let unitId = reqUnitId || null;
    let resolvedCompanyId = company_id || null;

    if (unitId && !resolvedCompanyId) {
      const { data: unitData } = await supabase
        .from("units")
        .select("company_id")
        .eq("id", unitId)
        .maybeSingle();
      resolvedCompanyId = unitData?.company_id;
    }

    if (!unitId && resolvedCompanyId) {
      const { data: firstUnit } = await supabase
        .from("units")
        .select("id")
        .eq("company_id", resolvedCompanyId)
        .limit(1)
        .maybeSingle();
      unitId = firstUnit?.id || null;
    }

    if (!resolvedCompanyId) {
      return errorResponse("Não foi possível resolver a empresa");
    }

    // ── 1. Get MASTER company ──
    const { data: masterCompany, error: companyErr } = await supabase
      .from("companies")
      .select("id, name, asaas_api_key_master, asaas_base_url_master, valor_mensalidade, dias_bloqueio, whatsapp_master")
      .eq("id", resolvedCompanyId)
      .single();

    if (companyErr || !masterCompany) {
      return errorResponse("Empresa não encontrada");
    }

    if (!masterCompany.asaas_api_key_master) {
      return errorResponse(
        "API Key Asaas Master não configurada. Vá em 'Minha Empresa' → aba 'Cobrança' e configure a API Key do Asaas Master antes de gerar cobranças SaaS."
      );
    }

    const apiKey = masterCompany.asaas_api_key_master;
    const baseUrl = masterCompany.asaas_base_url_master || "https://api.asaas.com/v3";

    // ── 2. Get UNIT/PARTNER data ──
    const { data: unit, error: unitErr } = await supabase
      .from("units")
      .select("id, name, cnpj, cpf, email_empresa, phone, whatsapp, address, bairro, cidade, estado, cep")
      .eq("id", unitId)
      .single();

    if (unitErr || !unit) {
      return errorResponse("Parceiro/unidade não encontrado");
    }

    if (!unit.name || unit.name.trim().length === 0) {
      return errorResponse("O parceiro precisa ter um nome cadastrado.");
    }

    const doc = (unit.cnpj || unit.cpf || "").replace(/\D/g, "");
    if (!doc || (doc.length !== 11 && doc.length !== 14)) {
      return errorResponse(
        `CPF/CNPJ inválido ou não cadastrado para o parceiro "${unit.name}". Cadastre um CNPJ (14 dígitos) ou CPF (11 dígitos) válido no cadastro do parceiro.`
      );
    }

    console.log("[create-saas-charge] Processando parceiro:", {
      unit_id: unitId,
      name: unit.name,
      doc: doc.substring(0, 4) + "***",
      masterCompany: masterCompany.name,
      action: action || "generate",
    });

    // ── 3. Get or create subscription ──
    let { data: subscription } = await supabase
      .from("saas_subscriptions")
      .select("*")
      .eq("unit_id", unitId)
      .maybeSingle();

    if (!subscription) {
      const dueDay = 10;
      const now = new Date();
      const nextBilling = new Date(now.getFullYear(), now.getMonth(), dueDay);
      if (nextBilling <= now) {
        nextBilling.setMonth(nextBilling.getMonth() + 1);
      }
      const blockDeadline = new Date(nextBilling);
      blockDeadline.setDate(blockDeadline.getDate() + (masterCompany.dias_bloqueio || 10));

      const { data: newSub, error: subErr } = await supabase
        .from("saas_subscriptions")
        .insert({
          company_id: resolvedCompanyId,
          unit_id: unitId,
          monthly_value: masterCompany.valor_mensalidade || 97,
          due_day: dueDay,
          next_billing_date: nextBilling.toISOString().split("T")[0],
          block_deadline: blockDeadline.toISOString().split("T")[0],
          status: "ACTIVE",
          plan: "BASIC",
          billing_type: "BOLETO",
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

    // ── 4. Create or get Asaas customer ──
    let asaasCustomerId = subscription.asaas_customer_id;

    if (asaasCustomerId) {
      try {
        const checkRes = await fetch(`${baseUrl}/customers/${asaasCustomerId}`, {
          headers: { access_token: apiKey },
        });
        if (!checkRes.ok) {
          console.log("[create-saas-charge] Customer inválido, recriando...");
          asaasCustomerId = null;
        }
        await checkRes.text();
      } catch {
        asaasCustomerId = null;
      }
    }

    if (!asaasCustomerId) {
      console.log("[create-saas-charge] Criando customer no Asaas MASTER para parceiro:", unit.name);

      const customerPayload: Record<string, unknown> = {
        name: unit.name,
        cpfCnpj: doc,
        externalReference: `saas_unit_${unitId}`,
      };

      if (unit.email_empresa) customerPayload.email = unit.email_empresa;
      const phone = (unit.whatsapp || unit.phone || "").replace(/\D/g, "");
      if (phone) customerPayload.mobilePhone = phone;
      if (unit.address) customerPayload.address = unit.address;
      if (unit.bairro) customerPayload.complement = unit.bairro;
      if (unit.cidade) customerPayload.cityName = unit.cidade;
      if (unit.estado) customerPayload.state = unit.estado;
      if (unit.cep) customerPayload.postalCode = unit.cep.replace(/\D/g, "");

      console.log("[create-saas-charge] Customer payload:", JSON.stringify(customerPayload));

      let custRes: Response;
      try {
        custRes = await fetch(`${baseUrl}/customers`, {
          method: "POST",
          headers: { "Content-Type": "application/json", access_token: apiKey },
          body: JSON.stringify(customerPayload),
        });
      } catch (fetchErr) {
        console.error("[create-saas-charge] Erro de rede:", fetchErr);
        return errorResponse("Erro de conexão com o Asaas. Verifique a URL e API Key Master em 'Minha Empresa'.", 502);
      }

      const custText = await custRes.text();
      console.log("[create-saas-charge] Asaas customer response:", custRes.status, custText);

      if (!custRes.ok) {
        let errorMsg = "Erro ao criar cliente no Asaas MASTER";
        try {
          const custData = JSON.parse(custText);
          if (custData.errors?.length) {
            errorMsg = custData.errors.map((e: { description?: string }) => e.description || "Erro desconhecido").join(". ");
          } else if (custData.message) {
            errorMsg = custData.message;
          }
        } catch { /* use default */ }

        if (custRes.status === 401) {
          errorMsg = "API Key Asaas Master inválida ou sem permissão. Verifique em 'Minha Empresa' → aba 'Cobrança'.";
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
      console.log("[create-saas-charge] Customer criado no Asaas MASTER:", asaasCustomerId);

      await supabase
        .from("saas_subscriptions")
        .update({ asaas_customer_id: asaasCustomerId })
        .eq("id", subscription.id);
    }

    // ── 5. Generate charge on Asaas MASTER ──
    const dueDate = subscription.next_billing_date;
    const today = new Date().toISOString().split("T")[0];
    const adjustedDueDate = (dueDate && dueDate < today) ? today : (dueDate || today);

    const billingType = resolveAsaasBillingType(subscription.billing_type);

    const finalValue = Math.max(
      subscription.monthly_value - (subscription.punctuality_discount || 0),
      0
    );

    const chargePayload = {
      customer: asaasCustomerId,
      billingType,
      value: finalValue > 0 ? finalValue : subscription.monthly_value,
      dueDate: adjustedDueDate,
      description: `Mensalidade SaaS - ${unit.name}`,
      externalReference: `saas_unit_${unitId}`,
    };

    console.log("[create-saas-charge] Charge payload:", JSON.stringify(chargePayload));

    let chargeRes: Response;
    try {
      chargeRes = await fetch(`${baseUrl}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", access_token: apiKey },
        body: JSON.stringify(chargePayload),
      });
    } catch (fetchErr) {
      console.error("[create-saas-charge] Erro de rede ao criar cobrança:", fetchErr);
      return errorResponse("Erro de conexão com o Asaas ao gerar cobrança.", 502);
    }

    const chargeText = await chargeRes.text();
    console.log("[create-saas-charge] Asaas charge response:", chargeRes.status, chargeText);

    if (!chargeRes.ok) {
      let errorMsg = "Erro ao criar cobrança no Asaas MASTER";
      try {
        const chargeData = JSON.parse(chargeText);
        if (chargeData.errors?.length) {
          errorMsg = chargeData.errors.map((e: { description?: string }) => e.description || "Erro").join(". ");
        } else if (chargeData.message) {
          errorMsg = chargeData.message;
        }
      } catch { /* use default */ }

      if (chargeRes.status === 401) {
        errorMsg = "API Key Asaas Master inválida. Verifique em 'Minha Empresa'.";
      }
      return errorResponse(errorMsg);
    }

    let chargeData;
    try {
      chargeData = JSON.parse(chargeText);
    } catch {
      return errorResponse("Resposta inválida do Asaas ao criar cobrança.");
    }

    console.log("[create-saas-charge] Cobrança criada no Asaas MASTER:", {
      id: chargeData.id,
      invoiceUrl: chargeData.invoiceUrl,
      bankSlipUrl: chargeData.bankSlipUrl,
      billingType: chargeData.billingType,
    });

    // ── 6. Save invoice ──
    const { data: invoice, error: invoiceErr } = await supabase
      .from("saas_invoices")
      .insert({
        company_id: resolvedCompanyId,
        unit_id: unitId,
        subscription_id: subscription.id,
        value: chargePayload.value,
        original_value: subscription.monthly_value,
        punctuality_discount: subscription.punctuality_discount || 0,
        billing_type: chargeData.billingType || billingType,
        due_date: adjustedDueDate,
        status: "PENDING",
        asaas_payment_id: chargeData.id,
        invoice_url: chargeData.invoiceUrl || null,
        boleto_url: chargeData.bankSlipUrl || null,
        pix_copy_paste: null,
        description: `Mensalidade SaaS - ${unit.name}`,
      })
      .select()
      .single();

    if (invoiceErr) {
      console.error("[create-saas-charge] Erro ao salvar fatura:", invoiceErr);
      return errorResponse("Cobrança criada no Asaas mas erro ao salvar no banco: " + invoiceErr.message, 500);
    }

    // ── 7. Always try to fetch PIX data (Asaas generates PIX for BOLETO too) ──
    let pixPayload: string | null = null;
    if (chargeData.id) {
      const pixData = await fetchPixData(baseUrl, chargeData.id, apiKey);
      pixPayload = pixData.payload;
      if (invoice && pixPayload) {
        await supabase
          .from("saas_invoices")
          .update({ pix_copy_paste: pixPayload })
          .eq("id", invoice.id);
        console.log("[create-saas-charge] PIX salvo para fatura:", invoice.id);
      }
    }

    // ── 8. Update next billing date ──
    const nextDate = new Date(adjustedDueDate);
    nextDate.setMonth(nextDate.getMonth() + 1);
    await supabase
      .from("saas_subscriptions")
      .update({ next_billing_date: nextDate.toISOString().split("T")[0] })
      .eq("id", subscription.id);

    console.log("[create-saas-charge] Próximo vencimento atualizado:", nextDate.toISOString().split("T")[0]);

    return jsonResponse({
      success: true,
      message: "Cobrança gerada com sucesso!",
      asaas_customer_id: asaasCustomerId,
      asaas_payment_id: chargeData.id,
      invoice_url: chargeData.invoiceUrl,
      boleto_url: chargeData.bankSlipUrl,
      pix_copy_paste: pixPayload,
      billing_type: chargeData.billingType || billingType,
      invoice,
    });
  } catch (err) {
    console.error("[create-saas-charge] Erro inesperado:", err);
    return errorResponse(err.message || "Erro interno ao processar cobrança.", 500);
  }
});
