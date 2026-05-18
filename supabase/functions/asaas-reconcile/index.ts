import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
};

const PAID_ASAAS = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "PAID"]);
const CANCELLED_ASAAS = new Set(["DELETED", "REFUNDED", "CANCELLED"]);
const LOCAL_PAID = new Set(["PAID", "RECEIVED", "CONFIRMED"]);

type AdminClient = ReturnType<typeof createClient>;
type Stats = {
  units_processed: number;
  asaas_charges_fetched: number;
  local_payments_scanned: number;
  duplicate_groups_found: number;
  local_duplicates_cancelled: number;
  asaas_duplicates_cancelled: number;
  paid_synced: number;
  missing_links_repaired: number;
  missing_charges_created: number;
  orphans_logged: number;
  customer_duplicates_detected: number;
  webhook_failures_marked_for_review: number;
  errors: number;
  skipped_paid_duplicates: number;
};

type ReportItem = {
  type: string;
  unit?: string;
  payment_id?: string;
  asaas_payment_id?: string | null;
  responsible?: string | null;
  message: string;
};

type AsaasPayment = Record<string, any> & {
  id: string;
  customer?: string;
  status?: string;
  value?: number;
  dueDate?: string;
  paymentDate?: string;
  confirmedDate?: string;
  clientPaymentDate?: string;
  receivedValue?: number;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  externalReference?: string;
  description?: string;
  billingType?: string;
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeJwtUserId(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    return JSON.parse(atob(authHeader.slice(7).split(".")[1])).sub ?? null;
  } catch {
    return null;
  }
}

function cents(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function cleanDoc(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

function validDoc(doc: string) {
  return (doc.length === 11 || doc.length === 14) && !/^(\d)\1+$/.test(doc);
}

function paidAtFromAsaas(a: AsaasPayment) {
  return a.paymentDate || a.confirmedDate || a.clientPaymentDate || new Date().toISOString();
}

function paidValueFromAsaas(a: AsaasPayment, fallback: unknown) {
  const received = Number(a.receivedValue ?? a.value ?? fallback ?? 0);
  return Number.isFinite(received) && received > 0 ? received : Number(fallback ?? 0);
}

function mapBillingType(method?: string | null) {
  const raw = String(method || "BOLETO").toUpperCase();
  if (raw === "PIX") return "PIX";
  if (raw === "CARD" || raw === "CREDIT_CARD" || raw === "CARTAO") return "CREDIT_CARD";
  return "BOLETO";
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function logPaymentSync(admin: AdminClient, data: {
  payment_id: string;
  unit_id: string;
  responsible_id?: string | null;
  asaas_payment_id?: string | null;
  action: string;
  success: boolean;
  request_payload?: unknown;
  response_payload?: unknown;
  error_message?: string | null;
}) {
  try {
    await admin.from("payment_sync_logs").insert({
      payment_id: data.payment_id,
      unit_id: data.unit_id,
      responsible_id: data.responsible_id ?? null,
      asaas_payment_id: data.asaas_payment_id ?? null,
      action: data.action,
      success: data.success,
      request_payload: data.request_payload ?? null,
      response_payload: data.response_payload ?? null,
      error_message: data.error_message ?? null,
    });
  } catch (e) {
    console.error("[asaas-reconcile] falha ao gravar payment_sync_logs", e);
  }
}

async function logWebhook(admin: AdminClient, data: {
  event: string;
  asaas_payment_id?: string | null;
  local_payment_id?: string | null;
  unit_id?: string | null;
  old_status?: string | null;
  new_status?: string | null;
  payload?: unknown;
  processed: boolean;
  error_message?: string | null;
}) {
  try {
    await admin.from("webhook_logs").insert({
      event: data.event,
      asaas_payment_id: data.asaas_payment_id ?? null,
      local_payment_id: data.local_payment_id ?? null,
      unit_id: data.unit_id ?? null,
      old_status: data.old_status ?? null,
      new_status: data.new_status ?? null,
      payload: data.payload ?? null,
      processed: data.processed,
      error_message: data.error_message ?? null,
    });
  } catch (e) {
    console.error("[asaas-reconcile] falha ao gravar webhook_logs", e);
  }
}

async function upsertInconsistency(admin: AdminClient, issue: Record<string, any>) {
  try {
    let q = admin
      .from("payment_inconsistencies")
      .select("id, detection_count")
      .eq("error_type", issue.error_type)
      .is("resolved_at", null)
      .limit(1);

    if (issue.payment_id) q = q.eq("payment_id", issue.payment_id);
    else if (issue.asaas_payment_id) q = q.eq("asaas_payment_id", issue.asaas_payment_id);
    else return;

    const { data: existing } = await q.maybeSingle();
    if (existing?.id) {
      await admin
        .from("payment_inconsistencies")
        .update({
          detection_count: (existing.detection_count ?? 1) + 1,
          last_detected_at: new Date().toISOString(),
          details: issue.details ?? {},
          asaas_status: issue.asaas_status ?? null,
          system_status: issue.system_status ?? null,
        })
        .eq("id", existing.id);
      return;
    }

    await admin.from("payment_inconsistencies").insert(issue);
  } catch (e) {
    console.error("[asaas-reconcile] falha ao registrar inconsistência", e);
  }
}

async function fetchAll<T>(builderFactory: (from: number, to: number) => any, pageSize = 1000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await builderFactory(from, to).range(from, to);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function fetchAsaasPayments(baseUrl: string, apiKey: string, sinceDate: string, stats: Stats) {
  const byId = new Map<string, AsaasPayment>();
  const filters = [`dateCreated[ge]=${sinceDate}`, `dueDate[ge]=${sinceDate}`];

  for (const filter of filters) {
    let offset = 0;
    const limit = 100;
    while (true) {
      const url = `${baseUrl}/payments?limit=${limit}&offset=${offset}&${filter}`;
      const res = await fetch(url, { headers: { access_token: apiKey } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        stats.errors++;
        console.error("[asaas-reconcile] erro ao listar cobranças", res.status, json);
        break;
      }
      const items: AsaasPayment[] = json?.data ?? [];
      for (const item of items) if (item?.id) byId.set(String(item.id), item);
      if (items.length < limit) break;
      offset += limit;
      await sleep(120);
    }
  }

  stats.asaas_charges_fetched += byId.size;
  return Array.from(byId.values());
}

async function fetchAsaasByExternalReference(baseUrl: string, apiKey: string, externalReference: string) {
  const url = `${baseUrl}/payments?limit=20&externalReference=${encodeURIComponent(externalReference)}`;
  const res = await fetch(url, { headers: { access_token: apiKey } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return [] as AsaasPayment[];
  return (json?.data ?? []) as AsaasPayment[];
}

async function searchCustomersByDoc(baseUrl: string, apiKey: string, doc: string) {
  const res = await fetch(`${baseUrl}/customers?limit=100&cpfCnpj=${doc}`, {
    headers: { access_token: apiKey },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return [] as Array<Record<string, any>>;
  return json?.data ?? [];
}

async function ensureCustomer(admin: AdminClient, baseUrl: string, apiKey: string, responsible: any, stats: Stats, report: ReportItem[], unitName: string) {
  let customerId = responsible.asaas_customer_id as string | null;
  if (customerId) {
    const check = await fetch(`${baseUrl}/customers/${customerId}`, { headers: { access_token: apiKey } }).catch(() => null);
    if (check?.ok) return customerId;
    customerId = null;
  }

  const doc = cleanDoc(responsible.cpf);
  if (!validDoc(doc)) throw new Error(`CPF/CNPJ inválido para ${responsible.full_name || responsible.id}`);

  const found = await searchCustomersByDoc(baseUrl, apiKey, doc);
  if (found.length > 0) {
    customerId = String(found[0].id);
    if (found.length > 1) {
      stats.customer_duplicates_detected++;
      report.push({ type: "ASAAS_DUPLICATE_CUSTOMER", unit: unitName, responsible: responsible.full_name, message: `${found.length} clientes com o mesmo CPF/CNPJ no Asaas; usando ${customerId}.` });
    }
    await admin.from("profiles").update({ asaas_customer_id: customerId }).eq("id", responsible.id);
    return customerId;
  }

  const phone = cleanDoc(responsible.phone);
  const payload: Record<string, unknown> = {
    name: responsible.full_name,
    cpfCnpj: doc,
    email: responsible.email || `${doc}@uplay.app`,
    externalReference: responsible.id,
    notificationDisabled: false,
  };
  if (phone) {
    payload.mobilePhone = phone;
    payload.phone = phone;
  }

  const created = await fetch(`${baseUrl}/customers`, {
    method: "POST",
    headers: { access_token: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await created.json().catch(() => ({}));
  if (!created.ok) throw new Error(json?.errors?.[0]?.description || json?.message || "Erro ao criar cliente no Asaas");
  customerId = String(json.id);
  await admin.from("profiles").update({ asaas_customer_id: customerId }).eq("id", responsible.id);
  return customerId;
}

async function attachAsaasToLocal(admin: AdminClient, payment: any, a: AsaasPayment, action: string, stats: Stats, report: ReportItem[], unitName: string, responsibleName?: string | null) {
  const isPaid = PAID_ASAAS.has(String(a.status));
  const update: Record<string, unknown> = {
    asaas_payment_id: a.id,
    invoice_url: a.invoiceUrl ?? payment.invoice_url ?? null,
    boleto_url: a.bankSlipUrl ?? payment.boleto_url ?? null,
    checkout_url: a.invoiceUrl ?? payment.checkout_url ?? null,
    raw_response: a,
    emission_status: "EMITTED",
    emission_error_code: null,
    emission_error_message: null,
    emission_response: a,
    sync_status: "FIXED",
    sync_last_fix: new Date().toISOString(),
    sync_error: null,
    corrected_automatically: true,
  };
  if (a.billingType) update.payment_method = a.billingType === "CREDIT_CARD" ? "CARD" : a.billingType;
  if (isPaid && payment.status !== "PAID") {
    update.status = "PAID";
    update.paid_at = paidAtFromAsaas(a);
    update.final_value = paidValueFromAsaas(a, payment.final_value ?? payment.value);
    stats.paid_synced++;
  } else if (CANCELLED_ASAAS.has(String(a.status)) && !LOCAL_PAID.has(payment.status)) {
    update.status = "CANCELLED";
  }

  const { error } = await admin.from("payments").update(update).eq("id", payment.id).is("asaas_payment_id", null);
  if (error) {
    stats.errors++;
    await logPaymentSync(admin, { payment_id: payment.id, unit_id: payment.unit_id, responsible_id: payment.responsible_id, asaas_payment_id: a.id, action, success: false, response_payload: a, error_message: error.message });
    return false;
  }

  stats.missing_links_repaired++;
  report.push({ type: action, unit: unitName, payment_id: payment.id, asaas_payment_id: a.id, responsible: responsibleName, message: `Parcela local vinculada à cobrança Asaas ${a.id}.` });
  await logPaymentSync(admin, { payment_id: payment.id, unit_id: payment.unit_id, responsible_id: payment.responsible_id, asaas_payment_id: a.id, action, success: true, response_payload: a });
  return true;
}

async function syncPaidStatus(admin: AdminClient, payment: any, a: AsaasPayment, stats: Stats, report: ReportItem[], unitName: string, responsibleName?: string | null) {
  if (!PAID_ASAAS.has(String(a.status)) || payment.status === "PAID") return;

  const update = {
    status: "PAID",
    paid_at: paidAtFromAsaas(a),
    final_value: paidValueFromAsaas(a, payment.final_value ?? payment.value),
    invoice_url: a.invoiceUrl ?? payment.invoice_url ?? null,
    boleto_url: a.bankSlipUrl ?? payment.boleto_url ?? null,
    checkout_url: a.invoiceUrl ?? payment.checkout_url ?? null,
    raw_response: a,
    sync_status: "FIXED",
    sync_last_fix: new Date().toISOString(),
    sync_error: null,
    corrected_automatically: true,
  };
  const { error } = await admin.from("payments").update(update).eq("id", payment.id).neq("status", "PAID");
  if (error) {
    stats.errors++;
    await logPaymentSync(admin, { payment_id: payment.id, unit_id: payment.unit_id, responsible_id: payment.responsible_id, asaas_payment_id: a.id, action: "AUTO_RECONCILE_PAID", success: false, response_payload: a, error_message: error.message });
    return;
  }

  stats.paid_synced++;
  report.push({ type: "AUTO_RECONCILE_PAID", unit: unitName, payment_id: payment.id, asaas_payment_id: a.id, responsible: responsibleName, message: "Baixa automática aplicada a partir do status pago no Asaas." });
  await logPaymentSync(admin, { payment_id: payment.id, unit_id: payment.unit_id, responsible_id: payment.responsible_id, asaas_payment_id: a.id, action: "AUTO_RECONCILE_PAID", success: true, response_payload: a });
}

async function cancelDuplicate(admin: AdminClient, payment: any, a: AsaasPayment | undefined, unit: any, stats: Stats, report: ReportItem[], responsibleName?: string | null) {
  if (LOCAL_PAID.has(String(payment.status))) {
    stats.skipped_paid_duplicates++;
    await upsertInconsistency(admin, {
      payment_id: payment.id,
      unit_id: payment.unit_id,
      company_id: unit.company_id,
      responsible_id: payment.responsible_id,
      responsible_name: responsibleName ?? null,
      asaas_payment_id: payment.asaas_payment_id ?? null,
      error_type: "DUPLICATE_PAID_REVIEW",
      severity: "HIGH",
      system_status: payment.status,
      system_value: payment.value,
      system_due_date: payment.due_date,
      details: { reason: "duplicidade paga não cancelada automaticamente para preservar cobrança paga válida" },
    });
    return;
  }

  let asaasCancelled = false;
  if (payment.asaas_payment_id && a && !PAID_ASAAS.has(String(a.status))) {
    const res = await fetch(`${unit.asaas_base_url || "https://api.asaas.com/v3"}/payments/${payment.asaas_payment_id}`, {
      method: "DELETE",
      headers: { access_token: unit.asaas_api_key },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok && !CANCELLED_ASAAS.has(String(a.status))) {
      stats.errors++;
      await logPaymentSync(admin, { payment_id: payment.id, unit_id: payment.unit_id, responsible_id: payment.responsible_id, asaas_payment_id: payment.asaas_payment_id, action: "AUTO_CANCEL_DUPLICATE_ASAAS", success: false, response_payload: json, error_message: json?.errors?.[0]?.description || json?.message || "Falha ao cancelar duplicada no Asaas" });
      return;
    }
    asaasCancelled = true;
    stats.asaas_duplicates_cancelled++;
  }

  const { error } = await admin.from("payments").update({
    status: "CANCELLED",
    sync_status: "FIXED",
    sync_last_fix: new Date().toISOString(),
    sync_error: null,
    corrected_automatically: true,
    emission_status: payment.asaas_payment_id ? "CANCELLED_DUPLICATE" : payment.emission_status,
  }).eq("id", payment.id).neq("status", "PAID");

  if (error) {
    stats.errors++;
    await logPaymentSync(admin, { payment_id: payment.id, unit_id: payment.unit_id, responsible_id: payment.responsible_id, asaas_payment_id: payment.asaas_payment_id, action: "AUTO_CANCEL_DUPLICATE_LOCAL", success: false, error_message: error.message });
    return;
  }

  stats.local_duplicates_cancelled++;
  report.push({ type: "AUTO_CANCEL_DUPLICATE", unit: unit.name, payment_id: payment.id, asaas_payment_id: payment.asaas_payment_id, responsible: responsibleName, message: `Duplicidade cancelada no sistema${asaasCancelled ? " e no Asaas" : ""}; histórico preservado.` });
  await logPaymentSync(admin, { payment_id: payment.id, unit_id: payment.unit_id, responsible_id: payment.responsible_id, asaas_payment_id: payment.asaas_payment_id, action: "AUTO_CANCEL_DUPLICATE", success: true, response_payload: { asaas_cancelled: asaasCancelled } });
  await upsertInconsistency(admin, {
    payment_id: payment.id,
    unit_id: payment.unit_id,
    company_id: unit.company_id,
    responsible_id: payment.responsible_id,
    responsible_name: responsibleName ?? null,
    asaas_payment_id: payment.asaas_payment_id ?? null,
    error_type: "DUPLICATE_INSTALLMENT",
    severity: "MEDIUM",
    system_status: "CANCELLED",
    system_value: payment.value,
    system_due_date: payment.due_date,
    details: { resolution: "cancelada automaticamente por reconciliação", preserved_history: true },
    resolved_at: new Date().toISOString(),
    resolution_action: "AUTO_CANCEL_DUPLICATE",
  });
}

async function createMissingAsaasCharge(admin: AdminClient, payment: any, unit: any, responsible: any, stats: Stats, report: ReportItem[]) {
  if (payment.asaas_payment_id || payment.status !== "PENDING") return;
  const provider = String(payment.payment_provider || payment.gateway || "ASAAS").toUpperCase();
  if (provider !== "ASAAS" || String(payment.payment_method || "").toUpperCase() === "DINHEIRO") return;

  const value = Number(payment.final_value ?? payment.value ?? 0);
  const originalValue = Number(payment.original_value ?? payment.value ?? value);
  if (!Number.isFinite(value) || value < 10) return;

  const baseUrl = unit.asaas_base_url || "https://api.asaas.com/v3";

  const already = await fetchAsaasByExternalReference(baseUrl, unit.asaas_api_key, payment.id);
  const activeExisting = already.find((a) => !CANCELLED_ASAAS.has(String(a.status)));
  if (activeExisting) {
    await attachAsaasToLocal(admin, payment, activeExisting, "AUTO_ATTACH_EXTERNAL_REFERENCE", stats, report, unit.name, responsible?.full_name);
    return;
  }

  let customerId: string;
  try {
    customerId = await ensureCustomer(admin, baseUrl, unit.asaas_api_key, responsible, stats, report, unit.name);
  } catch (e) {
    stats.errors++;
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("payments").update({ emission_status: "ERROR", emission_error_code: "CUSTOMER_ERROR", emission_error_message: message, emission_last_attempt_at: new Date().toISOString(), sync_status: "ERROR", sync_error: message }).eq("id", payment.id);
    await logPaymentSync(admin, { payment_id: payment.id, unit_id: payment.unit_id, responsible_id: payment.responsible_id, action: "AUTO_CREATE_MISSING_CHARGE", success: false, error_message: message });
    return;
  }

  const discountValue = Number(payment.punctuality_discount ?? 0) || 0;
  const hasDiscount = discountValue > 0 && originalValue > value;
  const payload: Record<string, unknown> = {
    customer: customerId,
    billingType: mapBillingType(payment.payment_method),
    value: hasDiscount ? originalValue : value,
    dueDate: payment.due_date,
    description: payment.description || "Mensalidade UPLAY",
    externalReference: payment.id,
  };
  if (hasDiscount) {
    payload.discount = { value: Number(discountValue.toFixed(2)), dueDateLimitDays: 0, type: "FIXED" };
  }

  const res = await fetch(`${baseUrl}/payments`, {
    method: "POST",
    headers: { access_token: unit.asaas_api_key, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    stats.errors++;
    const message = json?.errors?.[0]?.description || json?.message || "Falha ao criar cobrança no Asaas";
    await admin.from("payments").update({
      emission_status: "ERROR",
      emission_error_code: "ASAAS_CREATE_ERROR",
      emission_error_message: message,
      emission_payload: payload,
      emission_response: json,
      emission_last_attempt_at: new Date().toISOString(),
      emission_attempts: (payment.emission_attempts ?? 0) + 1,
      sync_status: "ERROR",
      sync_error: message,
    }).eq("id", payment.id).is("asaas_payment_id", null);
    await logPaymentSync(admin, { payment_id: payment.id, unit_id: payment.unit_id, responsible_id: payment.responsible_id, action: "AUTO_CREATE_MISSING_CHARGE", success: false, request_payload: payload, response_payload: json, error_message: message });
    return;
  }

  const update = {
    asaas_payment_id: json.id,
    invoice_url: json.invoiceUrl || null,
    boleto_url: json.bankSlipUrl || null,
    boleto_barcode: json.identificationField || null,
    checkout_url: json.invoiceUrl || null,
    raw_response: json,
    payment_method: json.billingType === "CREDIT_CARD" ? "CARD" : (json.billingType || payment.payment_method || "BOLETO"),
    status: PAID_ASAAS.has(String(json.status)) ? "PAID" : "PENDING",
    paid_at: PAID_ASAAS.has(String(json.status)) ? paidAtFromAsaas(json) : payment.paid_at,
    final_value: PAID_ASAAS.has(String(json.status)) ? paidValueFromAsaas(json, value) : payment.final_value,
    gateway: "ASAAS",
    payment_provider: "ASAAS",
    emission_status: "EMITTED",
    emission_error_code: null,
    emission_error_message: null,
    emission_payload: payload,
    emission_response: json,
    emission_last_attempt_at: new Date().toISOString(),
    emission_attempts: (payment.emission_attempts ?? 0) + 1,
    sync_status: "FIXED",
    sync_last_fix: new Date().toISOString(),
    sync_error: null,
    corrected_automatically: true,
  };

  const { error } = await admin.from("payments").update(update).eq("id", payment.id).is("asaas_payment_id", null);
  if (error) {
    stats.errors++;
    await logPaymentSync(admin, { payment_id: payment.id, unit_id: payment.unit_id, responsible_id: payment.responsible_id, asaas_payment_id: json.id, action: "AUTO_CREATE_MISSING_CHARGE", success: false, request_payload: payload, response_payload: json, error_message: error.message });
    return;
  }

  stats.missing_charges_created++;
  report.push({ type: "AUTO_CREATE_MISSING_CHARGE", unit: unit.name, payment_id: payment.id, asaas_payment_id: json.id, responsible: responsible?.full_name, message: "Cobrança ausente criada no Asaas e vinculada à parcela local." });
  await logPaymentSync(admin, { payment_id: payment.id, unit_id: payment.unit_id, responsible_id: payment.responsible_id, asaas_payment_id: json.id, action: "AUTO_CREATE_MISSING_CHARGE", success: true, request_payload: payload, response_payload: json });
  await sleep(120);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const isScheduled = body?.scheduled === true || req.headers.get("x-internal-key") === serviceRoleKey;
  const daysBack = Math.max(1, Math.min(365, Number(body?.days_back) || 120));
  const filterUnitId = typeof body?.unit_id === "string" ? body.unit_id : undefined;
  const repairDuplicates = body?.repair_duplicates !== false;
  const emitMissing = body?.emit_missing !== false;
  const maxCreate = Math.max(0, Math.min(1000, Number(body?.max_create) || 300));

  if (!isScheduled) {
    const actingUserId = decodeJwtUserId(req.headers.get("Authorization"));
    if (!actingUserId) return respond({ error: "Unauthorized" }, 401);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", actingUserId);
    const ok = (roles ?? []).some((r: { role: string }) => ["SUPER_ADMIN", "ADMIN_MASTER", "ADMIN_UNIDADE"].includes(r.role));
    if (!ok) return respond({ error: "Forbidden" }, 403);
  }

  let unitsQ = admin
    .from("units")
    .select("id, company_id, name, asaas_api_key, asaas_base_url, active")
    .eq("active", true)
    .not("asaas_api_key", "is", null);
  if (filterUnitId) unitsQ = unitsQ.eq("id", filterUnitId);
  const { data: units, error: unitError } = await unitsQ;
  if (unitError) return respond({ error: unitError.message }, 500);

  const stats: Stats = {
    units_processed: 0,
    asaas_charges_fetched: 0,
    local_payments_scanned: 0,
    duplicate_groups_found: 0,
    local_duplicates_cancelled: 0,
    asaas_duplicates_cancelled: 0,
    paid_synced: 0,
    missing_links_repaired: 0,
    missing_charges_created: 0,
    orphans_logged: 0,
    customer_duplicates_detected: 0,
    webhook_failures_marked_for_review: 0,
    errors: 0,
    skipped_paid_duplicates: 0,
  };
  const report: ReportItem[] = [];
  const specialFocus: Record<string, unknown> = {};
  const sinceDate = new Date(Date.now() - daysBack * 24 * 3600 * 1000).toISOString().slice(0, 10);

  for (const unit of units ?? []) {
    stats.units_processed++;
    const baseUrl = unit.asaas_base_url || "https://api.asaas.com/v3";

    try {
      const [localPayments, responsibles] = await Promise.all([
        fetchAll<any>((from, to) => admin
          .from("payments")
          .select("*")
          .eq("unit_id", unit.id)
          .or(`due_date.gte.${sinceDate},asaas_payment_id.not.is.null`)
          .order("due_date", { ascending: true }), 1000),
        fetchAll<any>((from, to) => admin
          .from("profiles")
          .select("id, full_name, cpf, phone, email, asaas_customer_id, unit_id, active")
          .eq("unit_id", unit.id), 1000),
      ]);
      stats.local_payments_scanned += localPayments.length;

      const responsibleById = new Map(responsibles.map((r) => [r.id, r]));
      const responsibleByCustomer = new Map(responsibles.filter((r) => r.asaas_customer_id).map((r) => [r.asaas_customer_id, r]));
      const localById = new Map(localPayments.map((p) => [p.id, p]));
      const localByAsaas = new Map(localPayments.filter((p) => p.asaas_payment_id).map((p) => [p.asaas_payment_id, p]));

      const asaasPayments = await fetchAsaasPayments(baseUrl, unit.asaas_api_key, sinceDate, stats);
      const asaasById = new Map(asaasPayments.map((a) => [String(a.id), a]));

      for (const a of asaasPayments) {
        const aid = String(a.id);
        const local = localByAsaas.get(aid);
        if (local) {
          await syncPaidStatus(admin, local, a, stats, report, unit.name, responsibleById.get(local.responsible_id)?.full_name);

          const valueMismatch = cents(local.original_value ?? local.value) !== cents(a.value);
          const dueMismatch = Boolean(a.dueDate && local.due_date && a.dueDate !== local.due_date);
          if (valueMismatch || dueMismatch) {
            await upsertInconsistency(admin, {
              payment_id: local.id,
              unit_id: unit.id,
              company_id: unit.company_id,
              responsible_id: local.responsible_id,
              responsible_name: responsibleById.get(local.responsible_id)?.full_name ?? null,
              asaas_payment_id: aid,
              error_type: valueMismatch ? "VALUE_MISMATCH" : "DUE_DATE_MISMATCH",
              severity: "LOW",
              system_status: local.status,
              asaas_status: a.status ?? null,
              system_value: local.original_value ?? local.value,
              asaas_value: a.value ?? null,
              system_due_date: local.due_date,
              asaas_due_date: a.dueDate ?? null,
              details: { reason: "divergência detectada durante reconciliação automática", asaas: { value: a.value, dueDate: a.dueDate } },
            });
          }
          continue;
        }

        let attached = false;
        const externalReference = String(a.externalReference || "");
        if (externalReference && localById.has(externalReference)) {
          const candidate = localById.get(externalReference);
          if (candidate && !candidate.asaas_payment_id) {
            attached = await attachAsaasToLocal(admin, candidate, a, "AUTO_ATTACH_BY_EXTERNAL_REFERENCE", stats, report, unit.name, responsibleById.get(candidate.responsible_id)?.full_name);
          }
        }

        if (!attached && a.customer) {
          const responsible = responsibleByCustomer.get(a.customer);
          if (responsible) {
            const candidate = localPayments.find((p) =>
              !p.asaas_payment_id &&
              p.responsible_id === responsible.id &&
              p.status !== "CANCELLED" &&
              p.payment_provider === "ASAAS" &&
              p.due_date === a.dueDate &&
              cents(p.original_value ?? p.value) === cents(a.value)
            );
            if (candidate) {
              attached = await attachAsaasToLocal(admin, candidate, a, "AUTO_ATTACH_BY_CUSTOMER_DATE_VALUE", stats, report, unit.name, responsible.full_name);
            }
          }
        }

        if (!attached) {
          stats.orphans_logged++;
          await upsertInconsistency(admin, {
            unit_id: unit.id,
            company_id: unit.company_id,
            asaas_payment_id: aid,
            error_type: "ASAAS_ORPHAN",
            severity: PAID_ASAAS.has(String(a.status)) ? "HIGH" : "MEDIUM",
            asaas_status: String(a.status ?? ""),
            asaas_value: Number(a.value ?? 0),
            asaas_due_date: a.dueDate ?? null,
            asaas_paid_at: paidAtFromAsaas(a),
            details: { reason: "cobrança existe no Asaas mas não foi localizada no sistema", description: a.description ?? null, customer: a.customer ?? null, externalReference: a.externalReference ?? null, billingType: a.billingType ?? null },
          });
        }
      }

      if (repairDuplicates) {
        const groups = new Map<string, any[]>();
        for (const p of localPayments) {
          if (p.status === "CANCELLED") continue;
          const key = `${p.unit_id}|${p.responsible_id}|${p.due_date}|${cents(p.value)}|${p.payment_type || ""}`;
          const arr = groups.get(key) ?? [];
          arr.push(p);
          groups.set(key, arr);
        }

        for (const arr of groups.values()) {
          if (arr.length < 2) continue;
          stats.duplicate_groups_found++;
          arr.sort((a, b) => {
            const score = (p: any) => (LOCAL_PAID.has(p.status) ? 0 : p.asaas_payment_id ? 1 : 2);
            return score(a) - score(b) || String(a.created_at).localeCompare(String(b.created_at));
          });
          const keep = arr[0];
          const paidCount = arr.filter((p) => LOCAL_PAID.has(String(p.status))).length;
          for (const duplicate of arr.slice(1)) {
            if (paidCount > 1 && LOCAL_PAID.has(String(duplicate.status))) {
              await cancelDuplicate(admin, duplicate, asaasById.get(duplicate.asaas_payment_id), unit, stats, report, responsibleById.get(duplicate.responsible_id)?.full_name);
              continue;
            }
            if (duplicate.id === keep.id) continue;
            await cancelDuplicate(admin, duplicate, asaasById.get(duplicate.asaas_payment_id), unit, stats, report, responsibleById.get(duplicate.responsible_id)?.full_name);
          }
        }
      }

      if (emitMissing) {
        let createdInThisRun = 0;
        const freshNoAsaas = localPayments
          .filter((p) => !p.asaas_payment_id && p.status === "PENDING" && String(p.payment_provider || p.gateway || "ASAAS").toUpperCase() === "ASAAS")
          .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));

        for (const p of freshNoAsaas) {
          if (createdInThisRun >= maxCreate) break;
          const responsible = responsibleById.get(p.responsible_id);
          if (!responsible?.active) continue;
          await createMissingAsaasCharge(admin, p, unit, responsible, stats, report);
          createdInThisRun++;
        }
      }

      if (/serra verde/i.test(unit.name)) {
        const fabianos = responsibles.filter((r) => /fabiano/i.test(r.full_name || ""));
        specialFocus.serra_verde = {
          unit_id: unit.id,
          local_payments_scanned: localPayments.length,
          asaas_charges_seen: asaasPayments.length,
          fabiano_profiles: fabianos.map((f) => ({ id: f.id, name: f.full_name, cpf: f.cpf, asaas_customer_id: f.asaas_customer_id })),
          pending_without_asaas_after_scan: localPayments.filter((p) => !p.asaas_payment_id && p.status === "PENDING").length,
        };
      }
    } catch (e) {
      stats.errors++;
      report.push({ type: "UNIT_ERROR", unit: unit.name, message: e instanceof Error ? e.message : String(e) });
      console.error("[asaas-reconcile] erro na unidade", unit.id, e);
    }
  }

  const { data: openWebhookFails } = await admin
    .from("webhook_logs")
    .select("id")
    .eq("processed", false)
    .gte("created_at", new Date(Date.now() - daysBack * 24 * 3600 * 1000).toISOString())
    .limit(1000);
  stats.webhook_failures_marked_for_review = openWebhookFails?.length ?? 0;

  try {
    await admin.from("audit_logs").insert({
      action: "asaas_auto_reconcile_full",
      target_table: "payments",
      target_id: filterUnitId ?? "00000000-0000-0000-0000-000000000000",
      performed_by: "00000000-0000-0000-0000-000000000000",
      details: { days_back: daysBack, stats, report: report.slice(0, 200), special_focus: specialFocus },
    });
  } catch (e) {
    console.error("[asaas-reconcile] falha ao gravar audit_logs", e);
  }

  return respond({
    ok: true,
    mode: "full_auto_repair",
    days_back: daysBack,
    since: sinceDate,
    scheduled: isScheduled,
    ...stats,
    errors_remaining: stats.errors + stats.skipped_paid_duplicates + stats.webhook_failures_marked_for_review,
    report,
    special_focus: specialFocus,
  });
});
