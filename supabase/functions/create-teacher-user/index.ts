import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type AuthUser = {
  id: string;
  email?: string;
};

const listAuthUserByEmail = async (admin: ReturnType<typeof createClient>, email: string) => {
  const perPage = 1000;
  for (let page = 1; page <= 50; page++) {
    const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Falha ao consultar usuários: ${error.message}`);
    const match = list?.users?.find((u: AuthUser) => u.email?.toLowerCase() === email);
    if (match) return match as AuthUser;
    if (!list?.users?.length || list.users.length < perPage) break;
  }
  return null;
};

const getAuthUserById = async (admin: ReturnType<typeof createClient>, userId: string) => {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  return data.user as AuthUser;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Não autorizado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData } = await caller.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub;
    if (!callerId) return jsonResponse({ error: "Não autorizado" }, 401);

    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isAdmin = callerRoles?.some((r: { role: string }) =>
      ["SUPER_ADMIN", "ADMIN_MASTER", "ADMIN_UNIDADE"].includes(r.role),
    );
    if (!isAdmin) return jsonResponse({ error: "Sem permissão" }, 403);

    const startedAt = new Date().toISOString();
    const { teacher_id, email, full_name, phone, password } = await req.json();
    if (!teacher_id || !email || !full_name) {
      return jsonResponse({ error: "Campos obrigatórios: teacher_id, email, full_name" }, 400);
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return jsonResponse({ error: "E-mail inválido" }, 400);
    }
    const finalPassword = (typeof password === "string" && password.length >= 8) ? password : "Uplay#Prof2026";

    console.info("[create-teacher-user] sync started", {
      teacher_id,
      email: normalizedEmail,
      callerId,
      startedAt,
    });

    // Carrega o professor para isolar por empresa/unidade
    const { data: teacher } = await admin
      .from("school_teachers")
      .select("id, unit_id, company_id, profile_id")
      .eq("id", teacher_id)
      .maybeSingle();
    if (!teacher) return jsonResponse({ error: "Professor não encontrado" }, 404);

    const previousProfileId = teacher.profile_id as string | null;
    const linkedAuth = previousProfileId ? await getAuthUserById(admin, previousProfileId) : null;
    const authByEmail = await listAuthUserByEmail(admin, normalizedEmail);
    let targetUser = authByEmail ?? linkedAuth;
    let reason = authByEmail ? "AUTH_EMAIL_EXISTENTE" : linkedAuth ? "PROFILE_ID_VALIDO" : "NOVO_AUTH";
    let rebuilt = false;

    console.info("[create-teacher-user] vínculo atual", {
      teacher_id,
      profile_id: previousProfileId,
      linked_auth_id: linkedAuth?.id ?? null,
      linked_auth_email: linkedAuth?.email ?? null,
      auth_email_id: authByEmail?.id ?? null,
      auth_email: authByEmail?.email ?? null,
    });

    if (authByEmail && linkedAuth && authByEmail.id !== linkedAuth.id) {
      const { data: otherTeacher } = await admin
        .from("school_teachers")
        .select("id, full_name")
        .eq("profile_id", authByEmail.id)
        .neq("id", teacher_id)
        .maybeSingle();
      if (otherTeacher) {
        console.warn("[create-teacher-user] e-mail já vinculado a outro professor", {
          teacher_id,
          email: normalizedEmail,
          auth_id: authByEmail.id,
          other_teacher_id: otherTeacher.id,
        });
        return jsonResponse({ error: "Este e-mail já está vinculado a outro professor." }, 409);
      }
      targetUser = authByEmail;
      reason = "EMAIL_AUTH_SUBSTITUIU_PROFILE_QUEBRADO";
      rebuilt = true;
    }

    if (!targetUser) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: normalizedEmail,
        password: finalPassword,
        email_confirm: true,
        user_metadata: { full_name: String(full_name).trim(), role: "PROFESSOR" },
      });
      if (createErr || !created?.user) {
        console.error("[create-teacher-user] createUser error", { teacher_id, email: normalizedEmail, error: createErr });
        return jsonResponse({ error: createErr?.message || "Falha ao criar usuário." }, 400);
      }
      targetUser = created.user as AuthUser;
      rebuilt = true;
      reason = "AUTH_CRIADO";
    }

    const { data: updatedAuth, error: updErr } = await admin.auth.admin.updateUserById(targetUser.id, {
      password: finalPassword,
      email: normalizedEmail,
      email_confirm: true,
      ban_duration: "none",
      user_metadata: { full_name: String(full_name).trim(), role: "PROFESSOR" },
    });
    if (updErr || !updatedAuth?.user) {
      console.error("[create-teacher-user] updateUser error", {
        teacher_id,
        auth_id: targetUser.id,
        email: normalizedEmail,
        error: updErr,
      });
      return jsonResponse({ error: updErr?.message || "Falha ao sincronizar usuário." }, 400);
    }
    targetUser = updatedAuth.user as AuthUser;
    const userId = targetUser.id;

    // Carrega profile atual (se houver) para preservar cpf e demais dados
    const { data: currentProfile } = await admin
      .from("profiles")
      .select("cpf")
      .eq("id", userId)
      .maybeSingle();

    // Upsert profile com flag de troca de senha (preserva CPF existente)
    const { error: profErr } = await admin.from("profiles").upsert({
      id: userId,
      full_name: String(full_name).trim(),
      email: normalizedEmail,
      phone: phone ? String(phone).trim() : null,
      unit_id: teacher.unit_id,
      active: true,
      must_change_password: true,
      cpf: currentProfile?.cpf ?? "",
    }, { onConflict: "id" });
    if (profErr) {
      console.error("[create-teacher-user] profile upsert error", { teacher_id, auth_id: userId, error: profErr });
      return jsonResponse({ error: profErr.message }, 400);
    }

    if (previousProfileId && previousProfileId !== userId) {
      const { count } = await admin
        .from("school_teachers")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", previousProfileId)
        .neq("id", teacher_id);
      if (!count) {
        await admin.from("user_roles").delete().eq("user_id", previousProfileId).eq("role", "PROFESSOR");
      }
      console.info("[create-teacher-user] vínculo quebrado substituído", {
        teacher_id,
        old_profile_id: previousProfileId,
        new_profile_id: userId,
      });
    }

    // Role PROFESSOR
    const { error: roleErr } = await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "PROFESSOR" }, { onConflict: "user_id,role" });
    if (roleErr) {
      console.error("[create-teacher-user] role upsert error", { teacher_id, auth_id: userId, error: roleErr });
      return jsonResponse({ error: "Falha ao sincronizar role PROFESSOR." }, 400);
    }

    // Vincula ao professor
    const { error: linkErr } = await admin
      .from("school_teachers")
      .update({ profile_id: userId, email: normalizedEmail })
      .eq("id", teacher_id);
    if (linkErr) return jsonResponse({ error: linkErr.message }, 400);

    const [{ data: checkTeacher }, { data: checkProfile }, { data: checkRole }, { data: finalAuth }] = await Promise.all([
      admin.from("school_teachers").select("profile_id, email").eq("id", teacher_id).maybeSingle(),
      admin.from("profiles").select("id, email, active").eq("id", userId).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "PROFESSOR").maybeSingle(),
      admin.auth.admin.getUserById(userId),
    ]);

    const validationErrors: string[] = [];
    if (finalAuth?.user?.email?.toLowerCase() !== normalizedEmail) validationErrors.push("auth_email_divergente");
    if (checkProfile?.email?.toLowerCase() !== normalizedEmail || checkProfile?.active !== true) validationErrors.push("profile_invalido");
    if (checkRole?.role !== "PROFESSOR") validationErrors.push("role_professor_ausente");
    if (checkTeacher?.profile_id !== userId || checkTeacher?.email?.toLowerCase() !== normalizedEmail) validationErrors.push("vinculo_professor_invalido");

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: loginErr } = await authClient.auth.signInWithPassword({
      email: normalizedEmail,
      password: finalPassword,
    });
    await authClient.auth.signOut();
    if (loginErr) validationErrors.push("login_senha_invalido");

    if (validationErrors.length) {
      console.error("[create-teacher-user] validação final falhou", {
        teacher_id,
        auth_id: userId,
        profile_id: userId,
        email: normalizedEmail,
        validationErrors,
        login_error: loginErr?.message ?? null,
        synced_at: new Date().toISOString(),
      });
      return jsonResponse({
        error: "Erro de sincronização do acesso. Tente reenviar o app novamente.",
        status: "ERRO_DE_SINCRONIZACAO",
        validation_errors: validationErrors,
      }, 500);
    }

    console.info("[create-teacher-user] sync completed", {
      teacher_id,
      auth_id: userId,
      profile_id: userId,
      email: normalizedEmail,
      reason,
      rebuilt,
      login_valid: true,
      synced_at: new Date().toISOString(),
    });

    return jsonResponse({
      success: true,
      user_id: userId,
      auth_id: userId,
      profile_id: userId,
      email: normalizedEmail,
      password: finalPassword,
      status: "LOGIN_FUNCIONAL",
      status_label: rebuilt ? "Acesso sincronizado" : "Login funcional",
      login_valid: true,
      rebuilt,
      reason,
      synced_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[create-teacher-user] internal error", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erro interno ao gerar acesso." },
      500,
    );
  }
});
