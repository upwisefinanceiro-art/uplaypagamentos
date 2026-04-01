-- Allow RESPONSAVEL users to view their own unit
CREATE POLICY "Responsavel can view own unit"
ON public.units
FOR SELECT
TO authenticated
USING (
  id = get_user_unit_id(auth.uid())
);