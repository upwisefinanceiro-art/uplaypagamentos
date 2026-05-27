// Meta (WhatsApp Cloud + Instagram) webhook receiver
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/omni-cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const integrationId = url.searchParams.get("integration_id");
  if (!integrationId) return jsonResponse({ error: "missing integration_id" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: integ } = await supabase.from("omni_integrations").select("*").eq("id", integrationId).maybeSingle();
  if (!integ) return jsonResponse({ error: "integration not found" }, 404);

  // Verification challenge (GET)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = (integ.credentials as any)?.verify_token ?? integ.webhook_secret;
    if (mode === "subscribe" && token === verifyToken) {
      return new Response(challenge ?? "", { status: 200, headers: corsHeaders });
    }
    return jsonResponse({ error: "verify failed" }, 403);
  }

  let payload: any = {};
  try { payload = await req.json(); } catch { /* empty */ }

  await supabase.from("omni_integration_logs").insert({
    integration_id: integ.id, company_id: integ.company_id, unit_id: integ.unit_id,
    event: payload?.object ?? "meta", direction: "inbound", payload,
  });

  try {
    const entries = payload?.entry ?? [];
    for (const entry of entries) {
      const changes = entry?.changes ?? [];
      for (const change of changes) {
        const value = change?.value ?? {};
        const messages = value?.messages ?? [];
        for (const m of messages) {
          const phone = (m.from ?? "").replace(/\D/g, "");
          const text = m.text?.body ?? m.button?.text ?? `[${m.type}]`;
          const externalId = m.id;
          const name = value.contacts?.[0]?.profile?.name ?? phone;
          if (!phone) continue;

          let { data: contact } = await supabase.from("omni_contacts")
            .select("*").eq("unit_id", integ.unit_id).eq("phone_e164", phone).maybeSingle();
          if (!contact) {
            const ins = await supabase.from("omni_contacts").insert({
              company_id: integ.company_id, unit_id: integ.unit_id,
              full_name: name, phone_e164: phone, origin: integ.channel,
            }).select().single();
            contact = ins.data;
          }
          let { data: conv } = await supabase.from("omni_conversations")
            .select("*").eq("contact_id", contact!.id)
            .in("status", ["open","pending","bot","waiting"]).order("created_at",{ascending:false})
            .limit(1).maybeSingle();
          if (!conv) {
            const ins = await supabase.from("omni_conversations").insert({
              company_id: integ.company_id, unit_id: integ.unit_id,
              channel: integ.channel, contact_id: contact!.id, integration_id: integ.id, status: "open",
            }).select().single();
            conv = ins.data;
          }
          await supabase.from("omni_messages").insert({
            conversation_id: conv!.id, company_id: integ.company_id, unit_id: integ.unit_id,
            integration_id: integ.id, sender_type: "contact",
            message_type: "text", content: text, external_id: externalId,
          });
        }
      }
    }
    await supabase.from("omni_integrations").update({
      last_event_at: new Date().toISOString(), last_sync_at: new Date().toISOString(),
    }).eq("id", integ.id);
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
