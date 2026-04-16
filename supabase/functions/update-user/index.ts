import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Não autorizado" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: "Missing environment variables" });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    let callerId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      callerId = payload.sub || null;
    } catch { /* invalid token */ }

    if (!callerId) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    const isAdminMaster = callerRoles?.some((row: { role: string }) => row.role === "ADMIN_MASTER");
    const isAdminUnidade = callerRoles?.some((row: { role: string }) => row.role === "ADMIN_UNIDADE");

    if (!isAdminMaster && !isAdminUnidade) {
      return jsonResponse({ error: "Sem permissão" });
    }

    const { user_id, full_name, cpf, phone, unit_id, email, address } = await req.json();

    if (!user_id || !full_name?.trim() || !cpf?.trim()) {
      return jsonResponse({ error: "user_id, nome e CPF são obrigatórios" });
    }

    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("id, unit_id, full_name, cpf, phone, email, address, active")
      .eq("id", user_id)
      .single();

    if (targetError || !targetProfile) {
      return jsonResponse({ error: "Registro não encontrado" });
    }

    const cleanCpf = String(cpf).replace(/\D/g, "");
    const normalizedName = String(full_name).trim();
    const normalizedPhone = typeof phone === "string" && phone.trim() ? phone.trim() : null;
    const normalizedAddress = typeof address === "string" && address.trim() ? address.trim() : null;
    const normalizedEmail = typeof email === "string" && email.trim()
      ? email.trim().toLowerCase()
      : targetProfile.email || `${cleanCpf}@uplay.app`;

    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return jsonResponse({ error: "E-mail inválido" }, 400);
    }

    let nextUnitId = targetProfile.unit_id;

    if (isAdminMaster) {
      nextUnitId = unit_id === null
        ? null
        : typeof unit_id === "string" && unit_id.trim()
          ? unit_id.trim()
          : targetProfile.unit_id;
    } else {
      const { data: callerProfile } = await supabaseAdmin
        .from("profiles")
        .select("unit_id")
        .eq("id", callerId)
        .single();

      if (!callerProfile?.unit_id || callerProfile.unit_id !== targetProfile.unit_id) {
        return jsonResponse({ error: "Sem permissão para editar este registro" });
      }
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      email: normalizedEmail,
      user_metadata: {
        cpf: cleanCpf,
        full_name: normalizedName,
      },
    });

    if (authError) {
      return jsonResponse({ error: authError.message });
    }

    const updateData = {
      full_name: normalizedName,
      cpf: cleanCpf,
      phone: normalizedPhone,
      email: normalizedEmail,
      address: normalizedAddress,
      unit_id: nextUnitId,
    };

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update(updateData)
      .eq("id", user_id);

    if (updateError) {
      return jsonResponse({ error: updateError.message });
    }

    await supabaseAdmin.from("audit_logs").insert({
      action: "EDIT",
      target_table: "profiles",
      target_id: user_id,
      performed_by: callerId,
      details: {
        before: targetProfile,
        after: updateData,
      },
    });

    return jsonResponse({ success: true, profile: updateData });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Erro interno" });
  }
});
