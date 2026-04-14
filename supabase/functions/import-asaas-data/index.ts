import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const { data: { user: caller } } = await supabaseUser.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check admin role
    const { data: callerRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const isAdmin = callerRoles?.some((r: { role: string }) =>
      r.role === "ADMIN_MASTER" || r.role === "ADMIN_UNIDADE"
    );
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let unitId: string | null = null;
    try {
      const body = await req.json();
      unitId = body.unit_id || null;
    } catch { /* no body */ }

    if (!unitId) {
      // Get caller's unit
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

    // Get unit's Asaas config
    const { data: unit } = await supabase
      .from("units")
      .select("id, asaas_api_key, asaas_base_url")
      .eq("id", unitId)
      .single();

    if (!unit?.asaas_api_key) {
      return new Response(JSON.stringify({ error: "Unidade sem API Key do Asaas configurada" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = unit.asaas_base_url || "https://api.asaas.com/v3";
    const apiKey = unit.asaas_api_key;

    let customersImported = 0;
    let customersSkipped = 0;
    let paymentsImported = 0;
    let paymentsSkipped = 0;
    let errors = 0;

    // ── PHASE 1: Import customers ──
    let customerOffset = 0;
    const customerLimit = 100;
    let hasMoreCustomers = true;

    while (hasMoreCustomers) {
      const custRes = await fetch(
        `${baseUrl}/customers?offset=${customerOffset}&limit=${customerLimit}`,
        { headers: { access_token: apiKey } }
      );

      if (!custRes.ok) {
        console.error("[import] Erro ao buscar customers:", custRes.status);
        break;
      }

      const custData = await custRes.json();
      const customers = custData.data || [];

      if (customers.length === 0) {
        hasMoreCustomers = false;
        break;
      }

      for (const cust of customers) {
        try {
          const cpf = cust.cpfCnpj?.replace(/\D/g, "") || "";
          if (!cpf) {
            customersSkipped++;
            continue;
          }

          // Check if profile with this CPF already exists in this unit
          const { data: existing } = await supabase
            .from("profiles")
            .select("id, asaas_customer_id")
            .eq("cpf", cpf)
            .eq("unit_id", unitId);

          if (existing && existing.length > 0) {
            // Update asaas_customer_id if missing
            if (!existing[0].asaas_customer_id) {
              await supabase
                .from("profiles")
                .update({ asaas_customer_id: cust.id })
                .eq("id", existing[0].id);
            }
            customersSkipped++;
            continue;
          }

          // Also check formatted CPF
          const cpfFormatted = cpf.length === 11
            ? `${cpf.slice(0,3)}.${cpf.slice(3,6)}.${cpf.slice(6,9)}-${cpf.slice(9)}`
            : cpf;

          const { data: existingFmt } = await supabase
            .from("profiles")
            .select("id, asaas_customer_id")
            .eq("cpf", cpfFormatted)
            .eq("unit_id", unitId);

          if (existingFmt && existingFmt.length > 0) {
            if (!existingFmt[0].asaas_customer_id) {
              await supabase
                .from("profiles")
                .update({ asaas_customer_id: cust.id })
                .eq("id", existingFmt[0].id);
            }
            customersSkipped++;
            continue;
          }

          // Create auth user + profile via create-user function pattern
          // For imported customers, create profile directly with service role
          const userId = crypto.randomUUID();
          const email = cust.email || `${cpf}@imported.uplay.app`;
          const phone = cust.mobilePhone || cust.phone || null;

          // Create auth user
          const { error: authError } = await supabase.auth.admin.createUser({
            email,
            password: "12345678",
            email_confirm: true,
            user_metadata: { cpf: cpfFormatted, full_name: cust.name || "Importado" },
          });

          if (authError) {
            // If email already exists, try to find and link
            if (authError.message?.includes("already been registered")) {
              const { data: authUsers } = await supabase.auth.admin.listUsers();
              const existingUser = authUsers?.users?.find(u => u.email === email);
              if (existingUser) {
                await supabase
                  .from("profiles")
                  .update({
                    asaas_customer_id: cust.id,
                    unit_id: unitId,
                    phone: phone,
                  })
                  .eq("id", existingUser.id);

                // Add RESPONSAVEL role if not exists
                await supabase
                  .from("user_roles")
                  .upsert({ user_id: existingUser.id, role: "RESPONSAVEL" }, { onConflict: "user_id,role" });
              }
              customersSkipped++;
              continue;
            }
            console.error("[import] Auth error for", cust.name, authError.message);
            errors++;
            continue;
          }

          // Get the created user
          const { data: authUsers } = await supabase.auth.admin.listUsers();
          const newUser = authUsers?.users?.find(u => u.email === email);

          if (newUser) {
            await supabase
              .from("profiles")
              .update({
                unit_id: unitId,
                phone: phone,
                asaas_customer_id: cust.id,
                email: email,
                address: cust.address ? `${cust.address}, ${cust.addressNumber || ""}` : null,
              })
              .eq("id", newUser.id);

            // Add RESPONSAVEL role
            await supabase
              .from("user_roles")
              .upsert({ user_id: newUser.id, role: "RESPONSAVEL" }, { onConflict: "user_id,role" });

            customersImported++;
          }
        } catch (err) {
          console.error("[import] Customer error:", err);
          errors++;
        }
      }

      customerOffset += customerLimit;
      hasMoreCustomers = custData.hasMore === true;
    }

    // ── PHASE 2: Import payments ──
    const statusMap: Record<string, string> = {
      PENDING: "PENDING",
      RECEIVED: "PAID",
      CONFIRMED: "PAID",
      OVERDUE: "OVERDUE",
      REFUNDED: "CANCELLED",
      DELETED: "CANCELLED",
      RECEIVED_IN_CASH: "PAID",
    };

    let paymentOffset = 0;
    const paymentLimit = 100;
    let hasMorePayments = true;

    while (hasMorePayments) {
      const payRes = await fetch(
        `${baseUrl}/payments?offset=${paymentOffset}&limit=${paymentLimit}`,
        { headers: { access_token: apiKey } }
      );

      if (!payRes.ok) {
        console.error("[import] Erro ao buscar payments:", payRes.status);
        break;
      }

      const payData = await payRes.json();
      const asaasPayments = payData.data || [];

      if (asaasPayments.length === 0) {
        hasMorePayments = false;
        break;
      }

      for (const ap of asaasPayments) {
        try {
          // Check if already imported
          const { data: existing } = await supabase
            .from("payments")
            .select("id")
            .eq("asaas_payment_id", ap.id)
            .maybeSingle();

          if (existing) {
            paymentsSkipped++;
            continue;
          }

          // Find responsible by asaas_customer_id
          const { data: responsible } = await supabase
            .from("profiles")
            .select("id")
            .eq("asaas_customer_id", ap.customer)
            .eq("unit_id", unitId)
            .maybeSingle();

          if (!responsible) {
            // Try to find by fetching customer data from Asaas
            paymentsSkipped++;
            continue;
          }

          // Map billing type
          const methodMap: Record<string, string> = {
            PIX: "PIX",
            BOLETO: "BOLETO",
            CREDIT_CARD: "CARD",
            UNDEFINED: "BOLETO",
          };

          const localStatus = statusMap[ap.status] || "PENDING";

          const paymentData = {
            asaas_payment_id: ap.id,
            responsible_id: responsible.id,
            unit_id: unitId,
            value: ap.value || 0,
            final_value: ap.value || 0,
            due_date: ap.dueDate,
            status: localStatus,
            payment_method: methodMap[ap.billingType] || "BOLETO",
            description: ap.description || "Importado do Asaas",
            payment_type: "AVULSA" as const,
            installment_number: ap.installmentNumber || 1,
            invoice_url: ap.invoiceUrl || null,
            boleto_url: ap.bankSlipUrl || null,
            boleto_barcode: ap.identificationField || null,
            raw_response: ap,
            paid_at: localStatus === "PAID" ? (ap.paymentDate || ap.confirmedDate || null) : null,
          };

          const { error: insertErr } = await supabase
            .from("payments")
            .insert(paymentData);

          if (insertErr) {
            console.error("[import] Payment insert error:", insertErr.message);
            errors++;
            continue;
          }

          // Fetch PIX data if applicable
          if (ap.billingType === "PIX" && localStatus !== "PAID" && localStatus !== "CANCELLED") {
            try {
              const pixRes = await fetch(`${baseUrl}/payments/${ap.id}/pixQrCode`, {
                headers: { access_token: apiKey },
              });
              if (pixRes.ok) {
                const pixData = await pixRes.json();
                if (pixData.payload || pixData.encodedImage) {
                  // Find the inserted payment
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
              // PIX data fetch is non-critical
            }
          }

          paymentsImported++;
        } catch (err) {
          console.error("[import] Payment error:", err);
          errors++;
        }
      }

      paymentOffset += paymentLimit;
      hasMorePayments = payData.hasMore === true;
    }

    const message = [
      customersImported > 0 ? `${customersImported} cliente(s) importado(s)` : null,
      customersSkipped > 0 ? `${customersSkipped} cliente(s) já existente(s)` : null,
      paymentsImported > 0 ? `${paymentsImported} cobrança(s) importada(s)` : null,
      paymentsSkipped > 0 ? `${paymentsSkipped} cobrança(s) já existente(s)` : null,
      errors > 0 ? `${errors} erro(s)` : null,
      customersImported === 0 && paymentsImported === 0 && errors === 0
        ? "Nenhum dado novo encontrado para importar"
        : null,
    ].filter(Boolean).join(", ");

    return new Response(JSON.stringify({
      success: true,
      customersImported,
      customersSkipped,
      paymentsImported,
      paymentsSkipped,
      errors,
      message,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("import-asaas-data error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
