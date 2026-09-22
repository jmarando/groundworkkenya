-- 1. social accounts
CREATE TABLE public.social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  handle text NOT NULL,
  display_name text,
  external_id text,
  status text NOT NULL DEFAULT 'pending',
  live boolean NOT NULL DEFAULT false,
  note text,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_accounts TO authenticated;
GRANT ALL ON public.social_accounts TO service_role;

ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "social accounts readable by team" ON public.social_accounts
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "social accounts managed by staff" ON public.social_accounts
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER social_accounts_touch BEFORE UPDATE ON public.social_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. conversations: social metadata + sentiment
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'sms',
  ADD COLUMN IF NOT EXISTS external_thread_id text,
  ADD COLUMN IF NOT EXISTS author_handle text,
  ADD COLUMN IF NOT EXISTS author_name text,
  ADD COLUMN IF NOT EXISTS sentiment text,
  ADD COLUMN IF NOT EXISTS sentiment_score numeric,
  ADD COLUMN IF NOT EXISTS issue text;

UPDATE public.conversations SET platform = channel WHERE platform = 'sms';

-- 3. messages: social metadata + sentiment
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'sms',
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'dm',
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS permalink text,
  ADD COLUMN IF NOT EXISTS author_handle text,
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sentiment text,
  ADD COLUMN IF NOT EXISTS sentiment_score numeric,
  ADD COLUMN IF NOT EXISTS issue text;

UPDATE public.messages SET platform = channel WHERE platform = 'sms' AND channel <> 'sms';

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS messages_platform_idx ON public.messages(platform);
CREATE UNIQUE INDEX IF NOT EXISTS messages_external_uniq ON public.messages(platform, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_thread_uniq ON public.conversations(platform, external_thread_id) WHERE external_thread_id IS NOT NULL;

-- 4. seed connected accounts
INSERT INTO public.social_accounts (platform, handle, display_name, status, live, note) VALUES
  ('facebook', 'groundworkcampaign', 'Campaign Page', 'pending', false, 'Page comments, mentions and Messenger DMs via the Meta app.'),
  ('instagram', 'groundworkcampaign', 'Campaign IG', 'pending', false, 'Professional account linked to the Facebook page.'),
  ('x', 'groundworkke', 'Campaign on X', 'pending', false, 'Mentions and DMs. Needs a paid API tier.'),
  ('whatsapp', '+254700000000', 'WhatsApp Business', 'pending', false, 'Business number on the WhatsApp Cloud API.');

-- 5. seed inbound social traffic tied to real people
WITH picks AS (
  SELECT p.id, p.full_name, p.ward_id, row_number() OVER (ORDER BY p.last_contacted_at DESC NULLS LAST) AS rn
  FROM public.people p
  WHERE p.opted_out = false
  LIMIT 40
),
spec AS (
  SELECT * FROM (VALUES
    (1,'facebook','dm','Hii barabara ya kwetu imeharibika kabisa, mvua ikinyesha hatuwezi kupita. Tafadhali tusaidie.','negative','roads'),
    (2,'facebook','comment','Nimeona mmeanza kazi ya taa za barabarani. Asanteni sana, tunaona mabadiliko.','positive','street lighting'),
    (3,'facebook','dm','My son finished form four last year and still has no bursary. What is the plan?','negative','bursaries'),
    (4,'instagram','dm','Naomba kujua siku ya rally hapa kwetu. Tuko tayari kuja wengi.','positive','rally'),
    (5,'instagram','comment','Maji hakuna kwa wiki mbili sasa. Mnaongea tu hamfanyi kitu.','negative','water'),
    (6,'instagram','comment','Good work on the health centre. Ile clinic sasa inafanya kazi vizuri.','positive','health centre'),
    (7,'x','mention','@groundworkke garbage has not been collected in our estate for a month. Do something.','negative','rubbish collection'),
    (8,'x','mention','@groundworkke finally a candidate who shows up. Respect.','positive','general'),
    (9,'x','dm','Can I volunteer as a youth organiser in my ward? Where do I sign up?','positive','volunteering'),
    (10,'whatsapp','dm','Boda riders wa hapa tunaomba mkutano na mgombea. Tuna maswali kuhusu security.','neutral','security'),
    (11,'whatsapp','dm','Nimepokea ujumbe wenu. Nitakuja kupiga kura, mko na support yetu.','positive','general'),
    (12,'whatsapp','dm','Jobs for the youth ndio kitu muhimu. Mkitusaidia hapo tutawaunga mkono.','neutral','jobs'),
    (13,'facebook','comment','Mnaahidi mengi kila uchaguzi halafu mnapotea. Tumechoka.','negative','trust'),
    (14,'instagram','dm','Where can I find the manifesto? I want to read it before deciding.','neutral','manifesto'),
    (15,'x','mention','@groundworkke the market traders were promised sheds. Still waiting.','negative','market'),
    (16,'whatsapp','dm','Tunashukuru kwa bursary ya mwanangu. Mungu awabariki.','positive','bursaries'),
    (17,'facebook','dm','Kuna wazee hapa hawajapata registration. Mnaweza kuleta team?','neutral','voter registration'),
    (18,'instagram','comment','Ile video ya juzi ilikuwa poa sana. Share more.','positive','general'),
    (19,'x','mention','@groundworkke insecurity at night is getting worse in our ward.','negative','security'),
    (20,'whatsapp','dm','Landlords wa hapa wanataka kujua msimamo wenu kuhusu rent na levies.','neutral','landlords')
  ) AS t(rn, platform, kind, body, sentiment, issue)
),
joined AS (
  SELECT p.id AS person_id, p.full_name, p.ward_id, s.platform, s.kind, s.body, s.sentiment, s.issue, s.rn
  FROM spec s JOIN picks p ON p.rn = s.rn
),
convo AS (
  INSERT INTO public.conversations
    (person_id, channel, platform, subject, snippet, status, tags, unread, last_message_at,
     external_thread_id, author_handle, author_name, sentiment, sentiment_score, issue)
  SELECT person_id,
         platform,
         platform,
         initcap(issue),
         body,
         CASE WHEN sentiment = 'negative' THEN 'open' ELSE 'open' END,
         ARRAY[issue],
         true,
         now() - (rn || ' hours')::interval,
         platform || '-thread-' || rn,
         '@' || lower(replace(coalesce(full_name, 'supporter'), ' ', '')),
         full_name,
         sentiment,
         CASE sentiment WHEN 'positive' THEN 0.8 WHEN 'negative' THEN -0.7 ELSE 0.05 END,
         issue
  FROM joined
  RETURNING id, person_id, platform, snippet, sentiment, sentiment_score, issue, last_message_at, author_handle
)
INSERT INTO public.messages
  (person_id, conversation_id, channel, platform, kind, direction, body, status,
   external_id, author_handle, sentiment, sentiment_score, issue, created_at, sent_at)
SELECT c.person_id, c.id, c.platform, c.platform,
       CASE WHEN c.platform = 'x' THEN 'mention' ELSE 'dm' END,
       'in', c.snippet, 'received',
       c.platform || '-msg-' || c.id::text, c.author_handle,
       c.sentiment, c.sentiment_score, c.issue, c.last_message_at, c.last_message_at
FROM convo c;