import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Finding = {
  kind: string;
  severity: "INFO" | "WARN" | "ERROR";
  teacher_id?: string | null;
  unit_id?: string | null;
  company_id?: string | null;
  details: Record<string, unknown>;
  fixed: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const findings: Finding[] = [];
  const counts = {
    teachers_checked: 0,
    roles_added: 0,
    closures_recalculated: 0,
    orphan_lessons: 0,
    duplicate_links: 0,
    schedule_conflicts: 0,
    auth_missing: 0,
  };

  try {
    // 1) Vínculos ativos + presença em auth.users + role PROFESSOR
    const { data: teachers } = await supabase
      .from("school_teachers")
      .select("id, profile_id, unit_id, company_id, active, full_name")
      .eq("active", true);

    counts.teachers_checked = teachers?.length ?? 0;
    const profileIds = Array.from(new Set((teachers ?? []).map((t) => t.profile_id).filter(Boolean)));

    // Roles atuais
    const { data: existingRoles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", profileIds.length ? profileIds : ["00000000-0000-0000-0000-000000000000"]);
    const teacherRoleSet = new Set(
      (existingRoles ?? []).filter((r) => r.role === "PROFESSOR").map((r) => r.user_id),
    );

    for (const t of teachers ?? []) {
      if (!t.profile_id) continue;
      if (!teacherRoleSet.has(t.profile_id)) {
        const { error } = await supabase.from("user_roles").insert({
          user_id: t.profile_id,
          role: "PROFESSOR",
        });
        if (!error) {
          counts.roles_added += 1;
          teacherRoleSet.add(t.profile_id);
          findings.push({
            kind: "ROLE_PROFESSOR_ADDED",
            severity: "INFO",
            teacher_id: t.id,
            unit_id: t.unit_id,
            company_id: t.company_id,
            details: { profile_id: t.profile_id, full_name: t.full_name },
            fixed: true,
          });
        }
      }
    }

    // 2) Vínculos duplicados ativos (mesmo profile_id+unit_id) — manter o mais recente
    const seen = new Map<string, { id: string; created_at: string }>();
    const { data: allLinks } = await supabase
      .from("school_teachers")
      .select("id, profile_id, unit_id, active, created_at")
      .eq("active", true)
      .order("created_at", { ascending: false });
    for (const link of allLinks ?? []) {
      if (!link.profile_id) continue;
      const key = `${link.profile_id}::${link.unit_id}`;
      const prev = seen.get(key);
      if (!prev) {
        seen.set(key, { id: link.id, created_at: link.created_at });
      } else {
        counts.duplicate_links += 1;
        findings.push({
          kind: "DUPLICATE_TEACHER_LINK",
          severity: "WARN",
          teacher_id: link.id,
          unit_id: link.unit_id,
          details: { kept_id: prev.id, duplicate_id: link.id, profile_id: link.profile_id },
          fixed: false,
        });
      }
    }

    // 3) Aulas com teacher_id inativo
    const { data: inactiveLessons } = await supabase
      .from("school_lessons")
      .select("id, teacher_id, unit_id, starts_at, status")
      .gte("starts_at", new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString())
      .neq("status", "CANCELED");
    const activeTeacherIds = new Set((teachers ?? []).map((t) => t.id));
    for (const l of inactiveLessons ?? []) {
      if (!activeTeacherIds.has(l.teacher_id)) {
        counts.orphan_lessons += 1;
        findings.push({
          kind: "LESSON_INACTIVE_TEACHER",
          severity: "WARN",
          teacher_id: l.teacher_id,
          unit_id: l.unit_id,
          details: { lesson_id: l.id, starts_at: l.starts_at, status: l.status },
          fixed: false,
        });
      }
    }

    // 4) Conflitos de horário (mesma teacher_id, intervalo sobreposto)
    const lessonsByTeacher = new Map<string, Array<{ id: string; s: number; e: number }>>();
    for (const l of inactiveLessons ?? []) {
      const arr = lessonsByTeacher.get(l.teacher_id) ?? [];
      arr.push({ id: l.id, s: +new Date(l.starts_at), e: +new Date((l as { ends_at?: string }).ends_at ?? l.starts_at) });
      lessonsByTeacher.set(l.teacher_id, arr);
    }
    for (const [tid, arr] of lessonsByTeacher) {
      arr.sort((a, b) => a.s - b.s);
      for (let i = 1; i < arr.length; i++) {
        if (arr[i].s < arr[i - 1].e) {
          counts.schedule_conflicts += 1;
          findings.push({
            kind: "SCHEDULE_CONFLICT",
            severity: "WARN",
            teacher_id: tid,
            details: { lesson_a: arr[i - 1].id, lesson_b: arr[i].id },
            fixed: false,
          });
        }
      }
    }

    // 5) Closures com total_value divergente
    const { data: closures } = await supabase
      .from("school_payroll_closures")
      .select("id, teacher_id, unit_id, total_value, status, reference_month, cycle_end_date")
      .neq("status", "PAID")
      .neq("status", "CANCELED");
    for (const c of closures ?? []) {
      const { data: sumRows } = await supabase
        .from("school_lessons")
        .select("computed_value")
        .eq("teacher_id", c.teacher_id)
        .eq("status", "VALIDATED")
        .gte("starts_at", c.reference_month)
        .lt("starts_at", c.cycle_end_date ?? c.reference_month);
      const sum = (sumRows ?? []).reduce((s, r) => s + Number(r.computed_value ?? 0), 0);
      if (Math.abs(sum - Number(c.total_value ?? 0)) > 0.01) {
        await supabase.rpc("recalc_school_payroll_closure", { _closure_id: c.id });
        counts.closures_recalculated += 1;
        findings.push({
          kind: "CLOSURE_TOTAL_MISMATCH",
          severity: "WARN",
          teacher_id: c.teacher_id,
          unit_id: c.unit_id,
          details: { closure_id: c.id, stored: c.total_value, computed: sum },
          fixed: true,
        });
      }
    }

    // Persistir findings em teacher_app_logs (modo agregado por finding)
    for (const f of findings) {
      const t = (teachers ?? []).find((x) => x.id === f.teacher_id);
      await supabase.from("teacher_app_logs").insert({
        user_id: t?.profile_id ?? "00000000-0000-0000-0000-000000000000",
        teacher_id: f.teacher_id ?? null,
        unit_id: f.unit_id ?? t?.unit_id ?? null,
        company_id: f.company_id ?? t?.company_id ?? null,
        event: "RECONCILE_FINDING",
        route: "reconcile-teachers",
        status: f.severity,
        message: f.kind,
        details: { ...f.details, fixed: f.fixed },
      });
    }

    // Log final
    await supabase.from("teacher_app_logs").insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      teacher_id: null,
      unit_id: null,
      company_id: null,
      event: "RECONCILE_RUN",
      route: "reconcile-teachers",
      status: "INFO",
      message: `Reconcile concluído: ${findings.length} achados`,
      details: { counts, findings_count: findings.length },
    });

    return new Response(JSON.stringify({ ok: true, counts, findings }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
