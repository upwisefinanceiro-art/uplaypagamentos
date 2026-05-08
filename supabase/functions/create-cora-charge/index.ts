// Edge Function: create-cora-charge
// Emite boleto+PIX no Banco Cora para uma parcela (payment_id).
// Grava status detalhado de emissão (emission_*) em payments para diagnóstico.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import {
  authenticateCora,
  coraRequest,
  getGlobalCoraCredentials,
  getUnitCoraCredentials,
  onlyDigits,
} from "../_shared/cora-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Helper: registra falha de emissão na própria parcela
async function recordEmissionError(
  admin: any,
  paymentId: string,
  code: string,
  message: string,
  payload?: unknown,
  response?: unknown,
) {
  try {
    // incrementa attempts via select+update
    const { data: cur } = await admin
      .from("payments")
      .select("emission_attempts")
      .eq("id", paymentId)
      .maybeSingle();
    const attempts = (cur?.emission_attempts ?? 0) + 1;
    await admin
      .from("payments")
      .update({
        emission_status: "ERROR",
        emission_error_code: code,
        emission_error_message: message,
        emission_payload: payload ?? null,
        emission_response: response ?? null,
        emission_last_attempt_at: new Date().toISOString(),
        emission_attempts: attempts,
        gateway: "CORA",
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId);
  } catch (e) {
    console.error("[create-cora-charge] failed to record emission error", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await userClient.auth.getUser();
    // Permite chamada interna (cron / auto-emit) via service role key
    const isInternal = authHeader === `Bearer ${serviceRoleKey}`;
    if (!caller && !isInternal) return json({ error: "Não autorizado" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    if (caller) {
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
      const allowed = roles?.some((r: { role: string }) => ["SUPER_ADMIN", "ADMIN_MASTER", "ADMIN_UNIDADE"].includes(r.role));
      if (!allowed) return json({ error: "Sem permissão" }, 403);
    }

    const { payment_id } = await req.json();
    if (!payment_id) return json({ error: "payment_id obrigatório" }, 400);

    const { data: payment, error: pErr } = await admin
      .from("payments")
      .select("id, unit_id, responsible_id, contract_id, value, final_value, due_date, description, status, gateway, payment_method, cora_invoice_id")
      .eq("id", payment_id)
      .single();
    if (pErr || !payment) return json({ error: "Parcela não encontrada" }, 404);

    if (payment.status !== "PENDING") return json({ error: `Parcela já está ${payment.status}` }, 400);

    // ── DEDUP: se já tem cora_invoice_id, NÃO recria ──
    if (payment.cora_invoice_id) {
      await admin
        .from("payments")
        .update({ emission_status: "EMITTED", emission_error_code: null, emission_error_message: null, updated_at: new Date().toISOString() })
        .eq("id", payment.id);
      return json({ success: true, already_emitted: true, cora_invoice_id: payment.cora_invoice_id });
    }

    // Carrega unidade incluindo credenciais Cora próprias
    const { data: unit } = await admin
      .from("units")
      .select("id, partnership_plan, name, cora_client_id, cora_certificate, cora_private_key, cora_environment")
      .eq("id", payment.unit_id)
      .single();
    if (!unit) {
      await recordEmissionError(admin, payment.id, "UNIT_NOT_FOUND", "Unidade não encontrada");
      return json({ error: "Unidade não encontrada" }, 404);
    }

    const hasUnitCora = !!(unit.cora_client_id && unit.cora_certificate && unit.cora_private_key);
    if (!hasUnitCora && unit.partnership_plan !== "PLANO_UPLAY") {
      const msg = "Credencial do banco Cora não configurada para esta unidade.";
      await recordEmissionError(admin, payment.id, "UNIT_CREDENTIALS_MISSING", msg);
      return json({ error: msg }, 400);
    }

    // Pagador
    const { data: resp } = await admin
      .from("profiles")
      .select("full_name, cpf, email, phone, address, address_number, complement, neighborhood, city, state, zip_code")
      .eq("id", payment.responsible_id)
      .single();
    if (!resp || !resp.full_name || !resp.cpf) {
      const msg = "Responsável sem nome ou CPF cadastrado.";
      await recordEmissionError(admin, payment.id, "RESPONSIBLE_INCOMPLETE", msg);
      return json({ error: msg }, 400);
    }

    const cpfDigits = onlyDigits(resp.cpf);

    // Endereço — combina contrato + profile (fallback)
    let ct: any = null;
    if (payment.contract_id) {
      const { data: contractData } = await admin
        .from("contracts")
        .select("address, address_number, neighborhood, city, state, zip_code, complement")
        .eq("id", payment.contract_id)
        .maybeSingle();
      ct = contractData;
    }

    const pick = (a: any, b: any) => {
      const va = typeof a === "string" ? a.trim() : a;
      const vb = typeof b === "string" ? b.trim() : b;
      return va || vb || "";
    };

    const addrStreet = pick(ct?.address, resp.address);
    const addrNumber = pick(ct?.address_number, resp.address_number) || "S/N";
    const addrDistrict = pick(ct?.neighborhood, resp.neighborhood) || "Centro";
    const addrCity = pick(ct?.city, resp.city);
    const addrState = String(pick(ct?.state, resp.state) || "").toUpperCase().slice(0, 2);
    const addrZip = onlyDigits(pick(ct?.zip_code, resp.zip_code));
    const addrComplement = pick(ct?.complement, resp.complement);

    const sanitizeName = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9 .'-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100);
    const customerName = sanitizeName(resp.full_name || "");
    const phoneDigits = onlyDigits(resp.phone);
    const emailTrim = (resp.email || "").trim();
    const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
    const dueDate = String(payment.due_date || "");

    // Validação completa pré-envio
    const validationErrors: string[] = [];
    if (!customerName || customerName.length < 3) validationErrors.push("nome do cliente (mínimo 3 caracteres)");
    if (cpfDigits.length !== 11 && cpfDigits.length !== 14) validationErrors.push("CPF/CNPJ (11 ou 14 dígitos)");
    if (!emailTrim || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) validationErrors.push("e-mail válido");
    if (phoneDigits && (phoneDigits.length < 10 || phoneDigits.length > 11)) validationErrors.push("telefone (10 ou 11 dígitos)");
    if (!addrStreet || addrStreet.trim().length < 3) validationErrors.push("logradouro");
    if (!addrZip || addrZip.length !== 8) validationErrors.push("CEP (8 dígitos)");
    if (!addrCity) validationErrors.push("cidade");
    if (!addrState || addrState.length !== 2) validationErrors.push("UF (2 letras)");
    if (!isoDateRe.test(dueDate)) validationErrors.push("vencimento em formato ISO YYYY-MM-DD");

    const valueCents = Math.round(Number(payment.final_value || payment.value || 0) * 100);
    if (!valueCents || valueCents < 1000) validationErrors.push("valor mínimo R$ 10,00");

    if (validationErrors.length) {
      const msg = `Dados inválidos: ${validationErrors.join(", ")}.`;
      await recordEmissionError(admin, payment.id, "VALIDATION_ERROR", msg, { validationErrors });
      return json({ error: msg, validation_errors: validationErrors }, 400);
    }

    const credsOrErr = hasUnitCora ? getUnitCoraCredentials(unit) : getGlobalCoraCredentials();
    if ("error" in credsOrErr) {
      await recordEmissionError(admin, payment.id, "CREDENTIALS_ERROR", credsOrErr.error);
      return json({ error: credsOrErr.error }, 500);
    }
    console.info("[create-cora-charge] credenciais", JSON.stringify({
      source: hasUnitCora ? "UNIT" : "GLOBAL_UPLAY",
      environment: credsOrErr.environment,
      unit_id: unit.id,
      unit_name: unit.name,
    }));

    const sessionOrErr = await authenticateCora(credsOrErr);
    if ("error" in sessionOrErr) {
      const msg = `Falha de autenticação Cora: ${sessionOrErr.error}`;
      await recordEmissionError(admin, payment.id, "AUTH_FAILED", msg, {
        unit_id: unit.id,
        credential_source: hasUnitCora ? "UNIT" : "GLOBAL_UPLAY",
        environment: credsOrErr.environment,
        client_id_preview: `${credsOrErr.clientId.slice(0, 6)}...${credsOrErr.clientId.slice(-4)}`,
      });
      return json({ error: msg }, 502);
    }
    const session = sessionOrErr;

    try {
      // Payload Cora V2 — invoices (boleto + PIX)
      const payload: Record<string, unknown> = {
        code: payment.id,
        customer: {
          name: customerName,
          email: emailTrim,
          document: {
            identity: cpfDigits,
            type: cpfDigits.length === 11 ? "CPF" : "CNPJ",
          },
          address: {
            street: addrStreet.slice(0, 100),
            number: String(addrNumber).slice(0, 10),
            district: (addrDistrict || "Centro").slice(0, 60),
            city: addrCity.slice(0, 60),
            state: addrState,
            complement: (addrComplement || "N/A").slice(0, 60),
            zip_code: addrZip,
          },
        },
        services: [
          {
            name: (payment.description || "Cobrança UPLAY").slice(0, 100),
            description: (payment.description || "Cobrança UPLAY").slice(0, 200),
            amount: valueCents,
          },
        ],
        payment_terms: { due_date: dueDate },
        payment_forms: ["BANK_SLIP", "PIX"],
      };

      const maskedPayload = JSON.parse(JSON.stringify(payload));
      if (maskedPayload.customer?.document?.identity) {
        const id = String(maskedPayload.customer.document.identity);
        maskedPayload.customer.document.identity = id.slice(0, 3) + "***" + id.slice(-2);
      }
      if (maskedPayload.customer?.email) {
        const em = String(maskedPayload.customer.email);
        const [u, d] = em.split("@");
        maskedPayload.customer.email = `${u.slice(0, 2)}***@${d || ""}`;
      }

      const endpoint = "/v2/invoices";
      const result = await coraRequest(session, endpoint, "POST", payload);

      if (!result.ok) {
        const errors = result.data?.errors;
        const errList = Array.isArray(errors)
          ? errors.map((e: any) => `[${e.field || e.code || "erro"}] ${e.description || e.message || JSON.stringify(e)}`).join(" | ")
          : null;
        const detail =
          errList ||
          result.data?.message ||
          result.data?.error_description ||
          result.data?.error ||
          (result.raw ? result.raw.slice(0, 500) : `(corpo vazio)`);

        const fullError = `Cora ${result.status}: ${detail}`;

        console.error("[create-cora-charge] ERRO Cora", JSON.stringify({
          status: result.status, endpoint: result.url,
          response_body: result.data ?? result.raw,
        }));

        await recordEmissionError(
          admin,
          payment.id,
          `CORA_${result.status}`,
          fullError,
          maskedPayload,
          result.data ?? result.raw,
        );

        try {
          await admin.from("webhook_logs").insert({
            event: "cora:create_charge_error",
            local_payment_id: payment_id,
            payload: { status: result.status, response_body: result.data ?? result.raw, payload_sent: maskedPayload, detail },
          });
        } catch (_) { /* ignore */ }

        return json({
          error: fullError,
          cora_status: result.status,
          cora_response: result.data ?? result.raw,
          payload_sent: maskedPayload,
        }, 502);
      }

      const invoice = result.data;
      const coraInvoiceId = invoice?.id || invoice?.invoice_id || invoice?.code;
      const boletoUrl = invoice?.bank_slip?.url || invoice?.boleto?.url || invoice?.payment_options?.bank_slip?.url || null;
      const pixCopia = invoice?.pix?.emv || invoice?.pix?.payload || invoice?.payment_options?.pix?.emv || null;
      const pixQr = invoice?.pix?.qrcode_image || invoice?.pix?.qrcode || null;
      const invoiceUrl = invoice?.url || invoice?.invoice_url || boletoUrl;

      // incrementa attempts
      const { data: cur2 } = await admin.from("payments").select("emission_attempts").eq("id", payment.id).maybeSingle();
      const attempts = (cur2?.emission_attempts ?? 0) + 1;

      await admin
        .from("payments")
        .update({
          cora_invoice_id: coraInvoiceId,
          cora_status: invoice?.status || "OPEN",
          cora_synced_at: new Date().toISOString(),
          gateway: "CORA",
          payment_method: "BOLETO",
          boleto_url: boletoUrl,
          invoice_url: invoiceUrl,
          pix_copy_paste: pixCopia,
          pix_qr_code: pixQr,
          emission_status: "EMITTED",
          emission_error_code: null,
          emission_error_message: null,
          emission_payload: maskedPayload,
          emission_response: invoice,
          emission_last_attempt_at: new Date().toISOString(),
          emission_attempts: attempts,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);

      try {
        await admin.from("webhook_logs").insert({
          event: "cora:create_charge_success",
          local_payment_id: payment.id,
          payload: { cora_invoice_id: coraInvoiceId },
        });
      } catch (_) { /* ignore */ }

      return json({ success: true, cora_invoice_id: coraInvoiceId, boleto_url: boletoUrl, pix_copy_paste: pixCopia });
    } finally {
      session.close();
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
