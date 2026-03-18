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

    // Verify caller
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
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

    const isAdminMaster = callerRoles?.some((r: any) => r.role === "ADMIN_MASTER");
    const isAdminUnidade = callerRoles?.some((r: any) => r.role === "ADMIN_UNIDADE");

    if (!isAdminMaster && !isAdminUnidade) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, action } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (user_id === caller.id) {
      return new Response(JSON.stringify({ error: "Você não pode executar esta ação em si mesmo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ADMIN_UNIDADE: only own unit
    if (!isAdminMaster) {
      const { data: callerProfile } = await supabaseAdmin
        .from("profiles")
        .select("unit_id")
        .eq("id", caller.id)
        .single();

      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("unit_id")
        .eq("id", user_id)
        .single();

      if (!callerProfile?.unit_id || callerProfile.unit_id !== targetProfile?.unit_id) {
        return new Response(JSON.stringify({ error: "Sem permissão para este usuário" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // === PERMANENT DELETE ===
    if (action === "permanent_delete") {
      if (!isAdminMaster) {
        return new Response(JSON.stringify({ error: "Apenas ADMIN_MASTER pode excluir permanentemente" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check dependencies: contracts or payments
      const [contractsRes, paymentsRes] = await Promise.all([
        supabaseAdmin.from("contracts").select("id").eq("responsible_id", user_id).limit(1),
        supabaseAdmin.from("payments").select("id").eq("responsible_id", user_id).limit(1),
      ]);

      const hasContracts = (contractsRes.data?.length ?? 0) > 0;
      const hasPayments = (paymentsRes.data?.length ?? 0) > 0;

      if (hasContracts || hasPayments) {
        return new Response(JSON.stringify({
          error: "Este usuário possui contratos ou cobranças vinculados. Não é possível excluir permanentemente. Sugerimos desativar o usuário.",
          has_dependencies: true,
        }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete related data: students, user_roles, audit_logs refs, profile, then auth user
      await supabaseAdmin.from("students").delete().eq("responsible_id", user_id);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);

      // Log before deleting profile
      await supabaseAdmin.from("audit_logs").insert({
        action: "PERMANENT_DELETE",
        target_table: "profiles",
        target_id: user_id,
        performed_by: caller.id,
        details: { deleted_user_id: user_id },
      });

      await supabaseAdmin.from("profiles").delete().eq("id", user_id);
      await supabaseAdmin.auth.admin.deleteUser(user_id);

      return new Response(
        JSON.stringify({ success: true, message: "Usuário excluído permanentemente" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === REACTIVATE ===
    if (action === "reactivate") {
      await supabaseAdmin.from("profiles").update({ active: true }).eq("id", user_id);
      await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "none" });

      await supabaseAdmin.from("audit_logs").insert({
        action: "REACTIVATE",
        target_table: "profiles",
        target_id: user_id,
        performed_by: caller.id,
      });

      return new Response(
        JSON.stringify({ success: true, message: "Usuário reativado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === DEACTIVATE (default) ===
    await supabaseAdmin.from("profiles").update({ active: false }).eq("id", user_id);
    await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "876600h" });

    await supabaseAdmin.from("audit_logs").insert({
      action: "DEACTIVATE",
      target_table: "profiles",
      target_id: user_id,
      performed_by: caller.id,
    });

    return new Response(
      JSON.stringify({ success: true, message: "Usuário desativado com sucesso" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
