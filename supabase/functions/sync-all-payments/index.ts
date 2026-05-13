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

function resolvePaymentStatus(currentStatus: string, asaasStatus?: string | null, paymentDate?: string | null) {
  const mappedStatus = (asaasStatus && statusMap[asaasStatus]) || currentStatus;

  if (paymentDate) return "PAID";
  if (currentStatus === "PAID" && mappedStatus !== "PAID" && mappedStatus !== "CANCELLED") return "PAID";
  if (currentStatus === "CANCELLED") return "CANCELLED";

  return mappedStatus;
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Parse body once
    let parsedBody: { unit_id?: string; scheduled?: boolean; background?: boolean; phase?: "create" | "refresh" | "both" } = {};
    try {
      parsedBody = await req.json();
    } catch { /* no body */ }

    const unitFilter: string | null = parsedBody.unit_id || null;
    const isScheduled = parsedBody.scheduled === true;
    const runInBackground = parsedBody.background === true || isScheduled;
    const phase: "create" | "refresh" | "both" = parsedBody.phase || "both";
    const authHeader = req.headers.get("Authorization");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Authorize: scheduled cron OR admin user
    if (!isScheduled) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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

      const { data: callerRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", caller.id);

      const isAdmin = callerRoles?.some((r: { role: string }) =>
        r.role === "ADMIN_MASTER" || r.role === "ADMIN_UNIDADE" || r.role === "SUPER_ADMIN"
      );
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Sem permissão" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.log("[sync-all-payments] Execução agendada (cron diário)");
    }

    const runSync = async () => {
    // ── PHASE 1: Refresh existing Asaas payments ──
    // Scope: PENDING/OVERDUE always + PAID nos últimos 90 dias (revalidação)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoStr = ninetyDaysAgo.toISOString();

    let refreshQuery = supabase
      .from("payments")
      .select("id, asaas_payment_id, unit_id, status, paid_at, pix_qr_code, pix_copy_paste, payment_method, value, original_value, final_value, due_date")
      .not("asaas_payment_id", "is", null)
      .or(`status.in.(PENDING,OVERDUE),and(status.eq.PAID,updated_at.gte.${ninetyDaysAgoStr})`);

    if (unitFilter) refreshQuery = refreshQuery.eq("unit_id", unitFilter);

    const { data: existingPayments, error: fetchErr } = await refreshQuery;

    if (fetchErr) {
      return new Response(JSON.stringify({ error: "Erro ao buscar pagamentos" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── PHASE 2: Get payments WITHOUT asaas_payment_id (need to be CREATED in Asaas) ──
    // ESTRITO: somente parcelas com payment_provider = ASAAS (ou gateway = ASAAS via espelho).
    let createQuery = supabase
      .from("payments")
      .select("id, responsible_id, unit_id, status, value, original_value, final_value, punctuality_discount, due_date, description, payment_method, payment_type, installment_number, payment_provider, gateway")
      .is("asaas_payment_id", null)
      .in("status", ["PENDING", "OVERDUE"])
      .neq("payment_method", "DINHEIRO");

    if (unitFilter) createQuery = createQuery.eq("unit_id", unitFilter);

    const { data: unsentPaymentsRaw } = await createQuery;
    const unsentPayments = (unsentPaymentsRaw || []).filter((p: any) => {
      const provider = String(p.payment_provider || p.gateway || "ASAAS").toUpperCase();
      if (provider !== "ASAAS") {
        console.log("[sync-all-payments] SKIP non-ASAAS", { payment_id: p.id, payment_provider: provider });
        return false;
      }
      return true;
    });

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

    // ── PHASE 2 (FIRST): Create charges in Asaas for unsent payments ──
    // Roda PRIMEIRO porque é o trabalho crítico e pequeno; Phase 1 pode levar minutos
    // e até estourar o limite de execução da edge function.
    const responsibleCache: Record<string, { full_name: string; cpf: string; phone: string | null; email: string | null; asaas_customer_id: string | null }> = {};

    if (phase === "create" || phase === "both") {
      for (const payment of (unsentPayments || [])) {
        const unitCfg = unitCache[payment.unit_id];
        if (!unitCfg) {
          errors++;
          const _e = "Unidade sem API Key";
          console.log(`[sync-all] Phase2 skip pid=${payment.id}: ${_e}`);
          results.push({ id: payment.id, action: "skipped", error: _e });
          continue;
        }

        try {
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
            const _e = "Responsável sem CPF";
            console.log(`[sync-all] Phase2 skip pid=${payment.id}: ${_e}`);
            results.push({ id: payment.id, action: "skipped", error: _e });
            continue;
          }

          const cpfClean = responsible.cpf.replace(/\D/g, "");
          if (!validateCpf(cpfClean)) {
            errors++;
            const _e = "CPF inválido";
            console.log(`[sync-all] Phase2 skip pid=${payment.id}: ${_e}`);
            results.push({ id: payment.id, action: "skipped", error: _e });
            continue;
          }

          let asaasCustomerId = responsible.asaas_customer_id;
          if (asaasCustomerId) {
            try {
              const checkRes = await fetch(`${unitCfg.asaas_base_url}/customers/${asaasCustomerId}`, {
                headers: { access_token: unitCfg.asaas_api_key },
              });
              if (!checkRes.ok) asaasCustomerId = null;
              await checkRes.text().catch(() => "");
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
            const customerData = await customerRes.json().catch(() => ({}));
            if (!customerRes.ok) {
              errors++;
              const _e = `Erro customer: ${customerData?.errors?.[0]?.description || customerRes.status}`;
              console.log(`[sync-all] Phase2 skip pid=${payment.id}: ${_e}`);
              results.push({ id: payment.id, action: "skipped", error: _e });
              continue;
            }
            asaasCustomerId = customerData.id;
            await supabase.from("profiles").update({ asaas_customer_id: asaasCustomerId }).eq("id", payment.responsible_id);
            responsible.asaas_customer_id = asaasCustomerId;
          }

          const billingTypeMap: Record<string, string> = {
            PIX: "PIX", BOLETO: "BOLETO", CARD: "CREDIT_CARD", ASAAS: "BOLETO",
          };
          const billingType = billingTypeMap[payment.payment_method || "BOLETO"] || "BOLETO";

          const todayStr = new Date().toISOString().slice(0, 10);
          const effectiveDueDate = payment.due_date < todayStr ? todayStr : payment.due_date;

          const punctualityDiscount = Number((payment as any).punctuality_discount ?? 0) || 0;
          const originalValue = Number((payment as any).original_value ?? payment.value ?? payment.final_value ?? 0);
          const finalWithDiscount = Number(payment.final_value ?? payment.value ?? originalValue);
          const hasDiscount = punctualityDiscount > 0 && originalValue > finalWithDiscount;

          const chargePayload: Record<string, unknown> = {
            customer: asaasCustomerId,
            billingType,
            value: hasDiscount ? originalValue : finalWithDiscount || originalValue,
            dueDate: effectiveDueDate,
            description: payment.description || "Mensalidade UPLAY",
          };

          if (hasDiscount) {
            chargePayload.discount = {
              value: Number(punctualityDiscount.toFixed(2)),
              dueDateLimitDays: 0,
              type: "FIXED",
            };
          }

          console.log(`[sync-all] Criando cobrança para payment ${payment.id}`, JSON.stringify(chargePayload));

          const chargeRes = await fetch(`${unitCfg.asaas_base_url}/payments`, {
            method: "POST",
            headers: { access_token: unitCfg.asaas_api_key, "Content-Type": "application/json" },
            body: JSON.stringify(chargePayload),
          });

          const chargeData = await chargeRes.json().catch(() => ({}));

          if (!chargeRes.ok) {
            errors++;
            const _e = `Erro Asaas: ${chargeData?.errors?.[0]?.description || chargeRes.status}`;
            console.log(`[sync-all] Phase2 skip pid=${payment.id}: ${_e}`);
            results.push({ id: payment.id, action: "skipped", error: _e });
            continue;
          }

          let pixQrCode: string | null = null;
          let pixCopyPaste: string | null = null;
          if (billingType === "PIX" && chargeData.id) {
            await new Promise(r => setTimeout(r, 2000));
            const pixData = await fetchPixData(unitCfg.asaas_base_url, chargeData.id, unitCfg.asaas_api_key);
            pixQrCode = pixData.encodedImage;
            pixCopyPaste = pixData.payload;
          }

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
          const msg = err instanceof Error ? err.message : "Erro desconhecido";
          console.log(`[sync-all] Phase2 exception pid=${payment.id}: ${msg}`);
          results.push({ id: payment.id, action: "error", error: msg });
        }
      }
      console.log(`[sync-all] Phase 2 (CREATE) complete: created=${created}, errors=${errors}`);
    }

    // ── PHASE 1 (SECOND): Refresh existing Asaas payments ──
    let phase1ErrSamples = 0;
    if (phase === "refresh" || phase === "both") {
      for (const payment of (existingPayments || [])) {
        const unitCfg = unitCache[payment.unit_id];
        if (!unitCfg) { errors++; continue; }

        await new Promise((r) => setTimeout(r, 180));

        try {
          let res = await fetch(`${unitCfg.asaas_base_url}/payments/${payment.asaas_payment_id}`, {
            headers: { access_token: unitCfg.asaas_api_key },
          });

          if (res.status === 429) {
            await new Promise((r) => setTimeout(r, 2500));
            res = await fetch(`${unitCfg.asaas_base_url}/payments/${payment.asaas_payment_id}`, {
              headers: { access_token: unitCfg.asaas_api_key },
            });
          }

          if (!res.ok) {
            errors++;
            if (phase1ErrSamples < 5) {
              const txt = await res.text().catch(() => "");
              console.log(`[sync-all] Phase1 error pid=${payment.id} asaas=${payment.asaas_payment_id} status=${res.status} body=${txt.slice(0, 160)}`);
              phase1ErrSamples++;
            }
            continue;
          }

          const asaasData = await res.json();
          const newStatus = resolvePaymentStatus(payment.status, asaasData.status, asaasData.paymentDate);

          const billingTypeMap: Record<string, string> = { PIX: "PIX", BOLETO: "BOLETO", CREDIT_CARD: "CARD" };
          const resolvedMethod = billingTypeMap[asaasData.billingType] || payment.payment_method;

          const updateData: Record<string, unknown> = {
            status: newStatus,
            invoice_url: asaasData.invoiceUrl || undefined,
            boleto_url: asaasData.bankSlipUrl || undefined,
            boleto_barcode: asaasData.identificationField || undefined,
            payment_method: resolvedMethod || undefined,
            raw_response: asaasData,
          };

          if (newStatus === "PAID") {
            if (!payment.paid_at) {
              updateData.paid_at = asaasData.paymentDate || new Date().toISOString();
            }
            const originalValue = Number((payment as any).original_value ?? payment.value);
            const asaasValue = typeof asaasData.value === "number" ? asaasData.value : null;
            const realPaidValue = Number(asaasValue ?? originalValue);
            if (Number.isFinite(realPaidValue) && realPaidValue > 0) {
              updateData.final_value = realPaidValue;
            }
          }

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
            await supabase.from("webhook_logs").insert({
              event: "SYNC_ALL_STATUS_CHANGED",
              asaas_payment_id: payment.asaas_payment_id,
              local_payment_id: payment.id,
              unit_id: payment.unit_id,
              old_status: payment.status,
              new_status: newStatus,
              payload: { source: "sync-all-payments", asaas_status: asaasData.status, payment_date: asaasData.paymentDate || null },
              processed: true,
            });
          }
          synced++;
        } catch (e) {
          errors++;
          if (phase1ErrSamples < 5) {
            console.log(`[sync-all] Phase1 exception pid=${payment.id}: ${e instanceof Error ? e.message : String(e)}`);
            phase1ErrSamples++;
          }
        }
      }
      console.log(`[sync-all] Phase 1 (REFRESH) complete: synced=${synced}, errors=${errors}`);
    }

    const totalProcessed = synced + created;
    const message = [
      created > 0 ? `${created} cobrança(s) enviada(s) ao Asaas` : null,
      synced > 0 ? `${synced} pagamento(s) sincronizado(s)` : null,
      errors > 0 ? `${errors} erro(s)` : null,
      totalProcessed === 0 && errors === 0 ? "Nenhum pagamento pendente para processar" : null,
    ].filter(Boolean).join(", ");

      console.log("[sync-all-payments] DONE", { synced, created, errors, message });
      return { synced, created, errors, results, message };
    };

    if (runInBackground) {
      // @ts-ignore - EdgeRuntime is provided by the Supabase runtime
      EdgeRuntime.waitUntil(runSync().catch((e) => console.error("[sync-all-payments] background error", e)));
      return new Response(JSON.stringify({
        success: true,
        background: true,
        message: "Sincronização iniciada em segundo plano. Acompanhe o progresso pelos logs.",
      }), {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await runSync();
    return new Response(JSON.stringify({
      success: true,
      ...result,
      changed: result.results,
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
