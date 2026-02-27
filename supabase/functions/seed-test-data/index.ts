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
    const { secret } = await req.json();
    if (secret !== "ensinup-seed-2024") {
      return new Response(JSON.stringify({ error: "Invalid secret" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const unitId = "9cf070e2-6604-4a3e-8962-440b5d233013"; // Serra Verde

    // 1) Create responsible user
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("cpf", "12345678901")
      .maybeSingle();

    let responsibleId: string;

    if (existing) {
      responsibleId = existing.id;
    } else {
      const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
        email: "12345678901@ensinup.app",
        password: "teste123",
        email_confirm: true,
        user_metadata: { cpf: "12345678901", full_name: "Maria Silva Santos" },
      });

      if (error) throw error;
      responsibleId = newUser.user.id;

      await supabaseAdmin.from("profiles")
        .update({ unit_id: unitId, phone: "31999990001" })
        .eq("id", responsibleId);

      await supabaseAdmin.from("user_roles").insert({
        user_id: responsibleId, role: "RESPONSAVEL",
      });
    }

    // 2) Create 2 students
    const { data: students } = await supabaseAdmin.from("students")
      .upsert([
        { full_name: "Pedro Silva Santos", responsible_id: responsibleId, unit_id: unitId },
        { full_name: "Ana Silva Santos", responsible_id: responsibleId, unit_id: unitId },
      ], { onConflict: "id" })
      .select("id, full_name");

    // 3) Create active contracts for each student
    const contracts = [];
    if (students) {
      for (const s of students) {
        const { data: contract } = await supabaseAdmin.from("contracts").insert({
          description: `Contrato ${s.full_name}`,
          student_id: s.id,
          responsible_id: responsibleId,
          unit_id: unitId,
          total_value: 12000,
          installments: 12,
          start_date: "2025-02-01",
          status: "ACTIVE",
        }).select("id").single();
        if (contract) contracts.push(contract);
      }
    }

    return new Response(
      JSON.stringify({ success: true, responsible_id: responsibleId, students, contracts }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
