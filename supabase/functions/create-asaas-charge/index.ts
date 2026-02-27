import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ChargeInput {
  responsible_id: string;
  student_id?: string;
  contract_id?: string;
  value: number;
  due_date: string;
  billing_type: "PIX" | "BOLETO" | "CARD";
  description?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1) Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Parse input
    const body: ChargeInput = await req.json();
    const { responsible_id, student_id, contract_id, value, due_date, billing_type, description } = body;

    if (!responsible_id || !value || !due_date || !billing_type) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: responsible_id, value, due_date, billing_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2) Get user's unit_id
    const { data: userProfile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("unit_id")
      .eq("id", userId)
      .single();

    if (profileErr || !userProfile?.unit_id) {
      return new Response(
        JSON.stringify({ error: "Usuário sem unidade vinculada" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const unitId = userProfile.unit_id;

    // 3) Get unit's Asaas credentials
    const { data: unit, error: unitErr } = await supabaseAdmin
      .from("units")
      .select("asaas_api_key, asaas_base_url")
      .eq("id", unitId)
      .single();

    if (unitErr || !unit?.asaas_api_key) {
      return new Response(
        JSON.stringify({ error: "Unidade sem credenciais Asaas configuradas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = unit.asaas_base_url || "https://sandbox.asaas.com/api/v3";

    // 4) Get responsible profile
    const { data: responsible, error: respErr } = await supabaseAdmin
      .from("profiles")
      .select("full_name, cpf, phone, asaas_customer_id")
      .eq("id", responsible_id)
      .single();

    if (respErr || !responsible) {
      return new Response(
        JSON.stringify({ error: "Responsável não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5) Ensure Asaas customer exists
    let asaasCustomerId = responsible.asaas_customer_id;

    if (!asaasCustomerId) {
      const cpfClean = responsible.cpf.replace(/\D/g, "");
      const customerPayload = {
        name: responsible.full_name,
        cpfCnpj: cpfClean,
        email: `${cpfClean}@ensinup.app`,
        mobilePhone: responsible.phone || undefined,
      };

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
        return new Response(
          JSON.stringify({ error: "Erro ao criar customer no Asaas", details: customerData }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      asaasCustomerId = customerData.id;

      await supabaseAdmin
        .from("profiles")
        .update({ asaas_customer_id: asaasCustomerId })
        .eq("id", responsible_id);
    }

    // 6) Create charge in Asaas
    const billingTypeMap: Record<string, string> = {
      PIX: "PIX",
      BOLETO: "BOLETO",
      CARD: "CREDIT_CARD",
    };

    const chargePayload = {
      customer: asaasCustomerId,
      billingType: billingTypeMap[billing_type],
      value,
      dueDate: due_date,
      description: description || "Mensalidade EnsinUP",
    };

    const chargeRes = await fetch(`${baseUrl}/payments`, {
      method: "POST",
      headers: {
        access_token: unit.asaas_api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chargePayload),
    });

    const chargeData = await chargeRes.json();

    if (!chargeRes.ok) {
      return new Response(
        JSON.stringify({ error: "Erro ao criar cobrança no Asaas", details: chargeData }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7) Extract links
    let pixQrCode: string | null = null;
    let pixCopyPaste: string | null = null;
    let invoiceUrl: string | null = chargeData.invoiceUrl || null;
    let boletoUrl: string | null = chargeData.bankSlipUrl || null;
    let checkoutUrl: string | null = null;

    if (billing_type === "PIX" && chargeData.id) {
      try {
        const pixRes = await fetch(`${baseUrl}/payments/${chargeData.id}/pixQrCode`, {
          headers: { access_token: unit.asaas_api_key },
        });
        if (pixRes.ok) {
          const pixData = await pixRes.json();
          pixQrCode = pixData.encodedImage || null;
          pixCopyPaste = pixData.payload || null;
        }
      } catch {
        // non-critical
      }
    }

    if (billing_type === "CARD") {
      checkoutUrl = chargeData.invoiceUrl || null;
    }

    // 8) Save to payments table
    const paymentInsert: Record<string, unknown> = {
      unit_id: unitId,
      contract_id: contract_id || null,
      responsible_id: responsible_id,
      installment_number: 1,
      due_date,
      value,
      status: "PENDING",
      asaas_payment_id: chargeData.id,
      pix_qr_code: pixQrCode,
      pix_copy_paste: pixCopyPaste,
      boleto_url: boletoUrl,
      invoice_url: invoiceUrl,
      checkout_url: checkoutUrl,
      payment_method: billing_type,
      raw_response: chargeData,
    };

    const { data: payment, error: insertErr } = await supabaseAdmin
      .from("payments")
      .insert(paymentInsert)
      .select("id")
      .single();

    if (insertErr) {
      return new Response(
        JSON.stringify({ error: "Cobrança criada no Asaas mas erro ao salvar no banco", details: insertErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        payment_id: payment.id,
        asaas_charge_id: chargeData.id,
        status: "PENDING",
        invoice_url: invoiceUrl,
        pix_qr_code: pixQrCode,
        pix_copy_paste: pixCopyPaste,
        boleto_url: boletoUrl,
        checkout_url: checkoutUrl,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
