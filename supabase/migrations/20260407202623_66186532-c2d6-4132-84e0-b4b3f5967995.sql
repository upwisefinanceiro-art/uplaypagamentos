
-- Create saas_plans table
CREATE TABLE public.saas_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_plano text NOT NULL,
  descricao text,
  valor_base numeric NOT NULL DEFAULT 97,
  duracao_meses integer NOT NULL DEFAULT 1,
  desconto_percentual numeric NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin full access to saas_plans"
  ON public.saas_plans FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'SUPER_ADMIN'))
  WITH CHECK (public.has_role(auth.uid(), 'SUPER_ADMIN'));

CREATE POLICY "Admin Master can view active plans"
  ON public.saas_plans FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN_MASTER') AND ativo = true);

-- Insert default plans
INSERT INTO public.saas_plans (nome_plano, descricao, valor_base, duracao_meses, desconto_percentual) VALUES
  ('Mensal', 'Plano mensal sem desconto', 97, 1, 0),
  ('Trimestral', 'Plano trimestral com 5% de desconto', 97, 3, 5),
  ('Anual', 'Plano anual com 15% de desconto', 97, 12, 15);

-- Add trial and plan_id fields to saas_subscriptions
ALTER TABLE public.saas_subscriptions
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.saas_plans(id),
  ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_ends_at date;
