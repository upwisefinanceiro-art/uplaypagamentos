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
    return new Response(null, { headers: corsHeaders });
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

    const token = authHeader.replace("Bearer ", "");
    let callerId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      callerId = payload.sub || null;
    } catch { /* invalid token */ }

    if (!callerId) {
      return jsonResponse({ error: "Não autorizado" });
    }

    // callerId already set above from JWT

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    const isAdminMaster = callerRoles?.some((r: { role: string }) => r.role === "ADMIN_MASTER");
    if (!isAdminMaster) {
      return jsonResponse({ error: "Apenas ADMIN_MASTER pode executar esta ação" });
    }

    const { mode } = await req.json();
    // mode: "preview" | "execute"

    // Get all RESPONSAVEL user IDs
    const { data: responsavelRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "RESPONSAVEL");

    const responsavelIds = new Set((responsavelRoles || []).map((r: { user_id: string }) => r.user_id));

    // Get all payments for responsaveis
    const { data: allPayments } = await supabaseAdmin
      .from("payments")
      .select("id, responsible_id, contract_id, status, value, due_date, description")
      .order("due_date");

    // Get all contracts
    const { data: allContracts } = await supabaseAdmin
      .from("contracts")
      .select("id, responsible_id, description, status");

    // Get all profiles that are RESPONSAVEL
    const { data: allProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, cpf, active");

    const responsavelProfiles = (allProfiles || []).filter(
      (p: { id: string }) => responsavelIds.has(p.id)
    );

    // Determine which responsaveis have PAID payments (protected)
    const paidByResponsible = new Map<string, number>();
    const unpaidPaymentsByResponsible = new Map<string, string[]>();

    for (const payment of allPayments || []) {
      if (!responsavelIds.has(payment.responsible_id)) continue;

      if (payment.status === "PAID" || payment.status === "RECEIVED" || payment.status === "CONFIRMED") {
        paidByResponsible.set(
          payment.responsible_id,
          (paidByResponsible.get(payment.responsible_id) || 0) + 1
        );
      } else {
        const list = unpaidPaymentsByResponsible.get(payment.responsible_id) || [];
        list.push(payment.id);
        unpaidPaymentsByResponsible.set(payment.responsible_id, list);
      }
    }

    // Contracts by responsible
    const contractsByResponsible = new Map<string, string[]>();
    for (const contract of allContracts || []) {
      if (!responsavelIds.has(contract.responsible_id)) continue;
      const list = contractsByResponsible.get(contract.responsible_id) || [];
      list.push(contract.id);
      contractsByResponsible.set(contract.responsible_id, list);
    }

    // Classify responsaveis
    const deletableClients: { id: string; full_name: string; cpf: string }[] = [];
    const blockedClients: { id: string; full_name: string; cpf: string; paid_count: number }[] = [];

    for (const profile of responsavelProfiles) {
      const paidCount = paidByResponsible.get(profile.id) || 0;
      if (paidCount > 0) {
        blockedClients.push({ id: profile.id, full_name: profile.full_name, cpf: profile.cpf, paid_count: paidCount });
      } else {
        deletableClients.push({ id: profile.id, full_name: profile.full_name, cpf: profile.cpf });
      }
    }

    // Count deletable items
    let deletablePayments = 0;
    let deletableContracts = 0;
    const deletablePaymentIds: string[] = [];
    const deletableContractIds: string[] = [];

    for (const client of deletableClients) {
      const paymentIds = unpaidPaymentsByResponsible.get(client.id) || [];
      deletablePaymentIds.push(...paymentIds);
      deletablePayments += paymentIds.length;

      const contractIds = contractsByResponsible.get(client.id) || [];
      deletableContractIds.push(...contractIds);
      deletableContracts += contractIds.length;
    }

    if (mode === "preview") {
      return jsonResponse({
        success: true,
        preview: {
          deletable_clients: deletableClients.length,
          deletable_contracts: deletableContracts,
          deletable_payments: deletablePayments,
          blocked_clients: blockedClients.length,
          clients: deletableClients.map((c) => c.full_name),
          blocked: blockedClients.map((c) => ({
            name: c.full_name,
            paid_count: c.paid_count,
          })),
        },
      });
    }

    if (mode === "execute") {
      let deletedPayments = 0;
      let deletedContracts = 0;
      let deletedStudents = 0;
      let deletedClients = 0;

      // 1. Delete unpaid payments for deletable clients
      if (deletablePaymentIds.length > 0) {
        const { count } = await supabaseAdmin
          .from("payments")
          .delete()
          .in("id", deletablePaymentIds)
          .select("id", { count: "exact", head: true });
        // Supabase doesn't return count on delete easily, count manually
        deletedPayments = deletablePaymentIds.length;
      }

      // Also delete all payments for deletable contracts (in case some weren't caught)
      if (deletableContractIds.length > 0) {
        await supabaseAdmin
          .from("payments")
          .delete()
          .in("contract_id", deletableContractIds);
      }

      // 2. Delete contracts
      if (deletableContractIds.length > 0) {
        await supabaseAdmin
          .from("contracts")
          .delete()
          .in("id", deletableContractIds);
        deletedContracts = deletableContractIds.length;
      }

      // 3. Delete students, roles, profiles, auth for each client
      for (const client of deletableClients) {
        // Delete students
        const { data: studentData } = await supabaseAdmin
          .from("students")
          .delete()
          .eq("responsible_id", client.id)
          .select("id");
        deletedStudents += studentData?.length || 0;

        // Delete whatsapp logs
        await supabaseAdmin
          .from("whatsapp_message_logs")
          .delete()
          .eq("responsible_id", client.id);

        // Delete roles
        await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", client.id);

        // Delete profile
        await supabaseAdmin
          .from("profiles")
          .delete()
          .eq("id", client.id);

        // Delete auth user
        await supabaseAdmin.auth.admin.deleteUser(client.id);
        deletedClients++;
      }

      // Log audit
      await supabaseAdmin.from("audit_logs").insert({
        action: "CLEAN_TEST_DATA",
        target_table: "multiple",
        target_id: callerId,
        performed_by: callerId,
        details: {
          deleted_clients: deletedClients,
          deleted_contracts: deletedContracts,
          deleted_payments: deletedPayments,
          deleted_students: deletedStudents,
          blocked_clients: blockedClients.length,
        },
      });

      return jsonResponse({
        success: true,
        result: {
          deleted_clients: deletedClients,
          deleted_contracts: deletedContracts,
          deleted_payments: deletedPayments,
          deleted_students: deletedStudents,
          blocked_clients: blockedClients.length,
          blocked: blockedClients.map((c) => ({
            name: c.full_name,
            paid_count: c.paid_count,
          })),
        },
      });
    }

    return jsonResponse({ error: "mode deve ser 'preview' ou 'execute'" });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Erro interno" });
  }
});
