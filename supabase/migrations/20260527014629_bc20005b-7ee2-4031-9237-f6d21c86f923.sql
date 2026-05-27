
-- =====================================================
-- OMNICHANNEL MODULE — Full schema
-- =====================================================

-- ENUMS
DO $$ BEGIN
  CREATE TYPE public.omni_channel AS ENUM ('WHATSAPP','INSTAGRAM','LANDING_PAGE','EMAIL','WEBCHAT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.omni_conversation_status AS ENUM ('open','pending','closed','bot','waiting');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.omni_sender_type AS ENUM ('contact','agent','bot','system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.omni_message_type AS ENUM ('text','image','audio','video','document','system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.omni_agent_presence AS ENUM ('online','offline','away','reconnecting');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.omni_integration_provider AS ENUM ('EVOLUTION_API','META_WHATSAPP_CLOUD','META_INSTAGRAM','LANDING_FORM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.omni_integration_status AS ENUM ('connected','disconnected','qr_pending','error','connecting');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.omni_automation_trigger AS ENUM ('message_received','conversation_opened','keyword_match','no_reply_timeout','tag_added');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================
-- HELPER: who can access the omni module (admins only, not RESPONSAVEL)
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_omni_agent(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id,'SUPER_ADMIN'::app_role)
      OR public.has_role(_user_id,'ADMIN_MASTER'::app_role)
      OR public.has_role(_user_id,'ADMIN_UNIDADE'::app_role)
      OR public.has_role(_user_id,'PROFESSOR'::app_role);
$$;

-- =====================================================
-- 1. omni_contacts
-- =====================================================
CREATE TABLE IF NOT EXISTS public.omni_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  full_name text NOT NULL,
  phone_e164 text,
  instagram_handle text,
  email text,
  avatar_url text,
  tags text[] DEFAULT '{}'::text[],
  origin public.omni_channel,
  notes text,
  profile_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS omni_contacts_unit_phone_uniq ON public.omni_contacts(unit_id, phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS omni_contacts_unit_ig_uniq ON public.omni_contacts(unit_id, instagram_handle) WHERE instagram_handle IS NOT NULL;
CREATE INDEX IF NOT EXISTS omni_contacts_unit_idx ON public.omni_contacts(unit_id);
CREATE INDEX IF NOT EXISTS omni_contacts_company_idx ON public.omni_contacts(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_contacts TO authenticated;
GRANT ALL ON public.omni_contacts TO service_role;
ALTER TABLE public.omni_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY omni_contacts_select ON public.omni_contacts FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (is_omni_agent(auth.uid()) AND unit_id = get_user_unit_id(auth.uid()))
);
CREATE POLICY omni_contacts_write ON public.omni_contacts FOR ALL TO authenticated USING (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (is_omni_agent(auth.uid()) AND unit_id = get_user_unit_id(auth.uid()))
) WITH CHECK (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (is_omni_agent(auth.uid()) AND unit_id = get_user_unit_id(auth.uid()))
);

-- =====================================================
-- 2. omni_integrations
-- =====================================================
CREATE TABLE IF NOT EXISTS public.omni_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  provider public.omni_integration_provider NOT NULL,
  channel public.omni_channel NOT NULL,
  display_name text NOT NULL,
  status public.omni_integration_status NOT NULL DEFAULT 'disconnected',
  credentials jsonb DEFAULT '{}'::jsonb,
  webhook_secret text DEFAULT encode(gen_random_bytes(24),'hex'),
  qr_code text,
  session_started_at timestamptz,
  last_sync_at timestamptz,
  last_event_at timestamptz,
  error_message text,
  ai_enabled boolean DEFAULT false,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS omni_integrations_unit_idx ON public.omni_integrations(unit_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_integrations TO authenticated;
GRANT ALL ON public.omni_integrations TO service_role;
ALTER TABLE public.omni_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY omni_integrations_select ON public.omni_integrations FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (has_role(auth.uid(),'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()))
);
CREATE POLICY omni_integrations_write ON public.omni_integrations FOR ALL TO authenticated USING (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (has_role(auth.uid(),'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()))
) WITH CHECK (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (has_role(auth.uid(),'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()))
);

-- =====================================================
-- 3. omni_integration_logs
-- =====================================================
CREATE TABLE IF NOT EXISTS public.omni_integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid REFERENCES public.omni_integrations(id) ON DELETE CASCADE,
  company_id uuid,
  unit_id uuid,
  event text NOT NULL,
  direction text CHECK (direction IN ('inbound','outbound','internal')),
  payload jsonb,
  response jsonb,
  http_status int,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS omni_integration_logs_int_idx ON public.omni_integration_logs(integration_id, created_at DESC);
CREATE INDEX IF NOT EXISTS omni_integration_logs_unit_idx ON public.omni_integration_logs(unit_id, created_at DESC);

GRANT SELECT, INSERT ON public.omni_integration_logs TO authenticated;
GRANT ALL ON public.omni_integration_logs TO service_role;
ALTER TABLE public.omni_integration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY omni_logs_select ON public.omni_integration_logs FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (has_role(auth.uid(),'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()))
);

-- =====================================================
-- 4. omni_queues
-- =====================================================
CREATE TABLE IF NOT EXISTS public.omni_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#6366f1',
  max_concurrent_per_agent int DEFAULT 10,
  active boolean DEFAULT true,
  position int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS omni_queues_unit_name_uniq ON public.omni_queues(unit_id, lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_queues TO authenticated;
GRANT ALL ON public.omni_queues TO service_role;
ALTER TABLE public.omni_queues ENABLE ROW LEVEL SECURITY;

CREATE POLICY omni_queues_select ON public.omni_queues FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (is_omni_agent(auth.uid()) AND unit_id = get_user_unit_id(auth.uid()))
);
CREATE POLICY omni_queues_write ON public.omni_queues FOR ALL TO authenticated USING (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (has_role(auth.uid(),'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()))
) WITH CHECK (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (has_role(auth.uid(),'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()))
);

-- =====================================================
-- 5. omni_conversations
-- =====================================================
CREATE TABLE IF NOT EXISTS public.omni_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  channel public.omni_channel NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.omni_contacts(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.omni_integrations(id) ON DELETE SET NULL,
  queue_id uuid REFERENCES public.omni_queues(id) ON DELETE SET NULL,
  assigned_to uuid,
  status public.omni_conversation_status NOT NULL DEFAULT 'open',
  priority int DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  last_message_preview text,
  last_message_at timestamptz,
  unread_count int NOT NULL DEFAULT 0,
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  closed_by uuid,
  tags text[] DEFAULT '{}'::text[],
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS omni_conv_unit_status_last ON public.omni_conversations(unit_id, status, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS omni_conv_assigned ON public.omni_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS omni_conv_contact ON public.omni_conversations(contact_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_conversations TO authenticated;
GRANT ALL ON public.omni_conversations TO service_role;
ALTER TABLE public.omni_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY omni_conv_select ON public.omni_conversations FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (is_omni_agent(auth.uid()) AND unit_id = get_user_unit_id(auth.uid()))
);
CREATE POLICY omni_conv_write ON public.omni_conversations FOR ALL TO authenticated USING (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (is_omni_agent(auth.uid()) AND unit_id = get_user_unit_id(auth.uid()))
) WITH CHECK (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (is_omni_agent(auth.uid()) AND unit_id = get_user_unit_id(auth.uid()))
);

-- =====================================================
-- 6. omni_messages
-- =====================================================
CREATE TABLE IF NOT EXISTS public.omni_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.omni_conversations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  integration_id uuid,
  sender_type public.omni_sender_type NOT NULL,
  sender_id uuid,
  message_type public.omni_message_type NOT NULL DEFAULT 'text',
  content text,
  media_url text,
  media_mime text,
  external_id text,
  reply_to_id uuid REFERENCES public.omni_messages(id) ON DELETE SET NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  delivery_status text DEFAULT 'sent',
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS omni_msg_conv_created ON public.omni_messages(conversation_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS omni_msg_external_uniq ON public.omni_messages(integration_id, external_id) WHERE external_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_messages TO authenticated;
GRANT ALL ON public.omni_messages TO service_role;
ALTER TABLE public.omni_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY omni_msg_select ON public.omni_messages FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (is_omni_agent(auth.uid()) AND unit_id = get_user_unit_id(auth.uid()))
);
CREATE POLICY omni_msg_write ON public.omni_messages FOR ALL TO authenticated USING (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (is_omni_agent(auth.uid()) AND unit_id = get_user_unit_id(auth.uid()))
) WITH CHECK (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (is_omni_agent(auth.uid()) AND unit_id = get_user_unit_id(auth.uid()))
);

-- =====================================================
-- 7. omni_message_attachments
-- =====================================================
CREATE TABLE IF NOT EXISTS public.omni_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.omni_messages(id) ON DELETE CASCADE,
  url text NOT NULL,
  mime text,
  size_bytes bigint,
  filename text,
  thumbnail_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS omni_att_msg_idx ON public.omni_message_attachments(message_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_message_attachments TO authenticated;
GRANT ALL ON public.omni_message_attachments TO service_role;
ALTER TABLE public.omni_message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY omni_att_all ON public.omni_message_attachments FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.omni_messages m
    WHERE m.id = message_id
      AND (
        has_role(auth.uid(),'SUPER_ADMIN'::app_role)
        OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND m.company_id = get_user_company_id(auth.uid()))
        OR (is_omni_agent(auth.uid()) AND m.unit_id = get_user_unit_id(auth.uid()))
      )
  )
) WITH CHECK (true);

-- =====================================================
-- 8. omni_conversation_assignments (history)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.omni_conversation_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.omni_conversations(id) ON DELETE CASCADE,
  company_id uuid,
  unit_id uuid,
  from_agent uuid,
  to_agent uuid,
  by_agent uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS omni_assign_conv_idx ON public.omni_conversation_assignments(conversation_id, created_at DESC);

GRANT SELECT, INSERT ON public.omni_conversation_assignments TO authenticated;
GRANT ALL ON public.omni_conversation_assignments TO service_role;
ALTER TABLE public.omni_conversation_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY omni_assign_select ON public.omni_conversation_assignments FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (is_omni_agent(auth.uid()) AND unit_id = get_user_unit_id(auth.uid()))
);

-- =====================================================
-- 9. omni_conversation_tags (catalog)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.omni_conversation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#64748b',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS omni_tags_unit_name_uniq ON public.omni_conversation_tags(unit_id, lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_conversation_tags TO authenticated;
GRANT ALL ON public.omni_conversation_tags TO service_role;
ALTER TABLE public.omni_conversation_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY omni_tags_all ON public.omni_conversation_tags FOR ALL TO authenticated USING (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (is_omni_agent(auth.uid()) AND unit_id = get_user_unit_id(auth.uid()))
) WITH CHECK (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (is_omni_agent(auth.uid()) AND unit_id = get_user_unit_id(auth.uid()))
);

-- =====================================================
-- 10. omni_typing_status
-- =====================================================
CREATE TABLE IF NOT EXISTS public.omni_typing_status (
  conversation_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  unit_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, agent_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_typing_status TO authenticated;
GRANT ALL ON public.omni_typing_status TO service_role;
ALTER TABLE public.omni_typing_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY omni_typing_all ON public.omni_typing_status FOR ALL TO authenticated USING (
  is_omni_agent(auth.uid())
) WITH CHECK (is_omni_agent(auth.uid()));

-- =====================================================
-- 11. omni_agent_status
-- =====================================================
CREATE TABLE IF NOT EXISTS public.omni_agent_status (
  profile_id uuid PRIMARY KEY,
  company_id uuid,
  unit_id uuid,
  presence public.omni_agent_presence NOT NULL DEFAULT 'offline',
  current_load int NOT NULL DEFAULT 0,
  max_load int NOT NULL DEFAULT 10,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_agent_status TO authenticated;
GRANT ALL ON public.omni_agent_status TO service_role;
ALTER TABLE public.omni_agent_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY omni_agent_select ON public.omni_agent_status FOR SELECT TO authenticated USING (
  is_omni_agent(auth.uid())
);
CREATE POLICY omni_agent_self_write ON public.omni_agent_status FOR ALL TO authenticated USING (
  profile_id = auth.uid()
) WITH CHECK (profile_id = auth.uid());

-- =====================================================
-- 12. omni_automation_rules + runs
-- =====================================================
CREATE TABLE IF NOT EXISTS public.omni_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  name text NOT NULL,
  trigger public.omni_automation_trigger NOT NULL,
  channel public.omni_channel,
  conditions jsonb DEFAULT '{}'::jsonb,
  actions jsonb DEFAULT '[]'::jsonb,
  priority int DEFAULT 100,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_automation_rules TO authenticated;
GRANT ALL ON public.omni_automation_rules TO service_role;
ALTER TABLE public.omni_automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY omni_auto_rules_all ON public.omni_automation_rules FOR ALL TO authenticated USING (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (has_role(auth.uid(),'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()))
) WITH CHECK (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
  OR (has_role(auth.uid(),'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()))
);

CREATE TABLE IF NOT EXISTS public.omni_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.omni_automation_rules(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.omni_conversations(id) ON DELETE CASCADE,
  unit_id uuid,
  status text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.omni_automation_runs TO authenticated;
GRANT ALL ON public.omni_automation_runs TO service_role;
ALTER TABLE public.omni_automation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY omni_auto_runs_select ON public.omni_automation_runs FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (is_omni_agent(auth.uid()) AND unit_id = get_user_unit_id(auth.uid()))
);

-- =====================================================
-- 13. AI tables
-- =====================================================
CREATE TABLE IF NOT EXISTS public.omni_ai_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  unit_id uuid,
  name text NOT NULL,
  system_prompt text NOT NULL,
  model text DEFAULT 'google/gemini-2.5-flash',
  temperature numeric DEFAULT 0.7,
  tools jsonb DEFAULT '[]'::jsonb,
  max_tokens int DEFAULT 1024,
  active boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_ai_prompts TO authenticated;
GRANT ALL ON public.omni_ai_prompts TO service_role;
ALTER TABLE public.omni_ai_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY omni_ai_prompts_all ON public.omni_ai_prompts FOR ALL TO authenticated USING (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
) WITH CHECK (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
);

CREATE TABLE IF NOT EXISTS public.omni_ai_contexts (
  conversation_id uuid PRIMARY KEY REFERENCES public.omni_conversations(id) ON DELETE CASCADE,
  summary text,
  memory jsonb DEFAULT '{}'::jsonb,
  last_compacted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_ai_contexts TO authenticated;
GRANT ALL ON public.omni_ai_contexts TO service_role;
ALTER TABLE public.omni_ai_contexts ENABLE ROW LEVEL SECURITY;
CREATE POLICY omni_ai_ctx_all ON public.omni_ai_contexts FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.omni_conversations c WHERE c.id = conversation_id
    AND (has_role(auth.uid(),'SUPER_ADMIN'::app_role)
      OR (is_omni_agent(auth.uid()) AND c.unit_id = get_user_unit_id(auth.uid()))))
) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.omni_ai_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.omni_conversations(id) ON DELETE CASCADE,
  prompt_id uuid REFERENCES public.omni_ai_prompts(id) ON DELETE SET NULL,
  unit_id uuid,
  status text DEFAULT 'bot',
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  tokens_in int DEFAULT 0,
  tokens_out int DEFAULT 0,
  cost numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.omni_ai_sessions TO authenticated;
GRANT ALL ON public.omni_ai_sessions TO service_role;
ALTER TABLE public.omni_ai_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY omni_ai_sessions_select ON public.omni_ai_sessions FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (is_omni_agent(auth.uid()) AND unit_id = get_user_unit_id(auth.uid()))
);

CREATE TABLE IF NOT EXISTS public.omni_ai_training (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  unit_id uuid,
  source text,
  content text NOT NULL,
  embedding_status text DEFAULT 'pending',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.omni_ai_training TO authenticated;
GRANT ALL ON public.omni_ai_training TO service_role;
ALTER TABLE public.omni_ai_training ENABLE ROW LEVEL SECURITY;
CREATE POLICY omni_ai_training_all ON public.omni_ai_training FOR ALL TO authenticated USING (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
) WITH CHECK (
  has_role(auth.uid(),'SUPER_ADMIN'::app_role)
  OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND company_id = get_user_company_id(auth.uid()))
);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- update_at touch
CREATE OR REPLACE FUNCTION public.omni_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_omni_contacts_upd BEFORE UPDATE ON public.omni_contacts FOR EACH ROW EXECUTE FUNCTION public.omni_touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_omni_integ_upd BEFORE UPDATE ON public.omni_integrations FOR EACH ROW EXECUTE FUNCTION public.omni_touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_omni_queues_upd BEFORE UPDATE ON public.omni_queues FOR EACH ROW EXECUTE FUNCTION public.omni_touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_omni_conv_upd BEFORE UPDATE ON public.omni_conversations FOR EACH ROW EXECUTE FUNCTION public.omni_touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_omni_auto_upd BEFORE UPDATE ON public.omni_automation_rules FOR EACH ROW EXECUTE FUNCTION public.omni_touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_omni_prompts_upd BEFORE UPDATE ON public.omni_ai_prompts FOR EACH ROW EXECUTE FUNCTION public.omni_touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- After new message: update conversation rollups
CREATE OR REPLACE FUNCTION public.omni_messages_after_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.omni_conversations c SET
    last_message_preview = LEFT(COALESCE(NEW.content, '['||NEW.message_type::text||']'), 200),
    last_message_at = NEW.created_at,
    unread_count = CASE WHEN NEW.sender_type = 'contact' THEN c.unread_count + 1 ELSE c.unread_count END,
    status = CASE WHEN c.status = 'closed' AND NEW.sender_type='contact' THEN 'open'::omni_conversation_status ELSE c.status END,
    updated_at = now()
  WHERE c.id = NEW.conversation_id;
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_omni_msg_after_ins AFTER INSERT ON public.omni_messages
  FOR EACH ROW EXECUTE FUNCTION public.omni_messages_after_insert();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Conversation assigned_to change → history
CREATE OR REPLACE FUNCTION public.omni_conv_assignment_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.assigned_to::text,'') IS DISTINCT FROM COALESCE(NEW.assigned_to::text,'') THEN
    INSERT INTO public.omni_conversation_assignments(conversation_id, company_id, unit_id, from_agent, to_agent, by_agent)
    VALUES (NEW.id, NEW.company_id, NEW.unit_id, OLD.assigned_to, NEW.assigned_to, auth.uid());
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_omni_conv_assign AFTER UPDATE ON public.omni_conversations
  FOR EACH ROW EXECUTE FUNCTION public.omni_conv_assignment_history();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed default queues for new units + backfill existing
CREATE OR REPLACE FUNCTION public.omni_seed_default_queues(_unit_id uuid, _company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.omni_queues(company_id, unit_id, name, color, position)
  VALUES
    (_company_id, _unit_id, 'Comercial',   '#10b981', 1),
    (_company_id, _unit_id, 'Financeiro',  '#f59e0b', 2),
    (_company_id, _unit_id, 'Pedagógico',  '#6366f1', 3),
    (_company_id, _unit_id, 'Suporte',     '#ef4444', 4)
  ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.omni_units_after_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.omni_seed_default_queues(NEW.id, NEW.company_id);
  RETURN NEW;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_omni_units_seed AFTER INSERT ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.omni_units_after_insert();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, company_id FROM public.units LOOP
    PERFORM public.omni_seed_default_queues(r.id, r.company_id);
  END LOOP;
END $$;

-- =====================================================
-- Secrets helper (like get_unit_secrets)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_omni_integration_secrets(_integration_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.omni_integrations WHERE id = _integration_id;
  IF v_row IS NULL THEN RAISE EXCEPTION 'Integration not found'; END IF;
  IF NOT (
    has_role(auth.uid(),'SUPER_ADMIN'::app_role)
    OR (has_role(auth.uid(),'ADMIN_MASTER'::app_role) AND v_row.company_id = get_user_company_id(auth.uid()))
    OR (has_role(auth.uid(),'ADMIN_UNIDADE'::app_role) AND v_row.unit_id = get_user_unit_id(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN v_row.credentials;
END $$;

-- =====================================================
-- REALTIME publication
-- =====================================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.omni_messages;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.omni_conversations;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.omni_typing_status;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.omni_agent_status;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.omni_integrations;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

ALTER TABLE public.omni_messages REPLICA IDENTITY FULL;
ALTER TABLE public.omni_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.omni_typing_status REPLICA IDENTITY FULL;
ALTER TABLE public.omni_agent_status REPLICA IDENTITY FULL;
ALTER TABLE public.omni_integrations REPLICA IDENTITY FULL;

-- =====================================================
-- STORAGE bucket: omni-media (private)
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('omni-media','omni-media', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "omni_media_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'omni-media' AND public.is_omni_agent(auth.uid()));

CREATE POLICY "omni_media_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'omni-media' AND public.is_omni_agent(auth.uid()));

CREATE POLICY "omni_media_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'omni-media' AND public.is_omni_agent(auth.uid()));

CREATE POLICY "omni_media_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'omni-media' AND public.is_omni_agent(auth.uid()));
