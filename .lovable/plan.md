
## Plano: Camada SaaS Multi-Empresa (Aditiva)

### Princípio: ZERO alterações em código/tabelas existentes. Tudo é ADIÇÃO.

---

### Fase 1 — Banco de Dados (Migration)

1. **Criar tabela `companies`** com campos:
   - `id`, `name`, `system_name`, `logo_url`, `primary_color`, `secondary_color`
   - `whatsapp_financeiro`, `plan` (FREE/BASIC/PRO/ENTERPRISE)
   - `status` (ATIVO/INATIVO/BLOQUEADO), `max_units`, `max_users`
   - `created_at`, `updated_at`

2. **Adicionar coluna `company_id` na tabela `units`** (nullable, sem quebrar dados existentes)

3. **Criar empresa padrão "EnsinUP"** e vincular todas as unidades existentes a ela

4. **Adicionar role `SUPER_ADMIN`** ao enum `app_role` (para o dono do SaaS)

5. **RLS na tabela `companies`**:
   - SUPER_ADMIN: acesso total
   - ADMIN_MASTER: visualiza apenas sua empresa
   - Demais: sem acesso direto

6. **Atualizar RLS de `units`** para incluir filtro por `company_id` (mantendo políticas atuais funcionando)

### Fase 2 — Frontend (após migration aprovada)
- Painel SUPER_ADMIN para gerenciar empresas
- Tela de criação/edição de empresa
- Dashboard com métricas globais

### O que NÃO muda:
- ✅ Tabelas existentes continuam intactas
- ✅ RLS existente continua funcionando
- ✅ Integração Asaas não é tocada
- ✅ Telas admin e app do cliente não mudam
- ✅ Fluxo de login/auth não muda
- ✅ Edge Functions não são alteradas
