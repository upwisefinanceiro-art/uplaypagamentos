import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── Auth check: accept internal key (cron) or JWT with SUPER_ADMIN/ADMIN_MASTER ──
    const internalKey = req.headers.get("x-internal-key");
    const expectedKey = Deno.env.get("X_INTERNAL_KEY");
    const isInternalCall = expectedKey && internalKey === expectedKey;

    if (!isInternalCall) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const token = authHeader.replace("Bearer ", "");
      let callerId: string | null = null;
      try { const p = JSON.parse(atob(token.split(".")[1])); callerId = p.sub || null; } catch { /* */ }
      if (!callerId) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: callerRoles } = await supabase.from("user_roles").select("role").eq("user_id", callerId);
      const isAllowed = callerRoles?.some((r: { role: string }) => ["SUPER_ADMIN", "ADMIN_MASTER"].includes(r.role));
      if (!isAllowed) {
        return new Response(JSON.stringify({ error: "Sem permissão" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const today = new Date().toISOString().split("T")[0];

    // Get all subscriptions that need checking
    const { data: allSubscriptions, error: subError } = await supabase
      .from("saas_subscriptions")
      .select("id, company_id, next_billing_date, block_deadline, status, trial_ends_at, trial_days")
      .in("status", ["ACTIVE", "OVERDUE", "TRIAL"])
      .not("block_deadline", "is", null);

    if (subError) {
      console.error("Error fetching subscriptions:", subError);
      return new Response(JSON.stringify({ error: subError.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let blocked = 0;
    let markedOverdue = 0;
    let trialExpired = 0;

    for (const sub of allSubscriptions || []) {
      const blockDeadline = sub.block_deadline;
      const nextBilling = sub.next_billing_date;

      // Handle trial expiration
      if (sub.status === "TRIAL" && sub.trial_ends_at && today > sub.trial_ends_at) {
        await supabase
          .from("saas_subscriptions")
          .update({ status: "ACTIVE" })
          .eq("id", sub.id);

        trialExpired++;
        continue;
      }

      if (!nextBilling) continue;

      // If past block deadline → block company
      if (blockDeadline && today > blockDeadline && sub.status !== "BLOCKED") {
        await supabase
          .from("saas_subscriptions")
          .update({ status: "BLOCKED" })
          .eq("id", sub.id);

        await supabase
          .from("companies")
          .update({ status: "BLOQUEADO" })
          .eq("id", sub.company_id);

        blocked++;
      }
      // If past due date but within tolerance → mark overdue
      else if (today > nextBilling && sub.status === "ACTIVE") {
        await supabase
          .from("saas_subscriptions")
          .update({ status: "OVERDUE" })
          .eq("id", sub.id);

        await supabase
          .from("companies")
          .update({ status: "ATRASADO" })
          .eq("id", sub.company_id);

        markedOverdue++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: (allSubscriptions || []).length,
        blocked,
        markedOverdue,
        trialExpired,
        date: today,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("check-saas-overdue error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
