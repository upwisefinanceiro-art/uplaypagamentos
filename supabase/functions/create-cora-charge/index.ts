// Edge Function: create-cora-charge
// Emite boleto+PIX no Banco Cora para uma parcela (payment_id) do Plano UPLAY.
// Usa credenciais GLOBAIS Cora (intermediação UPLAY).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import {
  authenticateCora,
  coraRequest,
  getGlobalCoraCredentials,
  onlyDigits,
} from "../_shared/cora-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
    if (!caller) return json({ error: "Não autorizado" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
    const allowed = roles?.some((r: { role: string }) => ["SUPER_ADMIN", "ADMIN_MASTER", "ADMIN_UNIDADE"].includes(r.role));
    if (!allowed) return json({ error: "Sem permissão" }, 403);

    const { payment_id } = await req.json();
    if (!payment_id) return json({ error: "payment_id obrigatório" }, 400);

    const { data: payment, error: pErr } = await admin
      .from("payments")
      .select("id, unit_id, responsible_id, value, final_value, due_date, description, status, gateway, payment_method, cora_invoice_id")
      .eq("id", payment_id)
      .single();
    if (pErr || !payment) return json({ error: "Parcela não encontrada" }, 404);

    if (payment.status !== "PENDING") return json({ error: `Parcela já está ${payment.status}` }, 400);
    if (payment.cora_invoice_id) {
      return json({ success: true, already_emitted: true, cora_invoice_id: payment.cora_invoice_id });
    }

    // Verifica plano UPLAY
    const { data: unit } = await admin
      .from("units")
      .select("id, partnership_plan, name")
      .eq("id", payment.unit_id)
      .single();
    if (!unit) return json({ error: "Unidade não encontrada" }, 404);
    if (unit.partnership_plan !== "PLANO_UPLAY") {
      return json({ error: "Esta unidade não está no Plano UPLAY (Cora)" }, 400);
    }

    // Pagador
    const { data: resp } = await admin
      .from("profiles")
      .select("full_name, cpf, email, phone, address")
      .eq("id", payment.responsible_id)
      .single();
    if (!resp || !resp.full_name || !resp.cpf) {
      return json({ error: "Responsável sem nome ou CPF cadastrado" }, 400);
    }

    const cpfDigits = onlyDigits(resp.cpf);
    if (cpfDigits.length !== 11 && cpfDigits.length !== 14) {
      return json({ error: "CPF/CNPJ do responsável inválido" }, 400);
    }

    // Credenciais globais
    const credsOrErr = getGlobalCoraCredentials();
    if ("error" in credsOrErr) return json({ error: credsOrErr.error }, 500);

    const sessionOrErr = await authenticateCora(credsOrErr);
    if ("error" in sessionOrErr) return json({ error: sessionOrErr.error }, 502);
    const session = sessionOrErr;

    try {
      const valueCents = Math.round(Number(payment.final_value || payment.value) * 100);
      if (valueCents < 1000) {
        return json({ error: "Valor mínimo R$ 10,00 para boleto Cora" }, 400);
      }

      // Payload Cora — boleto + PIX (BANK_SLIP)
      const payload = {
        code: payment.id, // referência interna (idempotência local)
        customer: {
          name: resp.full_name,
          email: resp.email || undefined,
          document: { identity: cpfDigits, type: cpfDigits.length === 11 ? "CPF" : "CNPJ" },
          address: {
            street: resp.address || "Não informado",
            number: "S/N",
            district: "Centro",
            city: "Belo Horizonte",
            state: "MG",
            complement: "",
            zip_code: "30000000",
          },
        },
        services: [
          {
            name: payment.description || "Cobrança UPLAY",
            description: payment.description || "Cobrança UPLAY",
            amount: valueCents,
          },
        ],
        payment_terms: {
          due_date: payment.due_date,
        },
        payment_forms: ["BANK_SLIP", "PIX"],
        notification: {
          name: resp.full_name,
          channels: resp.email
            ? [{ channel: "EMAIL", contact: resp.email, rules: ["NOTIFY_THREE_DAYS_BEFORE_DUE_DATE", "NOTIFY_ON_DUE_DATE"] }]
            : [],
        },
      };

      const result = await coraRequest(session, "/v2/invoices", "POST", payload);

      if (!result.ok) {
        const detail = result.data?.message || result.data?.errors?.[0]?.description || result.raw.slice(0, 300);
        try {
          await admin.from("webhook_logs").insert({
            event: "cora:create_charge_error",
            local_payment_id: payment_id,
            payload: { status: result.status, response: result.data || result.raw },
          });
        } catch (_) { /* ignore log failure */ }
        return json({ error: `Cora retornou ${result.status}: ${detail}` }, 502);
      }

      const invoice = result.data;
      const coraInvoiceId = invoice?.id || invoice?.invoice_id || invoice?.code;
      const boletoUrl = invoice?.bank_slip?.url || invoice?.boleto?.url || invoice?.payment_options?.bank_slip?.url || null;
      const pixCopia = invoice?.pix?.emv || invoice?.pix?.payload || invoice?.payment_options?.pix?.emv || null;
      const pixQr = invoice?.pix?.qrcode_image || invoice?.pix?.qrcode || null;
      const invoiceUrl = invoice?.url || invoice?.invoice_url || boletoUrl;

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
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);

      await admin.from("webhook_logs").insert({
        event: "cora:create_charge_success",
        local_payment_id: payment.id,
        payload: { cora_invoice_id: coraInvoiceId },
      }).catch(() => null);

      return json({ success: true, cora_invoice_id: coraInvoiceId, boleto_url: boletoUrl, pix_copy_paste: pixCopia });
    } finally {
      session.close();
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
