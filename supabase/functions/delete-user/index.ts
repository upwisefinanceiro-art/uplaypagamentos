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
    if (!authHeader) {
      return jsonResponse({ error: "Não autorizado" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: "Missing environment variables" });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();

    if (!caller) {
      return jsonResponse({ error: "Não autorizado" });
    }

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const isAdminMaster = callerRoles?.some((r: { role: string }) => r.role === "ADMIN_MASTER");
    const isAdminUnidade = callerRoles?.some((r: { role: string }) => r.role === "ADMIN_UNIDADE");

    if (!isAdminMaster && !isAdminUnidade) {
      return jsonResponse({ error: "Sem permissão" });
    }

    const { user_id, action } = await req.json();

    if (!user_id) {
      return jsonResponse({ error: "user_id é obrigatório" });
    }

    if (user_id === caller.id) {
      return jsonResponse({ error: "Você não pode executar esta ação em si mesmo" });
    }

    const logAction = async (auditAction: string, details: Record<string, unknown> = {}) => {
      await supabaseAdmin.from("audit_logs").insert({
        action: auditAction,
        target_table: "profiles",
        target_id: user_id,
        performed_by: caller.id,
        details,
      });
    };

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
        return jsonResponse({ error: "Sem permissão para este usuário" });
      }
    }

    if (action === "permanent_delete") {
      await logAction("DELETE_ATTEMPT", { requested_action: "permanent_delete" });

      if (!isAdminMaster) {
        await logAction("DELETE_ATTEMPT", {
          requested_action: "permanent_delete",
          blocked_reason: "not_admin_master",
        });
        return jsonResponse({ error: "Apenas ADMIN_MASTER pode excluir permanentemente" });
      }

      const [contractsRes, paymentsRes] = await Promise.all([
        supabaseAdmin.from("contracts").select("id").eq("responsible_id", user_id).limit(1),
        supabaseAdmin.from("payments").select("id").eq("responsible_id", user_id).limit(1),
      ]);

      const hasContracts = (contractsRes.data?.length ?? 0) > 0;
      const hasPayments = (paymentsRes.data?.length ?? 0) > 0;

      if (hasContracts || hasPayments) {
        await logAction("DELETE_ATTEMPT", {
          requested_action: "permanent_delete",
          blocked_reason: "financial_history",
          has_contracts: hasContracts,
          has_payments: hasPayments,
        });
        return jsonResponse({
          error: "Este registro possui histórico financeiro e não pode ser excluído. Use desativar.",
          has_dependencies: true,
        });
      }

      await supabaseAdmin.from("students").delete().eq("responsible_id", user_id);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
      await logAction("PERMANENT_DELETE", { deleted_user_id: user_id });
      await supabaseAdmin.from("profiles").delete().eq("id", user_id);
      await supabaseAdmin.auth.admin.deleteUser(user_id);

      return jsonResponse({ success: true, message: "Usuário excluído permanentemente" });
    }

    if (action === "reactivate") {
      await supabaseAdmin.from("profiles").update({ active: true }).eq("id", user_id);
      await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "none" });
      await logAction("REACTIVATE", { active: true });
      return jsonResponse({ success: true, message: "Usuário reativado" });
    }

    // Default: deactivate
    await supabaseAdmin.from("profiles").update({ active: false }).eq("id", user_id);
    await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "876600h" });
    await logAction("DEACTIVATE", { active: false });
    return jsonResponse({ success: true, message: "Usuário desativado com sucesso" });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Erro interno" });
  }
});
