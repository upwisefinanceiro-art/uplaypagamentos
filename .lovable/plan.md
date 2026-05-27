
# Módulo Omnichannel CRM Uplay — Arquitetura Completa

Construção real (sem mocks) do módulo de atendimento multicanal, com schema Supabase produtivo, RLS multi-tenant, Realtime, endpoints prontos para Evolution API e Meta Webhooks, e UI dark profissional estilo Kommo/Intercom.

---

## 1. Schema Supabase (migration única)

Novo enum `channel_type`: `WHATSAPP`, `INSTAGRAM`, `LANDING_PAGE`, `EMAIL`, `WEBCHAT`.
Novo enum `conversation_status`: `open`, `pending`, `closed`, `bot`, `waiting`.
Novo enum `message_sender_type`: `contact`, `agent`, `bot`, `system`.
Novo enum `message_type`: `text`, `image`, `audio`, `video`, `document`, `system`.
Novo enum `agent_presence`: `online`, `offline`, `away`, `reconnecting`.
Novo enum `integration_provider`: `EVOLUTION_API`, `META_WHATSAPP_CLOUD`, `META_INSTAGRAM`, `LANDING_FORM`.
Novo enum `automation_trigger`: `message_received`, `conversation_opened`, `keyword_match`, `no_reply_timeout`, `tag_added`.

Tabelas (todas com `company_id` + `unit_id` para isolamento SaaS, `created_at/updated_at`, RLS + GRANTs):

- **`omni_contacts`** — nome, phone_e164, instagram_handle, email, tags[], origin (channel_type), notes, profile_id (opcional, vínculo Responsável), avatar_url, metadata jsonb. UNIQUE parcial (`unit_id`, `phone_e164`) e (`unit_id`, `instagram_handle`).
- **`omni_integrations`** — provider, channel, status (`connected|disconnected|qr_pending|error`), display_name, credentials jsonb (criptografado nivel app), webhook_secret, last_sync_at, last_event_at, qr_code (text), session_started_at, error_message.
- **`omni_integration_logs`** — integration_id, event, direction (`inbound|outbound`), payload jsonb, response jsonb, http_status, error_message.
- **`omni_queues`** — nome (Comercial/Financeiro/Pedagógico/Suporte — seed inicial por unidade), color, max_concurrent_per_agent, active.
- **`omni_conversations`** — channel, contact_id, integration_id, queue_id, assigned_to (profile id), status, priority (1-5), last_message_preview, last_message_at, unread_count, opened_at, closed_at, closed_by, tags[], metadata jsonb. Index em (`unit_id`,`status`,`last_message_at desc`).
- **`omni_messages`** — conversation_id, sender_type, sender_id (nullable; profile id quando agent), message_type, content (text), media_url, media_mime, is_read, read_at, external_id (id da Evolution/Meta para dedupe — UNIQUE parcial com integration_id), reply_to_id, metadata jsonb. Index em (`conversation_id`,`created_at desc`).
- **`omni_message_attachments`** — message_id, url, mime, size, filename, thumbnail_url.
- **`omni_conversation_assignments`** — histórico: conversation_id, from_agent, to_agent, by_agent, reason, created_at.
- **`omni_conversation_tags`** — tag catálogo por unidade (nome, color).
- **`omni_typing_status`** — conversation_id, agent_id, started_at (ttl 10s via realtime — heartbeat).
- **`omni_agent_status`** — profile_id, unit_id, presence, current_load (int), max_load, last_seen_at, socket_id.
- **`omni_automation_rules`** — name, trigger, channel, conditions jsonb, actions jsonb (send_message, assign_queue, add_tag, move_pipeline, create_lead), priority, active.
- **`omni_automation_runs`** — rule_id, conversation_id, status, result jsonb (log de execução).
- **`omni_ai_prompts`** — name, system_prompt, model, temperature, tools jsonb, active.
- **`omni_ai_contexts`** — conversation_id, summary, memory jsonb, last_compacted_at.
- **`omni_ai_sessions`** — conversation_id, prompt_id, status (`bot|handoff_requested|handoff_done`), started_at, ended_at, tokens_in, tokens_out, cost.
- **`omni_ai_training`** — unit_id, source (manual/conversation), content, embedding_status (preparado p/ futuro pgvector).

**RLS** (todas tabelas): SUPER_ADMIN bypass; ADMIN_MASTER vê tudo do `company_id`; ADMIN_UNIDADE vê tudo do `unit_id`; agentes (RESPONSAVEL não — apenas Colaboradores/Admins) veem conversas atribuídas a eles ou sem atribuição na sua unidade. Helpers: reaproveita `has_role`, `get_user_company_id`, `get_user_unit_id`.

**Triggers**:
- `omni_messages` after insert → atualiza `last_message_preview/last_message_at/unread_count` da conversa; chama executor de automações via `pg_notify`.
- `omni_conversations` update assigned_to → grava `omni_conversation_assignments`.
- `omni_integrations` update status → log em `omni_integration_logs`.

**Realtime**: `ALTER PUBLICATION supabase_realtime ADD TABLE` em `omni_messages`, `omni_conversations`, `omni_typing_status`, `omni_agent_status`, `omni_integrations`.

**Seeds**: 4 filas padrão (`Comercial`, `Financeiro`, `Pedagógico`, `Suporte`) inseridas por trigger ao criar `unit` (ou backfill na migration).

---

## 2. Edge Functions (estrutura real, prontas p/ APIs)

Criadas em `supabase/functions/`:

- **`omni-evolution-webhook`** (`verify_jwt=false`) — recebe eventos da Evolution API: `messages.upsert`, `messages.update`, `connection.update`, `qrcode.updated`. Valida `webhook_secret` via header. Cria/atualiza contato + conversa + mensagem. Loga tudo em `omni_integration_logs`. Idempotente via `external_id`.
- **`omni-meta-webhook`** (`verify_jwt=false`) — handler Meta Cloud (WhatsApp + Instagram): GET para `hub.challenge`, POST para eventos. Valida `x-hub-signature-256` (HMAC-SHA256 com `app_secret`).
- **`omni-landing-webhook`** (`verify_jwt=false`) — recebe leads de landing pages com `x-uplay-key` por integração.
- **`omni-send-message`** — autenticado, roteia outbound conforme `integration.provider` (Evolution/Meta). Cria mensagem local imediatamente (status `pending`), faz a chamada externa, atualiza `external_id`/erro.
- **`omni-integration-test`** — autenticado, faz ping no provider configurado (Evolution `/instance/connectionState`, Meta `/me`). Retorna status + latência.
- **`omni-integration-qr`** — autenticado, chama Evolution `/instance/connect` e retorna QR; atualiza `qr_code` e `status='qr_pending'`.
- **`omni-automation-runner`** — invocada via `pg_net` no trigger de nova mensagem; avalia regras ativas e executa ações.
- **`omni-ai-reply`** — preparado para IA: usa `LOVABLE_API_KEY` (Lovable AI Gateway, modelo padrão `google/gemini-2.5-flash`); recebe `conversation_id`, monta contexto (últimas N mensagens + `omni_ai_contexts.memory`), gera resposta, registra `omni_ai_sessions`. Suporta handoff humano quando confidence < threshold.

Config `supabase/config.toml`: adicionar `verify_jwt = false` para os 3 webhooks.

Endpoints públicos (Supabase Functions URL) ficam disponíveis para colar no Evolution/Meta:
- `/functions/v1/omni-evolution-webhook`
- `/functions/v1/omni-meta-webhook`
- `/functions/v1/omni-landing-webhook`

---

## 3. Frontend — UI Dark Profissional

Estrutura modular em `src/pages/admin/omni/` + `src/components/omni/` + `src/hooks/omni/`.

### Páginas (rotas em `AdminLayout`)
- `/admin/omni` — **Inbox** (layout 3 colunas: lista conversas | thread | painel contato).
- `/admin/omni/contatos` — CRUD de contatos unificados.
- `/admin/omni/automacoes` — listagem + editor de regras (sem fluxo visual; form estruturado com triggers/condições/ações).
- `/admin/omni/integracoes` — cards por canal (WhatsApp Evolution, WhatsApp Meta, Instagram, Landing). Modal QR Code, teste de conexão, logs recentes.
- `/admin/omni/dashboard` — KPIs (mensagens hoje, tempo médio resposta, atendentes online, conversões, leads por canal, mensagens por unidade, fila de espera).
- `/admin/omni/logs` — tabela paginada `omni_integration_logs` com filtros.
- `/admin/omni/ia` — config de prompts, modelos, limites (preparada — UI funcional mesmo sem execução real ativada).

### Componentes-chave
- `ConversationList` — virtualizada, filtros (unidade/canal/atendente/status/fila), busca, ordenação por `last_message_at`, badge unread.
- `ConversationThread` — scroll reverso, paginação infinita por `created_at`, render por `message_type` (texto/imagem/áudio com player/vídeo/documento/system), agrupamento por dia, indicador “digitando…”, status de leitura.
- `MessageComposer` — textarea, anexos (upload p/ bucket `omni-media`), emoji picker (componente leve), gravação de áudio (MediaRecorder API), envio via `omni-send-message`.
- `ContactPanel` — info do contato, tags, histórico, atribuir atendente/fila, alterar status/prioridade.
- `QrConnectModal` — polling do status da integração, timer de sessão, retry.
- `AgentPresenceIndicator` — usa `omni_agent_status`.
- `TypingIndicator` — heartbeat de 3s em `omni_typing_status`.

### Hooks
- `useOmniRealtime(conversationId)` — subscribe em `omni_messages` filtrado.
- `useOmniInbox(filters)` — react-query + realtime patch da lista.
- `useAgentPresence()` — heartbeat de 20s; marca offline em `beforeunload`.
- `useTypingBroadcast(conversationId)`.
- `useOmniIntegrationStatus(integrationId)`.

### Storage
- Bucket `omni-media` (privado) com RLS: agentes da unidade podem upload/download; contatos não acessam diretamente (URLs assinadas).

### Design tokens
- Mantém dark atual. Adiciona em `index.css`:
  - `--omni-glow`, `--omni-bubble-in`, `--omni-bubble-out`, gradients sutis para header da conversa.
  - Animações: `pulse-online`, `fade-in-message`, skeleton shimmer para lista.

---

## 4. Sistema de Atribuição e Filas

- Atribuição manual: dropdown no `ContactPanel`.
- Atribuição automática (via automation `actions.assign_queue` + estratégia `round_robin` ou `least_loaded` baseado em `omni_agent_status.current_load`).
- Transferência: cria registro em `omni_conversation_assignments` (histórico auditável).
- Limite por agente: `omni_agent_status.max_load` respeitado pelo runner.
- Filas: select em cada conversa, prioridade 1-5 com indicador visual.

---

## 5. Logs e Observabilidade

- Tela `/admin/omni/logs` com filtros (integração, status, evento, data), payload colapsável (JSON viewer).
- Cada chamada outbound/inbound registra entrada — base para debug de Evolution/Meta.
- Health badges nas integrações: `last_event_at < 5min ✅`, `< 1h ⚠️`, `> 1h ❌`.

---

## 6. Preparação para IA (sem ativar)

- Tabelas criadas (`omni_ai_prompts`, `omni_ai_contexts`, `omni_ai_sessions`, `omni_ai_training`).
- Edge `omni-ai-reply` deployada mas só dispara se houver `omni_ai_prompts.active` + integração com flag `ai_enabled` (campo em `omni_integrations`).
- UI em `/admin/omni/ia` permite criar prompts, definir modelo (lista de modelos Lovable AI), temperatura, ferramentas (handoff_human, create_lead, schedule_visit), limite de tokens/dia.

---

## 7. Segurança e Isolamento

- 100% RLS por `unit_id`/`company_id`.
- Credenciais de integração (API keys Evolution, tokens Meta) salvas em `omni_integrations.credentials` jsonb — leitura restrita via função `get_omni_integration_secrets(_id)` (SECURITY DEFINER, mesma lógica de `get_unit_secrets`).
- Webhooks validam assinatura/secret.
- GRANTs explícitos por tabela conforme padrão do projeto.

---

## 8. O que NÃO entra agora

- Conexão real Evolution/Meta (apenas estrutura + UI para colar credenciais).
- Pipeline visual de automações (form simples agora; editor visual depois).
- Execução real da IA em produção (deployada mas desligada por flag).
- Templates HSM Meta / catálogo de mensagens (próxima fase).

---

## 9. Ordem de Implementação

1. Migration única com enums, tabelas, índices, GRANTs, RLS, triggers, realtime publication, seeds de filas.
2. Bucket `omni-media` + policies.
3. Edge functions (7 funções) + config.toml.
4. Hooks + tipos compartilhados.
5. Inbox (lista + thread + composer) — núcleo.
6. Integrações + QR modal + teste de conexão.
7. Contatos, Filas, Atribuição.
8. Automações (CRUD + runner).
9. Dashboard + Logs.
10. IA (UI + função preparada).
11. Item de menu no `AdminLayout` + rotas em `App.tsx`.
12. Smoke test: criar integração, simular webhook via curl no `omni-evolution-webhook`, ver mensagem aparecer em tempo real no Inbox.

---

## 10. Validação Final

- `supabase--linter` sem novos warnings críticos.
- Build limpo.
- Curl no webhook gera conversa + mensagem visível em realtime.
- Envio via composer cria registro local e tenta outbound (com erro esperado até a API real ser plugada — log correto).

Posso prosseguir com a implementação?
