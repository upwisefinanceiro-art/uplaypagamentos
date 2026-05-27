// Test connection to provider
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
  if (!integration_id) return jsonResponse({ error: "missing integration_id" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: integ } = await admin.from("omni_integrations").select("*").eq("id", integration_id).maybeSingle();
  if (!integ) return jsonResponse({ error: "not found" }, 404);

  const started = Date.now();
  try {
    if (integ.provider === "EVOLUTION_API") {
      const creds = integ.credentials ?? {};
      const res = await fetch(`${creds.base_url?.replace(/\/$/,"")}/instance/connectionState/${creds.instance ?? integ.display_name}`, {
        headers: { apikey: creds.api_key ?? "" },
      });
      const json = await res.json().catch(() => ({}));
      const latency = Date.now() - started;
      const state = json?.instance?.state ?? json?.state;
      await admin.from("omni_integrations").update({
        status: state === "open" ? "connected" : "disconnected",
        last_sync_at: new Date().toISOString(),
        error_message: res.ok ? null : JSON.stringify(json),
      }).eq("id", integ.id);
      return jsonResponse({ ok: res.ok, latency_ms: latency, state, raw: json });
    }
    if (integ.provider === "META_WHATSAPP_CLOUD" || integ.provider === "META_INSTAGRAM") {
      const token = (integ.credentials as any)?.access_token;
      const res = await fetch("https://graph.facebook.com/v19.0/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      return jsonResponse({ ok: res.ok, latency_ms: Date.now() - started, raw: json });
    }
    return jsonResponse({ ok: true, message: "Landing forms não exigem teste ativo" });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
});
