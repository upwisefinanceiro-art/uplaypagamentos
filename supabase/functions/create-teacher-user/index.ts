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

    const { teacher_id, email, full_name, phone, password } = await req.json();
    if (!teacher_id || !email || !full_name) {
      return jsonResponse({ error: "Campos obrigatórios: teacher_id, email, full_name" }, 400);
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return jsonResponse({ error: "E-mail inválido" }, 400);
    }
    const finalPassword = (typeof password === "string" && password.length >= 6) ? password : "12345678";

    // Carrega o professor para isolar por empresa/unidade
    const { data: teacher } = await admin
      .from("school_teachers")
      .select("id, unit_id, company_id, profile_id")
      .eq("id", teacher_id)
      .maybeSingle();
    if (!teacher) return jsonResponse({ error: "Professor não encontrado" }, 404);

    // Reutiliza usuário existente pelo e-mail, se houver
    const { data: existing } = await admin.auth.admin.listUsers();
    const existingUser = existing?.users?.find(
      (u: { email?: string }) => u.email?.toLowerCase() === normalizedEmail,
    );

    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
      await admin.auth.admin.updateUserById(userId, {
        password: finalPassword,
        email_confirm: true,
        ban_duration: "none",
        user_metadata: { full_name: String(full_name).trim() },
      });
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: normalizedEmail,
        password: finalPassword,
        email_confirm: true,
        user_metadata: { full_name: String(full_name).trim() },
      });
      if (createErr || !created?.user) {
        return jsonResponse({ error: createErr?.message || "Erro ao criar usuário" }, 400);
      }
      userId = created.user.id;
    }

    // Upsert profile com flag de troca de senha
    const { error: profErr } = await admin.from("profiles").upsert({
      id: userId,
      full_name: String(full_name).trim(),
      email: normalizedEmail,
      phone: phone ? String(phone).trim() : null,
      unit_id: teacher.unit_id,
      active: true,
      must_change_password: true,
      cpf: "",
    }, { onConflict: "id" });
    if (profErr) return jsonResponse({ error: profErr.message }, 400);

    // Role PROFESSOR
    await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "PROFESSOR" }, { onConflict: "user_id,role" });

    // Vincula ao professor
    const { error: linkErr } = await admin
      .from("school_teachers")
      .update({ profile_id: userId, email: normalizedEmail })
      .eq("id", teacher_id);
    if (linkErr) return jsonResponse({ error: linkErr.message }, 400);

    return jsonResponse({
      success: true,
      user_id: userId,
      email: normalizedEmail,
      password: finalPassword,
    });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erro interno" },
      500,
    );
  }
});
