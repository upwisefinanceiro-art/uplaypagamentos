## Problema

Hoje o roteamento usa o campo `gateway`, mas em vários pontos há **fallback para preferência da unidade** quando `gateway` está nulo (ex.: `AdminCharges.tsx:1384`). Isso faz com que cobranças sem `gateway` definido sejam emitidas no banco da unidade — mesmo se o usuário tinha selecionado outro banco anteriormente. Também há funções automáticas (`auto-emit-pending-charges`) e bulk que reaproveitam esse fallback.

## Estratégia

Criar uma **fonte única da verdade** chamada `payment_provider` (`ASAAS` | `CORA`), obrigatória em toda parcela e em toda tentativa de emissão. Toda função de emissão deve **abortar** se o provider esperado não bater com o roteamento real, sem nenhum fallback silencioso.

## Mudanças

### 1. Banco de dados (migration)
- Adicionar `payment_provider TEXT` em `payments` (nullable na criação para back-fill, depois NOT NULL).
- Backfill: `payment_provider = COALESCE(UPPER(gateway), 'ASAAS')`. Para registros já com `cora_invoice_id` preencher `CORA`; com `asaas_payment_id` preencher `ASAAS`.
- Tornar NOT NULL com default `'ASAAS'`.
- Adicionar CHECK: `payment_provider IN ('ASAAS','CORA')`.
- Adicionar trigger anti-mistura: bloqueia INSERT/UPDATE quando `payment_provider='ASAAS'` e `cora_invoice_id IS NOT NULL`, ou `payment_provider='CORA'` e `asaas_payment_id IS NOT NULL` (exceto se o registro já existia com ambos — histórico).
- Sincronizar `gateway` com `payment_provider` via trigger BEFORE INSERT/UPDATE para retro-compatibilidade temporária.

### 2. Edge Functions
- **`create-cora-charge`**: validar `payment.payment_provider === 'CORA'`. Se não, retornar erro `PROVIDER_MISMATCH` e gravar em `emission_error_*`. Nunca tocar Asaas.
- **`create-asaas-charge` / `sync-asaas-payment`**: validar `payment.payment_provider === 'ASAAS'`. Mesmo tratamento. Nunca tocar Cora.
- **`auto-emit-pending-charges`**: rotear **exclusivamente** por `payment_provider` (remover `String(p.gateway || "ASAAS")` fallback). Pular registros sem provider explícito e logar.
- **`manage-payment` / `sync-cora-payment`**: idem — só agem no provider gravado.
- Logs estruturados antes de cada emissão: `{payment_id, responsible_id, unit_id, payment_provider, target_function, attempt_at}`.

### 3. Frontend
- **`AdminCharges.tsx`**:
  - Remover fallback `unitPref === "cora" ? "CORA" : "ASAAS"` na linha ~1384. Usar **somente** `payment.payment_provider` (e exibir "Provider não definido" se ausente).
  - Em `handleCreateCharge`, gravar `payment_provider` (não só `gateway`).
  - `handleSyncPayment` e `handleEmitCora` roteiam por `payment_provider`.
  - Bulk emitir: filtrar por `payment_provider` e chamar a função correspondente parcela a parcela; nunca delegar para `auto-emit` que possa cair em fallback.
  - Card de cada cobrança: badge "Banco: Asaas" ou "Banco: Cora" + ID externo correto.
- **`AdminContracts.tsx` / `AddContractInstallmentsDialog.tsx`**: gravar `payment_provider` igual ao gateway escolhido. Remover `effectiveGateway = gateway === "CORA" || unitGw === "CORA" ? "CORA" : "ASAAS"` (que sobrepõe a escolha do form com a unidade); usar **somente** o valor do select. Ao trocar select, limpar resultados temporários.
- **Reemissão**: respeitar `payment_provider` da parcela. Não há diálogo de re-escolha (mantemos imutável após criação) — se o usuário quiser mudar de banco, cancela e cria de novo. Esta decisão evita ambiguidade.

### 4. Mensagens de erro
- Cora → "Erro ao emitir cobrança pelo Cora: <detalhe>"
- Asaas → "Erro ao emitir cobrança pelo Asaas: <detalhe>"
- Nunca cruzar.

### 5. Testes manuais (executados pelo usuário)
1. Criar individual Cora → só Cora.
2. Criar individual Asaas → só Asaas.
3. Sequência Cora→Asaas; segunda não toca Cora.
4. Sequência Asaas→Cora; segunda não toca Asaas.
5. Reemissão respeita provider gravado.
6. Lote 18× Asaas / 18× Cora → nenhuma chamada cruzada (verificar logs).

## Detalhes técnicos

### Arquivos editados
- `supabase/migrations/<ts>_payment_provider.sql` (novo)
- `supabase/functions/create-cora-charge/index.ts`
- `supabase/functions/create-asaas-charge/index.ts`
- `supabase/functions/sync-asaas-payment/index.ts`
- `supabase/functions/sync-cora-payment/index.ts`
- `supabase/functions/auto-emit-pending-charges/index.ts`
- `supabase/functions/manage-payment/index.ts`
- `src/pages/admin/AdminCharges.tsx`
- `src/pages/admin/AdminContracts.tsx`
- `src/components/admin/AddContractInstallmentsDialog.tsx`

### O que **não** muda
- Esquema de credenciais por unidade (Asaas/Cora) permanece igual.
- O campo legado `gateway` continua existindo, mas vira **espelho** de `payment_provider` (mantido por trigger) para compatibilidade até refator completo.
- Pré-seleção do banco no form continua usando `preferred_bank` da unidade — mas agora **só** como sugestão inicial; o valor enviado é sempre o do select.

### Decisão de reemissão
Reemissão **não** abre diálogo perguntando banco — usa o `payment_provider` gravado. Isso garante que "Reemitir" jamais cruze providers. Se quiser trocar, o admin cancela e gera nova.

### Nota sobre histórico
Parcelas antigas com ambos IDs (`asaas_payment_id` e `cora_invoice_id`) são preservadas; o trigger só impede **novas** misturas.
