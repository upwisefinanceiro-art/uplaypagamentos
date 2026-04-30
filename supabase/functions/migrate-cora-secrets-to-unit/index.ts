// Edge Function: migrate-cora-secrets-to-unit
// Copia as secrets globais CORA_* para uma unidade específica (one-shot).
// Apenas SUPER_ADMIN ou ADMIN_MASTER podem executar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Não autorizado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await supabaseUser.auth.getUser();
    if (!caller) return jsonResponse({ error: "Não autorizado" }, 401);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const allowed = roles?.some((r: { role: string }) =>
      ["SUPER_ADMIN", "ADMIN_MASTER"].includes(r.role)
    );
    if (!allowed) return jsonResponse({ error: "Sem permissão" }, 403);

    const { unit_id } = await req.json();
    if (!unit_id) return jsonResponse({ error: "unit_id é obrigatório" }, 400);

    const clientId = Deno.env.get("CORA_CLIENT_ID");
    const certificate = Deno.env.get("CORA_CERTIFICATE");
    const privateKey = Deno.env.get("CORA_PRIVATE_KEY");
    const environment = (Deno.env.get("CORA_ENVIRONMENT") || "stage").toLowerCase();

    if (!clientId || !certificate || !privateKey) {
      return jsonResponse({ error: "Secrets globais CORA_* não configuradas" }, 400);
    }

    const { error } = await supabaseAdmin
      .from("units")
      .update({
        cora_client_id: clientId,
        cora_certificate: certificate,
        cora_private_key: privateKey,
        cora_environment: environment,
      })
      .eq("id", unit_id);

    if (error) return jsonResponse({ error: error.message }, 500);

    return jsonResponse({ success: true, message: "Credenciais Cora copiadas para a unidade." });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Erro" }, 500);
  }
});
