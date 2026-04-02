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
    return new Response("ok", { headers: corsHeaders });
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
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub;

    if (claimsError || !callerId) {
      return jsonResponse({ error: "Não autorizado" });
    }

    const [{ data: callerRoles }, { data: callerProfile }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", callerId),
      supabaseAdmin.from("profiles").select("unit_id").eq("id", callerId).maybeSingle(),
    ]);

    const isAdminMaster = callerRoles?.some((row: { role: string }) => row.role === "ADMIN_MASTER");
    const isAdminUnidade = callerRoles?.some((row: { role: string }) => row.role === "ADMIN_UNIDADE");

    if (!isAdminMaster && !isAdminUnidade) {
      return jsonResponse({ error: "Sem permissão" });
    }

    const { cpf, full_name, phone, password, role, unit_id, email_override } = await req.json();

    const finalPassword = password || "12345678";

    const normalizedRole = role === "RESPONSAVEL" || role === "ADMIN_UNIDADE" ? role : null;
    if (!cpf || !full_name || !normalizedRole) {
      return jsonResponse({ error: "Campos obrigatórios: cpf, full_name e role válido" });
    }

    if (normalizedRole === "ADMIN_UNIDADE" && !isAdminMaster) {
      return jsonResponse({ error: "Apenas ADMIN_MASTER pode criar colaboradores" });
    }

    let nextUnitId = typeof unit_id === "string" && unit_id.trim() ? unit_id.trim() : null;

    if (!isAdminMaster) {
      if (normalizedRole !== "RESPONSAVEL") {
        return jsonResponse({ error: "ADMIN_UNIDADE só pode criar responsáveis" });
      }

      if (!callerProfile?.unit_id) {
        return jsonResponse({ error: "Administrador sem unidade vinculada" });
      }

      nextUnitId = callerProfile.unit_id;
    }

    if (!nextUnitId) {
      return jsonResponse({ error: "Unidade é obrigatória" });
    }

    const cleanCpf = String(cpf).replace(/\D/g, "");
    const normalizedName = String(full_name).trim();
    const normalizedPhone = typeof phone === "string" && phone.trim() ? phone.trim() : null;
    const email = typeof email_override === "string" && email_override.trim() ? email_override.trim() : `${cleanCpf}@ensinup.app`;

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("cpf", cleanCpf)
      .maybeSingle();

    if (existingProfile) {
      return jsonResponse({ error: "Já existe um cadastro com este CPF" });
    }

    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true,
      user_metadata: { cpf: cleanCpf, full_name: normalizedName },
    });

    if (createError || !createdUser?.user) {
      return jsonResponse({ error: createError?.message || "Erro ao criar usuário" });
    }

    const userId = createdUser.user.id;

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      cpf: cleanCpf,
      full_name: normalizedName,
      phone: normalizedPhone,
      email,
      unit_id: nextUnitId,
      active: true,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return jsonResponse({ error: profileError.message });
    }

    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: normalizedRole,
    });

    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return jsonResponse({ error: roleError.message });
    }

    await supabaseAdmin.from("audit_logs").insert({
      action: "CREATE",
      target_table: "profiles",
      target_id: userId,
      performed_by: callerId,
      details: {
        role: normalizedRole,
        unit_id: nextUnitId,
      },
    });

    return jsonResponse({ success: true, user_id: userId, email });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Erro interno" });
  }
});
