import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const PAID_STATUSES = new Set(["PAID", "RECEIVED", "CONFIRMED"]);

function asMoney(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

function resolveExpectedAsaasValue(payment: Record<string, unknown>, asaasData: Record<string, unknown>) {
  const systemValue = asMoney(payment.value) ?? 0;
  const originalValue = asMoney(payment.original_value) ?? systemValue;
  const finalValue = asMoney(payment.final_value) ?? systemValue;
  const discountValue = asMoney(payment.punctuality_discount) ?? 0;
  const asaasDiscount = asMoney((asaasData.discount as Record<string, unknown> | null)?.value) ?? 0;
  const isPaid = PAID_STATUSES.has(String(payment.status));

  if (isPaid) {
    return finalValue;
  }

  if (discountValue > 0 && originalValue > finalValue) {
    return asaasDiscount > 0 ? originalValue : finalValue;
  }

  return originalValue;
}

function mapAsaasStatus(status?: string | null): string | null {
  if (!status) return null;
  const map: Record<string, string> = {
    PENDING: "PENDING",
    RECEIVED: "PAID",
    CONFIRMED: "PAID",
    OVERDUE: "OVERDUE",
    REFUNDED: "CANCELLED",
    DELETED: "CANCELLED",
    RECEIVED_IN_CASH: "PAID",
  };
  return map[status] ?? null;
}

interface DetectedIssue {
  payment_id: string | null;
  unit_id: string;
  company_id: string | null;
  responsible_id: string | null;
  responsible_name: string | null;
  asaas_payment_id: string | null;
  error_type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  system_value: number | null;
  asaas_value: number | null;
  system_status: string | null;
  asaas_status: string | null;
  system_due_date: string | null;
  asaas_due_date: string | null;
  system_paid_at: string | null;
  asaas_paid_at: string | null;
  details: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const targetUnitId: string | undefined = body?.unit_id;
    const targetCompanyId: string | undefined = body?.company_id;

    // 1) Buscar unidades alvo (com chave Asaas configurada)
    let unitsQuery = supabase
      .from("units")
      .select("id, name, company_id, asaas_api_key, asaas_base_url")
      .eq("active", true);
    if (targetUnitId) unitsQuery = unitsQuery.eq("id", targetUnitId);
    if (targetCompanyId) unitsQuery = unitsQuery.eq("company_id", targetCompanyId);

    const { data: units, error: unitsErr } = await unitsQuery;
    if (unitsErr) throw unitsErr;

    const totals = {
      units_scanned: 0,
      payments_checked: 0,
      issues_found: 0,
      issues_resolved_auto: 0,
    };

    const allIssues: DetectedIssue[] = [];
    const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    for (const unit of units ?? []) {
      const apiKey = (unit as { asaas_api_key?: string | null }).asaas_api_key;
      const baseUrl =
        (unit as { asaas_base_url?: string | null }).asaas_base_url ||
        "https://api.asaas.com/v3";
      if (!apiKey) continue;
      totals.units_scanned += 1;

      // 2) Cobranças do escopo: pendentes/atrasadas + pagas últimos 30 dias
      const { data: pendingPayments } = await supabase
        .from("payments")
        .select(
          "id, unit_id, responsible_id, asaas_payment_id, status, value, final_value, due_date, paid_at, original_value, punctuality_discount",
        )
        .eq("unit_id", unit.id)
        .in("status", ["PENDING", "OVERDUE"]);

      const { data: paidPayments } = await supabase
        .from("payments")
        .select(
          "id, unit_id, responsible_id, asaas_payment_id, status, value, final_value, due_date, paid_at, original_value, punctuality_discount",
        )
        .eq("unit_id", unit.id)
        .in("status", ["PAID", "RECEIVED", "CONFIRMED"])
        .gte("paid_at", sinceIso);

      const payments = [...(pendingPayments ?? []), ...(paidPayments ?? [])];
      totals.payments_checked += payments.length;

      // Detectar duplicatas locais (mesmo asaas_payment_id em mais de um registro)
      const dupMap = new Map<string, string[]>();
      for (const p of payments) {
        if (!p.asaas_payment_id) continue;
        const arr = dupMap.get(p.asaas_payment_id) ?? [];
        arr.push(p.id);
        dupMap.set(p.asaas_payment_id, arr);
      }

      // Cache de nomes de responsáveis
      const responsibleIds = Array.from(
        new Set(payments.map((p) => p.responsible_id).filter(Boolean)),
      );
      const namesMap = new Map<string, string>();
      if (responsibleIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", responsibleIds as string[]);
        for (const p of profiles ?? []) namesMap.set(p.id, p.full_name);
      }

      for (const payment of payments) {
        const respName = payment.responsible_id
          ? namesMap.get(payment.responsible_id) ?? null
          : null;

        // Caso: sem vínculo Asaas (e não é dinheiro)
        if (!payment.asaas_payment_id) {
          allIssues.push({
            payment_id: payment.id,
            unit_id: unit.id,
            company_id: unit.company_id,
            responsible_id: payment.responsible_id,
            responsible_name: respName,
            asaas_payment_id: null,
            error_type: "MISSING_ASAAS_LINK",
            severity: "MEDIUM",
            system_value: payment.value,
            asaas_value: null,
            system_status: payment.status,
            asaas_status: null,
            system_due_date: payment.due_date,
            asaas_due_date: null,
            system_paid_at: payment.paid_at,
            asaas_paid_at: null,
            details: { reason: "Cobrança sem asaas_payment_id" },
          });
          continue;
        }

        // Duplicata
        const dupIds = dupMap.get(payment.asaas_payment_id) ?? [];
        if (dupIds.length > 1) {
          allIssues.push({
            payment_id: payment.id,
            unit_id: unit.id,
            company_id: unit.company_id,
            responsible_id: payment.responsible_id,
            responsible_name: respName,
            asaas_payment_id: payment.asaas_payment_id,
            error_type: "DUPLICATE",
            severity: "HIGH",
            system_value: payment.value,
            asaas_value: null,
            system_status: payment.status,
            asaas_status: null,
            system_due_date: payment.due_date,
            asaas_due_date: null,
            system_paid_at: payment.paid_at,
            asaas_paid_at: null,
            details: { duplicate_ids: dupIds },
          });
        }

        // Buscar no Asaas
        try {
          const res = await fetch(
            `${baseUrl}/payments/${payment.asaas_payment_id}`,
            { headers: { access_token: apiKey } },
          );
          if (!res.ok) {
            // 404 → cobrança não existe mais no Asaas
            if (res.status === 404) {
              allIssues.push({
                payment_id: payment.id,
                unit_id: unit.id,
                company_id: unit.company_id,
                responsible_id: payment.responsible_id,
                responsible_name: respName,
                asaas_payment_id: payment.asaas_payment_id,
                error_type: "MISSING_ASAAS_LINK",
                severity: "HIGH",
                system_value: payment.value,
                asaas_value: null,
                system_status: payment.status,
                asaas_status: null,
                system_due_date: payment.due_date,
                asaas_due_date: null,
                system_paid_at: payment.paid_at,
                asaas_paid_at: null,
                details: { reason: "Asaas retornou 404" },
              });
            }
            continue;
          }
          const asaasData = await res.json();
          const asaasMappedStatus = mapAsaasStatus(asaasData.status);
          const asaasValue =
            typeof asaasData.value === "number" ? asaasData.value : null;
          const asaasDueDate = asaasData.dueDate ?? null;
          const asaasPaidAt =
            asaasData.paymentDate ?? asaasData.clientPaymentDate ?? null;

          const isPaidLocal = PAID_STATUSES.has(payment.status);
          const isPaidAsaas = asaasMappedStatus === "PAID";

          // 1) Status divergente: pago no Asaas mas não no sistema
          if (isPaidAsaas && !isPaidLocal) {
            allIssues.push({
              payment_id: payment.id,
              unit_id: unit.id,
              company_id: unit.company_id,
              responsible_id: payment.responsible_id,
              responsible_name: respName,
              asaas_payment_id: payment.asaas_payment_id,
              error_type: "PAID_IN_ASAAS",
              severity: "CRITICAL",
              system_value: payment.value,
              asaas_value: asaasValue,
              system_status: payment.status,
              asaas_status: asaasMappedStatus,
              system_due_date: payment.due_date,
              asaas_due_date: asaasDueDate,
              system_paid_at: payment.paid_at,
              asaas_paid_at: asaasPaidAt,
              details: {
                received_value: asaasData.netValue ?? asaasData.value ?? null,
              },
            });
          }
          // 2) Pago no sistema mas não no Asaas
          else if (isPaidLocal && !isPaidAsaas) {
            allIssues.push({
              payment_id: payment.id,
              unit_id: unit.id,
              company_id: unit.company_id,
              responsible_id: payment.responsible_id,
              responsible_name: respName,
              asaas_payment_id: payment.asaas_payment_id,
              error_type: "PAID_IN_SYSTEM",
              severity: "HIGH",
              system_value: payment.value,
              asaas_value: asaasValue,
              system_status: payment.status,
              asaas_status: asaasMappedStatus,
              system_due_date: payment.due_date,
              asaas_due_date: asaasDueDate,
              system_paid_at: payment.paid_at,
              asaas_paid_at: asaasPaidAt,
              details: {},
            });
          }

          // 3) Valor diferente
          // Pendente: se o Asaas tem desconto de pontualidade configurado, o valor bruto esperado é original_value.
          // Legado sem discount no Asaas ainda é aceito quando value/final_value já representa o valor com desconto.
          // Pago: compara contra final_value/valor pago real, porque o cliente pode ter usado o desconto.
          const refValue = resolveExpectedAsaasValue(payment, asaasData);
          if (
            asaasValue !== null &&
            refValue !== null &&
            Math.abs(Number(refValue) - Number(asaasValue)) > 0.01
          ) {
            allIssues.push({
              payment_id: payment.id,
              unit_id: unit.id,
              company_id: unit.company_id,
              responsible_id: payment.responsible_id,
              responsible_name: respName,
              asaas_payment_id: payment.asaas_payment_id,
              error_type: "VALUE_MISMATCH",
              severity: "HIGH",
              system_value: refValue,
              asaas_value: asaasValue,
              system_status: payment.status,
              asaas_status: asaasMappedStatus,
              system_due_date: payment.due_date,
              asaas_due_date: asaasDueDate,
              system_paid_at: payment.paid_at,
              asaas_paid_at: asaasPaidAt,
              details: {
                diff: Number(refValue) - Number(asaasValue),
                original_value: payment.original_value ?? null,
                final_value: payment.final_value ?? null,
                punctuality_discount: payment.punctuality_discount ?? null,
                asaas_discount: asMoney(asaasData?.discount?.value) ?? null,
              },
            });
          }

          // 4) Data de vencimento diferente
          if (asaasDueDate && payment.due_date && asaasDueDate !== payment.due_date) {
            allIssues.push({
              payment_id: payment.id,
              unit_id: unit.id,
              company_id: unit.company_id,
              responsible_id: payment.responsible_id,
              responsible_name: respName,
              asaas_payment_id: payment.asaas_payment_id,
              error_type: "DUE_DATE_MISMATCH",
              severity: "LOW",
              system_value: payment.value,
              asaas_value: asaasValue,
              system_status: payment.status,
              asaas_status: asaasMappedStatus,
              system_due_date: payment.due_date,
              asaas_due_date: asaasDueDate,
              system_paid_at: payment.paid_at,
              asaas_paid_at: asaasPaidAt,
              details: {},
            });
          }

          // 5) Data de pagamento diferente (apenas quando ambos pagos)
          if (
            isPaidLocal &&
            isPaidAsaas &&
            asaasPaidAt &&
            payment.paid_at &&
            asaasPaidAt.split("T")[0] !==
              new Date(payment.paid_at).toISOString().split("T")[0]
          ) {
            allIssues.push({
              payment_id: payment.id,
              unit_id: unit.id,
              company_id: unit.company_id,
              responsible_id: payment.responsible_id,
              responsible_name: respName,
              asaas_payment_id: payment.asaas_payment_id,
              error_type: "DATE_MISMATCH",
              severity: "LOW",
              system_value: payment.value,
              asaas_value: asaasValue,
              system_status: payment.status,
              asaas_status: asaasMappedStatus,
              system_due_date: payment.due_date,
              asaas_due_date: asaasDueDate,
              system_paid_at: payment.paid_at,
              asaas_paid_at: asaasPaidAt,
              details: {},
            });
          }
        } catch (err) {
          console.warn(
            "[detect-payment-inconsistencies] erro ao consultar Asaas",
            JSON.stringify({
              payment_id: payment.id,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      }
    }

    totals.issues_found = allIssues.length;

    // 3) Persistir: para cada issue, ou cria novo registro aberto, ou atualiza last_detected_at + detection_count
    for (const issue of allIssues) {
      if (!issue.payment_id) {
        // sem payment_id (improvável) — apenas insere
        await supabase.from("payment_inconsistencies").insert(issue);
        continue;
      }
      const { data: existing } = await supabase
        .from("payment_inconsistencies")
        .select("id, detection_count")
        .eq("payment_id", issue.payment_id)
        .eq("error_type", issue.error_type)
        .is("resolved_at", null)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("payment_inconsistencies")
          .update({
            detection_count: (existing.detection_count ?? 0) + 1,
            last_detected_at: new Date().toISOString(),
            system_value: issue.system_value,
            asaas_value: issue.asaas_value,
            system_status: issue.system_status,
            asaas_status: issue.asaas_status,
            system_due_date: issue.system_due_date,
            asaas_due_date: issue.asaas_due_date,
            system_paid_at: issue.system_paid_at,
            asaas_paid_at: issue.asaas_paid_at,
            details: issue.details,
            severity: issue.severity,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("payment_inconsistencies").insert(issue);
      }
    }

    // 4) Auto-resolver: marcar como resolvidas as inconsistências abertas que NÃO apareceram nesta varredura
    // (escopo: unidades varridas)
    const scannedUnitIds = (units ?? []).map((u) => u.id);
    if (scannedUnitIds.length > 0) {
      const detectedKeys = new Set(
        allIssues.map((i) => `${i.payment_id}::${i.error_type}`),
      );
      const { data: openIssues } = await supabase
        .from("payment_inconsistencies")
        .select("id, payment_id, error_type")
        .in("unit_id", scannedUnitIds)
        .is("resolved_at", null);

      const toResolve = (openIssues ?? []).filter(
        (o) => !detectedKeys.has(`${o.payment_id}::${o.error_type}`),
      );
      if (toResolve.length > 0) {
        await supabase
          .from("payment_inconsistencies")
          .update({
            resolved_at: new Date().toISOString(),
            resolution_action: "AUTO_RESOLVED_NO_LONGER_DETECTED",
          })
          .in(
            "id",
            toResolve.map((t) => t.id),
          );
        totals.issues_resolved_auto = toResolve.length;
      }
    }

    return respond({ success: true, ...totals });
  } catch (err) {
    console.error(
      "[detect-payment-inconsistencies] erro fatal",
      err instanceof Error ? err.message : String(err),
    );
    return respond(
      { error: err instanceof Error ? err.message : "Erro desconhecido" },
      500,
    );
  }
});
