DROP POLICY IF EXISTS "Anyone can request a demo" ON public.demo_leads;
CREATE POLICY "Anyone can request a demo" ON public.demo_leads FOR INSERT TO anon, authenticated
WITH CHECK (
  length(btrim(coalesce(name,''))) BETWEEN 1 AND 200
  AND (phone IS NULL OR length(phone) <= 40)
  AND (email IS NULL OR length(email) <= 320)
  AND (seat IS NULL OR length(seat) <= 200)
  AND (county IS NULL OR length(county) <= 100)
  AND (phone IS NOT NULL OR email IS NOT NULL)
);
DROP POLICY IF EXISTS "accounts are public facts" ON public.listening_accounts;
CREATE POLICY "team members read accounts" ON public.listening_accounts FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid()) OR public.is_super_admin(auth.uid()));