import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

function validateCpf(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11 && clean.length !== 14) return false;
  if (/^(\d)\1+$/.test(clean)) return false;
  return true;
}

async function fetchPixData(baseUrl: string, asaasPaymentId: string, apiKey: string) {
  try {
    const pixRes = await fetch(`${baseUrl}/payments/${asaasPaymentId}/pixQrCode`, {
      headers: { access_token: apiKey },
    });
    if (!pixRes.ok) return { encodedImage: null, payload: null };
    const pixData = await pixRes.json();
    return { encodedImage: pixData.encodedImage || null, payload: pixData.payload || null };
  } catch {
    return { encodedImage: null, payload: null };
  }
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function getFaceValue(payment: { value?: number | null; originalValue?: number | null }) {
  return roundCurrency(Number(payment.originalValue ?? payment.value ?? 0));
}

function getPaidAmount(payment: { value?: number | null; originalValue?: number | null; receivedValue?: number | null }) {
  return roundCurrency(Number(payment.receivedValue ?? payment.value ?? payment.originalValue ?? 0));
}

function getPunctualityDiscount(payment: {
  value?: number | null;
  originalValue?: number | null;
  receivedValue?: number | null;
  discount?: { value?: number | null; type?: string | null } | null;
}) {
  const faceValue = getFaceValue(payment);
  const configuredDiscountValue = Number(payment.discount?.value ?? 0);
  const configuredDiscount = payment.discount?.type === "PERCENTAGE"
    ? roundCurrency(faceValue * configuredDiscountValue / 100)
    : roundCurrency(configuredDiscountValue);
  const inferredDiscount = roundCurrency(Math.max(faceValue - getPaidAmount(payment), 0));
  return Math.max(configuredDiscount, inferredDiscount);
}

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

    const token = authHeader.replace("Bearer ", "");
    let callerId: string | null = null;
    let isServiceRole = false;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      callerId = payload.sub || null;
      if (payload.role === "service_role") {
        isServiceRole = true;
      }
    } catch { /* invalid token */ }

    if (!callerId && !isServiceRole) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (!isServiceRole) {
      // Check admin
      const { data: callerRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId);

      const isAdmin = callerRoles?.some((r: { role: string }) =>
        r.role === "ADMIN_MASTER" || r.role === "ADMIN_UNIDADE"
      );
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Sem permissão" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Get optional unit_id filter
    let unitFilter: string | null = null;
    try {
      const body = await req.json();
      unitFilter = body.unit_id || null;
    } catch { /* no body */ }

    // ── PHASE 1: Refresh existing Asaas payments ──
    let refreshQuery = supabase
      .from("payments")
      .select("id, asaas_payment_id, unit_id, status, paid_at, pix_qr_code, pix_copy_paste")
      .not("asaas_payment_id", "is", null)
      .in("status", ["PENDING", "OVERDUE", "PAID"]);

    if (unitFilter) refreshQuery = refreshQuery.eq("unit_id", unitFilter);

    const { data: existingPayments, error: fetchErr } = await refreshQuery;

    if (fetchErr) {
      return new Response(JSON.stringify({ error: "Erro ao buscar pagamentos" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── PHASE 2: Get payments WITHOUT asaas_payment_id (need to be CREATED in Asaas) ──
    let createQuery = supabase
      .from("payments")
      .select("id, responsible_id, unit_id, status, value, final_value, due_date, description, payment_method, payment_type, installment_number")
      .is("asaas_payment_id", null)
      .in("status", ["PENDING", "OVERDUE"])
      .neq("payment_method", "DINHEIRO");

    if (unitFilter) createQuery = createQuery.eq("unit_id", unitFilter);

    const { data: unsentPayments } = await createQuery;

    // Group all by unit to reuse API keys
    const allUnits = new Set<string>();
    for (const p of (existingPayments || [])) allUnits.add(p.unit_id);
    for (const p of (unsentPayments || [])) allUnits.add(p.unit_id);

    // Cache units
    const unitCache: Record<string, { asaas_api_key: string; asaas_base_url: string }> = {};
    for (const uid of allUnits) {
      const { data: unit } = await supabase
        .from("units")
        .select("asaas_api_key, asaas_base_url")
        .eq("id", uid)
        .single();
      if (unit?.asaas_api_key) {
        unitCache[uid] = { asaas_api_key: unit.asaas_api_key, asaas_base_url: unit.asaas_base_url || "https://api.asaas.com/v3" };
      }
    }

    let synced = 0;
    let created = 0;
    let errors = 0;
    const results: Array<{ id: string; action: string; oldStatus?: string; newStatus?: string; error?: string }> = [];

    // ── PHASE 1: Refresh existing payments ──
    for (const payment of (existingPayments || [])) {
      const unitCfg = unitCache[payment.unit_id];
      if (!unitCfg) { errors++; continue; }

      try {
        const res = await fetch(`${unitCfg.asaas_base_url}/payments/${payment.asaas_payment_id}`, {
          headers: { access_token: unitCfg.asaas_api_key },
        });

        if (!res.ok) { errors++; continue; }

        const asaasData = await res.json();
        const newStatus = statusMap[asaasData.status] || payment.status;
        const faceValue = getFaceValue(asaasData);

        const updateData: Record<string, unknown> = {
          value: faceValue,
          original_value: faceValue,
          final_value: newStatus === "PAID" ? getPaidAmount(asaasData) : faceValue,
          punctuality_discount: getPunctualityDiscount(asaasData),
          status: newStatus,
          invoice_url: asaasData.invoiceUrl || undefined,
          boleto_url: asaasData.bankSlipUrl || undefined,
          boleto_barcode: asaasData.identificationField || undefined,
          raw_response: asaasData,
        };

        if (newStatus === "PAID" && !payment.paid_at) {
          updateData.paid_at = asaasData.paymentDate || new Date().toISOString();
        } else if (newStatus !== "PAID" && payment.paid_at) {
          updateData.paid_at = null;
        }

        // Fetch PIX if needed
        if (asaasData.billingType === "PIX" && (!payment.pix_qr_code || !payment.pix_copy_paste)) {
          const pixData = await fetchPixData(unitCfg.asaas_base_url, payment.asaas_payment_id, unitCfg.asaas_api_key);
          updateData.pix_qr_code = pixData.encodedImage || null;
          updateData.pix_copy_paste = pixData.payload || null;
        }

        const cleanUpdate = Object.fromEntries(
          Object.entries(updateData).filter(([, v]) => v !== undefined)
        );

        await supabase.from("payments").update(cleanUpdate).eq("id", payment.id);

        if (newStatus !== payment.status) {
          results.push({ id: payment.id, action: "refreshed", oldStatus: payment.status, newStatus });
        }
        synced++;
      } catch {
        errors++;
      }
    }

    // ── PHASE 2: Create charges in Asaas for unsent payments ──
    // Cache responsibles to avoid repeated queries
    const responsibleCache: Record<string, { full_name: string; cpf: string; phone: string | null; email: string | null; asaas_customer_id: string | null }> = {};

    for (const payment of (unsentPayments || [])) {
      const unitCfg = unitCache[payment.unit_id];
      if (!unitCfg) {
        errors++;
        results.push({ id: payment.id, action: "skipped", error: "Unidade sem API Key" });
        continue;
      }

      try {
        // Get responsible
        if (!responsibleCache[payment.responsible_id]) {
          const { data: resp } = await supabase
            .from("profiles")
            .select("full_name, cpf, phone, email, asaas_customer_id")
            .eq("id", payment.responsible_id)
            .single();
          if (resp) responsibleCache[payment.responsible_id] = resp;
        }

        const responsible = responsibleCache[payment.responsible_id];
        if (!responsible || !responsible.cpf) {
          errors++;
          results.push({ id: payment.id, action: "skipped", error: "Responsável sem CPF" });
          continue;
        }

        const cpfClean = responsible.cpf.replace(/\D/g, "");
        if (!validateCpf(cpfClean)) {
          errors++;
          results.push({ id: payment.id, action: "skipped", error: "CPF inválido" });
          continue;
        }

        // Ensure customer exists in Asaas
        let asaasCustomerId = responsible.asaas_customer_id;

        if (asaasCustomerId) {
          try {
            const checkRes = await fetch(`${unitCfg.asaas_base_url}/customers/${asaasCustomerId}`, {
              headers: { access_token: unitCfg.asaas_api_key },
            });
            if (!checkRes.ok) asaasCustomerId = null;
          } catch {
            asaasCustomerId = null;
          }
        }

        if (!asaasCustomerId) {
          const customerPayload: Record<string, unknown> = {
            name: responsible.full_name.trim(),
            cpfCnpj: cpfClean,
            email: responsible.email || `${cpfClean}@uplay.app`,
          };
          if (responsible.phone) {
            const phoneClean = responsible.phone.replace(/\D/g, "");
            if (phoneClean.length >= 10 && phoneClean.length <= 11) {
              customerPayload.mobilePhone = phoneClean;
            }
          }

          const customerRes = await fetch(`${unitCfg.asaas_base_url}/customers`, {
            method: "POST",
            headers: { access_token: unitCfg.asaas_api_key, "Content-Type": "application/json" },
            body: JSON.stringify(customerPayload),
          });

          const customerData = await customerRes.json();
          if (!customerRes.ok) {
            errors++;
            results.push({ id: payment.id, action: "skipped", error: `Erro customer: ${customerData?.errors?.[0]?.description || "Desconhecido"}` });
            continue;
          }

          asaasCustomerId = customerData.id;
          await supabase.from("profiles").update({ asaas_customer_id: asaasCustomerId }).eq("id", payment.responsible_id);
          // Update cache
          responsible.asaas_customer_id = asaasCustomerId;
        }

        // Determine billing type
        const billingTypeMap: Record<string, string> = {
          PIX: "PIX", BOLETO: "BOLETO", CARD: "CREDIT_CARD", ASAAS: "BOLETO",
        };
        const billingType = billingTypeMap[payment.payment_method || "BOLETO"] || "BOLETO";

        // Asaas does not accept due dates in the past
        const todayStr = new Date().toISOString().slice(0, 10);
        const effectiveDueDate = payment.due_date < todayStr ? todayStr : payment.due_date;

        const chargePayload = {
          customer: asaasCustomerId,
          billingType,
          value: Number(payment.final_value ?? payment.value),
          dueDate: effectiveDueDate,
          description: payment.description || "Mensalidade UPLAY",
        };

        console.log(`[sync-all] Criando cobrança para payment ${payment.id}`, JSON.stringify(chargePayload));

        const chargeRes = await fetch(`${unitCfg.asaas_base_url}/payments`, {
          method: "POST",
          headers: { access_token: unitCfg.asaas_api_key, "Content-Type": "application/json" },
          body: JSON.stringify(chargePayload),
        });

        const chargeData = await chargeRes.json();

        if (!chargeRes.ok) {
          errors++;
          results.push({ id: payment.id, action: "skipped", error: `Erro Asaas: ${chargeData?.errors?.[0]?.description || "Desconhecido"}` });
          continue;
        }

        // Fetch PIX data if applicable
        let pixQrCode: string | null = null;
        let pixCopyPaste: string | null = null;
        if (billingType === "PIX" && chargeData.id) {
          // Wait 2s for Asaas to process PIX assets
          await new Promise(r => setTimeout(r, 2000));
          const pixData = await fetchPixData(unitCfg.asaas_base_url, chargeData.id, unitCfg.asaas_api_key);
          pixQrCode = pixData.encodedImage;
          pixCopyPaste = pixData.payload;
        }

        // Map billing type to payment method
        const methodMap: Record<string, string> = { PIX: "PIX", BOLETO: "BOLETO", CREDIT_CARD: "CARD" };
        const resolvedMethod = methodMap[chargeData.billingType] || payment.payment_method;

        const updateData = {
          asaas_payment_id: chargeData.id,
          invoice_url: chargeData.invoiceUrl || null,
          boleto_url: chargeData.bankSlipUrl || null,
          boleto_barcode: chargeData.identificationField || null,
          checkout_url: chargeData.invoiceUrl || null,
          pix_qr_code: pixQrCode,
          pix_copy_paste: pixCopyPaste,
          raw_response: chargeData,
          payment_method: resolvedMethod,
          status: statusMap[chargeData.status] || payment.status,
          due_date: chargeData.dueDate || payment.due_date,
        };

        await supabase.from("payments").update(updateData).eq("id", payment.id);

        created++;
        results.push({ id: payment.id, action: "created", newStatus: updateData.status });
        console.log(`[sync-all] Cobrança criada: ${chargeData.id} para payment ${payment.id}`);
      } catch (err) {
        errors++;
        results.push({ id: payment.id, action: "error", error: err instanceof Error ? err.message : "Erro desconhecido" });
      }
    }

    const totalProcessed = synced + created;
    const message = [
      created > 0 ? `${created} cobrança(s) enviada(s) ao Asaas` : null,
      synced > 0 ? `${synced} pagamento(s) sincronizado(s)` : null,
      errors > 0 ? `${errors} erro(s)` : null,
      totalProcessed === 0 && errors === 0 ? "Nenhum pagamento pendente para processar" : null,
    ].filter(Boolean).join(", ");

    return new Response(JSON.stringify({
      success: true,
      synced,
      created,
      errors,
      changed: results,
      message,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-all-payments error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
