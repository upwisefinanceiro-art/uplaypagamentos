import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface AsaasCustomer {
  id?: string;
  name?: string;
  email?: string;
  cpfCnpj?: string;
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

interface ProfileRow {
  id: string;
  full_name: string;
  cpf: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  unit_id: string | null;
  asaas_customer_id: string | null;
}

const FAKE_EMAIL_DOMAINS = ["imported.uplay.app", "uplay.app"];

function isFakeEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  const lower = email.toLowerCase();
  return FAKE_EMAIL_DOMAINS.some((d) => lower.endsWith(`@${d}`));
}

function isBetterEmail(asaas: string | undefined, current: string | null): boolean {
  if (!asaas) return false;
  const a = asaas.trim().toLowerCase();
  if (!a || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) return false;
  if (FAKE_EMAIL_DOMAINS.some((d) => a.endsWith(`@${d}`))) return false;
  if (!current) return true;
  return current.toLowerCase() !== a;
}

// Remove leading numeric prefixes like "13.435.878 SERGIO DIAS" or "12345 NOME"
function cleanName(name: string | undefined): string | null {
  if (!name) return null;
  let cleaned = name.trim();
  // Remove leading sequences like "13.435.878 ", "12345-67 ", "123456789 "
  cleaned = cleaned.replace(/^[\d.\-/]+\s+/u, "").trim();
  return cleaned || null;
}

function pickPhone(asaas: AsaasCustomer): string | null {
  const mobile = (asaas.mobilePhone || "").replace(/\D/g, "");
  if (mobile.length >= 10) return mobile;
  const phone = (asaas.phone || "").replace(/\D/g, "");
  if (phone.length >= 10) return phone;
  return null;
}

function buildAddress(c: AsaasCustomer): string | null {
  const parts: string[] = [];
  const street = (c.address || "").trim();
  const number = (c.addressNumber || "").trim();
  if (street) parts.push(number ? `${street}, ${number}` : street);
  const complement = (c.complement || "").trim();
  if (complement) parts.push(complement);
  const province = (c.province || "").trim();
  if (province) parts.push(province);
  const city = (c.city || "").trim();
  const state = (c.state || "").trim();
  if (city && state) parts.push(`${city}/${state}`);
  else if (city) parts.push(city);
  else if (state) parts.push(state);
  const cep = (c.postalCode || "").replace(/\D/g, "");
  if (cep.length === 8) parts.push(`CEP ${cep.slice(0, 5)}-${cep.slice(5)}`);
  return parts.length ? parts.join(" - ") : null;
}

async function fetchAsaasCustomer(
  baseUrl: string,
  apiKey: string,
  customerId: string | null,
  cpfCnpj: string,
): Promise<AsaasCustomer | null> {
  // Try by id first
  if (customerId) {
    try {
      const r = await fetch(`${baseUrl}/customers/${customerId}`, {
        headers: { access_token: apiKey },
      });
      if (r.ok) return await r.json();
    } catch { /* ignore */ }
  }
  // Fallback by CPF/CNPJ
  const clean = cpfCnpj.replace(/\D/g, "");
  if (!clean) return null;
  try {
    const r = await fetch(`${baseUrl}/customers?cpfCnpj=${clean}&limit=1`, {
      headers: { access_token: apiKey },
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (data?.data?.length) return data.data[0];
  } catch { /* ignore */ }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "Não autorizado" }, 401);

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
    const isAdmin = roles?.some((r: { role: string }) =>
      r.role === "ADMIN_MASTER" || r.role === "ADMIN_UNIDADE" || r.role === "SUPER_ADMIN"
    );
    if (!isAdmin) return json({ error: "Sem permissão" }, 403);

    let body: { unit_id?: string; profile_id?: string } = {};
    try { body = await req.json(); } catch { /* no body */ }

    // Build profile query
    let query = admin
      .from("profiles")
      .select("id, full_name, cpf, email, phone, address, unit_id, asaas_customer_id");

    if (body.profile_id) {
      query = query.eq("id", body.profile_id);
    } else if (body.unit_id) {
      query = query.eq("unit_id", body.unit_id);
    } else {
      return json({ error: "Informe profile_id ou unit_id" }, 400);
    }

    // Only RESPONSAVEL clients
    const { data: profilesRaw, error: profErr } = await query;
    if (profErr) return json({ error: profErr.message }, 500);
    if (!profilesRaw?.length) return json({ success: true, processed: 0, updated: 0, errors: 0, message: "Nenhum cliente encontrado" });

    // Filter to only RESPONSAVEL role profiles
    const profileIds = profilesRaw.map((p) => p.id);
    const { data: respRoles } = await admin
      .from("user_roles")
      .select("user_id")
      .in("user_id", profileIds)
      .eq("role", "RESPONSAVEL");
    const respIds = new Set((respRoles || []).map((r: { user_id: string }) => r.user_id));
    const profiles = (profilesRaw as ProfileRow[]).filter((p) => respIds.has(p.id));

    // Group by unit to reuse credentials
    const unitIds = Array.from(new Set(profiles.map((p) => p.unit_id).filter(Boolean) as string[]));
    const unitCache: Record<string, { apiKey: string; baseUrl: string }> = {};
    for (const uid of unitIds) {
      const { data: u } = await admin
        .from("units")
        .select("asaas_api_key, asaas_base_url")
        .eq("id", uid)
        .maybeSingle();
      if (u?.asaas_api_key) {
        unitCache[uid] = {
          apiKey: u.asaas_api_key,
          baseUrl: u.asaas_base_url || "https://api.asaas.com/v3",
        };
      }
    }

    let processed = 0;
    let updated = 0;
    let errors = 0;
    const skipped: string[] = [];
    const updatedDetails: Array<{ id: string; name: string; fields: string[] }> = [];

    for (const p of profiles) {
      processed++;
      if (!p.unit_id || !unitCache[p.unit_id]) {
        skipped.push(p.id);
        continue;
      }
      const cfg = unitCache[p.unit_id];

      const customer = await fetchAsaasCustomer(cfg.baseUrl, cfg.apiKey, p.asaas_customer_id, p.cpf);
      if (!customer) {
        errors++;
        continue;
      }

      const updates: Record<string, unknown> = {};
      const changedFields: string[] = [];

      // Name: only fix if currently has numeric prefix
      const cleanedCurrent = cleanName(p.full_name);
      if (cleanedCurrent && cleanedCurrent !== p.full_name) {
        updates.full_name = cleanedCurrent;
        changedFields.push("full_name");
      } else if (!p.full_name?.trim() && customer.name) {
        const cn = cleanName(customer.name);
        if (cn) {
          updates.full_name = cn;
          changedFields.push("full_name");
        }
      }

      // Email: replace fake with real
      if (isFakeEmail(p.email) && isBetterEmail(customer.email, p.email)) {
        updates.email = customer.email!.trim().toLowerCase();
        changedFields.push("email");
      }

      // Phone: fill if empty
      if (!p.phone || !p.phone.replace(/\D/g, "")) {
        const newPhone = pickPhone(customer);
        if (newPhone) {
          updates.phone = newPhone;
          changedFields.push("phone");
        }
      }

      // Address: fill if empty
      if (!p.address || !p.address.trim()) {
        const newAddr = buildAddress(customer);
        if (newAddr) {
          updates.address = newAddr;
          changedFields.push("address");
        }
      }

      // CPF: only fix if currently empty
      if ((!p.cpf || !p.cpf.replace(/\D/g, "")) && customer.cpfCnpj) {
        const cleanCpf = customer.cpfCnpj.replace(/\D/g, "");
        if (cleanCpf.length === 11 || cleanCpf.length === 14) {
          updates.cpf = cleanCpf;
          changedFields.push("cpf");
        }
      }

      // Asaas customer id: backfill
      if (!p.asaas_customer_id && customer.id) {
        updates.asaas_customer_id = customer.id;
        changedFields.push("asaas_customer_id");
      }

      if (Object.keys(updates).length === 0) continue;

      const { error: upErr } = await admin.from("profiles").update(updates).eq("id", p.id);
      if (upErr) {
        errors++;
        continue;
      }

      updated++;
      updatedDetails.push({ id: p.id, name: (updates.full_name as string) || p.full_name, fields: changedFields });

      // Audit log
      await admin.from("audit_logs").insert({
        action: "SYNC_ASAAS",
        target_table: "profiles",
        target_id: p.id,
        performed_by: caller.id,
        details: { fields: changedFields, source: "sync-clients-asaas" },
      });
    }

    return json({
      success: true,
      processed,
      updated,
      errors,
      skipped: skipped.length,
      details: updatedDetails.slice(0, 50),
      message: `${updated} cliente(s) atualizado(s) de ${processed} processado(s)${errors ? ` — ${errors} erro(s)` : ""}`,
    });
  } catch (err) {
    console.error("sync-clients-asaas error:", err);
    return json({ error: err instanceof Error ? err.message : "Erro interno" }, 500);
  }
});
