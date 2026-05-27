// Send message (agent → customer) - routes by provider
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/omni-cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (!claims?.claims) return jsonResponse({ error: "unauthorized" }, 401);
  const userId = claims.claims.sub;

  const body = await req.json().catch(() => ({})) as any;
  const { conversation_id, content, message_type = "text", media_url, media_mime } = body;
  if (!conversation_id || (!content && !media_url)) return jsonResponse({ error: "invalid payload" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: conv } = await admin.from("omni_conversations").select("*, omni_contacts(*), omni_integrations(*)")
    .eq("id", conversation_id).maybeSingle();
  if (!conv) return jsonResponse({ error: "conversation not found" }, 404);

  // Insert local message first
  const { data: msg, error: msgErr } = await admin.from("omni_messages").insert({
    conversation_id: conv.id, company_id: conv.company_id, unit_id: conv.unit_id,
    integration_id: conv.integration_id, sender_type: "agent", sender_id: userId,
    message_type, content, media_url, media_mime, delivery_status: "pending",
  }).select().single();
  if (msgErr) return jsonResponse({ error: msgErr.message }, 500);

  const integ = (conv as any).omni_integrations;
  const contact = (conv as any).omni_contacts;
  if (!integ) {
    await admin.from("omni_messages").update({ delivery_status: "sent" }).eq("id", msg.id);
    return jsonResponse({ ok: true, message: msg, warning: "no integration linked" });
  }

  // Route outbound
  try {
    let externalId: string | null = null;
    if (integ.provider === "EVOLUTION_API") {
      const creds = integ.credentials ?? {};
      const baseUrl: string = creds.base_url?.replace(/\/$/, "");
      const instance: string = creds.instance ?? integ.display_name;
      const apiKey: string = creds.api_key;
      if (!baseUrl || !apiKey) throw new Error("Evolution: base_url e api_key obrigatórios");
      const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ number: contact.phone_e164, text: content }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(JSON.stringify(json));
      externalId = json?.key?.id ?? null;
      await admin.from("omni_integration_logs").insert({
        integration_id: integ.id, company_id: integ.company_id, unit_id: integ.unit_id,
        event: "message.send", direction: "outbound", payload: { conversation_id, content },
        response: json, http_status: res.status,
      });
    } else if (integ.provider === "META_WHATSAPP_CLOUD") {
      const creds = integ.credentials ?? {};
      const phoneId = creds.phone_number_id;
      const token = creds.access_token;
      if (!phoneId || !token) throw new Error("Meta: phone_number_id e access_token obrigatórios");
      const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messaging_product: "whatsapp", to: contact.phone_e164, type: "text", text: { body: content },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(JSON.stringify(json));
      externalId = json?.messages?.[0]?.id ?? null;
    } else {
      throw new Error(`Provider ${integ.provider} ainda não suportado para envio`);
    }

    await admin.from("omni_messages").update({
      delivery_status: "sent", external_id: externalId,
    }).eq("id", msg.id);
    return jsonResponse({ ok: true, message_id: msg.id, external_id: externalId });
  } catch (err) {
    await admin.from("omni_messages").update({
      delivery_status: "failed", error_message: String(err),
    }).eq("id", msg.id);
    await admin.from("omni_integration_logs").insert({
      integration_id: integ.id, company_id: integ.company_id, unit_id: integ.unit_id,
      event: "message.send.error", direction: "outbound", error_message: String(err),
    });
    return jsonResponse({ error: String(err), message_id: msg.id }, 502);
  }
});
