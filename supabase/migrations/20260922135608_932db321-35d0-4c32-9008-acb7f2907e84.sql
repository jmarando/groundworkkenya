CREATE TABLE public.demo_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  seat TEXT,
  county TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT INSERT ON public.demo_leads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demo_leads TO authenticated;
GRANT ALL ON public.demo_leads TO service_role;

ALTER TABLE public.demo_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can request a demo" ON public.demo_leads FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Team can read demo leads" ON public.demo_leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can update demo leads" ON public.demo_leads FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Admins and managers can delete demo leads" ON public.demo_leads FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));