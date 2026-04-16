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

STATUS_MAP.DUNNING_REQUESTED = "PENDING";

interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  complement?: string | null;
  province?: string | null;
  postalCode?: string | null;
  city?: string | null;
  state?: string | null;
}

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

interface ProfileRow {
  id: string;
  cpf: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  unit_id: string | null;
  asaas_customer_id: string | null;
}

interface StudentRow {
  id: string;
  full_name: string;
  responsible_id: string;
}

interface PaymentRow {
  id: string;
  asaas_payment_id: string | null;
  responsible_id: string;
  student_id: string | null;
}

interface UnitConfig {
  id: string;
  asaas_api_key: string | null;
  asaas_base_url: string | null;
}

interface MergedCustomer {
  primary: AsaasCustomer;
  aliases: AsaasCustomer[];
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizeCpf(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

function normalizeEmail(value?: string | null) {
  const normalized = value?.trim().toLowerCase() || "";
  return normalized || null;
}

function isImportedPlaceholderEmail(value?: string | null) {
  return /@imported\.uplay\.app$/i.test(value || "");
}

function pickBestNonEmptyValue(values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

function pickBestEmail(values: Array<string | null | undefined>) {
  const normalized = values.map((value) => normalizeEmail(value)).filter(Boolean) as string[];
  const realEmail = normalized.find((value) => !isImportedPlaceholderEmail(value));
  return realEmail || normalized[0] || null;
}

function buildImportedLoginEmail(cpf: string, unitId: string, customerId: string) {
  const safeUnit = unitId.replace(/\W/g, "").slice(0, 8).toLowerCase();
  const safeCustomer = customerId.replace(/\W/g, "").slice(-8).toLowerCase();
  return `${cpf}.${safeUnit}.${safeCustomer}@imported.uplay.app`;
}

function buildCustomerUnitKey(customerId: string, unitId: string | null | undefined) {
  return `${customerId}::${unitId || "no-unit"}`;
}

function buildAddress(customer: AsaasCustomer) {
  const addressParts = [customer.address, customer.addressNumber, customer.complement]
    .filter(Boolean)
    .join(", ");

  return [addressParts, customer.province, customer.city, customer.state, customer.postalCode]
    .filter(Boolean)
    .join(" - ") || null;
}

function guessPaymentType(description: string) {
  const normalized = description.toLowerCase();
  if (normalized.includes("apostila")) return "APOSTILA";
  if (normalized.includes("matrícula") || normalized.includes("matricula")) return "MATRICULA";
  if (normalized.includes("mensalidade") || normalized.includes("parcela")) return "MENSALIDADE";
  return "AVULSA";
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchAllPages<T>(baseUrl: string, path: string, apiKey: string): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = `${baseUrl}${path}${path.includes("?") ? "&" : "?"}offset=${offset}&limit=${limit}`;
    const response = await fetch(url, { headers: { access_token: apiKey } });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Erro ao consultar Asaas em ${path}: ${response.status} ${body}`);
    }

    const json = await response.json();
    const data = (json.data || []) as T[];
    all.push(...data);

    if (!json.hasMore) break;
    offset += limit;
  }

  return all;
}

async function fetchAllSupabaseRows<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message?: string } | null }>,
  pageSize = 1000,
) {
  const allRows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) {
      throw new Error(error.message || "Erro ao buscar dados paginados no banco");
    }

    const page = data || [];
    allRows.push(...page);

    if (page.length < pageSize) break;
  }

  return allRows;
}

async function fetchAsaasCustomerById(baseUrl: string, customerId: string, apiKey: string): Promise<AsaasCustomer | null> {
  const response = await fetch(`${baseUrl}/customers/${customerId}`, {
    headers: { access_token: apiKey },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as AsaasCustomer;
}

async function fetchAllAuthUsers(supabaseAdmin: any) {
  const users: Array<{ id: string; email?: string | null }> = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const current = data?.users ?? [];
    users.push(...current.map((user: { id: string; email?: string | null }) => ({ id: user.id, email: user.email })));

    if (current.length < perPage) break;
    page += 1;
  }

  return users;
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      await worker(current);
    }
  });

  await Promise.all(runners);
}

function buildSummary(stats: Record<string, number>) {
  const parts = [
    stats.customersImported ? `${stats.customersImported} responsável(is) importado(s)` : null,
    stats.customersUpdated ? `${stats.customersUpdated} responsável(is) atualizado(s)` : null,
    stats.customersSkipped ? `${stats.customersSkipped} responsável(is) já existente(s)` : null,
    stats.studentsCreated ? `${stats.studentsCreated} aluno(s) criado(s)` : null,
    stats.paymentsImported ? `${stats.paymentsImported} cobrança(s) importada(s)` : null,
    stats.paymentsUpdated ? `${stats.paymentsUpdated} cobrança(s) corrigida(s)` : null,
    stats.paymentsSkipped ? `${stats.paymentsSkipped} cobrança(s) já existente(s)` : null,
    stats.errors ? `${stats.errors} erro(s)` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "Nenhum dado novo encontrado para importar";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ success: false, error: "Não autorizado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ success: false, error: "Configuração do backend incompleta" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub;

    if (claimsError || !callerId) {
      return jsonResponse({ success: false, error: "Não autorizado" }, 401);
    }

    const [{ data: callerRoles }, { data: callerProfile }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", callerId),
      supabaseAdmin.from("profiles").select("unit_id").eq("id", callerId).maybeSingle(),
    ]);

    const roles = (callerRoles || []).map((entry: { role: string }) => entry.role);
    const isSuperAdmin = roles.includes("SUPER_ADMIN");
    const isAdminMaster = roles.includes("ADMIN_MASTER");
    const isAdminUnidade = roles.includes("ADMIN_UNIDADE");

    if (!isSuperAdmin && !isAdminMaster && !isAdminUnidade) {
      return jsonResponse({ success: false, error: "Sem permissão" }, 403);
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const requestedUnitId = typeof body.unit_id === "string" && body.unit_id.trim() ? body.unit_id : null;
    const unitId = requestedUnitId || callerProfile?.unit_id || null;

    if (!unitId) {
      return jsonResponse({ success: false, error: "Unidade não encontrada" }, 400);
    }

    if (isAdminUnidade && callerProfile?.unit_id && callerProfile.unit_id !== unitId) {
      return jsonResponse({ success: false, error: "Você só pode importar a própria unidade" }, 403);
    }

    const { data: unit, error: unitError } = await supabaseAdmin
      .from("units")
      .select("id, asaas_api_key, asaas_base_url")
      .eq("id", unitId)
      .maybeSingle<UnitConfig>();

    if (unitError || !unit) {
      return jsonResponse({ success: false, error: "Unidade não encontrada" }, 404);
    }

    if (!unit.asaas_api_key) {
      return jsonResponse({ success: false, error: "Unidade sem API Key do Asaas configurada" }, 400);
    }

    const baseUrl = unit.asaas_base_url || "https://api.asaas.com/v3";
    const apiKey = unit.asaas_api_key;

    console.log(`[import] Starting import for unit ${unitId}`);

    const [asaasCustomers, asaasPayments, allProfiles, localStudents, existingPayments, authUsers, responsibleRolesRes] = await Promise.all([
      fetchAllPages<AsaasCustomer>(baseUrl, "/customers", apiKey),
      fetchAllPages<AsaasPayment>(baseUrl, "/payments", apiKey),
      fetchAllSupabaseRows<ProfileRow>((from, to) =>
        supabaseAdmin
          .from("profiles")
          .select("id, cpf, full_name, phone, email, address, unit_id, asaas_customer_id")
          .order("created_at", { ascending: true })
          .range(from, to),
      ),
      fetchAllSupabaseRows<StudentRow>((from, to) =>
        supabaseAdmin
          .from("students")
          .select("id, full_name, responsible_id")
          .eq("unit_id", unitId)
          .order("created_at", { ascending: true })
          .range(from, to),
      ),
      fetchAllSupabaseRows<PaymentRow>((from, to) =>
        supabaseAdmin
          .from("payments")
          .select("id, asaas_payment_id, responsible_id, student_id")
          .eq("unit_id", unitId)
          .order("created_at", { ascending: true })
          .range(from, to),
      ),
      fetchAllAuthUsers(supabaseAdmin),
      supabaseAdmin.from("user_roles").select("user_id").eq("role", "RESPONSAVEL"),
    ]);

    const existingResponsibleRoleIds = new Set(
      ((responsibleRolesRes.data || []) as Array<{ user_id: string }>).map((entry) => entry.user_id),
    );

    console.log(`[import] Found ${asaasCustomers.length} customers and ${asaasPayments.length} payments in Asaas`);

    const stats = {
      customersImported: 0,
      customersUpdated: 0,
      customersSkipped: 0,
      studentsCreated: 0,
      paymentsImported: 0,
      paymentsUpdated: 0,
      paymentsSkipped: 0,
      errors: 0,
    };

    const diagnostics: string[] = [];

    const authUserByEmail = new Map<string, { id: string; email?: string | null }>();
    for (const user of authUsers) {
      if (user.email) authUserByEmail.set(user.email.toLowerCase(), user);
    }

    const profilesById = new Map<string, ProfileRow>();
    const profilesByAsaasCustomerId = new Map<string, ProfileRow>();
    const profilesByCpf = new Map<string, ProfileRow[]>();

    for (const profile of allProfiles) {
      profilesById.set(profile.id, profile);
      if (profile.asaas_customer_id) {
        profilesByAsaasCustomerId.set(buildCustomerUnitKey(profile.asaas_customer_id, profile.unit_id), profile);
      }
      if (profile.unit_id !== unitId) continue;

      const cpf = normalizeCpf(profile.cpf);
      if (!cpf) continue;
      const list = profilesByCpf.get(cpf) || [];
      list.push(profile);
      profilesByCpf.set(cpf, list);
    }

    const existingPaymentIds = new Set(
      existingPayments
        .map((payment) => payment.asaas_payment_id)
        .filter((value): value is string => Boolean(value)),
    );
    const existingPaymentsByAsaasId = new Map(
      existingPayments
        .filter((payment): payment is PaymentRow & { asaas_payment_id: string } => Boolean(payment.asaas_payment_id))
        .map((payment) => [payment.asaas_payment_id, payment]),
    );

    const paymentsByCustomerId = new Map<string, AsaasPayment[]>();
    for (const payment of asaasPayments) {
      const list = paymentsByCustomerId.get(payment.customer) || [];
      list.push(payment);
      paymentsByCustomerId.set(payment.customer, list);
    }

    const studentByResponsibleId = new Map<string, StudentRow>();
    for (const student of localStudents) {
      if (!studentByResponsibleId.has(student.responsible_id)) {
        studentByResponsibleId.set(student.responsible_id, student);
      }
    }

    const customerToProfile = new Map<string, string>();
    const customerInfoById = new Map(asaasCustomers.map((customer) => [customer.id, customer]));

    const customersByCpf = new Map<string, AsaasCustomer[]>();
    const customersWithoutCpf: AsaasCustomer[] = [];

    for (const customer of asaasCustomers) {
      const cpf = normalizeCpf(customer.cpfCnpj);
      if (!cpf) {
        customersWithoutCpf.push(customer);
        continue;
      }

      const list = customersByCpf.get(cpf) || [];
      list.push(customer);
      customersByCpf.set(cpf, list);
    }

    const mergedCustomers: MergedCustomer[] = Array.from(customersByCpf.entries()).map(([, group]) => {
      const sorted = [...group].sort((left, right) => {
        const paymentDelta = (paymentsByCustomerId.get(right.id)?.length || 0) - (paymentsByCustomerId.get(left.id)?.length || 0);
        if (paymentDelta !== 0) return paymentDelta;

        const emailDelta = Number(Boolean(pickBestEmail([right.email]))) - Number(Boolean(pickBestEmail([left.email])));
        if (emailDelta !== 0) return emailDelta;

        return left.id.localeCompare(right.id);
      });

      const primary = sorted[0];
      const aliases = sorted;

      return {
        primary: {
          ...primary,
          email: pickBestEmail(aliases.map((customer) => customer.email)),
          phone: pickBestNonEmptyValue(aliases.map((customer) => customer.phone)),
          mobilePhone: pickBestNonEmptyValue(aliases.map((customer) => customer.mobilePhone)),
          address: pickBestNonEmptyValue(aliases.map((customer) => customer.address)),
          addressNumber: pickBestNonEmptyValue(aliases.map((customer) => customer.addressNumber)),
          complement: pickBestNonEmptyValue(aliases.map((customer) => customer.complement)),
          province: pickBestNonEmptyValue(aliases.map((customer) => customer.province)),
          postalCode: pickBestNonEmptyValue(aliases.map((customer) => customer.postalCode)),
          city: pickBestNonEmptyValue(aliases.map((customer) => customer.city)),
          state: pickBestNonEmptyValue(aliases.map((customer) => customer.state)),
        },
        aliases,
      };
    });

    const upsertResponsibleRole = async (userId: string) => {
      if (existingResponsibleRoleIds.has(userId)) return;

      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role: "RESPONSAVEL" }, { onConflict: "user_id,role" });

      if (error) throw error;
      existingResponsibleRoleIds.add(userId);
    };

    for (const { primary: customer, aliases } of mergedCustomers) {
      try {
        const cpf = normalizeCpf(customer.cpfCnpj);
        if (!cpf) {
          stats.customersSkipped += 1;
          continue;
        }

        const phone = customer.mobilePhone || customer.phone || null;
        const fullAddress = buildAddress(customer);
        const customerEmail = normalizeEmail(customer.email);

        const matchingProfiles = profilesByCpf.get(cpf) || [];
        const existingProfile =
          profilesByAsaasCustomerId.get(buildCustomerUnitKey(customer.id, unitId)) ||
          matchingProfiles.find((profile) => profile.unit_id === unitId) ||
          null;

        if (existingProfile) {
          const profilePayload: Record<string, unknown> = {
            id: existingProfile.id,
            cpf,
            full_name: customer.name || existingProfile.full_name,
            phone: phone || existingProfile.phone,
            email: customerEmail || existingProfile.email,
            address: fullAddress || existingProfile.address,
            asaas_customer_id: customer.id,
            unit_id: existingProfile.unit_id || unitId,
            active: true,
          };

          const shouldUpdateProfile =
            existingProfile.full_name !== profilePayload.full_name ||
            existingProfile.phone !== profilePayload.phone ||
            existingProfile.email !== profilePayload.email ||
            existingProfile.address !== profilePayload.address ||
            existingProfile.asaas_customer_id !== profilePayload.asaas_customer_id ||
            existingProfile.unit_id !== profilePayload.unit_id;

          if (shouldUpdateProfile) {
            const { error: profileError } = await supabaseAdmin.from("profiles").upsert(profilePayload);
            if (profileError) throw profileError;
          }

          await upsertResponsibleRole(existingProfile.id);

          const mergedProfile = {
            ...existingProfile,
            cpf,
            full_name: String(profilePayload.full_name),
            phone: (profilePayload.phone as string | null) ?? null,
            email: (profilePayload.email as string | null) ?? null,
            address: (profilePayload.address as string | null) ?? null,
            unit_id: String(profilePayload.unit_id),
            asaas_customer_id: customer.id,
          } satisfies ProfileRow;

          profilesById.set(existingProfile.id, mergedProfile);
          profilesByAsaasCustomerId.set(buildCustomerUnitKey(customer.id, mergedProfile.unit_id), mergedProfile);
          profilesByCpf.set(cpf, [
            mergedProfile,
            ...matchingProfiles.filter((profile) => profile.id !== mergedProfile.id),
          ]);

          for (const alias of aliases) {
            customerToProfile.set(alias.id, existingProfile.id);
            profilesByAsaasCustomerId.set(buildCustomerUnitKey(alias.id, mergedProfile.unit_id), mergedProfile);
          }
          stats.customersUpdated += 1;
          continue;
        }

        const profileEmail = customerEmail;
        const generatedLoginEmail = buildImportedLoginEmail(cpf, unitId, customer.id);
        let loginEmail = profileEmail || generatedLoginEmail;
        let authUser = authUserByEmail.get(loginEmail) || null;

        if (authUser) {
          const authUserProfile = profilesById.get(authUser.id) || null;
          const sameCpf = authUserProfile && normalizeCpf(authUserProfile.cpf) === cpf;
          const sameUnit = authUserProfile && authUserProfile.unit_id === unitId;

          if (!sameCpf || (authUserProfile && !sameUnit)) {
            loginEmail = generatedLoginEmail;
            authUser = authUserByEmail.get(loginEmail) || null;
          }
        }

        let userId: string;

        if (authUser) {
          const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
            email: loginEmail,
            password: "12345678",
            email_confirm: true,
            ban_duration: "none",
            user_metadata: { cpf, full_name: customer.name || "Importado" },
          });

          if (updateUserError) throw updateUserError;
          userId = authUser.id;
        } else {
          const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
            email: loginEmail,
            password: "12345678",
            email_confirm: true,
            user_metadata: { cpf, full_name: customer.name || "Importado" },
          });

          if (createUserError || !createdUser?.user) {
            throw createUserError || new Error("Erro ao criar usuário para responsável importado");
          }

          userId = createdUser.user.id;
          authUserByEmail.set(loginEmail, { id: userId, email: loginEmail });
        }

        const newProfile = {
          id: userId,
          cpf,
          full_name: customer.name || "Importado",
          phone,
          email: profileEmail || loginEmail,
          address: fullAddress,
          asaas_customer_id: customer.id,
          unit_id: unitId,
          active: true,
        };

        const { error: newProfileError } = await supabaseAdmin.from("profiles").upsert(newProfile);
        if (newProfileError) throw newProfileError;

        await upsertResponsibleRole(userId);

        const profileRow: ProfileRow = {
          id: userId,
          cpf,
          full_name: newProfile.full_name,
          phone: newProfile.phone,
          email: newProfile.email,
          address: newProfile.address,
          unit_id: newProfile.unit_id,
          asaas_customer_id: newProfile.asaas_customer_id,
        };

        profilesById.set(userId, profileRow);
        for (const alias of aliases) {
          profilesByAsaasCustomerId.set(buildCustomerUnitKey(alias.id, profileRow.unit_id), profileRow);
          customerToProfile.set(alias.id, userId);
        }
        profilesByCpf.set(cpf, [...(profilesByCpf.get(cpf) || []), profileRow]);
        stats.customersImported += 1;
      } catch (error) {
        console.error("[import] customer error", customer.id, error);
        diagnostics.push(`responsável ${customer.name}: ${error instanceof Error ? error.message : "erro inesperado"}`);
        stats.errors += 1;
      }
    }

    for (const customer of customersWithoutCpf) {
      const customerEmail = normalizeEmail(customer.email);
      const matchedProfile = customerEmail
        ? Array.from(profilesById.values()).find((profile) => profile.unit_id === unitId && normalizeEmail(profile.email) === customerEmail)
        : null;

      if (matchedProfile) {
        customerToProfile.set(customer.id, matchedProfile.id);
        profilesByAsaasCustomerId.set(buildCustomerUnitKey(customer.id, matchedProfile.unit_id), matchedProfile);
      }
    }

    const studentsToInsert = Array.from(customerToProfile.entries())
      .filter(([, responsibleId]) => !studentByResponsibleId.has(responsibleId))
      .map(([customerId, responsibleId]) => {
        const customer = customerInfoById.get(customerId);
        return {
          full_name: customer?.name || "Aluno Importado",
          responsible_id: responsibleId,
          unit_id: unitId,
          active: true,
        };
      });

    for (const chunk of chunkArray(studentsToInsert, 200)) {
      if (chunk.length === 0) continue;

      const { data, error } = await supabaseAdmin
        .from("students")
        .insert(chunk)
        .select("id, full_name, responsible_id");

      if (error) {
        console.error("[import] student insert error", error);
        diagnostics.push(`alunos: ${error.message}`);
        stats.errors += chunk.length;
        continue;
      }

      for (const student of (data || []) as StudentRow[]) {
        studentByResponsibleId.set(student.responsible_id, student);
        stats.studentsCreated += 1;
      }
    }

    const paymentRowsByAsaasId = new Map<string, Record<string, unknown>>();
    const paymentUpdates: Array<{ id: string; values: Record<string, unknown> }> = [];

    for (const payment of asaasPayments) {
      let responsibleId = customerToProfile.get(payment.customer) || null;

      if (!responsibleId) {
        let paymentCustomer = customerInfoById.get(payment.customer) || null;

        if (!paymentCustomer) {
          paymentCustomer = await fetchAsaasCustomerById(baseUrl, payment.customer, apiKey);
          if (paymentCustomer) {
            customerInfoById.set(payment.customer, paymentCustomer);
          }
        }

        const customerCpf = normalizeCpf(paymentCustomer?.cpfCnpj);
        if (customerCpf) {
          const matchedProfile = (profilesByCpf.get(customerCpf) || []).find((profile) => profile.unit_id === unitId) || null;
          if (matchedProfile) {
            responsibleId = matchedProfile.id;
            customerToProfile.set(payment.customer, matchedProfile.id);
          }
        }

        if (!responsibleId && paymentCustomer?.email) {
          const matchedProfile = Array.from(profilesById.values()).find(
            (profile) => profile.unit_id === unitId && normalizeEmail(profile.email) === normalizeEmail(paymentCustomer?.email),
          );

          if (matchedProfile) {
            responsibleId = matchedProfile.id;
            customerToProfile.set(payment.customer, matchedProfile.id);
          }
        }
      }

      if (!responsibleId) {
        stats.paymentsSkipped += 1;
        diagnostics.push(`cobrança ${payment.id}: responsável não localizado`);
        continue;
      }

      const studentId = studentByResponsibleId.get(responsibleId)?.id || null;
      const status = STATUS_MAP[payment.status] || "PENDING";
      const paymentMethod = METHOD_MAP[payment.billingType] || "BOLETO";
      const paidAt =
        status === "PAID"
          ? payment.paymentDate || payment.confirmedDate || payment.clientPaymentDate || null
          : null;

      const paymentPayload = {
        responsible_id: responsibleId,
        student_id: studentId,
        unit_id: unitId,
        value: payment.value || 0,
        original_value: payment.value || 0,
        final_value: payment.netValue || payment.value || 0,
        due_date: payment.dueDate,
        status,
        payment_method: paymentMethod,
        description: payment.description || "Importado do Asaas",
        payment_type: guessPaymentType(payment.description || ""),
        installment_number: payment.installmentNumber || 1,
        invoice_url: payment.invoiceUrl || null,
        boleto_url: payment.bankSlipUrl || null,
        boleto_barcode: payment.identificationField || null,
        raw_response: payment,
        paid_at: paidAt,
      };

      const existingPayment = existingPaymentsByAsaasId.get(payment.id) || null;
      if (existingPayment) {
        if (existingPayment.responsible_id !== responsibleId || existingPayment.student_id !== studentId) {
          paymentUpdates.push({ id: existingPayment.id, values: paymentPayload });
        } else {
          stats.paymentsSkipped += 1;
        }
        continue;
      }

      if (paymentRowsByAsaasId.has(payment.id)) {
        stats.paymentsSkipped += 1;
        continue;
      }

      paymentRowsByAsaasId.set(payment.id, {
        asaas_payment_id: payment.id,
        ...paymentPayload,
      });
    }

    const paymentRows = Array.from(paymentRowsByAsaasId.values());

    const insertedPayments: Array<{ id: string; asaas_payment_id: string; payment_method: string | null; status: string }> = [];

    for (const chunk of chunkArray(paymentRows, 200)) {
      if (chunk.length === 0) continue;

      const { data, error } = await supabaseAdmin
        .from("payments")
        .insert(chunk)
        .select("id, asaas_payment_id, payment_method, status");

      if (!error) {
        insertedPayments.push(...((data || []) as Array<{ id: string; asaas_payment_id: string; payment_method: string | null; status: string }>));
        stats.paymentsImported += chunk.length;

        for (const row of chunk) {
          if (typeof row.asaas_payment_id === "string") existingPaymentIds.add(row.asaas_payment_id);
        }
        continue;
      }

      console.error("[import] bulk payment insert error", error);

      for (const row of chunk) {
        const { data: singleData, error: singleError } = await supabaseAdmin
          .from("payments")
          .insert(row)
          .select("id, asaas_payment_id, payment_method, status")
          .maybeSingle();

        if (singleError || !singleData) {
          diagnostics.push(`cobrança ${String(row.asaas_payment_id)}: ${singleError?.message || "falha ao inserir"}`);
          stats.errors += 1;
          continue;
        }

        insertedPayments.push(singleData as { id: string; asaas_payment_id: string; payment_method: string | null; status: string });
        stats.paymentsImported += 1;
        if (typeof row.asaas_payment_id === "string") existingPaymentIds.add(row.asaas_payment_id);
      }
    }

    for (const chunk of chunkArray(paymentUpdates, 100)) {
      for (const item of chunk) {
        const { data, error } = await supabaseAdmin
          .from("payments")
          .update(item.values)
          .eq("id", item.id)
          .select("id, asaas_payment_id, payment_method, status")
          .maybeSingle();

        if (error || !data) {
          diagnostics.push(`cobrança ${item.id}: ${error?.message || "falha ao corrigir vínculo"}`);
          stats.errors += 1;
          continue;
        }

        insertedPayments.push(data as { id: string; asaas_payment_id: string; payment_method: string | null; status: string });
        stats.paymentsUpdated += 1;
      }
    }

    const pixCandidates = insertedPayments.filter(
      (payment) => payment.payment_method === "PIX" && payment.status !== "PAID" && payment.status !== "CANCELLED",
    );

    await runWithConcurrency(pixCandidates, 20, async (payment) => {
      try {
        const response = await fetch(`${baseUrl}/payments/${payment.asaas_payment_id}/pixQrCode`, {
          headers: { access_token: apiKey },
        });

        if (!response.ok) return;

        const pixData = await response.json();
        if (!pixData.payload && !pixData.encodedImage) return;

        await supabaseAdmin
          .from("payments")
          .update({
            pix_copy_paste: pixData.payload || null,
            pix_qr_code: pixData.encodedImage || null,
          })
          .eq("id", payment.id);
      } catch (error) {
        diagnostics.push(`pix ${payment.asaas_payment_id}: ${error instanceof Error ? error.message : "falha ao buscar QR Code"}`);
      }
    });

    const message = buildSummary(stats);
    const elapsedMs = Date.now() - startedAt;
    console.log(`[import] finished in ${elapsedMs}ms`, JSON.stringify(stats));

    return jsonResponse({
      success: true,
      ...stats,
      message,
      diagnostics: diagnostics.slice(0, 20),
      processing_time_ms: elapsedMs,
    });
  } catch (error) {
    console.error("import-asaas-data error:", error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
        processing_time_ms: Date.now() - startedAt,
      },
      500,
    );
  }
});