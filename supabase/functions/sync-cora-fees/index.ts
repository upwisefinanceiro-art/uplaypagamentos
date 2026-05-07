// Edge Function: sync-cora-fees
// Consulta o extrato (ledger) da conta Cora e tenta casar lançamentos de tarifa
// com pagamentos PAID, gravando o valor real cobrado em payments.cora_fee_amount
// (com cora_fee_source = 'EXTRATO').
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { authenticateCora, coraRequest, getUnitCoraCredentials } from "../_shared/cora-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const STATEMENT_PATHS = [
  "/v1/ledger",
  "/v2/ledger",
  "/v1/account-statement",
  "/v2/account-statement",
];

async function fetchStatement(session: any, startISO: string, endISO: string) {
  for (const path of STATEMENT_PATHS) {
    const qs = `?start_date=${startISO}&end_date=${endISO}&page_size=200`;
    try {
      const r = await coraRequest(session, `${path}${qs}`, "GET");
      if (r.ok && r.data) return { path, data: r.data };
    } catch (_) { /* try next */ }
  }
  return null;
}

function flattenEntries(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.entries || data.items || data.data || data.results || data.transactions || [];
}

function isFeeEntry(entry: any): boolean {
  const text = JSON.stringify(entry).toLowerCase();
  return /tarifa|fee|tax|cobran[cç]a de tarifa/.test(text)
    && (Number(entry?.amount ?? entry?.value ?? 0) < 0 || /debit|d[eé]bito/.test(text));
}

function entryAmount(entry: any): number {
  const v = entry?.amount ?? entry?.value ?? 0;
  const n = typeof v === "number" ? v : Number(v);
  return Math.abs(Number.isFinite(n) ? (n > 1000 ? n / 100 : n) : 0);
}

function entryRef(entry: any): string | null {
  return entry?.related_id || entry?.invoice_id || entry?.reference || entry?.metadata?.invoice_id || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return json({ ok: true, msg: "sync-cora-fees alive" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const body = await req.json().catch(() => ({}));
  const targetUnitId: string | undefined = body?.unit_id;

  // Janela: últimos 60 dias
  const end = new Date();
  const start = new Date(); start.setDate(start.getDate() - 60);
  const startISO = start.toISOString().slice(0, 10);
  const endISO = end.toISOString().slice(0, 10);

  // Buscar pagamentos Cora pagos sem fee do extrato
  let q = admin.from("payments")
    .select("id, unit_id, cora_invoice_id, paid_at, final_value, value, cora_fee_amount, cora_fee_source")
    .eq("gateway", "CORA")
    .in("status", ["PAID", "RECEIVED", "CONFIRMED"])
    .gte("paid_at", start.toISOString());
  if (targetUnitId) q = q.eq("unit_id", targetUnitId);

  const { data: payments, error } = await q;
  if (error) return json({ error: error.message }, 500);
  if (!payments?.length) return json({ ok: true, matched: 0, msg: "no payments to reconcile" });

  // Agrupa por unidade
  const byUnit: Record<string, typeof payments> = {};
  payments.forEach((p) => {
    if (!byUnit[p.unit_id]) byUnit[p.unit_id] = [] as any;
    byUnit[p.unit_id].push(p);
  });

  let matched = 0;
  const errors: any[] = [];

  for (const unitId of Object.keys(byUnit)) {
    const { data: unit } = await admin.from("units")
      .select("id, name, cora_client_id, cora_certificate, cora_private_key, cora_environment")
      .eq("id", unitId).maybeSingle();
    if (!unit) continue;

    const creds = getUnitCoraCredentials(unit as any);
    if ("error" in creds) { errors.push({ unitId, error: creds.error }); continue; }

    const session = await authenticateCora(creds);
    if ("error" in session) { errors.push({ unitId, error: session.error }); continue; }

    try {
      const stmt = await fetchStatement(session, startISO, endISO);
      if (!stmt) {
        errors.push({ unitId, error: "extrato Cora indisponível (endpoints testados sem retorno)" });
        continue;
      }
      const entries = flattenEntries(stmt.data).filter(isFeeEntry);
      console.info("[CORA_FEES] unit", unitId, "entries", entries.length, "via", stmt.path);

      for (const p of byUnit[unitId]) {
        // Tenta casar por related_id == cora_invoice_id
        const ref = p.cora_invoice_id;
        const match = entries.find((e) => {
          const r = entryRef(e);
          return r && ref && String(r) === String(ref);
        });
        if (!match) continue;
        const fee = entryAmount(match);
        if (!fee) continue;
        await admin.from("payments").update({
          cora_fee_amount: fee,
          cora_fee_source: "EXTRATO",
          updated_at: new Date().toISOString(),
        }).eq("id", p.id);
        matched++;
      }
    } finally {
      session.close();
    }
  }

  return json({ ok: true, matched, errors });
});
