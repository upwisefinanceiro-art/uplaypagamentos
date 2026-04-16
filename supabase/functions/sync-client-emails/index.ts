import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeCpf(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

function normalizePhone(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

function normalizeEmail(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

function isPlaceholderEmail(email?: string | null) {
  return /@(imported\.)?uplay\.app$/i.test(email || "");
}

function isValidEmail(email?: string | null) {
  return !!email && EMAIL_REGEX.test(normalizeEmail(email));
}

interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj?: string;
  email?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
}

type ProfileRow = {
  id: string;
  cpf: string;
  email: string | null;
  full_name: string;
  phone: string | null;
  unit_id: string | null;
  asaas_customer_id: string | null;
};

async function fetchCustomer(baseUrl: string, customerId: string, apiKey: string): Promise<AsaasCustomer | null> {
  const res = await fetch(`${baseUrl}/customers/${customerId}`, { headers: { access_token: apiKey } });
  if (!res.ok) return null;
  return await res.json();
}

function shouldReplaceEmail(currentEmail: string | null, nextEmail: string | null, overwriteValidConflict: boolean) {
  if (!nextEmail || !isValidEmail(nextEmail) || isPlaceholderEmail(nextEmail)) return false;
  if (!currentEmail) return true;
  if (currentEmail === nextEmail) return false;
  if (isPlaceholderEmail(currentEmail) || !isValidEmail(currentEmail)) return true;
  return overwriteValidConflict;
}

function hasProtectedEmailConflict(currentEmail: string | null, nextEmail: string | null) {
  return !!currentEmail && !!nextEmail && currentEmail !== nextEmail && isValidEmail(currentEmail) && !isPlaceholderEmail(currentEmail);
}

function shouldReplacePhone(currentPhone: string | null, nextPhone: string | null) {
  if (!nextPhone) return false;
  if (!currentPhone) return true;
  if (currentPhone === nextPhone) return false;
  return currentPhone.length < 10 || /^0+$/.test(currentPhone);
}

function shouldReplaceName(currentName: string | null, nextName: string | null) {
  if (!nextName) return false;
  return !(currentName || "").trim();
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
    const filterProfileId = typeof body.profile_id === "string" ? body.profile_id : null;
    const overwriteConflictingEmails = body.overwrite_conflicting_emails === true;
    const updateNames = body.update_name === true;
    const updatePhones = body.update_phone !== false;
    const automatic = body.automatic === true;

    let profilesQuery = supabase
      .from("profiles")
      .select("id, cpf, email, full_name, phone, unit_id, asaas_customer_id");

    if (filterProfileId) profilesQuery = profilesQuery.eq("id", filterProfileId);
    else if (filterUnitId) profilesQuery = profilesQuery.eq("unit_id", filterUnitId);

    const { data: profiles } = await profilesQuery;

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhum cliente encontrado para sincronizar" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const unitIds = [...new Set((profiles as ProfileRow[]).map((profile) => profile.unit_id).filter(Boolean))] as string[];
    let unitsQuery = supabase
      .from("units")
      .select("id, asaas_api_key, asaas_base_url, name")
      .in("id", unitIds)
      .not("asaas_api_key", "is", null);
    const { data: units } = await unitsQuery;

    if (!units || units.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma unidade com API Asaas configurada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const unitsById = new Map(units.map((unit) => [unit.id, unit]));
    let updated = 0;
    let skipped = 0;
    let protectedConflicts = 0;
    let missingAsaasId = 0;
    let fetchErrors = 0;
    const details: Array<Record<string, unknown>> = [];

    for (const profile of profiles as ProfileRow[]) {
      if (!profile.unit_id || !unitsById.has(profile.unit_id)) {
        skipped++;
        continue;
      }

      if (!profile.asaas_customer_id) {
        missingAsaasId++;
        continue;
      }

      const unit = unitsById.get(profile.unit_id)!;
      const baseUrl = unit.asaas_base_url || "https://api.asaas.com/v3";
      const apiKey = unit.asaas_api_key;

      const customer = await fetchCustomer(baseUrl, profile.asaas_customer_id, apiKey);
      if (!customer) {
        fetchErrors++;
        continue;
      }

      const currentEmail = normalizeEmail(profile.email) || null;
      const currentPhone = normalizePhone(profile.phone) || null;
      const asaasEmail = normalizeEmail(customer.email) || null;
      const asaasPhone = normalizePhone(customer.mobilePhone || customer.phone) || null;
      const asaasName = customer.name?.trim() || null;

      const updatePayload: Record<string, string | null> = {};
      const fieldsUpdated: string[] = [];

      if (shouldReplaceEmail(currentEmail, asaasEmail, overwriteConflictingEmails)) {
        updatePayload.email = asaasEmail;
        fieldsUpdated.push("email");
      } else if (hasProtectedEmailConflict(currentEmail, asaasEmail)) {
        protectedConflicts++;
      }

      if (updatePhones && shouldReplacePhone(currentPhone, asaasPhone)) {
        updatePayload.phone = asaasPhone;
        fieldsUpdated.push("phone");
      }

      if (updateNames && shouldReplaceName(profile.full_name, asaasName)) {
        updatePayload.full_name = asaasName;
        fieldsUpdated.push("full_name");
      }

      if (fieldsUpdated.length === 0) {
        skipped++;
        continue;
      }

      const { error: updateErr } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", profile.id);

      if (updateErr) {
        console.error(`[sync-emails] Error updating ${profile.full_name}:`, updateErr);
        fetchErrors++;
        continue;
      }

      try {
        if (updatePayload.email || updatePayload.full_name) {
          await supabase.auth.admin.updateUserById(profile.id, {
            ...(updatePayload.email ? { email: updatePayload.email } : {}),
            ...(updatePayload.full_name ? {
              user_metadata: {
                cpf: normalizeCpf(profile.cpf),
                full_name: updatePayload.full_name,
              },
            } : {}),
          });
        }
      } catch (e) {
        console.log(`[sync-emails] Could not update auth user for ${profile.id}:`, e);
      }

      await supabase.from("audit_logs").insert({
        action: automatic ? "AUTO_SYNC_ASAAS" : "SYNC_ASAAS",
        target_table: "profiles",
        target_id: profile.id,
        performed_by: callerId,
        details: {
          unit_id: profile.unit_id,
          asaas_customer_id: profile.asaas_customer_id,
          old_email: currentEmail,
          new_email: updatePayload.email ?? currentEmail,
          old_phone: currentPhone,
          new_phone: updatePayload.phone ?? currentPhone,
          old_name: profile.full_name,
          new_name: updatePayload.full_name ?? profile.full_name,
          automatic,
          fields_updated: fieldsUpdated,
        },
      });

      details.push({
        profile_id: profile.id,
        name: updatePayload.full_name ?? profile.full_name,
        cpf: normalizeCpf(profile.cpf).slice(0, 4) + "***",
        old_email: currentEmail,
        new_email: updatePayload.email ?? currentEmail,
        old_phone: currentPhone,
        new_phone: updatePayload.phone ?? currentPhone,
        old_name: profile.full_name,
        new_name: updatePayload.full_name ?? profile.full_name,
        fields_updated: fieldsUpdated,
      });
      updated++;
    }

    return new Response(JSON.stringify({
      success: true,
      processed_profiles: profiles.length,
      updated,
      skipped,
      protected_conflicts: protectedConflicts,
      missing_asaas_id: missingAsaasId,
      fetch_errors: fetchErrors,
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
