import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { secret, email, password, full_name, cpf, reset_all } = await req.json();
    if (secret !== "ensinup-seed-2024") {
      return new Response(JSON.stringify({ error: "Invalid secret" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminCpf = String(cpf || "00000000000").replace(/\D/g, "");
    const adminEmail = email || "admin@ensinup.com";
    const adminPassword = password || "12345678";
    const adminName = full_name || "Admin Master";

    const allUsers: any[] = [];
    let page = 1;

    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
      if (error) throw error;

      const users = data?.users ?? [];
      allUsers.push(...users);

      if (users.length < 100) break;
      page += 1;
    }

    if (reset_all) {
      for (const user of allUsers) {
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          password: adminPassword,
          email_confirm: true,
        });
      }
    }

    const existingUser = allUsers.find((u: any) => u.email === adminEmail);

    let adminUserId = existingUser?.id as string | undefined;

    if (existingUser) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { cpf: adminCpf, full_name: adminName },
      });

      if (updateError) throw updateError;
    } else {
      const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { cpf: adminCpf, full_name: adminName },
      });

      if (error) throw error;
      adminUserId = newUser.user.id;
    }

    if (!adminUserId) {
      throw new Error("Falha ao preparar usuário administrador");
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: adminUserId,
      cpf: adminCpf,
      email: adminEmail,
      full_name: adminName,
      active: true,
    });

    if (profileError) throw profileError;

    const { error: roleError } = await supabaseAdmin.from("user_roles").upsert({
      user_id: adminUserId,
      role: "ADMIN_MASTER",
    }, {
      onConflict: "user_id,role",
    });

    if (roleError) throw roleError;

    return new Response(
      JSON.stringify({ success: true, user_id: adminUserId, email: adminEmail, cpf: adminCpf, reset_all: Boolean(reset_all) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
