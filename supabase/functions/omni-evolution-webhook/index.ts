// Evolution API webhook receiver
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

  // Load integration
  const { data: integ, error: integErr } = await supabase
    .from("omni_integrations").select("*").eq("id", integrationId).maybeSingle();
  if (integErr || !integ) return jsonResponse({ error: "integration not found" }, 404);

  // Validate secret (header or query)
  const secret = req.headers.get("x-webhook-secret") ?? url.searchParams.get("secret");
  if (integ.webhook_secret && secret !== integ.webhook_secret) {
    await supabase.from("omni_integration_logs").insert({
      integration_id: integ.id, company_id: integ.company_id, unit_id: integ.unit_id,
      event: "webhook.auth_failed", direction: "inbound", http_status: 401,
    });
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let payload: any = {};
  try { payload = await req.json(); } catch { /* empty */ }

  const event = payload?.event ?? payload?.type ?? "unknown";

  await supabase.from("omni_integration_logs").insert({
    integration_id: integ.id, company_id: integ.company_id, unit_id: integ.unit_id,
    event, direction: "inbound", payload,
  });

  try {
    // Connection updates
    if (event === "connection.update" || event === "qrcode.updated") {
      const state = payload?.data?.state ?? payload?.state;
      const qr = payload?.data?.qrcode?.base64 ?? payload?.qrcode;
      await supabase.from("omni_integrations").update({
        status: state === "open" ? "connected" : (qr ? "qr_pending" : "connecting"),
        qr_code: qr ?? integ.qr_code,
        last_event_at: new Date().toISOString(),
        last_sync_at: state === "open" ? new Date().toISOString() : integ.last_sync_at,
        session_started_at: state === "open" ? new Date().toISOString() : integ.session_started_at,
      }).eq("id", integ.id);
      return jsonResponse({ ok: true });
    }

    // Inbound message
    if (event === "messages.upsert" || event === "message" || event === "messages.update") {
      const m = payload?.data ?? payload?.message ?? payload;
      const remoteJid: string = m?.key?.remoteJid ?? m?.from ?? "";
      const phone = remoteJid.replace(/@.*$/, "").replace(/\D/g, "");
      const externalId: string = m?.key?.id ?? m?.id ?? crypto.randomUUID();
      const fromMe: boolean = m?.key?.fromMe ?? m?.fromMe ?? false;
      const text: string = m?.message?.conversation
        ?? m?.message?.extendedTextMessage?.text
        ?? m?.text ?? m?.body ?? "";
      const pushName: string = m?.pushName ?? m?.notifyName ?? phone;

      if (!phone) return jsonResponse({ ok: true, skipped: "no phone" });

      // Upsert contact
      let { data: contact } = await supabase.from("omni_contacts")
        .select("*").eq("unit_id", integ.unit_id).eq("phone_e164", phone).maybeSingle();
      if (!contact) {
        const ins = await supabase.from("omni_contacts").insert({
          company_id: integ.company_id, unit_id: integ.unit_id,
          full_name: pushName || phone, phone_e164: phone, origin: "WHATSAPP",
        }).select().single();
        contact = ins.data;
      }

      // Find or create conversation
      let { data: conv } = await supabase.from("omni_conversations")
        .select("*").eq("contact_id", contact!.id)
        .in("status", ["open","pending","bot","waiting"]).order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      if (!conv) {
        const ins = await supabase.from("omni_conversations").insert({
          company_id: integ.company_id, unit_id: integ.unit_id,
          channel: "WHATSAPP", contact_id: contact!.id, integration_id: integ.id, status: "open",
        }).select().single();
        conv = ins.data;
      }

      await supabase.from("omni_messages").insert({
        conversation_id: conv!.id, company_id: integ.company_id, unit_id: integ.unit_id,
        integration_id: integ.id,
        sender_type: fromMe ? "agent" : "contact",
        message_type: "text",
        content: text || "(sem texto)",
        external_id: externalId,
      });

      await supabase.from("omni_integrations").update({
        last_event_at: new Date().toISOString(), last_sync_at: new Date().toISOString(),
      }).eq("id", integ.id);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    await supabase.from("omni_integration_logs").insert({
      integration_id: integ.id, company_id: integ.company_id, unit_id: integ.unit_id,
      event: "error", direction: "inbound", error_message: String(err),
    });
    return jsonResponse({ error: String(err) }, 500);
  }
});
