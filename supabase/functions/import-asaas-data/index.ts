import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STATUS_MAP: Record<string, string> = {
  PENDING: "PENDING",
  RECEIVED: "PAID",
  CONFIRMED: "PAID",
  OVERDUE: "OVERDUE",
  REFUNDED: "CANCELLED",
  DELETED: "CANCELLED",
  RECEIVED_IN_CASH: "PAID",
};

const METHOD_MAP: Record<string, string> = {
  PIX: "PIX",
  BOLETO: "BOLETO",
  CREDIT_CARD: "CARD",
  UNDEFINED: "BOLETO",
};

/**
 * Formats a raw CPF/CNPJ string (digits-only) into the standard display format.
 */
function formatCpf(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}

/**
 * Paginate through all pages of an Asaas list endpoint.
 */
async function fetchAllPages<T>(baseUrl: string, path: string, apiKey: string): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = `${baseUrl}${path}${path.includes("?") ? "&" : "?"}offset=${offset}&limit=${limit}`;
    const res = await fetch(url, { headers: { access_token: apiKey } });
    if (!res.ok) {
      console.error(`[import] Fetch error ${res.status} at ${path}`);
      break;
    }
    const json = await res.json();
    const data = (json.data || []) as T[];
    all.push(...data);
    if (!json.hasMore) break;
    offset += limit;
  }

  return all;
}

/**
 * Try to guess payment_type from description or billing metadata.
 */
function guessPaymentType(description: string): string {
  const d = (description || "").toLowerCase();
  if (d.includes("apostila")) return "APOSTILA";
  if (d.includes("matrícula") || d.includes("matricula")) return "MATRICULA";
  if (d.includes("mensalidade") || d.includes("parcela")) return "MENSALIDADE";
  return "AVULSA";
}

// ─────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await supabaseUser.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── Role check ──
    const { data: callerRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const isAdmin = callerRoles?.some(
      (r: { role: string }) => r.role === "ADMIN_MASTER" || r.role === "ADMIN_UNIDADE"
    );
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Unit resolution ──
    let unitId: string | null = null;
    try {
      const body = await req.json();
      unitId = body.unit_id || null;
    } catch {
      /* no body */
    }

    if (!unitId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("unit_id")
        .eq("id", caller.id)
        .single();
      unitId = profile?.unit_id || null;
    }

    if (!unitId) {
      return new Response(JSON.stringify({ error: "Unidade não encontrada" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: unit } = await supabase
      .from("units")
      .select("id, asaas_api_key, asaas_base_url")
      .eq("id", unitId)
      .single();

    if (!unit?.asaas_api_key) {
      return new Response(
        JSON.stringify({ error: "Unidade sem API Key do Asaas configurada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = unit.asaas_base_url || "https://api.asaas.com/v3";
    const apiKey = unit.asaas_api_key;

    // Counters
    const stats = {
      customersImported: 0,
      customersUpdated: 0,
      customersSkipped: 0,
      studentsCreated: 0,
      paymentsImported: 0,
      paymentsSkipped: 0,
      errors: 0,
    };

    // ═════════════════════════════════════════════
    // PHASE 1 — Import ALL customers from Asaas
    // ═════════════════════════════════════════════

    console.log("[import] Fetching all Asaas customers …");

    interface AsaasCustomer {
      id: string;
      name: string;
      cpfCnpj?: string;
      email?: string;
      phone?: string;
      mobilePhone?: string;
      address?: string;
      addressNumber?: string;
      complement?: string;
      province?: string;
      postalCode?: string;
      city?: string;
      state?: string;
    }

    const asaasCustomers = await fetchAllPages<AsaasCustomer>(baseUrl, "/customers", apiKey);
    console.log(`[import] ${asaasCustomers.length} customers found in Asaas`);

    // Map: asaas_customer_id → local profile id (built during import)
    const customerToProfile: Record<string, string> = {};

    for (const cust of asaasCustomers) {
      try {
        const cpfRaw = (cust.cpfCnpj || "").replace(/\D/g, "");
        if (!cpfRaw) {
          stats.customersSkipped++;
          continue;
        }

        const cpfFmt = formatCpf(cpfRaw);
        const phone = cust.mobilePhone || cust.phone || null;
        const addressParts = [cust.address, cust.addressNumber, cust.complement]
          .filter(Boolean)
          .join(", ");
        const fullAddress = [addressParts, cust.province, cust.city, cust.state, cust.postalCode]
          .filter(Boolean)
          .join(" - ");

        // Try to find existing profile by CPF (both raw and formatted) in this unit
        const { data: existingProfiles } = await supabase
          .from("profiles")
          .select("id, asaas_customer_id, phone, email, address")
          .or(`cpf.eq.${cpfRaw},cpf.eq.${cpfFmt}`)
          .eq("unit_id", unitId);

        if (existingProfiles && existingProfiles.length > 0) {
          const existing = existingProfiles[0];
          customerToProfile[cust.id] = existing.id;

          // Update with any missing data from Asaas
          const updates: Record<string, unknown> = {};
          if (!existing.asaas_customer_id) updates.asaas_customer_id = cust.id;
          if (!existing.phone && phone) updates.phone = phone;
          if (!existing.email && cust.email) updates.email = cust.email;
          if (!existing.address && fullAddress) updates.address = fullAddress;

          if (Object.keys(updates).length > 0) {
            await supabase.from("profiles").update(updates).eq("id", existing.id);
            stats.customersUpdated++;
          } else {
            stats.customersSkipped++;
          }
          continue;
        }

        // Also check without unit_id filter (maybe profile exists in another unit)
        const { data: globalMatch } = await supabase
          .from("profiles")
          .select("id, asaas_customer_id, unit_id")
          .or(`cpf.eq.${cpfRaw},cpf.eq.${cpfFmt}`)
          .limit(1);

        if (globalMatch && globalMatch.length > 0) {
          // Profile exists but in another unit — skip creating a new auth user
          // Just map it for payment linking
          customerToProfile[cust.id] = globalMatch[0].id;
          stats.customersSkipped++;
          continue;
        }

        // Create new auth user
        const email = cust.email || `${cpfRaw}@imported.uplay.app`;

        const { data: newUserData, error: authError } = await supabase.auth.admin.createUser({
          email,
          password: "12345678",
          email_confirm: true,
          user_metadata: { cpf: cpfFmt, full_name: cust.name || "Importado" },
        });

        if (authError) {
          if (authError.message?.includes("already been registered")) {
            // Find existing user by email
            const { data: listData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
            const match = listData?.users?.find((u) => u.email === email);
            if (match) {
              customerToProfile[cust.id] = match.id;
              await supabase
                .from("profiles")
                .update({
                  asaas_customer_id: cust.id,
                  unit_id: unitId,
                  phone,
                  email: cust.email || undefined,
                  address: fullAddress || undefined,
                })
                .eq("id", match.id);
              await supabase
                .from("user_roles")
                .upsert(
                  { user_id: match.id, role: "RESPONSAVEL" },
                  { onConflict: "user_id,role" }
                );
              stats.customersUpdated++;
            } else {
              stats.customersSkipped++;
            }
            continue;
          }
          console.error("[import] Auth error:", cust.name, authError.message);
          stats.errors++;
          continue;
        }

        if (newUserData?.user) {
          const uid = newUserData.user.id;
          customerToProfile[cust.id] = uid;

          await supabase
            .from("profiles")
            .update({
              unit_id: unitId,
              phone,
              asaas_customer_id: cust.id,
              email: cust.email || email,
              address: fullAddress || null,
              full_name: cust.name || "Importado",
              cpf: cpfFmt,
            })
            .eq("id", uid);

          await supabase
            .from("user_roles")
            .upsert({ user_id: uid, role: "RESPONSAVEL" }, { onConflict: "user_id,role" });

          stats.customersImported++;
        }
      } catch (err) {
        console.error("[import] Customer error:", err);
        stats.errors++;
      }
    }

    console.log("[import] Customers done.", JSON.stringify(stats));

    // ═════════════════════════════════════════════
    // PHASE 2 — Import ALL payments from Asaas
    // ═════════════════════════════════════════════

    console.log("[import] Fetching all Asaas payments …");

    interface AsaasPayment {
      id: string;
      customer: string;
      billingType: string;
      value: number;
      netValue?: number;
      dueDate: string;
      status: string;
      description?: string;
      invoiceUrl?: string;
      bankSlipUrl?: string;
      identificationField?: string;
      paymentDate?: string;
      confirmedDate?: string;
      clientPaymentDate?: string;
      installmentNumber?: number;
      externalReference?: string;
    }

    const asaasPayments = await fetchAllPages<AsaasPayment>(baseUrl, "/payments", apiKey);
    console.log(`[import] ${asaasPayments.length} payments found in Asaas`);

    // Group payments by customer to create students
    const paymentsByCustomer: Record<string, AsaasPayment[]> = {};
    for (const ap of asaasPayments) {
      if (!paymentsByCustomer[ap.customer]) paymentsByCustomer[ap.customer] = [];
      paymentsByCustomer[ap.customer].push(ap);
    }

    // For each customer that has payments, ensure a student exists
    const customerToStudent: Record<string, string> = {};

    for (const [asaasCustomerId, _payments] of Object.entries(paymentsByCustomer)) {
      const profileId = customerToProfile[asaasCustomerId];
      if (!profileId) continue;

      // Check if student already exists for this responsible in this unit
      const { data: existingStudents } = await supabase
        .from("students")
        .select("id")
        .eq("responsible_id", profileId)
        .eq("unit_id", unitId!)
        .limit(1);

      if (existingStudents && existingStudents.length > 0) {
        customerToStudent[asaasCustomerId] = existingStudents[0].id;
      } else {
        // Get the customer name to use as student name
        const asaasCust = asaasCustomers.find((c) => c.id === asaasCustomerId);
        const studentName = asaasCust?.name || "Aluno Importado";

        const { data: newStudent, error: studentErr } = await supabase
          .from("students")
          .insert({
            full_name: studentName,
            responsible_id: profileId,
            unit_id: unitId!,
            active: true,
          })
          .select("id")
          .single();

        if (studentErr) {
          console.error("[import] Student creation error:", studentErr.message);
          stats.errors++;
        } else if (newStudent) {
          customerToStudent[asaasCustomerId] = newStudent.id;
          stats.studentsCreated++;
        }
      }
    }

    console.log("[import] Students done. Created:", stats.studentsCreated);

    // Now import each payment
    for (const ap of asaasPayments) {
      try {
        // Check if already imported
        const { data: existing } = await supabase
          .from("payments")
          .select("id")
          .eq("asaas_payment_id", ap.id)
          .maybeSingle();

        if (existing) {
          stats.paymentsSkipped++;
          continue;
        }

        const profileId = customerToProfile[ap.customer];
        if (!profileId) {
          stats.paymentsSkipped++;
          continue;
        }

        const studentId = customerToStudent[ap.customer] || null;
        const localStatus = STATUS_MAP[ap.status] || "PENDING";
        const paymentMethod = METHOD_MAP[ap.billingType] || "BOLETO";
        const paymentType = guessPaymentType(ap.description || "");

        let paidAt: string | null = null;
        if (localStatus === "PAID") {
          paidAt = ap.paymentDate || ap.confirmedDate || ap.clientPaymentDate || null;
        }

        const paymentData = {
          asaas_payment_id: ap.id,
          responsible_id: profileId,
          student_id: studentId,
          unit_id: unitId!,
          value: ap.value || 0,
          final_value: ap.value || 0,
          due_date: ap.dueDate,
          status: localStatus,
          payment_method: paymentMethod,
          description: ap.description || "Importado do Asaas",
          payment_type: paymentType,
          installment_number: ap.installmentNumber || 1,
          invoice_url: ap.invoiceUrl || null,
          boleto_url: ap.bankSlipUrl || null,
          boleto_barcode: ap.identificationField || null,
          raw_response: ap,
          paid_at: paidAt,
        };

        const { error: insertErr } = await supabase.from("payments").insert(paymentData);

        if (insertErr) {
          console.error("[import] Payment insert error:", ap.id, insertErr.message);
          stats.errors++;
          continue;
        }

        // Fetch PIX data for active PIX payments
        if (
          ap.billingType === "PIX" &&
          localStatus !== "PAID" &&
          localStatus !== "CANCELLED"
        ) {
          try {
            const pixRes = await fetch(`${baseUrl}/payments/${ap.id}/pixQrCode`, {
              headers: { access_token: apiKey },
            });
            if (pixRes.ok) {
              const pixData = await pixRes.json();
              if (pixData.payload || pixData.encodedImage) {
                const { data: inserted } = await supabase
                  .from("payments")
                  .select("id")
                  .eq("asaas_payment_id", ap.id)
                  .maybeSingle();

                if (inserted) {
                  await supabase
                    .from("payments")
                    .update({
                      pix_copy_paste: pixData.payload || null,
                      pix_qr_code: pixData.encodedImage || null,
                    })
                    .eq("id", inserted.id);
                }
              }
            }
          } catch {
            // Non-critical
          }
        }

        stats.paymentsImported++;
      } catch (err) {
        console.error("[import] Payment error:", err);
        stats.errors++;
      }
    }

    console.log("[import] All done.", JSON.stringify(stats));

    // ── Build summary message ──
    const parts = [
      stats.customersImported > 0 ? `${stats.customersImported} responsável(is) importado(s)` : null,
      stats.customersUpdated > 0 ? `${stats.customersUpdated} responsável(is) atualizado(s)` : null,
      stats.customersSkipped > 0 ? `${stats.customersSkipped} responsável(is) já existente(s)` : null,
      stats.studentsCreated > 0 ? `${stats.studentsCreated} aluno(s) criado(s)` : null,
      stats.paymentsImported > 0 ? `${stats.paymentsImported} cobrança(s) importada(s)` : null,
      stats.paymentsSkipped > 0 ? `${stats.paymentsSkipped} cobrança(s) já existente(s)` : null,
      stats.errors > 0 ? `${stats.errors} erro(s)` : null,
    ];

    const nonEmpty = parts.filter(Boolean);
    const message =
      nonEmpty.length > 0
        ? nonEmpty.join(", ")
        : "Nenhum dado novo encontrado para importar";

    return new Response(
      JSON.stringify({ success: true, ...stats, message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("import-asaas-data error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
