import { supabase } from "@/integrations/supabase/client";

export interface SyncedPaymentRecord {
  id: string;
  value: number;
  final_value: number | null;
  due_date: string;
  status: string;
  payment_method: string | null;
  pix_copy_paste: string | null;
  pix_qr_code: string | null;
  invoice_url: string | null;
  checkout_url: string | null;
  boleto_url: string | null;
  boleto_barcode: string | null;
  asaas_payment_id: string | null;
  responsible_id: string;
  unit_id: string;
  installment_number: number;
  contract_id: string | null;
  student_id: string | null;
  description: string;
  payment_type: string;
  raw_response: Record<string, unknown> | null;
}

interface ResponsiblePayload {
  full_name: string;
  phone: string | null;
}

export interface ResolvedWhatsAppChargeData {
  payment: SyncedPaymentRecord;
  responsible: ResponsiblePayload;
  studentName?: string;
  description: string;
}

const PAYMENT_SELECT = [
  "id",
  "value",
  "final_value",
  "due_date",
  "status",
  "payment_method",
  "pix_copy_paste",
  "pix_qr_code",
  "invoice_url",
  "checkout_url",
  "boleto_url",
  "boleto_barcode",
  "asaas_payment_id",
  "responsible_id",
  "unit_id",
  "installment_number",
  "contract_id",
  "student_id",
  "description",
  "payment_type",
  "raw_response",
].join(", ");

function getRawBillingType(rawResponse: Record<string, unknown> | null | undefined) {
  const billingType = rawResponse?.billingType;
  return typeof billingType === "string" ? billingType : null;
}

export function normalizeAsaasPaymentMethod(payment: Pick<SyncedPaymentRecord, "payment_method" | "pix_copy_paste" | "boleto_url" | "checkout_url" | "invoice_url" | "raw_response">) {
  if (payment.payment_method === "ASAAS") return "BOLETO";
  if (payment.payment_method === "PIX" || payment.payment_method === "BOLETO" || payment.payment_method === "CARD" || payment.payment_method === "DINHEIRO") {
    return payment.payment_method;
  }

  const rawBillingType = getRawBillingType(payment.raw_response);
  if (rawBillingType === "PIX") return "PIX";
  if (rawBillingType === "BOLETO") return "BOLETO";
  if (rawBillingType === "CREDIT_CARD") return "CARD";

  if (payment.pix_copy_paste) return "PIX";
  if (payment.boleto_url) return "BOLETO";
  if (payment.checkout_url) return "CARD";
  if (payment.invoice_url) return "BOLETO";

  return "BOLETO";
}

export function getMissingAsaasFields(payment: SyncedPaymentRecord) {
  const missing: string[] = [];
  const method = normalizeAsaasPaymentMethod(payment);
  const hasPaymentLink = Boolean(payment.invoice_url || payment.checkout_url);

  if (method !== "DINHEIRO" && !payment.asaas_payment_id) {
    missing.push("asaas_payment_id");
  }

  if (!hasPaymentLink) {
    missing.push("invoice_url");
  }

  if (method === "BOLETO" && !(payment.boleto_url || payment.invoice_url || payment.checkout_url)) {
    missing.push("boleto_url");
  }

  if (method === "PIX" && !payment.pix_copy_paste) {
    missing.push("pix_copy_paste");
  }

  return missing;
}

async function parseFunctionError(error: unknown) {
  let message = error instanceof Error ? error.message : "Falha ao sincronizar cobrança.";

  try {
    const maybeContext = (error as { context?: { json?: () => Promise<{ error?: string; details?: unknown }> } })?.context;
    if (maybeContext?.json) {
      const body = await maybeContext.json();
      message = body?.error || message;
    }
  } catch {
    // noop
  }

  return message;
}

async function loadPaymentRecord(paymentId: string): Promise<SyncedPaymentRecord> {
  const { data, error } = await supabase
    .from("payments")
    .select(PAYMENT_SELECT)
    .eq("id", paymentId)
    .single();

  if (error || !data) {
    throw new Error("Cobrança não encontrada.");
  }

  const basePayment = data as unknown as SyncedPaymentRecord;
  const payment = {
    ...basePayment,
    payment_method: normalizeAsaasPaymentMethod(basePayment),
  } as SyncedPaymentRecord;

  console.info("[whatsapp-sync] cobrança carregada do banco", {
    paymentId,
    asaasPaymentId: payment.asaas_payment_id,
    paymentMethod: payment.payment_method,
    invoiceUrl: Boolean(payment.invoice_url),
    boletoUrl: Boolean(payment.boleto_url),
    pixCopyPaste: Boolean(payment.pix_copy_paste),
  });

  return payment;
}

export async function syncAsaasPaymentData(paymentId: string) {
  const payment = await loadPaymentRecord(paymentId);

  if (payment.payment_method === "DINHEIRO") {
    throw new Error("Cobranças em dinheiro não possuem dados do Asaas para envio por WhatsApp.");
  }

  const missingBeforeSync = getMissingAsaasFields(payment);
  if (missingBeforeSync.length === 0) {
    return payment;
  }

  console.info("[whatsapp-sync] campos faltantes detectados", {
    paymentId,
    missingBeforeSync,
  });
  console.info("[whatsapp-sync] chamada ao Asaas iniciada", { paymentId });

  const { data, error } = await supabase.functions.invoke("sync-asaas-payment", {
    body: { payment_id: paymentId },
  });

  if (error) {
    throw new Error(await parseFunctionError(error));
  }

  if ((data as { error?: string } | null)?.error) {
    throw new Error((data as { error: string }).error);
  }

  console.info("[whatsapp-sync] resposta da API recebida", {
    paymentId,
    action: (data as { action?: string } | null)?.action,
    invoiceUrl: Boolean((data as { invoice_url?: string | null } | null)?.invoice_url),
    boletoUrl: Boolean((data as { boleto_url?: string | null } | null)?.boleto_url),
    pixCopyPaste: Boolean((data as { pix_copy_paste?: string | null } | null)?.pix_copy_paste),
  });

  const refreshedPayment = await loadPaymentRecord(paymentId);
  const missingAfterSync = getMissingAsaasFields(refreshedPayment);

  console.info("[whatsapp-sync] campos salvos no banco", {
    paymentId,
    missingAfterSync,
    invoiceUrl: Boolean(refreshedPayment.invoice_url),
    boletoUrl: Boolean(refreshedPayment.boleto_url),
    pixCopyPaste: Boolean(refreshedPayment.pix_copy_paste),
    paymentMethod: refreshedPayment.payment_method,
  });

  if (missingAfterSync.length > 0) {
    throw new Error("Não foi possível obter os dados completos da cobrança no Asaas.");
  }

  return refreshedPayment;
}

export async function resolveWhatsAppChargeData(paymentId: string): Promise<ResolvedWhatsAppChargeData> {
  const payment = await syncAsaasPaymentData(paymentId);

  const contractQuery = payment.contract_id
    ? supabase.from("contracts").select("description, student_id").eq("id", payment.contract_id).single()
    : Promise.resolve({ data: null, error: null });

  const [responsibleRes, contractRes] = await Promise.all([
    supabase.from("profiles").select("full_name, phone").eq("id", payment.responsible_id).single(),
    contractQuery,
  ]);

  if (responsibleRes.error || !responsibleRes.data) {
    throw new Error("Responsável da cobrança não encontrado.");
  }

  let description = payment.description || `Parcela ${payment.installment_number}`;
  let studentName: string | undefined;

  if (contractRes.data) {
    description = contractRes.data.description || description;

    if (contractRes.data.student_id) {
      const { data: studentData } = await supabase
        .from("students")
        .select("full_name")
        .eq("id", contractRes.data.student_id)
        .single();

      studentName = studentData?.full_name;
    }
  }

  console.info("[whatsapp-sync] mensagem montada", {
    paymentId,
    paymentMethod: payment.payment_method,
    hasBoleto: Boolean(payment.boleto_url || payment.invoice_url || payment.checkout_url),
    hasPix: Boolean(payment.pix_copy_paste),
    description,
  });

  return {
    payment,
    responsible: responsibleRes.data,
    studentName,
    description,
  };
}