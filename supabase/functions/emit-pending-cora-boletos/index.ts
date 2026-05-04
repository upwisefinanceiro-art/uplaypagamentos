// Edge Function: emit-pending-cora-boletos
// Emite em lote os boletos Cora pendentes (gateway=CORA, status=PENDING, sem cora_invoice_id).
// Background processing — retorna imediatamente quantidade enfileirada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

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
    const allowed = roles?.some((r: { role: string }) => ["SUPER_ADMIN", "ADMIN_MASTER"].includes(r.role));
    if (!allowed) return json({ error: "Sem permissão" }, 403);

    const { unit_id } = await req.json().catch(() => ({}));

    // Lista parcelas elegíveis em unidades do Plano UPLAY
    let q = admin
      .from("payments")
      .select("id, unit_id, units!inner(partnership_plan)")
      .eq("status", "PENDING")
      .eq("gateway", "CORA")
      .is("cora_invoice_id", null)
      .eq("units.partnership_plan", "PLANO_UPLAY")
      .limit(200);

    if (unit_id) q = q.eq("unit_id", unit_id);

    const { data: pending, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const ids = (pending ?? []).map((p: any) => p.id);

    // Background: dispara create-cora-charge sequencialmente
    (async () => {
      let ok = 0, fail = 0;
      for (const id of ids) {
        try {
          const r = await admin.functions.invoke("create-cora-charge", {
            body: { payment_id: id },
            headers: { Authorization: authHeader },
          });
          if ((r as any).error) fail++;
          else ok++;
        } catch {
          fail++;
        }
      }
      try {
        await admin.from("webhook_logs").insert({
          event: "cora:batch_emit_done",
          unit_id: unit_id ?? null,
          payload: { ok, fail, total: ids.length },
        });
      } catch (_) { /* ignore */ }
    })();

    return json({ success: true, queued: ids.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
