// Fetch QR code from Evolution API
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
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (!claims?.claims) return jsonResponse({ error: "unauthorized" }, 401);

  const { integration_id } = await req.json().catch(() => ({})) as any;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: integ } = await admin.from("omni_integrations").select("*").eq("id", integration_id).maybeSingle();
  if (!integ) return jsonResponse({ error: "not found" }, 404);
  if (integ.provider !== "EVOLUTION_API") return jsonResponse({ error: "QR só disponível para Evolution API" }, 400);

  const creds = integ.credentials ?? {};
  try {
    const res = await fetch(`${creds.base_url?.replace(/\/$/,"")}/instance/connect/${creds.instance ?? integ.display_name}`, {
      headers: { apikey: creds.api_key ?? "" },
    });
    const json = await res.json().catch(() => ({}));
    const qr = json?.base64 ?? json?.qrcode?.base64 ?? json?.code ?? null;
    await admin.from("omni_integrations").update({
      status: qr ? "qr_pending" : "connecting",
      qr_code: qr, session_started_at: new Date().toISOString(),
    }).eq("id", integ.id);
    return jsonResponse({ ok: true, qr });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
});
