import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(JSON.stringify({ error: "Missing environment variables" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();

    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const isAdminMaster = callerRoles?.some((r: { role: string }) => r.role === "ADMIN_MASTER");
    const isAdminUnidade = callerRoles?.some((r: { role: string }) => r.role === "ADMIN_UNIDADE");

    if (!isAdminMaster && !isAdminUnidade) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, full_name, cpf, phone, unit_id, email, address } = await req.json();

    if (!user_id || !full_name?.trim() || !cpf?.trim()) {
      return new Response(JSON.stringify({ error: "user_id, nome e CPF são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("id, unit_id, full_name, cpf, phone, email, address")
      .eq("id", user_id)
      .single();

    if (targetError || !targetProfile) {
      return new Response(JSON.stringify({ error: "Registro não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanCpf = String(cpf).replace(/\D/g, "");
    const normalizedName = String(full_name).trim();
    const normalizedPhone = typeof phone === "string" && phone.trim() ? phone.trim() : null;
    const normalizedAddress = typeof address === "string" && address.trim() ? address.trim() : null;
    const normalizedEmail = typeof email === "string" && email.trim()
      ? email.trim().toLowerCase()
      : `${cleanCpf}@ensinup.app`;

    let nextUnitId = targetProfile.unit_id;

    if (isAdminMaster) {
      nextUnitId = typeof unit_id === "string" && unit_id.trim() ? unit_id : null;
    } else {
      const { data: callerProfile } = await supabaseAdmin
        .from("profiles")
        .select("unit_id")
        .eq("id", caller.id)
        .single();

      if (!callerProfile?.unit_id || callerProfile.unit_id !== targetProfile.unit_id) {
        return new Response(JSON.stringify({ error: "Sem permissão para editar este registro" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      nextUnitId = targetProfile.unit_id;
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      email: normalizedEmail,
      user_metadata: {
        cpf: cleanCpf,
        full_name: normalizedName,
      },
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabaseAdmin.from("audit_logs").insert({
      action: "EDIT",
      target_table: "profiles",
      target_id: user_id,
      performed_by: caller.id,
      details: {
        before: targetProfile,
        after: updateData,
      },
    });

    return new Response(JSON.stringify({ success: true, profile: updateData }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});