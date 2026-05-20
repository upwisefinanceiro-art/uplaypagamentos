
# Plano — Estabilidade da Área do Professor (Fases 1 + 2)

Foco exclusivo em login, multiunidade, realtime, sessão, reconciliação, logs e botão "Reprocessar". Painel de saúde, alertas e dashboard ficam para a próxima rodada (após validação).

---

## Fase 1 — Login, Sessão, Multiunidade e Realtime Híbrido

### 1.1. Login do Professor (eliminar falhas)
- **`resolve_auth_email`**: hoje busca em `profiles` ligado por `id`. Quando o professor não tem profile (só `school_teachers`), o login por CPF falha. Vou estender a função para:
  - Procurar também em `school_teachers.cpf` → `profile_id` → `auth.users.email`.
  - Aceitar e-mail digitado mesmo sem profile (fallback direto em `auth.users.email`).
- **`Login.tsx`**: hoje bloqueia por `unit_id` do profile. Reescrever a checagem de bloqueio para professores:
  - Carregar TODOS os vínculos ativos em `school_teachers` + status das unidades.
  - Só bloquear se NENHUMA unidade ativa existir (hoje já tenta, mas a query é frágil; vou consolidar).
  - Não exigir `profile.unit_id` para professores multiunidade — usar a primeira unidade ativa do vínculo como contexto.
- **Mensagens de erro específicas** por categoria (CPF não encontrado, senha errada, todas as unidades bloqueadas, conta inativa) salvas em `teacher_app_logs`.

### 1.2. Sessão persistente
- Adicionar `detectSessionInUrl: true` e manter `autoRefreshToken: true` (já está). Garantir que `onAuthStateChange` em `AuthContext` trate `TOKEN_REFRESHED` sem disparar re-sync (já trata) e adicionar tratamento de `SIGNED_OUT` inesperado: tentar `supabase.auth.refreshSession()` 1x antes de limpar estado.
- Criar hook `useSessionGuard` no `TeacherLayout` que:
  - A cada 5 min chama `supabase.auth.getSession()` e, se o token expirar em <2 min, força `refreshSession()`.
  - Em caso de `refreshSession` falhar 2x seguidas, mostra toast "Reconectando..." em vez de deslogar.

### 1.3. Multiunidade nativa
- Novo contexto `TeacherUnitContext` (`src/contexts/TeacherUnitContext.tsx`):
  - Carrega todos os vínculos ativos do professor (`school_teachers` + `units_public`).
  - Expõe `units`, `activeUnitId`, `setActiveUnitId`, `teacherIdsByUnit`.
  - Persiste a unidade ativa em `localStorage` (`teacher_active_unit`).
- **Seletor de unidade** no header do `TeacherLayout` (só aparece se >1 unidade).
- `TeacherLessons` e `TeacherPayroll` passam a filtrar por `activeUnitId` + `teacher_id` correspondente, e expõem botão "Ver todas as unidades" para visão consolidada.
- Troca de unidade NÃO faz logout — apenas refetch.

### 1.4. Realtime híbrido
- Criar hook `useTeacherRealtime(teacherIds: string[])`:
  - Inscreve em `school_lessons`, `school_payroll_closures`, `school_teacher_payments` filtrando por `teacher_id=in.(...)`.
  - Refetch automático ao receber INSERT/UPDATE/DELETE.
  - Polling de segurança a cada 60s (`setInterval`) que invalida a query.
  - Detecta perda de conexão (`channel.subscribe` status `CHANNEL_ERROR` / `TIMED_OUT`) e reconecta com backoff exponencial (2s, 5s, 10s, 30s).
- Substitui os listeners ad-hoc atuais em `TeacherLessons.tsx` e `TeacherPayroll.tsx`.

---

## Fase 2 — Reconciliação, Logs e Reprocessar

### 2.1. Logs completos
- Tabela `teacher_app_logs` já existe. Vou:
  - Adicionar índice composto `(user_id, created_at desc)` e `(status, created_at desc)`.
  - Padronizar eventos: `LOGIN_OK`, `LOGIN_FAIL`, `SESSION_REFRESHED`, `SESSION_REFRESH_FAIL`, `UNIT_SWITCH`, `LESSONS_LOAD_OK`, `LESSONS_LOAD_FAIL`, `LESSON_CONFIRM_OK/FAIL`, `REALTIME_CONNECTED`, `REALTIME_DISCONNECTED`, `RECONCILE_RUN`, `REPROCESS_RUN`.
  - Helper `logTeacherAppEvent` já existe — expandir tipagem com esses literais.
  - Logar a partir de Login.tsx, AuthContext, TeacherLayout, TeacherLessons, TeacherPayroll e do hook realtime.
- RLS: admin (ADMIN_MASTER, SUPER_ADMIN) lê tudo; ADMIN_UNIDADE lê só da sua unidade; o próprio professor lê só os seus.

### 2.2. Reconciliação automática diária (edge function + pg_cron)
- Nova edge function `reconcile-teachers` (service_role):
  - Detecta e corrige:
    1. `school_teachers.profile_id` apontando para `auth.users` inexistente → log `WARN`.
    2. Professor ativo sem nenhuma role `PROFESSOR` em `user_roles` → insere a role.
    3. Aulas (`school_lessons`) com `teacher_id` inativo → log `WARN`.
    4. Aulas com `unit_id` ≠ `school_teachers.unit_id` do mesmo `teacher_id` → log `WARN`.
    5. Conflitos de horário: duas aulas do mesmo professor com `tsrange` sobreposto → log `WARN`.
    6. Fechamentos (`school_payroll_closures`) com `total_value` divergente da soma das aulas validadas → recalcula via `recalc_school_payroll_closure`.
    7. Vínculo duplicado `(profile_id, unit_id)` ativo → mantém o mais recente.
  - Cada inconsistência grava em `teacher_app_logs` com `event='RECONCILE_FINDING'` + `details`.
  - Resumo final gravado como `event='RECONCILE_RUN'` com contagens.
- Agendar via `pg_cron` diariamente às 04:00 UTC.

### 2.3. Botão "Reprocessar dados do professor"
- Nova edge function `reprocess-teacher` que aceita `{ teacher_id?, unit_id?, all?: boolean }`:
  - Recalcula `computed_value` das aulas (trigger já cuida, mas força UPDATE de toque).
  - Roda `recalc_school_payroll_closure` para todos os closures do(s) professor(es).
  - Garante role `PROFESSOR` no `user_roles` se houver vínculo ativo.
  - Reinvoca `react-query` invalidations via realtime (UPDATE toque em uma linha sentinela do professor).
  - Retorna relatório `{ teachers_processed, closures_recalculated, lessons_touched, findings: [...] }`.
- UI nova: `src/pages/admin/school/AdminSchoolHealth.tsx` (rota `/admin/escola/saude`):
  - Lista professores com botões "Reprocessar" individual.
  - Botões "Reprocessar unidade inteira" e "Reprocessar todos".
  - Tabela com últimos 50 registros de `teacher_app_logs` (status=ERROR/WARN), com filtros por unidade e severidade.
  - Botão "Rodar reconciliação agora" → invoca `reconcile-teachers`.
- Link no menu admin escolar.

---

## Detalhes Técnicos

### Migrações SQL
1. Atualizar `resolve_auth_email` para considerar `school_teachers.cpf`.
2. Índices em `teacher_app_logs`.
3. RLS adicional em `teacher_app_logs` para ADMIN_UNIDADE/PROFESSOR.
4. `pg_cron` job diário para `reconcile-teachers`.

### Arquivos novos
- `src/contexts/TeacherUnitContext.tsx`
- `src/hooks/useTeacherRealtime.ts`
- `src/hooks/useSessionGuard.ts`
- `src/pages/admin/school/AdminSchoolHealth.tsx`
- `supabase/functions/reconcile-teachers/index.ts`
- `supabase/functions/reprocess-teacher/index.ts`

### Arquivos editados
- `src/contexts/AuthContext.tsx` (refresh resiliente)
- `src/pages/Login.tsx` (bloqueio multiunidade + logging detalhado)
- `src/components/layouts/TeacherLayout.tsx` (seletor de unidade, session guard)
- `src/pages/teacher/TeacherLessons.tsx` (usa contexto + hook realtime)
- `src/pages/teacher/TeacherPayroll.tsx` (idem)
- `src/lib/teacher-app-logger.ts` (eventos tipados)
- `src/App.tsx` (rota nova admin)
- `src/components/layouts/AdminLayout.tsx` (item de menu "Saúde Escolar")

### O que NÃO entra agora (próxima rodada, após validação)
- Painel de "professores online" em tempo real
- Alertas WhatsApp/e-mail
- Health check externo de APIs
- Dashboard visual do professor com KPIs

---

## Validação
Ao final, vou:
- Conferir build limpo
- Rodar `supabase/linter`
- Smoke test via `read_query`: contagem de vínculos ativos, professores sem role, closures divergentes — antes e depois do reconcile.
- Testar manualmente: login por CPF de professor multiunidade, troca de unidade sem logout, confirmação de aula refletindo em tempo real, reprocessar individual e em lote.

Posso prosseguir com a implementação?
