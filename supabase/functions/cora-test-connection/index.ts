// Edge Function: cora-test-connection
// Valida credenciais mTLS Cora autenticando via OAuth client_credentials.
// Lê credenciais por unit_id (units.cora_*) com fallback para secrets globais.
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

function getCoraBaseUrl(environment: string) {
  return environment === "production"
    ? "https://matls-clients.api.cora.com.br"
    : "https://matls-clients.api.stage.cora.com.br";
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
      ["SUPER_ADMIN", "ADMIN_MASTER", "ADMIN_UNIDADE"].includes(r.role)
    );
    if (!allowed) return jsonResponse({ error: "Sem permissão" }, 403);

    // ---- Origem das credenciais: unidade (preferido) ou globais (fallback) ----
    let unit_id: string | null = null;
    try {
      const body = await req.json();
      unit_id = body?.unit_id ?? null;
    } catch { /* sem body */ }

    let clientId: string | undefined;
    let certificate: string | undefined;
    let privateKey: string | undefined;
    let environment: string;
    let source: "unit" | "global" = "global";

    if (unit_id) {
      const { data: unit, error: unitErr } = await supabaseAdmin
        .from("units")
        .select("cora_client_id, cora_certificate, cora_private_key, cora_environment")
        .eq("id", unit_id)
        .maybeSingle();
      if (unitErr) return jsonResponse({ success: false, error: `Erro ao buscar unidade: ${unitErr.message}` });
      if (!unit) return jsonResponse({ success: false, error: "Unidade não encontrada" });

      clientId = unit.cora_client_id ?? undefined;
      certificate = unit.cora_certificate ?? undefined;
      privateKey = unit.cora_private_key ?? undefined;
      environment = (unit.cora_environment || "stage").toLowerCase();
      source = "unit";

      if (!clientId || !certificate || !privateKey) {
        return jsonResponse({
          success: false,
          error: "Esta unidade ainda não possui credenciais Cora configuradas. Cadastre na aba 'Banco Cora' do perfil da unidade.",
        });
      }
    } else {
      clientId = Deno.env.get("CORA_CLIENT_ID");
      certificate = Deno.env.get("CORA_CERTIFICATE");
      privateKey = Deno.env.get("CORA_PRIVATE_KEY");
      environment = (Deno.env.get("CORA_ENVIRONMENT") || "stage").toLowerCase();

      const missing: string[] = [];
      if (!clientId) missing.push("CORA_CLIENT_ID");
      if (!certificate) missing.push("CORA_CERTIFICATE");
      if (!privateKey) missing.push("CORA_PRIVATE_KEY");
      if (missing.length > 0) {
        return jsonResponse({ success: false, error: `Secrets faltando: ${missing.join(", ")}` });
      }
    }

    const baseUrl = getCoraBaseUrl(environment);

    // ---- Normalização e diagnóstico de PEMs ----
    const normalizePem = (raw: string, labelPattern: string) => {
      const normalized = raw.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
      const match = normalized.match(new RegExp(`-----BEGIN (${labelPattern})-----([\\s\\S]*?)-----END \\1-----`));
      if (!match) return normalized;
      const label = match[1];
      const body = match[2].replace(/\s+/g, "");
      const wrapped = body.match(/.{1,64}/g)?.join("\n") || body;
      return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----`;
    };
    const certPem = normalizePem(certificate!, "CERTIFICATE");
    const keyPem = normalizePem(privateKey!, "(?:RSA |EC )?PRIVATE KEY");

    const certHasHeader = /-----BEGIN CERTIFICATE-----/.test(certPem);
    const certHasFooter = /-----END CERTIFICATE-----/.test(certPem);
    const keyHasHeader = /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(keyPem);
    const keyHasFooter = /-----END (?:RSA |EC )?PRIVATE KEY-----/.test(keyPem);

    if (!certHasHeader || !certHasFooter) {
      return jsonResponse({
        success: false,
        source,
        error: "CORA_CERTIFICATE não está em formato PEM válido (-----BEGIN/END CERTIFICATE-----).",
      });
    }
    if (!keyHasHeader || !keyHasFooter) {
      return jsonResponse({
        success: false,
        source,
        error: "CORA_PRIVATE_KEY não está em formato PEM válido (-----BEGIN/END PRIVATE KEY-----).",
      });
    }

    // ---- mTLS client ----
    let httpClient: Deno.HttpClient;
    try {
      // @ts-ignore
      httpClient = Deno.createHttpClient({ cert: certPem, key: keyPem });
    } catch (e) {
      return jsonResponse({
        success: false,
        source,
        error: `Falha ao criar cliente mTLS: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    const tokenUrl = `${baseUrl}/token`;
    const formBody = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId!,
    });

    let tokenRes: Response;
    try {
      tokenRes = await fetch(tokenUrl, {
        method: "POST",
        // @ts-ignore
        client: httpClient,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: formBody.toString(),
      });
    } catch (e) {
      try { httpClient.close(); } catch { /* noop */ }
      return jsonResponse({
        success: false,
        source,
        error: `Falha de rede ao chamar Cora: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    const rawText = await tokenRes.text();
    let parsed: Record<string, unknown> | null = null;
    try { parsed = JSON.parse(rawText); } catch { /* not json */ }

    try { httpClient.close(); } catch { /* noop */ }

    if (!tokenRes.ok) {
      const detail = (parsed && (parsed.error_description || parsed.message || parsed.error)) || rawText.slice(0, 300);
      return jsonResponse({
        success: false,
        source,
        environment,
        status_code: tokenRes.status,
        error: `Cora retornou ${tokenRes.status}: ${detail}`,
      });
    }

    const accessToken = parsed?.access_token as string | undefined;
    const expiresIn = parsed?.expires_in as number | undefined;

    if (!accessToken) {
      return jsonResponse({
        success: false,
        source,
        environment,
        error: "Cora respondeu 200, mas sem access_token.",
      });
    }

    return jsonResponse({
      success: true,
      source,
      environment,
      base_url: baseUrl,
      client_id: clientId,
      token_preview: `${accessToken.slice(0, 12)}...`,
      expires_in: expiresIn ?? null,
      message: `Conexão Cora OK (origem: ${source === "unit" ? "credenciais da unidade" : "secrets globais"}).`,
    });
  } catch (err) {
    return jsonResponse({
      success: false,
      error: err instanceof Error ? err.message : "Erro interno",
    }, 500);
  }
});
