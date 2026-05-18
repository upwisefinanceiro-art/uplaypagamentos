
# Auditoria Asaas — Diagnóstico e Plano de Correção

## 1. Diagnóstico (varredura já executada no banco e nas edge functions)

### O que está OK
- **Idempotência por `asaas_payment_id`**: 3.306 registros com `asaas_payment_id` → 3.306 IDs distintos. Zero colisão. O webhook não está duplicando linhas pelo mesmo evento.
- **Idempotência de evento**: `webhook_events.event_id` tem unique constraint e o `asaas-webhook` insere antes de processar (retorna `duplicate:true` no 23505). Eventos repetidos do Asaas já são ignorados.
- **Guard “PAID nunca volta”**: `resolvePaymentStatus` mantém status `PAID` mesmo se Asaas reenviar `PENDING/OVERDUE`. Confirmado em `asaas-webhook/index.ts` linhas 39-41.
- **Webhook recebendo eventos**: 1.148 sucessos / 350 falhas em 30 dias, último evento processado há minutos.
- **Os "Payment not found locally" recentes (163 em 30d / 18 em 7d)** são `PAYMENT_DELETED` das 26 cobranças que apagamos hoje da Daisy — comportamento esperado, **não é bug**.

### Problemas reais encontrados
1. **76 grupos de parcelas duplicadas** no banco com mesmo `(responsible_id, due_date, value)`. A maioria já está paga (cliente foi cobrado 2-3x no Asaas — caso Bruno R$139,90 jul-out/2025, Daisy R$229,90 mai-out/2025, etc.).
2. **26 pagamentos sem `contract_id`** (órfãos vindos de importações antigas do Asaas).
3. **Sem trava transacional em `create-asaas-charge`**: dois cliques rápidos no botão "Gerar cobrança" da mesma parcela podem criar duas cobranças no Asaas (a função apenas faz `INSERT` em payments sem checar `asaas_payment_id` existente da mesma parcela).
4. **Validação fraca do webhook token**: `asaas-webhook` só valida se o header vier; se o Asaas não mandar, aceita qualquer chamada. Risco de spoofing.
5. **Sem unique constraint** que impeça duplicidade de parcelas. Toda proteção é a nível de aplicação (e está furada — ver #3).
6. **Sem reconciliação automática agendada** entre o que existe no Asaas e o que existe localmente (a função `sync-all-payments` existe mas é manual).

## 2. Correções

### Etapa A — Banco (migration)
- `UNIQUE (asaas_payment_id)` em `payments` (já é único de fato, vamos garantir formalmente).
- Index parcial `UNIQUE (contract_id, installment_number)` para parcelas regulares (impede a mesma parcela do mesmo contrato existir 2x).
- Limpeza segura das 76 duplicatas de parcelas:
  - Quando o grupo tem cópias **PAID + PENDING/OVERDUE**: manter a PAID, apagar a outra (e cancelar no Asaas se ainda estiver aberta).
  - Quando o grupo tem 2+ PAID: manter a mais antiga, registrar as outras em `payment_inconsistencies` para revisão manual (não excluir — pode haver dinheiro real recebido em duplicidade que precisa ser estornado pelo financeiro).
- Tentar vincular os 26 pagamentos sem `contract_id` (best-effort por responsável + descrição), registrando o que não casar em `payment_inconsistencies`.

### Etapa B — `create-asaas-charge` (idempotência na criação)
- Antes do `POST /payments` no Asaas, dar `SELECT ... FOR UPDATE` no payment local; se já tiver `asaas_payment_id`, devolver o existente (não recria).
- Travar via `external_reference` enviado ao Asaas igual ao `payment.id` local — se vier 200 mas a requisição duplicar, a segunda recupera o mesmo registro.

### Etapa C — `asaas-webhook` (endurecer)
- Tornar a validação do token **obrigatória** quando a unit tiver um token configurado (rejeitar se header ausente).
- Mensurar tempo de processamento e logar.

### Etapa D — Reconciliação automática
- Nova edge function `asaas-reconcile` que para cada unit:
  1. Lista cobranças no Asaas dos últimos N dias (`GET /payments?dateCreated[ge]=...`).
  2. Para cada uma sem correspondente local, cria a inconsistência em `payment_inconsistencies` (não cria payment automaticamente — evita "fantasmas").
  3. Para cada `payment` local sem `asaas_payment_id` há mais de 1h, dispara `sync-asaas-payment`.
- Agendar via `pg_cron` 4x ao dia (06:00, 13:00, 17:00, 22:00 BRT, conforme pedido do usuário em mensagem anterior).

### Etapa E — Painel de auditoria (somente leitura, ADMIN_MASTER)
- Nova página `/admin/auditoria-asaas` listando:
  - Inconsistências abertas (`payment_inconsistencies`).
  - Últimos webhooks falhos (`webhook_logs`).
  - Botão "Forçar reconciliação agora" (chama `asaas-reconcile`).
  - Botão "Reenviar para Asaas" por payment.

## 3. O que **não** vou fazer agora (e por quê)
- **Apagar automaticamente cobranças PAID duplicadas**: pode existir dinheiro real recebido em duplicidade. Vou apenas marcar para revisão manual da Daisy/financeiro.
- **Cancelar em massa cobranças PENDING duplicadas no Asaas** sem confirmação por unit — risco alto. O painel da Etapa E permitirá ação manual auditada.
- **Testes automatizados completos**: o pedido inclui ~10 cenários de teste. Cria-se em uma segunda iteração depois das correções acima validadas.

## 4. Ordem de execução
1. Migration (Etapa A) — precisa de aprovação no Lovable.
2. Edit em `create-asaas-charge` + `asaas-webhook` (Etapas B + C).
3. Criar `asaas-reconcile` + cron (Etapa D).
4. Página `/admin/auditoria-asaas` (Etapa E).

## 5. Detalhes técnicos
- `webhook_events(provider, event_id)` já tem unique → mantém.
- `payment_inconsistencies` já existe e tem RLS → reaproveitar.
- `cora-webhook` e fluxo Cora não estão no escopo (problema é Asaas).
- `payments.external_reference` (campo enviado ao Asaas) será setado como `payment.id` local em todas as criações novas.

Posso prosseguir com a Etapa A (migration) primeiro?
