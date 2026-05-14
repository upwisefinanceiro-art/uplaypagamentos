import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EVENTS = [
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_REFUNDED",
  "PAYMENT_RESTORED",
];

function decodeJwtUserId(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    return JSON.parse(atob(authHeader.slice(7).split(".")[1])).sub ?? null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  const isScheduled = body?.scheduled === true;

  // Authorization (skip for cron)
  if (!isScheduled) {
    const userId = decodeJwtUserId(req.headers.get("Authorization"));
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const allowed = (roles ?? []).some((r: any) =>
      ["SUPER_ADMIN", "ADMIN_MASTER", "ADMIN_UNIDADE"].includes(r.role));
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/asaas-webhook`;
  const onlyUnitId: string | undefined = body?.unit_id;

  let q = admin.from("units")
    .select("id, name, asaas_api_key, asaas_base_url, asaas_webhook_token, email_empresa")
    .eq("active", true)
    .not("asaas_api_key", "is", null);
  if (onlyUnitId) q = q.eq("id", onlyUnitId);

  const { data: units, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];

  for (const u of units ?? []) {
    try {
      const baseUrl = u.asaas_base_url || "https://api.asaas.com/v3";
      const apiKey = u.asaas_api_key;
      let token = u.asaas_webhook_token;
      if (!token) {
        token = crypto.randomUUID().replace(/-/g, "");
        await admin.from("units").update({ asaas_webhook_token: token }).eq("id", u.id);
      }

      // 1) List existing webhooks
      const listRes = await fetch(`${baseUrl}/webhooks?limit=100`, {
        headers: { access_token: apiKey },
      });
      const listBody = await listRes.json().catch(() => ({}));
      const existing = (listBody?.data ?? []).find(
        (w: any) => w.url === webhookUrl,
      );

      const payload = {
        name: "UPLAY Sync",
        url: webhookUrl,
        email: u.email_empresa || "financeiro@uplaypagamento.com.br",
        enabled: true,
        interrupted: false,
        apiVersion: 3,
        authToken: token,
        sendType: "SEQUENTIALLY",
        events: EVENTS,
      };

      let action: string;
      let respBody: any;
      if (existing?.id) {
        const upd = await fetch(`${baseUrl}/webhooks/${existing.id}`, {
          method: "PUT",
          headers: { access_token: apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        respBody = await upd.json().catch(() => ({}));
        action = upd.ok ? "UPDATED" : `ERROR_${upd.status}`;
      } else {
        const cre = await fetch(`${baseUrl}/webhooks`, {
          method: "POST",
          headers: { access_token: apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        respBody = await cre.json().catch(() => ({}));
        action = cre.ok ? "CREATED" : `ERROR_${cre.status}`;
      }

      results.push({
        unit_id: u.id, unit_name: u.name, action,
        error: action.startsWith("ERROR") ? (respBody?.errors?.[0]?.description || JSON.stringify(respBody)) : null,
      });
    } catch (err) {
      results.push({
        unit_id: u.id, unit_name: u.name, action: "ERROR",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, webhook_url: webhookUrl, results }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
