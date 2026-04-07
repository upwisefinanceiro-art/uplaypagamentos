
-- Add address fields to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS estado text,
  ADD COLUMN IF NOT EXISTS cep text;

-- Add SaaS billing config fields
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS asaas_api_key_master text,
  ADD COLUMN IF NOT EXISTS asaas_base_url_master text DEFAULT 'https://api.asaas.com/v3',
  ADD COLUMN IF NOT EXISTS asaas_webhook_token_master text,
  ADD COLUMN IF NOT EXISTS valor_mensalidade numeric DEFAULT 97.00,
  ADD COLUMN IF NOT EXISTS dias_bloqueio integer DEFAULT 10;

-- Create storage bucket for company logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access for logos
CREATE POLICY "Public can view company logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-logos');

-- Admin Master can upload logos for their company
CREATE POLICY "Admin Master can upload company logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
);

-- Admin Master can update their logos
CREATE POLICY "Admin Master can update company logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
);

-- Admin Master can delete their logos
CREATE POLICY "Admin Master can delete company logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND has_role(auth.uid(), 'ADMIN_MASTER'::app_role)
);

-- Super Admin full access to logos
CREATE POLICY "Super Admin full access to company logos"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND has_role(auth.uid(), 'SUPER_ADMIN'::app_role)
)
WITH CHECK (
  bucket_id = 'company-logos'
  AND has_role(auth.uid(), 'SUPER_ADMIN'::app_role)
);
