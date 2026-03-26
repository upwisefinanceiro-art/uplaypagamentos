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

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check admin
    const { data: callerRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const isAdmin = callerRoles?.some((r: { role: string }) =>
      r.role === "ADMIN_MASTER" || r.role === "ADMIN_UNIDADE"
    );
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get optional unit_id filter
    let unitFilter: string | null = null;
    try {
      const body = await req.json();
      unitFilter = body.unit_id || null;
    } catch { /* no body */ }

    // Get all pending/overdue payments with asaas_payment_id
    let query = supabase
      .from("payments")
      .select("id, asaas_payment_id, unit_id, status, paid_at, pix_qr_code, pix_copy_paste")
      .not("asaas_payment_id", "is", null)
      .in("status", ["PENDING", "OVERDUE"]);

    if (unitFilter) {
      query = query.eq("unit_id", unitFilter);
    }

    const { data: payments, error: fetchErr } = await query;

    if (fetchErr) {
      return new Response(JSON.stringify({ error: "Erro ao buscar pagamentos" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!payments || payments.length === 0) {
      return new Response(JSON.stringify({ success: true, synced: 0, message: "Nenhum pagamento pendente para sincronizar" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group payments by unit to reuse API keys
    const byUnit: Record<string, typeof payments> = {};
    for (const p of payments) {
      if (!byUnit[p.unit_id]) byUnit[p.unit_id] = [];
      byUnit[p.unit_id].push(p);
    }

    let synced = 0;
    let errors = 0;
    const results: Array<{ id: string; oldStatus: string; newStatus: string }> = [];

    for (const [unitId, unitPayments] of Object.entries(byUnit)) {
      const { data: unit } = await supabase
        .from("units")
        .select("asaas_api_key, asaas_base_url")
        .eq("id", unitId)
        .single();

      if (!unit?.asaas_api_key) {
        errors += unitPayments.length;
        continue;
      }

      const baseUrl = unit.asaas_base_url || "https://api.asaas.com/v3";

      for (const payment of unitPayments) {
        try {
          const res = await fetch(`${baseUrl}/payments/${payment.asaas_payment_id}`, {
            headers: { access_token: unit.asaas_api_key },
          });

          if (!res.ok) {
            errors++;
            continue;
          }

          const asaasData = await res.json();
          const newStatus = statusMap[asaasData.status] || payment.status;

          const updateData: Record<string, unknown> = {
            status: newStatus,
            invoice_url: asaasData.invoiceUrl || undefined,
            boleto_url: asaasData.bankSlipUrl || undefined,
            raw_response: asaasData,
          };

          if (newStatus === "PAID" && !payment.paid_at) {
            updateData.paid_at = asaasData.paymentDate || new Date().toISOString();
          }

          // Fetch PIX if needed
          if (asaasData.billingType === "PIX" && (!payment.pix_qr_code || !payment.pix_copy_paste)) {
            try {
              const pixRes = await fetch(`${baseUrl}/payments/${payment.asaas_payment_id}/pixQrCode`, {
                headers: { access_token: unit.asaas_api_key },
              });
              if (pixRes.ok) {
                const pixData = await pixRes.json();
                updateData.pix_qr_code = pixData.encodedImage || null;
                updateData.pix_copy_paste = pixData.payload || null;
              }
            } catch { /* non-critical */ }
          }

          const cleanUpdate = Object.fromEntries(
            Object.entries(updateData).filter(([, v]) => v !== undefined)
          );

          await supabase.from("payments").update(cleanUpdate).eq("id", payment.id);

          if (newStatus !== payment.status) {
            results.push({ id: payment.id, oldStatus: payment.status, newStatus });
          }
          synced++;
        } catch {
          errors++;
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      synced,
      errors,
      changed: results,
      message: `${synced} pagamento(s) sincronizado(s), ${results.length} atualizado(s)`,
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
