// Edge Function: auto-emit-pending-charges
// Varre parcelas PENDING sem ID externo (asaas_payment_id / cora_invoice_id)
// e dispara a emissão automática no provedor correto (Asaas ou Cora) com base
// no campo `gateway` da parcela (que já é setado pelo provider preferido da unidade).
// Background processing — retorna imediatamente quantidade enfileirada.
//
// Pode ser chamado:
//   - Por admin autenticado (Authorization: Bearer <jwt>)
//   - Pelo cron interno (header x-internal-key === SUPABASE_SERVICE_ROLE_KEY ou body.scheduled === true)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function recordEmissionError(admin: any, paymentId: string, gateway: string, code: string, message: string, response?: unknown) {
  try {
    const { data: cur } = await admin.from("payments").select("emission_attempts").eq("id", paymentId).maybeSingle();
    await admin.from("payments").update({
      gateway,
      emission_status: "ERROR",
      emission_error_code: code,
      emission_error_message: message,
      emission_response: response ?? null,
      emission_last_attempt_at: new Date().toISOString(),
      emission_attempts: (cur?.emission_attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq("id", paymentId);
  } catch (e) {
    console.error("[auto-emit-pending-charges] failed to record route error", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    let body: { unit_id?: string; limit?: number; scheduled?: boolean } = {};
    try { body = await req.json(); } catch { /* sem body */ }

    const authHeader = req.headers.get("Authorization");
    const internalKey = req.headers.get("x-internal-key");
    const isScheduled = body.scheduled === true || internalKey === serviceRoleKey;

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Autorização: cron OU admin
    if (!isScheduled) {
      if (!authHeader) return json({ error: "Não autorizado" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user: caller } } = await userClient.auth.getUser();
      if (!caller) return json({ error: "Não autorizado" }, 401);
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
      const allowed = roles?.some((r: { role: string }) =>
        ["SUPER_ADMIN", "ADMIN_MASTER", "ADMIN_UNIDADE"].includes(r.role)
      );
      if (!allowed) return json({ error: "Sem permissão" }, 403);
    }

    const limit = Math.min(Math.max(body.limit ?? 200, 1), 500);

    // Busca pendentes sem ID externo
    let q = admin
      .from("payments")
      .select("id, unit_id, gateway, payment_provider, asaas_payment_id, cora_invoice_id, payment_method")
      .eq("status", "PENDING")
      .neq("payment_method", "DINHEIRO")
      .or("asaas_payment_id.is.null,cora_invoice_id.is.null")
      .limit(limit);
    if (body.unit_id) q = q.eq("unit_id", body.unit_id);

    const { data: pending, error } = await q;
    if (error) return json({ error: error.message }, 500);

    // Filtra: só o que realmente falta o ID do gateway escolhido — SEM fallback de banco.
    // payment_provider é a fonte única da verdade.
    const queue = (pending ?? []).filter((p: any) => {
      const gw = String(p.payment_provider || p.gateway || "").toUpperCase();
      if (gw !== "ASAAS" && gw !== "CORA") {
        console.warn("[auto-emit-pending-charges] SKIP — provider ausente", p.id);
        return false;
      }
      if (gw === "CORA") return !p.cora_invoice_id;
      return !p.asaas_payment_id;
    });

    // Background: roteia para o provedor correto
    (async () => {
      let okCora = 0, okAsaas = 0, fail = 0;
      const runHeaders: Record<string, string> = authHeader
        ? { Authorization: authHeader }
        : { Authorization: `Bearer ${serviceRoleKey}` };

      for (const p of queue) {
        const gw = String(p.gateway || "ASAAS").toUpperCase();
        const fnName = gw === "CORA" ? "create-cora-charge" : "sync-asaas-payment";
        try {
          const r = await admin.functions.invoke(fnName, {
            body: { payment_id: p.id },
            headers: runHeaders,
          });
          const err = (r as any).error;
          const dataErr = (r as any).data?.error;
          if (err || dataErr) {
            fail++;
            const message = dataErr || err?.message || `Falha ao emitir cobrança no ${gw === "CORA" ? "Cora" : "Asaas"}.`;
            await recordEmissionError(admin, p.id, gw, "AUTO_EMIT_FUNCTION_ERROR", message, (r as any).data ?? err);
          } else if (gw === "CORA") okCora++;
          else okAsaas++;
        } catch (e) {
          fail++;
          await recordEmissionError(admin, p.id, gw, "AUTO_EMIT_EXCEPTION", e instanceof Error ? e.message : String(e));
        }
      }
      try {
        await admin.from("audit_logs").insert({
          action: "auto_emit_pending_charges",
          target_table: "payments",
          target_id: body.unit_id ?? "00000000-0000-0000-0000-000000000000",
          performed_by: "00000000-0000-0000-0000-000000000000",
          details: { ok_cora: okCora, ok_asaas: okAsaas, fail, total: queue.length, scheduled: isScheduled },
        });
      } catch (_) { /* ignore */ }
    })();

    return json({ success: true, queued: queue.length, total_pending: pending?.length ?? 0 });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
