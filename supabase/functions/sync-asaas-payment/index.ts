import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validateCpf(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11 && clean.length !== 14) return false;
  if (/^(\d)\1+$/.test(clean)) return false;
  return true;
}

// Grava falha de emissão na própria parcela (apenas para fluxo CREATE)
async function recordEmissionError(
  admin: any,
  paymentId: string,
  code: string,
  message: string,
  payload?: unknown,
  response?: unknown,
) {
  try {
    const { data: cur } = await admin
      .from("payments").select("emission_attempts").eq("id", paymentId).maybeSingle();
    const attempts = (cur?.emission_attempts ?? 0) + 1;
    await admin.from("payments").update({
      emission_status: "ERROR",
      emission_error_code: code,
      emission_error_message: message,
      emission_payload: payload ?? null,
      emission_response: response ?? null,
      emission_last_attempt_at: new Date().toISOString(),
      emission_attempts: attempts,
      gateway: "ASAAS",
      updated_at: new Date().toISOString(),
    }).eq("id", paymentId);
  } catch (e) {
    console.error("[sync-asaas-payment] failed to record emission error", e);
  }
}

function mapAsaasStatus(status?: string | null): string | null {
  const statusMap: Record<string, string> = {
    PENDING: "PENDING",
    RECEIVED: "PAID",
    CONFIRMED: "PAID",
    OVERDUE: "OVERDUE",
    REFUNDED: "CANCELLED",
    DELETED: "CANCELLED",
    RECEIVED_IN_CASH: "PAID",
  };

  if (!status) return null;
  return statusMap[status] || null;
}

function mapBillingTypeToPaymentMethod(billingType?: string | null): string | null {
  const billingTypeMap: Record<string, string> = {
    PIX: "PIX",
    BOLETO: "BOLETO",
    CREDIT_CARD: "CARD",
  };

  if (!billingType) return null;
  return billingTypeMap[billingType] || null;
}

function resolvePaymentStatus(currentStatus: string, asaasStatus?: string | null, paymentDate?: string | null) {
  const mappedStatus = mapAsaasStatus(asaasStatus) || currentStatus;

  if (paymentDate) return "PAID";
  if (currentStatus === "PAID" && mappedStatus !== "PAID" && mappedStatus !== "CANCELLED") return "PAID";
  if (currentStatus === "CANCELLED") return "CANCELLED";

  return mappedStatus;
}

async function fetchPixData(baseUrl: string, asaasPaymentId: string, apiKey: string) {
  try {
    const pixRes = await fetch(`${baseUrl}/payments/${asaasPaymentId}/pixQrCode`, {
      headers: { access_token: apiKey },
    });

    if (!pixRes.ok) {
      console.warn("[sync-asaas-payment] não foi possível buscar PIX", JSON.stringify({ asaasPaymentId, status: pixRes.status }));
      return { encodedImage: null, payload: null };
    }

    const pixData = await pixRes.json();
    return {
      encodedImage: pixData.encodedImage || null,
      payload: pixData.payload || null,
    };
  } catch (error) {
    console.warn("[sync-asaas-payment] erro ao buscar PIX", JSON.stringify({ asaasPaymentId, error: error instanceof Error ? error.message : String(error) }));
    return { encodedImage: null, payload: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ error: "Não autorizado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await supabaseUser.auth.getUser();
    if (!caller) return respond({ error: "Não autorizado" }, 401);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const { payment_id } = body;

    if (!payment_id) return respond({ error: "payment_id é obrigatório" }, 400);

    // Check caller roles
    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const isAdmin = callerRoles?.some((r: { role: string }) =>
      r.role === "ADMIN_MASTER" || r.role === "ADMIN_UNIDADE"
    );
    const isResponsavel = callerRoles?.some((r: { role: string }) =>
      r.role === "RESPONSAVEL"
    );

    if (!isAdmin && !isResponsavel) return respond({ error: "Sem permissão" }, 403);

    // Get payment
    const { data: payment, error: payErr } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("id", payment_id)
      .single();

    if (payErr || !payment) return respond({ error: "Pagamento não encontrado" }, 404);

    // GUARD: nunca tocar parcelas marcadas como CORA — provider é decidido na criação
    if ((payment.gateway || "").toUpperCase() === "CORA") {
      console.warn("[sync-asaas-payment] BLOQUEADO: parcela com gateway=CORA", JSON.stringify({ payment_id, gateway: payment.gateway }));
      return respond({ error: "Esta parcela foi criada com gateway Banco Cora. Use 'Emitir boleto Cora' para emiti-la." }, 400);
    }

    // RESPONSAVEL can only sync their own payments
    if (isResponsavel && !isAdmin) {
      if (payment.responsible_id !== caller.id) {
        return respond({ error: "Sem permissão para esta cobrança" }, 403);
      }
      // RESPONSAVEL can only refresh existing asaas payments, not create new ones
      if (!payment.asaas_payment_id) {
        return respond({ error: "Esta cobrança ainda não foi enviada ao Asaas. Entre em contato com o financeiro." }, 400);
      }
    }

    console.log("[sync-asaas-payment] cobrança carregada do banco", JSON.stringify({
      payment_id,
      caller_id: caller.id,
      caller_role: isAdmin ? "ADMIN" : "RESPONSAVEL",
      asaas_payment_id: payment.asaas_payment_id,
      payment_method: payment.payment_method,
      status: payment.status,
      due_date: payment.due_date,
      unit_id: payment.unit_id,
      invoice_url: Boolean(payment.invoice_url),
      boleto_url: Boolean(payment.boleto_url),
      pix_copy_paste: Boolean(payment.pix_copy_paste),
    }));

    // Get unit with Asaas credentials
    const { data: unit, error: unitErr } = await supabaseAdmin
      .from("units")
      .select("id, name, asaas_api_key, asaas_base_url")
      .eq("id", payment.unit_id)
      .single();

    if (unitErr || !unit?.asaas_api_key) {
      const msg = "Credencial do banco Asaas não configurada para esta unidade.";
      // só registra emission se for fluxo de criação (sem asaas_payment_id)
      if (!payment.asaas_payment_id) {
        await recordEmissionError(supabaseAdmin, payment_id, "UNIT_CREDENTIALS_MISSING", msg);
      }
      return respond({ error: msg }, 400);
    }

    console.log("[sync-asaas-payment] unidade identificada", JSON.stringify({
      unit_id: unit.id,
      unit_name: unit.name,
      base_url: unit.asaas_base_url || "https://api.asaas.com/v3",
    }));

    const baseUrl = unit.asaas_base_url || "https://api.asaas.com/v3";

    // ── REFRESH: payment already has asaas_payment_id ──
    if (payment.asaas_payment_id) {
      console.log("[sync-asaas-payment] chamada ao Asaas iniciada", JSON.stringify({ payment_id, asaas_payment_id: payment.asaas_payment_id, mode: "refresh" }));
      const asaasRes = await fetch(`${baseUrl}/payments/${payment.asaas_payment_id}`, {
        headers: { access_token: unit.asaas_api_key },
      });

      if (!asaasRes.ok) {
        const errData = await asaasRes.json().catch(() => ({}));
        return respond({
          error: "Erro ao consultar Asaas",
          details: errData?.errors?.[0]?.description || JSON.stringify(errData),
        }, 502);
      }

      const asaasData = await asaasRes.json();
      console.log("[sync-asaas-payment] resposta da API recebida", JSON.stringify({
        payment_id,
        asaas_payment_id: payment.asaas_payment_id,
        billingType: asaasData.billingType,
        status: asaasData.status,
        invoiceUrl: Boolean(asaasData.invoiceUrl),
        bankSlipUrl: Boolean(asaasData.bankSlipUrl),
      }));

      // Fetch PIX data if applicable
      let pixQrCode: string | null = payment.pix_qr_code;
      let pixCopyPaste: string | null = payment.pix_copy_paste;

      if (asaasData.billingType === "PIX" && (!pixQrCode || !pixCopyPaste)) {
        const pixData = await fetchPixData(baseUrl, payment.asaas_payment_id, unit.asaas_api_key);
        pixQrCode = pixData.encodedImage || null;
        pixCopyPaste = pixData.payload || null;
      }

      const resolvedStatus = resolvePaymentStatus(payment.status, asaasData.status, asaasData.paymentDate);
      const resolvedMethod = mapBillingTypeToPaymentMethod(asaasData.billingType) || payment.payment_method || null;

      const updateData: Record<string, unknown> = {
        invoice_url: asaasData.invoiceUrl || payment.invoice_url,
        boleto_url: asaasData.bankSlipUrl || payment.boleto_url,
        boleto_barcode: asaasData.identificationField || payment.boleto_barcode,
        pix_qr_code: pixQrCode,
        pix_copy_paste: pixCopyPaste,
        checkout_url: asaasData.invoiceUrl || payment.checkout_url,
        status: resolvedStatus,
        payment_method: resolvedMethod,
        due_date: asaasData.dueDate || payment.due_date,
        raw_response: asaasData,
      };

      if (resolvedStatus === "PAID") {
        if (!payment.paid_at) {
          updateData.paid_at = asaasData.paymentDate || new Date().toISOString();
        }
        // ── VALOR BRUTO (cliente sempre vê o valor cheio cobrado/pago) ──
        // Fonte da verdade: Asaas.value (BRUTO). NUNCA usar netValue (líquido) aqui,
        // pois o netValue é o valor descontado da taxa Asaas — isso é despesa interna,
        // exibida apenas no painel /admin/taxas-asaas.
        const originalValue = Number(payment.original_value ?? payment.value);
        const asaasValue = typeof asaasData.value === "number" ? asaasData.value : null;
        const realPaidValue = Number(asaasValue ?? originalValue);
        if (Number.isFinite(realPaidValue) && realPaidValue > 0) {
          updateData.final_value = realPaidValue;
        }
      }

      const { error: updateErr } = await supabaseAdmin.from("payments").update(updateData).eq("id", payment_id);
      if (updateErr) {
        console.error("[sync-asaas-payment] erro ao salvar campos no banco", JSON.stringify({ payment_id, error: updateErr.message }));
        return respond({ error: "Não foi possível salvar os dados sincronizados da cobrança" }, 500);
      }

      console.log("[sync-asaas-payment] campos salvos no banco", JSON.stringify({
        payment_id,
        payment_method: resolvedMethod,
        status: resolvedStatus,
        due_date: updateData.due_date,
        invoice_url: Boolean(updateData.invoice_url),
        boleto_url: Boolean(updateData.boleto_url),
        pix_copy_paste: Boolean(updateData.pix_copy_paste),
      }));

      return respond({
        success: true,
        action: "refreshed",
        invoice_url: updateData.invoice_url,
        boleto_url: updateData.boleto_url,
        checkout_url: updateData.checkout_url,
        pix_copy_paste: updateData.pix_copy_paste,
        pix_qr_code: updateData.pix_qr_code,
        status: updateData.status,
        due_date: updateData.due_date,
        payment_method: updateData.payment_method,
        billing_type: asaasData.billingType || null,
        customer: asaasData.customer || null,
        value: asaasData.value ?? payment.final_value ?? payment.value,
      });
    }

    // ── CREATE: payment has no asaas_payment_id ──
    // Only admins can create charges in Asaas
    if (!isAdmin) {
      return respond({ error: "Esta cobrança ainda não foi enviada ao Asaas. Entre em contato com o financeiro." }, 400);
    }

    // Skip DINHEIRO
    if (payment.payment_method === "DINHEIRO") {
      return respond({ error: "Cobranças em dinheiro não são enviadas ao Asaas" }, 400);
    }

    // Get responsible
    const { data: responsible, error: respErr } = await supabaseAdmin
      .from("profiles")
      .select("full_name, cpf, phone, email, asaas_customer_id")
      .eq("id", payment.responsible_id)
      .single();

    if (respErr || !responsible) {
      await recordEmissionError(supabaseAdmin, payment_id, "RESPONSIBLE_NOT_FOUND", "Responsável não encontrado.");
      return respond({ error: "Responsável não encontrado" }, 404);
    }

    // ── VALIDATE required fields ──
    if (!responsible.cpf || responsible.cpf.trim() === "") {
      const msg = "CPF do responsável não está cadastrado.";
      await recordEmissionError(supabaseAdmin, payment_id, "VALIDATION_ERROR", msg);
      return respond({ error: msg }, 400);
    }

    const cpfClean = responsible.cpf.replace(/\D/g, "");

    if (!validateCpf(cpfClean)) {
      const msg = `CPF do responsável é inválido: ${responsible.cpf}.`;
      await recordEmissionError(supabaseAdmin, payment_id, "VALIDATION_ERROR", msg);
      return respond({ error: msg }, 400);
    }

    if (!responsible.full_name || responsible.full_name.trim().length < 3) {
      const msg = "Nome do responsável é obrigatório e deve ter pelo menos 3 caracteres.";
      await recordEmissionError(supabaseAdmin, payment_id, "VALIDATION_ERROR", msg);
      return respond({ error: msg }, 400);
    }

    // ── Ensure customer exists in Asaas ──
    let asaasCustomerId = responsible.asaas_customer_id;

    if (asaasCustomerId) {
      try {
        const checkRes = await fetch(`${baseUrl}/customers/${asaasCustomerId}`, {
          headers: { access_token: unit.asaas_api_key },
        });
        if (!checkRes.ok) {
          console.log(`Customer ${asaasCustomerId} inválido no Asaas, recriando...`);
          asaasCustomerId = null;
        }
      } catch {
        asaasCustomerId = null;
      }
    }

    if (!asaasCustomerId) {
      const customerPayload: Record<string, unknown> = {
        name: responsible.full_name.trim(),
        cpfCnpj: cpfClean,
        email: responsible.email || `${cpfClean}@uplay.app`,
        notificationDisabled: false,
      };

      // Only add phone if valid
      if (responsible.phone) {
        const phoneClean = responsible.phone.replace(/\D/g, "");
        if (phoneClean.length >= 10 && phoneClean.length <= 11) {
          customerPayload.mobilePhone = phoneClean;
          customerPayload.phone = phoneClean;
        }
      }

      console.log("Criando customer no Asaas:", JSON.stringify(customerPayload));

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
        const detail = customerData?.errors?.[0]?.description
          || customerData?.errors?.[0]?.code
          || JSON.stringify(customerData);
        const msg = `Erro ao criar cliente no Asaas: ${detail}`;
        console.error("Asaas customer error:", JSON.stringify(customerData));
        await recordEmissionError(supabaseAdmin, payment_id, "ASAAS_CUSTOMER_ERROR", msg, customerPayload, customerData);
        return respond({
          error: msg,
          details: customerData,
        }, 502);
      }

      asaasCustomerId = customerData.id;
      await supabaseAdmin.from("profiles").update({ asaas_customer_id: asaasCustomerId }).eq("id", payment.responsible_id);
      console.log("Customer criado:", asaasCustomerId);
    } else if (responsible.phone) {
      // Garante mobilePhone no customer existente (essencial para WhatsApp)
      const phoneClean = responsible.phone.replace(/\D/g, "");
      if (phoneClean.length >= 10 && phoneClean.length <= 11) {
        try {
          await fetch(`${baseUrl}/customers/${asaasCustomerId}`, {
            method: "POST",
            headers: { access_token: unit.asaas_api_key, "Content-Type": "application/json" },
            body: JSON.stringify({ mobilePhone: phoneClean, phone: phoneClean, notificationDisabled: false }),
          });
        } catch (e) { console.warn("update customer mobilePhone falhou", e); }
      }
    }

    // Configura notificações: WhatsApp ON / Email+SMS OFF (idempotente)
    try {
      const notifRes = await fetch(`${baseUrl}/customers/${asaasCustomerId}/notifications`, {
        headers: { access_token: unit.asaas_api_key },
      });
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        const items: Array<{ id: string }> = notifData?.data || [];
        for (const n of items) {
          await fetch(`${baseUrl}/notifications/${n.id}`, {
            method: "PUT",
            headers: { access_token: unit.asaas_api_key, "Content-Type": "application/json" },
            body: JSON.stringify({
              enabled: true,
              emailEnabledForProvider: false,
              emailEnabledForCustomer: false,
              smsEnabledForProvider: false,
              smsEnabledForCustomer: false,
              phoneCallEnabledForCustomer: false,
              whatsappEnabledForProvider: true,
              whatsappEnabledForCustomer: true,
            }),
          });
        }
        console.log(`Notificações WhatsApp-only configuradas para ${items.length} eventos`);
      }
    } catch (e) {
      console.warn("Falha ao configurar notificações WhatsApp-only:", e);
    }


    // ── Determine billing type ──
    const billingTypeMap: Record<string, string> = {
      PIX: "PIX",
      BOLETO: "BOLETO",
      CARD: "CREDIT_CARD",
      ASAAS: "BOLETO",
    };
    const billingType = billingTypeMap[payment.payment_method || "BOLETO"] || "BOLETO";

    // ── Create charge ──
    // Asaas does not accept due dates in the past; use today as minimum
    const todayStr = new Date().toISOString().slice(0, 10);
    const effectiveDueDate = payment.due_date < todayStr ? todayStr : payment.due_date;

    const chargePayload = {
      customer: asaasCustomerId,
      billingType,
      value: Number(payment.final_value ?? payment.value),
      dueDate: effectiveDueDate,
      description: payment.description || "Mensalidade UPLAY",
    };

    console.log("Criando cobrança no Asaas:", JSON.stringify(chargePayload));
    console.log("[sync-asaas-payment] chamada ao Asaas iniciada", JSON.stringify({ payment_id, mode: "create", billingType, dueDate: payment.due_date }));

    const chargeRes = await fetch(`${baseUrl}/payments`, {
      method: "POST",
      headers: {
        access_token: unit.asaas_api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chargePayload),
    });

    const chargeData = await chargeRes.json();
    console.log("[sync-asaas-payment] resposta da API recebida", JSON.stringify({
      payment_id,
      asaas_payment_id: chargeData?.id || null,
      billingType: chargeData?.billingType || billingType,
      status: chargeData?.status || null,
      invoiceUrl: Boolean(chargeData?.invoiceUrl),
      bankSlipUrl: Boolean(chargeData?.bankSlipUrl),
    }));

    if (!chargeRes.ok) {
      const detail = chargeData?.errors?.[0]?.description
        || chargeData?.errors?.[0]?.code
        || JSON.stringify(chargeData);
      console.error("Asaas charge error:", JSON.stringify(chargeData));
      return respond({
        error: `Erro ao criar cobrança no Asaas: ${detail}`,
        details: chargeData,
      }, 502);
    }

    console.log("Cobrança criada:", chargeData.id);

    // ── Fetch PIX data if applicable ──
    let pixQrCode: string | null = null;
    let pixCopyPaste: string | null = null;

    if (billingType === "PIX" && chargeData.id) {
      const pixData = await fetchPixData(baseUrl, chargeData.id, unit.asaas_api_key);
      pixQrCode = pixData.encodedImage || null;
      pixCopyPaste = pixData.payload || null;
    }

    // ── Update payment record ──
    const resolvedMethod = payment.payment_method === "ASAAS" ? "BOLETO" : payment.payment_method;
    const resolvedStatus = resolvePaymentStatus(payment.status, chargeData.status, chargeData.paymentDate);

    const updateData = {
      asaas_payment_id: chargeData.id,
      invoice_url: chargeData.invoiceUrl || null,
      boleto_url: chargeData.bankSlipUrl || null,
      boleto_barcode: chargeData.identificationField || null,
      checkout_url: chargeData.invoiceUrl || null,
      pix_qr_code: pixQrCode,
      pix_copy_paste: pixCopyPaste,
      raw_response: chargeData,
      payment_method: mapBillingTypeToPaymentMethod(chargeData.billingType) || resolvedMethod,
      status: resolvedStatus,
      due_date: chargeData.dueDate || payment.due_date,
    };

    const { error: updateErr } = await supabaseAdmin.from("payments").update(updateData).eq("id", payment_id);
    if (updateErr) {
      console.error("[sync-asaas-payment] erro ao salvar campos no banco", JSON.stringify({ payment_id, error: updateErr.message }));
      return respond({ error: "Não foi possível salvar os dados sincronizados da cobrança" }, 500);
    }

    console.log("[sync-asaas-payment] campos salvos no banco", JSON.stringify({
      payment_id,
      asaas_payment_id: chargeData.id,
      payment_method: updateData.payment_method,
      status: updateData.status,
      due_date: updateData.due_date,
      invoice_url: Boolean(updateData.invoice_url),
      boleto_url: Boolean(updateData.boleto_url),
      pix_copy_paste: Boolean(updateData.pix_copy_paste),
    }));

    return respond({
      success: true,
      action: "created",
      asaas_payment_id: chargeData.id,
      invoice_url: updateData.invoice_url,
      boleto_url: updateData.boleto_url,
      checkout_url: updateData.checkout_url,
      pix_copy_paste: pixCopyPaste,
      pix_qr_code: pixQrCode,
      status: updateData.status,
      due_date: updateData.due_date,
      payment_method: updateData.payment_method,
      billing_type: chargeData.billingType || billingType,
      customer: asaasCustomerId,
      value: chargeData.value ?? Number(payment.final_value ?? payment.value),
    });
  } catch (err) {
    console.error("sync-asaas-payment error:", err);
    return respond({ error: err instanceof Error ? err.message : "Erro interno" }, 500);
  }
});
