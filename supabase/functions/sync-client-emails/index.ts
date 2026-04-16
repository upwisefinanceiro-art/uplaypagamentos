import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeCpf(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

function isPlaceholderEmail(email?: string | null) {
  return /@imported\.uplay\.app$/i.test(email || "");
}

interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj?: string;
  email?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
}

async function fetchAllPages(baseUrl: string, path: string, apiKey: string): Promise<AsaasCustomer[]> {
  const all: AsaasCustomer[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const url = `${baseUrl}${path}${path.includes("?") ? "&" : "?"}offset=${offset}&limit=${limit}`;
    const res = await fetch(url, { headers: { access_token: apiKey } });
    if (!res.ok) break;
    const json = await res.json();
    all.push(...(json.data || []));
    if (!json.hasMore) break;
    offset += limit;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Auth: require JWT with SUPER_ADMIN or ADMIN_MASTER role
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    let callerId: string | null = null;
    try { const p = JSON.parse(atob(token.split(".")[1])); callerId = p.sub || null; } catch { /* */ }
    if (!callerId) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: callerRoles } = await supabase.from("user_roles").select("role").eq("user_id", callerId);
    const isAllowed = callerRoles?.some((r: { role: string }) => ["SUPER_ADMIN", "ADMIN_MASTER"].includes(r.role));
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* */ }
    const filterUnitId = typeof body.unit_id === "string" ? body.unit_id : null;

    // Get units with Asaas keys
    let unitsQuery = supabase.from("units").select("id, asaas_api_key, asaas_base_url, name").not("asaas_api_key", "is", null);
    if (filterUnitId) unitsQuery = unitsQuery.eq("id", filterUnitId);
    const { data: units } = await unitsQuery;

    if (!units || units.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma unidade com API Asaas configurada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    let skipped = 0;
    let noMatch = 0;
    let totalCustomers = 0;
    const details: { name: string; cpf: string; oldEmail: string | null; newEmail: string }[] = [];

    for (const unit of units) {
      const baseUrl = unit.asaas_base_url || "https://api.asaas.com/v3";
      const apiKey = unit.asaas_api_key;

      console.log(`[sync-emails] Processing unit: ${unit.name} (${unit.id})`);

      // Fetch all customers from Asaas
      const customers = await fetchAllPages(baseUrl, "/customers", apiKey);
      totalCustomers += customers.length;

      // Get all profiles for this unit
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, cpf, email, full_name, asaas_customer_id")
        .eq("unit_id", unit.id);

      if (!profiles || profiles.length === 0) continue;

      // Build lookup maps
      const profileByCpf = new Map<string, typeof profiles[0]>();
      const profileByAsaasId = new Map<string, typeof profiles[0]>();
      for (const p of profiles) {
        const cpf = normalizeCpf(p.cpf);
        if (cpf) profileByCpf.set(cpf, p);
        if (p.asaas_customer_id) profileByAsaasId.set(p.asaas_customer_id, p);
      }

      for (const customer of customers) {
        const asaasEmail = customer.email?.trim().toLowerCase() || null;
        const cpf = normalizeCpf(customer.cpfCnpj);

        // Match profile
        let profile = profileByAsaasId.get(customer.id) || null;
        if (!profile && cpf) profile = profileByCpf.get(cpf) || null;

        if (!profile) {
          noMatch++;
          continue;
        }

        // Skip if Asaas has no real email
        if (!asaasEmail || isPlaceholderEmail(asaasEmail)) {
          skipped++;
          continue;
        }

        // Skip if profile already has a good email (same as Asaas)
        const currentEmail = profile.email?.trim().toLowerCase() || null;
        if (currentEmail === asaasEmail) {
          skipped++;
          continue;
        }

        // Update profile email
        const { error: updateErr } = await supabase
          .from("profiles")
          .update({ email: asaasEmail })
          .eq("id", profile.id);

        if (updateErr) {
          console.error(`[sync-emails] Error updating ${profile.full_name}:`, updateErr);
          continue;
        }

        // Also update auth user email if it's a placeholder
        if (isPlaceholderEmail(currentEmail)) {
          try {
            await supabase.auth.admin.updateUserById(profile.id, { email: asaasEmail });
          } catch (e) {
            console.log(`[sync-emails] Could not update auth email for ${profile.id}:`, e);
          }
        }

        details.push({
          name: profile.full_name,
          cpf: cpf.substring(0, 4) + "***",
          oldEmail: currentEmail,
          newEmail: asaasEmail,
        });
        updated++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_asaas_customers: totalCustomers,
      updated,
      skipped,
      no_match: noMatch,
      details: details.slice(0, 50),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[sync-client-emails] error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
