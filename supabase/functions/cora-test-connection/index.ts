// Edge Function: cora-test-connection
// Valida as credenciais mTLS do Banco Cora autenticando via OAuth client_credentials.
// Usa as secrets globais: CORA_CLIENT_ID, CORA_CERTIFICATE, CORA_PRIVATE_KEY, CORA_ENVIRONMENT
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
  // Integração Direta usa subdomínio matls-clients
  return environment === "production"
    ? "https://matls-clients.api.cora.com.br"
    : "https://matls-clients.api.stage.cora.com.br";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---- Autenticação do usuário chamador ----
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

    // ---- Carregar credenciais Cora das secrets ----
    const clientId = Deno.env.get("CORA_CLIENT_ID");
    const certificate = Deno.env.get("CORA_CERTIFICATE");
    const privateKey = Deno.env.get("CORA_PRIVATE_KEY");
    const environment = (Deno.env.get("CORA_ENVIRONMENT") || "stage").toLowerCase();

    const missing: string[] = [];
    if (!clientId) missing.push("CORA_CLIENT_ID");
    if (!certificate) missing.push("CORA_CERTIFICATE");
    if (!privateKey) missing.push("CORA_PRIVATE_KEY");
    if (missing.length > 0) {
      return jsonResponse({
        success: false,
        error: `Secrets faltando: ${missing.join(", ")}`,
      });
    }

    const baseUrl = getCoraBaseUrl(environment);

    // ---- Diagnóstico de formato dos PEMs ----
    // Normaliza: aceita PEMs com \n literais, \r\n ou já formatados.
    const normalizePem = (s: string) => s.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
    const certPem = normalizePem(certificate!);
    const keyPem = normalizePem(privateKey!);

    const certHasHeader = /-----BEGIN CERTIFICATE-----/.test(certPem);
    const certHasFooter = /-----END CERTIFICATE-----/.test(certPem);
    const keyHasHeader = /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(keyPem);
    const keyHasFooter = /-----END (?:RSA |EC )?PRIVATE KEY-----/.test(keyPem);

    const diagnostics = {
      cert_length: certPem.length,
      cert_first_40: certPem.slice(0, 40),
      cert_last_40: certPem.slice(-40),
      cert_has_header: certHasHeader,
      cert_has_footer: certHasFooter,
      cert_line_count: certPem.split("\n").length,
      key_length: keyPem.length,
      key_first_40: keyPem.slice(0, 40),
      key_last_40: keyPem.slice(-40),
      key_has_header: keyHasHeader,
      key_has_footer: keyHasFooter,
      key_line_count: keyPem.split("\n").length,
    };
    console.log("[cora-test-connection] PEM diagnostics:", JSON.stringify(diagnostics));

    if (!certHasHeader || !certHasFooter) {
      return jsonResponse({
        success: false,
        error: "CORA_CERTIFICATE não está em formato PEM válido. Faltam as linhas '-----BEGIN CERTIFICATE-----' e/ou '-----END CERTIFICATE-----'.",
        diagnostics,
      });
    }
    if (!keyHasHeader || !keyHasFooter) {
      return jsonResponse({
        success: false,
        error: "CORA_PRIVATE_KEY não está em formato PEM válido. Faltam as linhas '-----BEGIN PRIVATE KEY-----' (ou RSA/EC) e/ou '-----END PRIVATE KEY-----'.",
        diagnostics,
      });
    }

    // ---- Criar HTTP client com mTLS ----
    let httpClient: Deno.HttpClient;
    try {
      // @ts-ignore - Deno.createHttpClient existe no runtime do Supabase Edge
      httpClient = Deno.createHttpClient({
        cert: certPem,
        key: keyPem,
      });
    } catch (e) {
      return jsonResponse({
        success: false,
        error: `Falha ao criar cliente mTLS: ${e instanceof Error ? e.message : String(e)}. Verifique se o certificado e a chave privada estão no formato PEM correto.`,
        diagnostics,
      });
    }

    // ---- Chamar endpoint de OAuth do Cora ----
    const tokenUrl = `${baseUrl}/token`;
    const formBody = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId!,
    });

    let tokenRes: Response;
    try {
      tokenRes = await fetch(tokenUrl, {
        method: "POST",
        // @ts-ignore - client é suportado no runtime
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
        environment,
        error: "Cora respondeu 200, mas sem access_token na resposta.",
      });
    }

    return jsonResponse({
      success: true,
      environment,
      base_url: baseUrl,
      client_id: clientId,
      token_preview: `${accessToken.slice(0, 12)}...`,
      expires_in: expiresIn ?? null,
      message: "Conexão com o Banco Cora estabelecida com sucesso via mTLS.",
    });
  } catch (err) {
    return jsonResponse({
      success: false,
      error: err instanceof Error ? err.message : "Erro interno",
    }, 500);
  }
});
