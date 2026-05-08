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

    const isSuperAdmin = callerRoles?.some((row: { role: string }) => row.role === "SUPER_ADMIN");
    const isAdminMaster = callerRoles?.some((row: { role: string }) => row.role === "ADMIN_MASTER");
    const isAdminUnidade = callerRoles?.some((row: { role: string }) => row.role === "ADMIN_UNIDADE");

    if (!isAdminMaster && !isAdminUnidade && !isSuperAdmin) {
      return jsonResponse({ error: "Sem permissão" });
    }

    const { cpf, full_name, phone, password, role, unit_id, email_override, email } = await req.json();

    const finalPassword = password || "12345678";

    const allowedRoles = ["RESPONSAVEL", "ADMIN_UNIDADE", "ADMIN_MASTER"];
    const normalizedRole = allowedRoles.includes(role) ? role : null;
    if (!cpf || !full_name || !normalizedRole) {
      return jsonResponse({ error: "Campos obrigatórios: cpf, full_name e role válido" });
    }

    if (normalizedRole === "ADMIN_UNIDADE" && !isAdminMaster && !isSuperAdmin) {
      return jsonResponse({ error: "Apenas ADMIN_MASTER pode criar colaboradores" });
    }

    if (normalizedRole === "ADMIN_MASTER" && !isSuperAdmin && !isAdminMaster) {
      return jsonResponse({ error: "Sem permissão para criar ADMIN_MASTER" });
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
    // E-mail real informado pelo usuário (pode ser vazio).
    const userTypedEmail = typeof email_override === "string" && email_override.trim()
      ? email_override.trim().toLowerCase()
      : typeof email === "string" && email.trim()
        ? email.trim().toLowerCase()
        : "";
    const isFakeEmail = (e: string) => /@(uplay\.app|imported\.uplay\.app)$/i.test(e);
    if (userTypedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userTypedEmail)) {
      return jsonResponse({ error: "E-mail inválido" });
    }
    // Profile guarda APENAS o e-mail real do cliente (ou null). Nunca CPF@uplay.app.
    const profileEmail: string | null = userTypedEmail && !isFakeEmail(userTypedEmail) ? userTypedEmail : null;
    // Auth precisa de um e-mail para login: usa o real se houver, senão fallback CPF@uplay.app.
    const normalizedEmail = profileEmail || `${cleanCpf}@uplay.app`;

    // Check if email already exists in auth
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const emailExists = existingUsers?.users?.find(
      (u: { email?: string }) => u.email?.toLowerCase() === normalizedEmail
    );
    if (emailExists) {
      const existingUserId = emailExists.id;

      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(existingUserId, {
        email: normalizedEmail,
        password: finalPassword,
        email_confirm: true,
        ban_duration: "none",
        user_metadata: { cpf: cleanCpf, full_name: normalizedName },
      });

      if (authUpdateError) {
        return jsonResponse({ error: authUpdateError.message || "Erro ao atualizar acesso existente" });
      }

      const { error: existingProfileError } = await supabaseAdmin.from("profiles").upsert({
        id: existingUserId,
        cpf: cleanCpf,
        full_name: normalizedName,
        phone: normalizedPhone,
        email: profileEmail,
        unit_id: nextUnitId,
        active: true,
      });

      if (existingProfileError) {
        return jsonResponse({ error: existingProfileError.message || "Erro ao sincronizar perfil existente" });
      }

      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", existingUserId)
        .eq("role", "RESPONSAVEL");

      const { error: roleUpsertError } = await supabaseAdmin.from("user_roles").upsert({
        user_id: existingUserId,
        role: normalizedRole,
      }, { onConflict: "user_id,role" });

      if (roleUpsertError) {
        return jsonResponse({ error: roleUpsertError.message || "Erro ao sincronizar perfil de acesso" });
      }

      return jsonResponse({ success: true, user_id: existingUserId, email: normalizedEmail, updated: true });
    }

    const { data: dupRows } = await supabaseAdmin.rpc("find_duplicate_cpf", {
      _cpf: cleanCpf,
      _exclude_id: null,
    });
    const existingProfile = Array.isArray(dupRows) && dupRows.length > 0 ? dupRows[0] : null;

    // Se já existe um cadastro com este CPF, REUTILIZA em vez de bloquear.
    // Garante que nunca haverá dois perfis com o mesmo CPF e desbloqueia a criação de novos contratos.
    if (existingProfile) {
      const existingUserId = existingProfile.id;

      // Atualiza dados básicos + reativa + reseta senha padrão
      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(existingUserId, {
        password: finalPassword,
        email_confirm: true,
        ban_duration: "none",
        user_metadata: { cpf: cleanCpf, full_name: normalizedName },
      });
      if (authUpdateError) {
        return jsonResponse({ error: authUpdateError.message || "Erro ao reutilizar cadastro existente" });
      }

      const { error: existingProfileError } = await supabaseAdmin.from("profiles").update({
        cpf: cleanCpf,
        full_name: normalizedName,
        phone: normalizedPhone,
        unit_id: nextUnitId,
        active: true,
      }).eq("id", existingUserId);
      if (existingProfileError) {
        return jsonResponse({ error: existingProfileError.message || "Erro ao sincronizar perfil existente" });
      }

      await supabaseAdmin.from("user_roles").upsert(
        { user_id: existingUserId, role: normalizedRole },
        { onConflict: "user_id,role" },
      );

      await supabaseAdmin.from("audit_logs").insert({
        action: "REUSE_BY_CPF",
        target_table: "profiles",
        target_id: existingUserId,
        performed_by: callerId,
        details: { cpf: cleanCpf, role: normalizedRole, unit_id: nextUnitId },
      });

      return jsonResponse({
        success: true,
        user_id: existingUserId,
        existing_name: existingProfile.full_name,
        reused: true,
      });
    }

    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
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
      email: normalizedEmail,
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

    return jsonResponse({ success: true, user_id: userId, email: normalizedEmail });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Erro interno" });
  }
});
