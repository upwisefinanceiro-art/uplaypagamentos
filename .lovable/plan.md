## Plano de Implementação

### Fase 1 — Exclusão e Desativação de Unidades
1. **Corrigir exclusão**: Garantir que a exclusão funcione quando não há vínculos
2. **Adicionar botão "Desativar"**: Setar `active = false` na unidade quando houver vínculos
3. **Bloquear operações em unidades inativas**: Impedir criação de clientes/contratos/cobranças

### Fase 2 — Estrutura de Assinatura SaaS (Banco de Dados)
- Já existem as tabelas `saas_subscriptions` e `saas_invoices` — vou adicionar os campos faltantes:
  - `due_day` (dia do vencimento, ex: 10)
  - `block_deadline` (data limite de bloqueio = vencimento + 10 dias)
  - `asaas_customer_id`, `asaas_payment_id`, `invoice_url` na `saas_invoices`
- Atualizar status da company baseado na assinatura (ATIVO/ATRASADO/BLOQUEADO)

### Fase 3 — Lógica de Bloqueio Automático
- Edge Function agendada (cron) que verifica diariamente:
  - Se `next_billing_date + 10 dias < hoje` e não pago → bloqueia empresa
  - Se pago → reativa empresa
- No frontend: interceptar login de empresa bloqueada e mostrar tela de bloqueio

### Fase 4 — Dashboard Super Admin
- Atualizar SuperDashboard com:
  - Empresas ativas/atrasadas/bloqueadas
  - Vencendo hoje
  - Valor total a receber/recebido do SaaS
  - Detalhes por empresa (próximo vencimento, status)

### Fase 5 — Tela de Empresas (Super Admin)
- Mostrar status da assinatura, valor, vencimento, data limite
- Botões: "Ver cobrança", "Abrir boleto", "Copiar link"

### Fase 6 — Integração Asaas para SaaS
- Edge Function para criar customer/cobrança da empresa no Asaas
- Webhook para receber pagamento e reativar automaticamente

### ⚠️ Observação
A integração Asaas para cobrar empresas requer uma **API Key do ADMIN_MASTER** (proprietário da plataforma), separada das API Keys das unidades. Será necessário configurar isso como secret.

### Ordem de execução
Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 5 → Fase 6
