import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface ProfileRow {
  id: string;
  full_name: string;
  phone: string | null;
  unit_id: string | null;
  asaas_customer_id: string | null;
}

async function configureWhatsappOnly(
  baseUrl: string,
  apiKey: string,
  customerId: string,
  mobilePhone: string | null,
) {
  // 1) Atualiza customer (mobilePhone + notificationDisabled=false)
  if (mobilePhone) {
    try {
      await fetch(`${baseUrl}/customers/${customerId}`, {
        method: "POST",
        headers: { access_token: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          mobilePhone,
          phone: mobilePhone,
          notificationDisabled: false,
        }),
      });
    } catch (e) {
      console.warn("update customer failed", customerId, e);
    }
  }

  // 2) Lista notifications do customer e força WhatsApp ON / Email+SMS OFF
  const notifRes = await fetch(`${baseUrl}/customers/${customerId}/notifications`, {
    headers: { access_token: apiKey },
  });
  if (!notifRes.ok) {
    return { configured: 0, error: `notifications GET failed: ${notifRes.status}` };
  }
  const notifData = await notifRes.json();
  const items: Array<{ id: string }> = notifData?.data || [];
  let configured = 0;
  for (const n of items) {
    const r = await fetch(`${baseUrl}/notifications/${n.id}`, {
      method: "PUT",
      headers: { access_token: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        emailEnabledForProvider: false,
        emailEnabledForCustomer: false,
        smsEnabledForProvider: false,
        smsEnabledForCustomer: false,
        phoneCallEnabledForCustomer: false,
        whatsappEnabledForProvider: true,
        whatsappEnabledForCustomer: true,
      }),
    });
    if (r.ok) configured++;
  }
  return { configured, error: null as string | null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "Não autorizado" }, 401);

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
    const isAdmin = roles?.some((r: { role: string }) =>
      ["ADMIN_MASTER", "ADMIN_UNIDADE", "SUPER_ADMIN"].includes(r.role)
    );
    if (!isAdmin) return json({ error: "Sem permissão" }, 403);

    let body: { unit_id?: string; profile_id?: string } = {};
    try { body = await req.json(); } catch { /* no body */ }

    let query = admin
      .from("profiles")
      .select("id, full_name, phone, unit_id, asaas_customer_id")
      .not("asaas_customer_id", "is", null);

    if (body.profile_id) query = query.eq("id", body.profile_id);
    else if (body.unit_id) query = query.eq("unit_id", body.unit_id);

    const { data: profiles, error: profErr } = await query;
    if (profErr) return json({ error: profErr.message }, 500);
    if (!profiles?.length) return json({ success: true, processed: 0, updated: 0, errors: 0, message: "Nenhum cliente com Asaas vinculado" });

    // cache de credenciais por unidade
    const unitIds = Array.from(new Set((profiles as ProfileRow[]).map(p => p.unit_id).filter(Boolean) as string[]));
    const unitCache: Record<string, { apiKey: string; baseUrl: string }> = {};
    for (const uid of unitIds) {
      const { data: u } = await admin
        .from("units").select("asaas_api_key, asaas_base_url").eq("id", uid).maybeSingle();
      if (u?.asaas_api_key) {
        unitCache[uid] = { apiKey: u.asaas_api_key, baseUrl: u.asaas_base_url || "https://api.asaas.com/v3" };
      }
    }

    let processed = 0, updated = 0, errors = 0, skipped = 0;
    const errorDetails: Array<{ id: string; name: string; error: string }> = [];

    for (const p of profiles as ProfileRow[]) {
      processed++;
      if (!p.unit_id || !unitCache[p.unit_id] || !p.asaas_customer_id) {
        skipped++;
        continue;
      }
      const cfg = unitCache[p.unit_id];
      const phoneClean = (p.phone || "").replace(/\D/g, "") || null;
      try {
        const result = await configureWhatsappOnly(cfg.baseUrl, cfg.apiKey, p.asaas_customer_id, phoneClean);
        if (result.error) {
          errors++;
          errorDetails.push({ id: p.id, name: p.full_name, error: result.error });
        } else if (result.configured > 0) {
          updated++;
        }
      } catch (e) {
        errors++;
        errorDetails.push({ id: p.id, name: p.full_name, error: e instanceof Error ? e.message : "erro" });
      }
    }

    await admin.from("audit_logs").insert({
      action: "UPDATE_ASAAS_NOTIFICATIONS",
      target_table: "profiles",
      target_id: caller.id,
      performed_by: caller.id,
      details: { processed, updated, errors, skipped, scope: body },
    });

    return json({
      success: true,
      processed,
      updated,
      errors,
      skipped,
      errors_sample: errorDetails.slice(0, 20),
      message: `${updated} cliente(s) configurado(s) para WhatsApp-only de ${processed} processado(s)`,
    });
  } catch (err) {
    console.error("update-asaas-notifications error:", err);
    return json({ error: err instanceof Error ? err.message : "Erro interno" }, 500);
  }
});
