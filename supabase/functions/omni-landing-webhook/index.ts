// Landing page lead webhook
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/omni-cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const url = new URL(req.url);
  const integrationId = url.searchParams.get("integration_id");
  const secret = req.headers.get("x-uplay-key") ?? url.searchParams.get("key");
  if (!integrationId) return jsonResponse({ error: "missing integration_id" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: integ } = await supabase.from("omni_integrations").select("*").eq("id", integrationId).maybeSingle();
  if (!integ) return jsonResponse({ error: "integration not found" }, 404);
  if (integ.webhook_secret && secret !== integ.webhook_secret) return jsonResponse({ error: "unauthorized" }, 401);

  const body: any = await req.json().catch(() => ({}));
  const name = body.name ?? body.nome ?? "Lead Landing";
  const phone = (body.phone ?? body.telefone ?? "").replace(/\D/g, "");
  const email = body.email;
  const message = body.message ?? body.mensagem ?? "Novo lead recebido pela landing page";

  await supabase.from("omni_integration_logs").insert({
    integration_id: integ.id, company_id: integ.company_id, unit_id: integ.unit_id,
    event: "landing.lead", direction: "inbound", payload: body,
  });

  let { data: contact } = await supabase.from("omni_contacts")
    .select("*").eq("unit_id", integ.unit_id)
    .or(phone ? `phone_e164.eq.${phone}` : `email.eq.${email ?? '__none__'}`)
    .maybeSingle();
  if (!contact) {
    const ins = await supabase.from("omni_contacts").insert({
      company_id: integ.company_id, unit_id: integ.unit_id,
      full_name: name, phone_e164: phone || null, email: email || null, origin: "LANDING_PAGE",
    }).select().single();
    contact = ins.data;
  }
  const { data: conv } = await supabase.from("omni_conversations").insert({
    company_id: integ.company_id, unit_id: integ.unit_id,
    channel: "LANDING_PAGE", contact_id: contact!.id, integration_id: integ.id, status: "open",
  }).select().single();
  await supabase.from("omni_messages").insert({
    conversation_id: conv!.id, company_id: integ.company_id, unit_id: integ.unit_id,
    integration_id: integ.id, sender_type: "contact", message_type: "text", content: message,
    metadata: body,
  });
  return jsonResponse({ ok: true, contact_id: contact!.id, conversation_id: conv!.id });
});
