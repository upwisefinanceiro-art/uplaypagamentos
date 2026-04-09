
-- Fix: Add restrictive INSERT policy on profiles
-- Only allow inserting a profile where id matches the authenticated user
-- The handle_new_user trigger uses SECURITY DEFINER so it bypasses RLS
CREATE POLICY "Users can only insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());
