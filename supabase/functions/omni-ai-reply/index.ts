// AI reply using Lovable AI Gateway (preparado, dispara só se prompt ativo)
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/omni-cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { conversation_id } = await req.json().catch(() => ({})) as any;
  if (!conversation_id) return jsonResponse({ error: "missing conversation_id" }, 400);
  if (!LOVABLE_API_KEY) return jsonResponse({ error: "LOVABLE_API_KEY not configured" }, 503);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: conv } = await admin.from("omni_conversations")
    .select("*, omni_integrations(*)").eq("id", conversation_id).maybeSingle();
  if (!conv) return jsonResponse({ error: "conv not found" }, 404);

  const integ = (conv as any).omni_integrations;
  if (!integ?.ai_enabled) return jsonResponse({ ok: true, skipped: "ai disabled on integration" });

  const { data: prompt } = await admin.from("omni_ai_prompts")
    .select("*").eq("company_id", conv.company_id).eq("active", true)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!prompt) return jsonResponse({ ok: true, skipped: "no active prompt" });

  const { data: history } = await admin.from("omni_messages")
    .select("sender_type, content, created_at").eq("conversation_id", conversation_id)
    .order("created_at", { ascending: false }).limit(20);
  const messages = [
    { role: "system", content: prompt.system_prompt },
    ...(history ?? []).reverse().map((m: any) => ({
      role: m.sender_type === "contact" ? "user" : "assistant",
      content: m.content ?? "",
    })),
  ];

  const session = await admin.from("omni_ai_sessions").insert({
    conversation_id, prompt_id: prompt.id, unit_id: conv.unit_id, status: "bot",
  }).select().single();

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({ model: prompt.model, temperature: Number(prompt.temperature ?? 0.7), messages }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(json));
    const reply = json.choices?.[0]?.message?.content ?? "";

    await admin.from("omni_messages").insert({
      conversation_id, company_id: conv.company_id, unit_id: conv.unit_id,
      integration_id: conv.integration_id, sender_type: "bot",
      message_type: "text", content: reply,
    });
    await admin.from("omni_ai_sessions").update({
      ended_at: new Date().toISOString(),
      tokens_in: json.usage?.prompt_tokens ?? 0,
      tokens_out: json.usage?.completion_tokens ?? 0,
    }).eq("id", session.data!.id);
    return jsonResponse({ ok: true, reply });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
});
