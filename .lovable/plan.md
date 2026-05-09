## Reconciliação automática Asaas × Sistema (desconto de pontualidade)

Objetivo: corrigir em massa cobranças Asaas antigas que foram criadas com `value` já descontado, sem `discount` separado, sem precisar tratar uma a uma.

### 1. Banco de dados (migration)

Adicionar em `public.payments`:

- `sync_status TEXT NOT NULL DEFAULT 'OK'` — valores: `OK`, `DIVERGENT`, `FIXING`, `FIXED`, `ERROR`
- `sync_error TEXT`
- `sync_last_check TIMESTAMPTZ`
- `sync_last_fix TIMESTAMPTZ`
- `sync_fixed_by UUID`
- `sync_attempts INT NOT NULL DEFAULT 0`
- `corrected_automatically BOOLEAN NOT NULL DEFAULT false`

Nova tabela `public.payment_sync_logs` (auditoria detalhada):
- `payment_id`, `asaas_payment_id`, `responsible_id`, `unit_id`
- `old_value`, `new_value`, `old_discount`, `new_discount`
- `action` (`UPDATE_ASAAS` | `CANCEL_AND_RECREATE` | `MARK_OK` | `ERROR`)
- `request_payload jsonb`, `response_payload jsonb`
- `success boolean`, `error_message text`
- `performed_by uuid`, `created_at`

RLS: mesmas políticas de `payments` (Super/Admin Master/Admin Unidade por unidade).

### 2. Edge Function: `reconcile-asaas-discounts`

Nova função Deno. Recebe `{ unit_id?, payment_ids?, dry_run?, batch_size? }`.

Fluxo por cobrança elegível (filtro):
- `payment_provider = 'ASAAS'`
- `status IN ('PENDING','OVERDUE','RECEIVED_PENDING_CONFIRMATION')`
- `asaas_payment_id IS NOT NULL`
- `punctuality_discount > 0` e `original_value IS NOT NULL`

Para cada uma:
1. `GET /payments/{id}` no Asaas (chave da unidade).
2. Comparar:
   - esperado: `value = original_value`, `discount.value = punctuality_discount`, `discount.type = FIXED`, `discount.dueDateLimitDays = 0`
   - se já bate → marca `sync_status='OK'`, `sync_last_check=now()`.
3. Se divergente e cobrança não paga/cancelada no Asaas:
   - Tentar `POST /payments/{id}` (update) com payload:
     ```json
     { "value": original_value, "discount": { "value": discount, "dueDateLimitDays": 0, "type": "FIXED" } }
     ```
   - Se 200 → `sync_status='FIXED'`, `corrected_automatically=true`, log `UPDATE_ASAAS`.
   - Se Asaas recusar (ex.: já visualizada/parcial) → `DELETE /payments/{id}` + chamar `sync-asaas-payment` (que já cria com discount correto). Atualiza `asaas_payment_id` no payment. Log `CANCEL_AND_RECREATE`.
4. Erros são capturados por item, registrados em `payment_sync_logs` e setam `sync_status='ERROR'`, `sync_error=msg`. Não interrompe o lote.

Controle de lote:
- `batch_size` default 25.
- `await sleep(150ms)` entre chamadas (rate limit Asaas).
- Usa `EdgeRuntime.waitUntil` para processamento assíncrono e responde com `job_id` lógico (apenas o totals iniciais + assíncrono).

Versão síncrona simples para começar: processa até `batch_size` por chamada e retorna `{ checked, fixed, divergent, errors, remaining }`. O frontend chama em loop até `remaining === 0`.

### 3. Frontend: `DashboardInconsistencies.tsx`

Adicionar botão "Corrigir automaticamente" ao lado de "Verificar agora".

Comportamento:
- Mostra `Dialog` com progresso: `Verificadas X / Total · Corrigidas: Y · Erros: Z`.
- Loop: chama `reconcile-asaas-discounts` com `batch_size: 25` até `remaining === 0`.
- Ao final: toast com total, recarrega `fetchIssues()` e dispara `detect-payment-inconsistencies` para limpar a lista.

Adicionar contadores no card (badges): `Divergentes`, `Corrigidas`, `Erros` (com base em `sync_status` consultado ao montar).

### 4. Segurança

- Edge function valida JWT do chamador, exige role `SUPER_ADMIN`, `ADMIN_MASTER` ou `ADMIN_UNIDADE`.
- Filtro garante que **nunca** processa `RECEIVED`, `CONFIRMED`, `PAID`, `REFUNDED`, `CANCELLED`.
- Antes de cada update, re-checa status no Asaas; se já pago, aborta sem alterar.

### 5. Arquivos

- `supabase/migrations/<ts>_payment_sync_status.sql`
- `supabase/functions/reconcile-asaas-discounts/index.ts` (novo)
- `src/components/dashboard/DashboardInconsistencies.tsx` (botão + dialog progresso)

### Confirmações antes de prosseguir

1. Posso adicionar os 7 campos em `payments` + criar `payment_sync_logs`?
2. Estratégia "tentar UPDATE → fallback DELETE+CREATE" está OK? (a alternativa segura é só UPDATE, e cobranças que falharem ficam marcadas como ERROR para revisão manual.)
3. Executar em lotes de 25 chamando do navegador é aceitável, ou prefere agendar via cron diário?
