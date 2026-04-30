// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tipo "Negativação via Serasa" no Asaas
const SERASA_TYPE = "CREDIT_BUREAU";

// Status que representam negativação ATIVA (em andamento) na tela do Asaas
// Excluímos CANCELLED, DENIED e PAID (já encerradas / pagas)
const ACTIVE_DUNNING_STATUSES = new Set([
  "PENDING",
  "AWAITING_APPROVAL",
  "PROCESSED",
  "PARTIALLY_PAID",
  "AWAITING_CANCELLATION",
]);

interface DunningItem {
  id: string;
  status: string;
  type: string;
  payment: string; // asaas payment id
}

async function syncUnit(unitId: string, apiKey: string, baseUrl: string, supabase: any) {
  const url = `${baseUrl.replace(/\/$/, "")}/paymentDunnings`;
  const collected: DunningItem[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    // Filtra direto na API: apenas Serasa (CREDIT_BUREAU)
    const qs = `?limit=${limit}&offset=${offset}&type=${SERASA_TYPE}`;
    const res = await fetch(`${url}${qs}`, {
      headers: { access_token: apiKey, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[unit ${unitId}] dunnings fetch failed ${res.status}: ${text}`);
      break;
    }
    const json = await res.json();
    const data: DunningItem[] = json?.data || [];
    collected.push(...data);
    if (!json?.hasMore || data.length < limit) break;
    offset += limit;
    if (offset > 5000) break; // safety
  }

  console.log(`[unit ${unitId}] fetched ${collected.length} Serasa dunnings`);

  // Buscar payments locais desta unidade
  const { data: localPayments } = await supabase
    .from("payments")
    .select("id, asaas_payment_id, in_dunning, dunning_id, dunning_manual")
    .eq("unit_id", unitId)
    .not("asaas_payment_id", "is", null);

  const byAsaasId = new Map<string, any>();
  (localPayments || []).forEach((p: any) => byAsaasId.set(p.asaas_payment_id, p));

  const activeAsaasIds = new Set<string>();
  const updates: { id: string; status: string; dunningId: string }[] = [];

  for (const d of collected) {
    // Garante que é Serasa (CREDIT_BUREAU) e está em status ativo
    if (d.type !== SERASA_TYPE) continue;
    if (!ACTIVE_DUNNING_STATUSES.has(d.status)) continue;
    activeAsaasIds.add(d.payment);
    const local = byAsaasId.get(d.payment);
    if (local) updates.push({ id: local.id, status: d.status, dunningId: d.id });
  }

  let marked = 0;
  let unmarked = 0;

  // Marcar os que estão ativos
  for (const u of updates) {
    const { error } = await supabase
      .from("payments")
      .update({
        in_dunning: true,
        dunning_status: u.status,
        dunning_id: u.dunningId,
        dunning_synced_at: new Date().toISOString(),
        dunning_manual: false,
      })
      .eq("id", u.id);
    if (!error) marked++;
  }

  // Desmarcar os que NÃO foram marcados manualmente E não estão mais ativos
  const idsParaLimpar = (localPayments || [])
    .filter((p: any) => p.in_dunning && !p.dunning_manual && !activeAsaasIds.has(p.asaas_payment_id))
    .map((p: any) => p.id);

  if (idsParaLimpar.length > 0) {
    const { error } = await supabase
      .from("payments")
      .update({
        in_dunning: false,
        dunning_status: null,
        dunning_id: null,
        dunning_synced_at: new Date().toISOString(),
      })
      .in("id", idsParaLimpar);
    if (!error) unmarked = idsParaLimpar.length;
  }

  return { unitId, fetched: collected.length, marked, unmarked, notLinked: collected.length - updates.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const targetUnitId: string | null = body?.unit_id ?? null;

    let unitsQuery = supabase
      .from("units")
      .select("id, asaas_api_key, asaas_base_url")
      .eq("active", true)
      .not("asaas_api_key", "is", null);

    if (targetUnitId) unitsQuery = unitsQuery.eq("id", targetUnitId);

    const { data: units, error: unitsError } = await unitsQuery;
    if (unitsError) throw unitsError;

    const results = [];
    for (const u of units || []) {
      if (!u.asaas_api_key) continue;
      try {
        const r = await syncUnit(
          u.id,
          u.asaas_api_key,
          u.asaas_base_url || "https://api.asaas.com/v3",
          supabase,
        );
        results.push(r);
      } catch (e) {
        console.error(`Error syncing unit ${u.id}:`, e);
        results.push({ unitId: u.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-asaas-dunnings error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
