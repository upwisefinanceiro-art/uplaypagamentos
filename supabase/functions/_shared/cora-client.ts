// Shared helper for Cora mTLS API calls
// Used by create-cora-charge and emit-pending-cora-boletos

export const CORA_BASES: Record<string, string> = {
  production: "https://matls-clients.api.cora.com.br",
  stage: "https://matls-clients.api.stage.cora.com.br",
};

export function getCoraBaseUrl(env: string) {
  return CORA_BASES[env === "production" ? "production" : "stage"];
}

export function normalizePem(raw: string, labelPattern: string) {
  const normalized = raw.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
  const match = normalized.match(new RegExp(`-----BEGIN (${labelPattern})-----([\\s\\S]*?)-----END \\1-----`));
  if (!match) return normalized;
  const label = match[1];
  const body = match[2].replace(/\s+/g, "");
  const wrapped = body.match(/.{1,64}/g)?.join("\n") || body;
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----`;
}

export interface CoraCredentials {
  clientId: string;
  certificate: string;
  privateKey: string;
  environment: string;
}

export function getGlobalCoraCredentials(): CoraCredentials | { error: string } {
  const clientId = Deno.env.get("CORA_CLIENT_ID");
  const certificate = Deno.env.get("CORA_CERTIFICATE");
  const privateKey = Deno.env.get("CORA_PRIVATE_KEY");
  const environment = (Deno.env.get("CORA_ENVIRONMENT") || "stage").toLowerCase();

  const missing: string[] = [];
  if (!clientId) missing.push("CORA_CLIENT_ID");
  if (!certificate) missing.push("CORA_CERTIFICATE");
  if (!privateKey) missing.push("CORA_PRIVATE_KEY");
  if (missing.length) return { error: `Secrets Cora faltando: ${missing.join(", ")}` };

  return { clientId: clientId!, certificate: certificate!, privateKey: privateKey!, environment };
}

export interface CoraSession {
  httpClient: Deno.HttpClient;
  baseUrl: string;
  accessToken: string;
  close: () => void;
}

export async function authenticateCora(creds: CoraCredentials): Promise<CoraSession | { error: string }> {
  const certPem = normalizePem(creds.certificate, "CERTIFICATE");
  const keyPem = normalizePem(creds.privateKey, "(?:RSA |EC )?PRIVATE KEY");
  const baseUrl = getCoraBaseUrl(creds.environment);

  let httpClient: Deno.HttpClient;
  try {
    // @ts-ignore - Deno API
    httpClient = Deno.createHttpClient({ cert: certPem, key: keyPem });
  } catch (e) {
    return { error: `Falha mTLS: ${e instanceof Error ? e.message : String(e)}` };
  }

  const close = () => { try { httpClient.close(); } catch { /* noop */ } };

  let tokenRes: Response;
  try {
    tokenRes = await fetch(`${baseUrl}/token`, {
      method: "POST",
      // @ts-ignore
      client: httpClient,
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: creds.clientId }).toString(),
    });
  } catch (e) {
    close();
    return { error: `Falha de rede Cora: ${e instanceof Error ? e.message : String(e)}` };
  }

  const text = await tokenRes.text();
  if (!tokenRes.ok) {
    close();
    return { error: `Cora auth ${tokenRes.status}: ${text.slice(0, 300)}` };
  }
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* ignore */ }
  const accessToken = parsed?.access_token;
  if (!accessToken) {
    close();
    return { error: "Cora auth sem access_token" };
  }
  return { httpClient, baseUrl, accessToken, close };
}

export async function coraRequest(session: CoraSession, path: string, method: string, body?: unknown) {
  const res = await fetch(`${session.baseUrl}${path}`, {
    method,
    // @ts-ignore
    client: session.httpClient,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* not json */ }
  return { ok: res.ok, status: res.status, data: parsed, raw: text };
}

export function onlyDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}
