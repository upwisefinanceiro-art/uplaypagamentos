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

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    const isAdminMaster = callerRoles?.some((row: { role: string }) => row.role === "ADMIN_MASTER");
    const isAdminUnidade = callerRoles?.some((row: { role: string }) => row.role === "ADMIN_UNIDADE");

    if (!isAdminMaster && !isAdminUnidade) {
      return jsonResponse({ error: "Sem permissão" });
    }

    const { user_id, action, force_cascade } = await req.json();

    if (!user_id) {
      return jsonResponse({ error: "user_id é obrigatório" });
    }

    if (user_id === callerId) {
      return jsonResponse({ error: "Você não pode executar esta ação em si mesmo" });
    }

    const [{ data: callerProfile }, { data: targetProfile }, { data: targetRoles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("unit_id").eq("id", callerId).maybeSingle(),
      supabaseAdmin.from("profiles").select("id, unit_id, active").eq("id", user_id).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", user_id),
    ]);

    if (!targetProfile) {
      return jsonResponse({ error: "Registro não encontrado" });
    }

    if (!isAdminMaster) {
      const targetIsMaster = targetRoles?.some((row: { role: string }) => row.role === "ADMIN_MASTER");
      if (targetIsMaster || !callerProfile?.unit_id || callerProfile.unit_id !== targetProfile.unit_id) {
        return jsonResponse({ error: "Sem permissão para este usuário" });
      }
    }

    const logAction = async (auditAction: string, details: Record<string, unknown> = {}) => {
      await supabaseAdmin.from("audit_logs").insert({
        action: auditAction,
        target_table: "profiles",
        target_id: user_id,
        performed_by: callerId,
        details,
      });
    };

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
        supabaseAdmin.from("contracts").select("id", { count: "exact", head: true }).eq("responsible_id", user_id),
        supabaseAdmin.from("payments").select("id, status", { count: "exact" }).eq("responsible_id", user_id),
      ]);

      const contractCount = contractsRes.count ?? 0;
      const paymentCount = paymentsRes.count ?? 0;
      const hasContracts = contractCount > 0;
      const hasPayments = paymentCount > 0;

      // Check if there are PAID payments (truly protected)
      const paidPayments = (paymentsRes.data || []).filter(
        (p: { status: string }) => ["PAID", "RECEIVED", "CONFIRMED"].includes(p.status)
      );
      const hasPaidPayments = paidPayments.length > 0;

      if (hasPaidPayments) {
        await logAction("DELETE_ATTEMPT", {
          requested_action: "permanent_delete",
          blocked_reason: "has_paid_payments",
          paid_count: paidPayments.length,
        });
        return jsonResponse({
          error: "Este cliente possui pagamentos confirmados e não pode ser excluído. Use desativar.",
          has_dependencies: true,
          has_paid: true,
          contract_count: contractCount,
          payment_count: paymentCount,
          paid_count: paidPayments.length,
        });
      }

      if ((hasContracts || hasPayments) && !force_cascade) {
        return jsonResponse({
          error: "Este cliente possui registros vinculados. Confirme a exclusão em cascata.",
          has_dependencies: true,
          has_paid: false,
          contract_count: contractCount,
          payment_count: paymentCount,
          paid_count: 0,
        });
      }

      // Force cascade: delete unpaid payments, contracts, then user
      if (hasPayments) {
        await supabaseAdmin.from("payments").delete().eq("responsible_id", user_id);
      }
      if (hasContracts) {
        await supabaseAdmin.from("contracts").delete().eq("responsible_id", user_id);
      }

      await supabaseAdmin.from("students").delete().eq("responsible_id", user_id);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
      await supabaseAdmin.from("profiles").delete().eq("id", user_id);

      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (deleteAuthError) {
        return jsonResponse({ error: deleteAuthError.message });
      }

      await logAction("PERMANENT_DELETE", { deleted_user_id: user_id });
      return jsonResponse({ success: true, message: "Usuário excluído permanentemente" });
    }

    if (action === "reactivate") {
      const { error: profileError } = await supabaseAdmin.from("profiles").update({ active: true }).eq("id", user_id);
      if (profileError) {
        return jsonResponse({ error: profileError.message });
      }

      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "none" });
      if (authError) {
        return jsonResponse({ error: authError.message });
      }

      await logAction("REACTIVATE", { before_active: targetProfile.active, after_active: true });
      return jsonResponse({ success: true, message: "Usuário reativado" });
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").update({ active: false }).eq("id", user_id);
    if (profileError) {
      return jsonResponse({ error: profileError.message });
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "876600h" });
    if (authError) {
      return jsonResponse({ error: authError.message });
    }

    await logAction("DEACTIVATE", { before_active: targetProfile.active, after_active: false });
    return jsonResponse({ success: true, message: "Usuário desativado com sucesso" });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Erro interno" });
  }
});
