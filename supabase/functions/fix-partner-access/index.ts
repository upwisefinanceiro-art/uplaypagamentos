import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const { secret } = await req.json();
    if (secret !== "ensinup-fix-2024") {
      return jsonResponse({ error: "Invalid secret" }, 403);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // 1. Get all units with email_empresa
    const { data: units, error: unitsError } = await supabaseAdmin
      .from("units")
      .select("id, name, email_empresa, email_acesso, tipo_cadastro, cpf, cnpj, whatsapp, phone")
      .not("email_empresa", "is", null)
      .neq("email_empresa", "");

    if (unitsError) {
      return jsonResponse({ error: unitsError.message }, 500);
    }

    const results: Array<{
      unit: string;
      email: string;
      status: string;
      detail?: string;
    }> = [];

    // 2. List all existing auth users
    const allUsers: any[] = [];
    let page = 1;
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
      if (error) {
        return jsonResponse({ error: `listUsers error: ${error.message}` }, 500);
      }
      const users = data?.users ?? [];
      allUsers.push(...users);
      if (users.length < 100) break;
      page += 1;
    }

    for (const unit of (units || [])) {
      const email = unit.email_empresa!.trim().toLowerCase();
      const unitName = unit.name || "Sem nome";
      const defaultPassword = "12345678";

      try {
        // Check if auth user exists for this email
        const existingAuthUser = allUsers.find(
          (u: any) => u.email?.toLowerCase() === email
        );

        // Generate a safe CPF placeholder for PJ
        const fakeCpf = unit.tipo_cadastro === "PF"
          ? (unit.cpf || `PF${Date.now()}`)
          : `PJ${unit.id.replace(/-/g, "").slice(0, 11)}`;

        if (existingAuthUser) {
          // User exists in auth - check if it's corrupted
          // Try to update it (this fixes most issues)
          const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            existingAuthUser.id,
            {
              email: email,
              password: defaultPassword,
              email_confirm: true,
              ban_duration: "none",
              user_metadata: { cpf: fakeCpf, full_name: unitName },
            }
          );

          if (updateError) {
            // If update fails, the user record is corrupted
            // Delete it and recreate
            console.log(`Corrupted user ${email}, deleting and recreating...`);
            
            // Clean up profile and roles first
            await supabaseAdmin.from("user_roles").delete().eq("user_id", existingAuthUser.id);
            await supabaseAdmin.from("profiles").delete().eq("id", existingAuthUser.id);
            
            const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(existingAuthUser.id);
            if (deleteError) {
              results.push({ unit: unitName, email, status: "ERROR", detail: `Delete failed: ${deleteError.message}` });
              continue;
            }

            // Create fresh
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
              email: email,
              password: defaultPassword,
              email_confirm: true,
              user_metadata: { cpf: fakeCpf, full_name: unitName },
            });

            if (createError || !newUser?.user) {
              results.push({ unit: unitName, email, status: "ERROR", detail: `Recreate failed: ${createError?.message}` });
              continue;
            }

            // Create profile
            await supabaseAdmin.from("profiles").upsert({
              id: newUser.user.id,
              cpf: fakeCpf,
              full_name: unitName,
              email: email,
              unit_id: unit.id,
              active: true,
              phone: unit.whatsapp || unit.phone || null,
            });

            // Assign role
            await supabaseAdmin.from("user_roles").upsert(
              { user_id: newUser.user.id, role: "ADMIN_UNIDADE" },
              { onConflict: "user_id,role" }
            );

            results.push({ unit: unitName, email, status: "RECREATED", detail: `New ID: ${newUser.user.id}` });
          } else {
            // Update succeeded - sync profile and role
            await supabaseAdmin.from("profiles").upsert({
              id: existingAuthUser.id,
              cpf: fakeCpf,
              full_name: unitName,
              email: email,
              unit_id: unit.id,
              active: true,
              phone: unit.whatsapp || unit.phone || null,
            });

            await supabaseAdmin.from("user_roles").upsert(
              { user_id: existingAuthUser.id, role: "ADMIN_UNIDADE" },
              { onConflict: "user_id,role" }
            );

            results.push({ unit: unitName, email, status: "SYNCED" });
          }
        } else {
          // No auth user exists - create from scratch
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: defaultPassword,
            email_confirm: true,
            user_metadata: { cpf: fakeCpf, full_name: unitName },
          });

          if (createError || !newUser?.user) {
            results.push({ unit: unitName, email, status: "ERROR", detail: `Create failed: ${createError?.message}` });
            continue;
          }

          await supabaseAdmin.from("profiles").upsert({
            id: newUser.user.id,
            cpf: fakeCpf,
            full_name: unitName,
            email: email,
            unit_id: unit.id,
            active: true,
            phone: unit.whatsapp || unit.phone || null,
          });

          await supabaseAdmin.from("user_roles").upsert(
            { user_id: newUser.user.id, role: "ADMIN_UNIDADE" },
            { onConflict: "user_id,role" }
          );

          results.push({ unit: unitName, email, status: "CREATED", detail: `New ID: ${newUser.user.id}` });
        }

        // Update unit email_acesso
        await supabaseAdmin.from("units").update({ email_acesso: email }).eq("id", unit.id);

      } catch (err) {
        results.push({ unit: unitName, email, status: "ERROR", detail: (err as Error).message });
      }
    }

    return jsonResponse({ success: true, results });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
