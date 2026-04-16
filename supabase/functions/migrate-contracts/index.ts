import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function cleanDescription(raw: string): string {
  let d = raw
    .replace(/Parcela\s+\d+\s+de\s+\d+\.?\s*/gi, "")
    .replace(/Boleto\s+referente\s+ao\s+/gi, "")
    .replace(/Parcela\s+referente\s+ao\s+/gi, "")
    .replace(/curso\s+(na\s+escola\s+)?/gi, "Curso ")
    .replace(/\s*-\s*$/g, "")
    .replace(/\.\s*$/g, "")
    .trim();
  if (!d || d.length < 3) d = "Curso Profissionalizante";
  return d.charAt(0).toUpperCase() + d.slice(1);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { dry_run = false, unit_id, limit = 100 } = await req.json().catch(() => ({}));

    // Find all RESPONSAVEL profiles without contracts
    let query = supabase
      .from("profiles")
      .select("id, full_name, cpf, phone, email, unit_id, active, created_at")
      .not("unit_id", "is", null);

    if (unit_id) {
      query = query.eq("unit_id", unit_id);
    }

    const { data: allProfiles, error: profErr } = await query;
    if (profErr) throw profErr;

    // Filter to RESPONSAVEL only
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "RESPONSAVEL");
    const responsavelIds = new Set((roles || []).map((r: any) => r.user_id));

    // Get existing contracts to find who already has one
    const { data: existingContracts } = await supabase
      .from("contracts")
      .select("responsible_id, student_id");
    const existingKeys = new Set(
      (existingContracts || []).map((c: any) => `${c.responsible_id}_${c.student_id}`)
    );
    const responsaveisWithContract = new Set(
      (existingContracts || []).map((c: any) => c.responsible_id)
    );

    const profiles = (allProfiles || []).filter(
      (p: any) => responsavelIds.has(p.id) && !responsaveisWithContract.has(p.id)
    ).slice(0, limit);

    if (profiles.length === 0) {
      return new Response(
        JSON.stringify({ message: "Todos os clientes já possuem contrato.", created: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all students for these profiles
    const profileIds = profiles.map((p: any) => p.id);
    
    // Batch fetch students (max 500 at a time)
    let allStudents: any[] = [];
    for (let i = 0; i < profileIds.length; i += 200) {
      const batch = profileIds.slice(i, i + 200);
      const { data: students } = await supabase
        .from("students")
        .select("id, full_name, responsible_id, unit_id, birth_date")
        .in("responsible_id", batch);
      allStudents = allStudents.concat(students || []);
    }

    // Group students by responsible
    const studentsByResponsible: Record<string, any[]> = {};
    for (const s of allStudents) {
      if (!studentsByResponsible[s.responsible_id]) {
        studentsByResponsible[s.responsible_id] = [];
      }
      studentsByResponsible[s.responsible_id].push(s);
    }

    // Batch fetch payments for these profiles
    let allPayments: any[] = [];
    for (let i = 0; i < profileIds.length; i += 200) {
      const batch = profileIds.slice(i, i + 200);
      const { data: payments } = await supabase
        .from("payments")
        .select("id, responsible_id, student_id, unit_id, value, due_date, payment_type, status, description, contract_id")
        .in("responsible_id", batch)
        .is("contract_id", null)
        .order("due_date", { ascending: true });
      allPayments = allPayments.concat(payments || []);
    }

    // Group payments by responsible+student
    const paymentsByKey: Record<string, any[]> = {};
    for (const pay of allPayments) {
      const key = `${pay.responsible_id}_${pay.student_id || "null"}`;
      if (!paymentsByKey[key]) paymentsByKey[key] = [];
      paymentsByKey[key].push(pay);
    }

    const contractsToCreate: any[] = [];
    const paymentUpdates: { contractId: string; paymentIds: string[] }[] = [];

    let contractNum = 1;

    for (const profile of profiles) {
      const students = studentsByResponsible[profile.id] || [];

      if (students.length === 0) {
        // Client without student - create basic contract
        const payments = paymentsByKey[`${profile.id}_null`] || [];
        const mensalidades = payments.filter((p: any) => p.payment_type === "MENSALIDADE");
        const firstDue = mensalidades[0]?.due_date || null;
        const avgValue = mensalidades.length > 0
          ? mensalidades.reduce((s: number, p: any) => s + Number(p.value), 0) / mensalidades.length
          : 0;
        const totalValue = mensalidades.length > 0
          ? mensalidades.reduce((s: number, p: any) => s + Number(p.value), 0)
          : avgValue;
        const rawDesc = mensalidades[0]?.description || payments[0]?.description || "Curso Profissionalizante";
        const desc = rawDesc;

        // Create a dummy student for this profile
        const { data: newStudent, error: stuErr } = await supabase
          .from("students")
          .insert({
            full_name: profile.full_name,
            responsible_id: profile.id,
            unit_id: profile.unit_id,
            birth_date: null,
          })
          .select("id")
          .single();

        if (stuErr) {
          console.error("Error creating student for", profile.id, stuErr);
          continue;
        }

        const contract = {
          unit_id: profile.unit_id,
          student_id: newStudent.id,
          responsible_id: profile.id,
          responsible_name: profile.full_name,
          cpf: profile.cpf,
          phone: profile.phone,
          email: profile.email,
          description: cleanDescription(rawDesc),
          total_value: totalValue > 0 ? Math.round(totalValue * 100) / 100 : 0,
          installments: mensalidades.length || 1,
          start_date: firstDue || profile.created_at?.split("T")[0] || new Date().toISOString().split("T")[0],
          first_due_date: firstDue,
          due_day: firstDue ? new Date(firstDue + "T12:00:00").getDate() : 10,
          status: profile.active ? "ACTIVE" : "CANCELLED",
        };

        contractsToCreate.push({ contract, paymentIds: payments.map((p: any) => p.id) });
      } else {
        // One contract per student
        for (const student of students) {
          const key = `${profile.id}_${student.id}`;
          const payments = paymentsByKey[key] || paymentsByKey[`${profile.id}_null`] || [];
          const mensalidades = payments.filter((p: any) => p.payment_type === "MENSALIDADE");
          const firstDue = mensalidades[0]?.due_date || null;
          const avgValue = mensalidades.length > 0
            ? mensalidades.reduce((s: number, p: any) => s + Number(p.value), 0) / mensalidades.length
            : 0;
          const totalValue = mensalidades.length > 0
            ? mensalidades.reduce((s: number, p: any) => s + Number(p.value), 0)
            : 0;
          const rawDesc = mensalidades[0]?.description || payments[0]?.description || "Curso Profissionalizante";

          const contract = {
            unit_id: profile.unit_id,
            student_id: student.id,
            responsible_id: profile.id,
            responsible_name: profile.full_name,
            cpf: profile.cpf,
            phone: profile.phone,
            email: profile.email,
            description: cleanDescription(rawDesc),
            total_value: totalValue > 0 ? Math.round(totalValue * 100) / 100 : 0,
            installments: mensalidades.length || 1,
            start_date: firstDue || profile.created_at?.split("T")[0] || new Date().toISOString().split("T")[0],
            first_due_date: firstDue,
            due_day: firstDue ? new Date(firstDue + "T12:00:00").getDate() : 10,
            status: profile.active ? "ACTIVE" : "CANCELLED",
            birth_date: student.birth_date,
          };

          contractsToCreate.push({ contract, paymentIds: payments.map((p: any) => p.id) });
        }
      }
    }

    if (dry_run) {
      return new Response(
        JSON.stringify({
          dry_run: true,
          total_clients: profiles.length,
          contracts_to_create: contractsToCreate.length,
          sample: contractsToCreate.slice(0, 5).map(c => ({
            responsible: c.contract.responsible_name,
            description: c.contract.description,
            total_value: c.contract.total_value,
            installments: c.contract.installments,
            payments_to_link: c.paymentIds.length,
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Execute: create contracts and link payments
    let created = 0;
    let linked = 0;
    const errors: string[] = [];

    for (const item of contractsToCreate) {
      const { data: newContract, error: cErr } = await supabase
        .from("contracts")
        .insert(item.contract)
        .select("id")
        .single();

      if (cErr) {
        errors.push(`${item.contract.responsible_name}: ${cErr.message}`);
        continue;
      }

      created++;

      // Link payments to this contract
      if (item.paymentIds.length > 0) {
        for (let i = 0; i < item.paymentIds.length; i += 50) {
          const batch = item.paymentIds.slice(i, i + 50);
          const { error: upErr } = await supabase
            .from("payments")
            .update({ contract_id: newContract.id })
            .in("id", batch);
          if (upErr) {
            errors.push(`Link payments error: ${upErr.message}`);
          } else {
            linked += batch.length;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_clients_processed: profiles.length,
        contracts_created: created,
        payments_linked: linked,
        errors: errors.length > 0 ? errors.slice(0, 20) : [],
        remaining_without_contract: profiles.length - created,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
