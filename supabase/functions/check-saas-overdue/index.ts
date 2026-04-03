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

    const today = new Date().toISOString().split("T")[0];

    // Get all active subscriptions that are past block deadline
    const { data: overdueSubscriptions, error: subError } = await supabase
      .from("saas_subscriptions")
      .select("id, company_id, next_billing_date, block_deadline, status")
      .in("status", ["ACTIVE", "OVERDUE"])
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

    for (const sub of overdueSubscriptions || []) {
      const blockDeadline = sub.block_deadline;
      const nextBilling = sub.next_billing_date;

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
        checked: (overdueSubscriptions || []).length,
        blocked,
        markedOverdue,
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
