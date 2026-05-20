import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  teacher_id?: string;
  unit_id?: string;
  all?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Verifica caller é admin
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const allowed = (roles ?? []).some((r) =>
    ["SUPER_ADMIN", "ADMIN_MASTER", "ADMIN_UNIDADE"].includes(r.role),
  );
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  try {
    let query = supabase
      .from("school_teachers")
      .select("id, profile_id, unit_id, company_id, full_name")
      .eq("active", true);
    if (body.teacher_id) query = query.eq("id", body.teacher_id);
    else if (body.unit_id) query = query.eq("unit_id", body.unit_id);
    else if (!body.all) {
      return new Response(JSON.stringify({ error: "informe teacher_id, unit_id ou all=true" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: teachers, error: tErr } = await query;
    if (tErr) throw tErr;
    if (!teachers || teachers.length === 0) {
      return new Response(JSON.stringify({ ok: true, teachers_processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let closuresRecalculated = 0;
    let lessonsTouched = 0;
    let rolesEnsured = 0;
    const findings: Array<Record<string, unknown>> = [];

    for (const t of teachers) {
      // Garante role PROFESSOR
      if (t.profile_id) {
        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("user_id", t.profile_id)
          .eq("role", "PROFESSOR")
          .maybeSingle();
        if (!roleRow) {
          const { error } = await supabase
            .from("user_roles")
            .insert({ user_id: t.profile_id, role: "PROFESSOR" });
          if (!error) rolesEnsured++;
        }
      }

      // Toca aulas (dispara trigger de recálculo de computed_value)
      const { data: lessons } = await supabase
        .from("school_lessons")
        .select("id")
        .eq("teacher_id", t.id)
        .gte("starts_at", new Date(Date.now() - 1000 * 60 * 60 * 24 * 180).toISOString());
      for (const l of lessons ?? []) {
        const { error } = await supabase
          .from("school_lessons")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", l.id);
        if (!error) lessonsTouched++;
      }

      // Recalcula closures
      const { data: closures } = await supabase
        .from("school_payroll_closures")
        .select("id")
        .eq("teacher_id", t.id)
        .neq("status", "CANCELED");
      for (const c of closures ?? []) {
        const { error } = await supabase.rpc("recalc_school_payroll_closure", { _closure_id: c.id });
        if (!error) closuresRecalculated++;
      }

      await supabase.from("teacher_app_logs").insert({
        user_id: t.profile_id ?? user.id,
        teacher_id: t.id,
        unit_id: t.unit_id,
        company_id: t.company_id,
        event: "REPROCESS_RUN",
        route: "reprocess-teacher",
        status: "INFO",
        message: `Reprocessado por ${user.id}`,
        details: { triggered_by: user.id },
      });

      findings.push({ teacher_id: t.id, full_name: t.full_name });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        teachers_processed: teachers.length,
        lessons_touched: lessonsTouched,
        closures_recalculated: closuresRecalculated,
        roles_ensured: rolesEnsured,
        findings,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
