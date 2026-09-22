
create table public.listening_topics (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  query text not null,
  keywords text[] not null default '{}',
  exclude_terms text[] not null default '{}',
  kind text not null default 'campaign',
  active boolean not null default true,
  last_scanned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listening_mentions (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.listening_topics(id) on delete set null,
  source text not null default 'web',
  domain text,
  title text,
  url text not null,
  snippet text,
  author text,
  published_at timestamptz,
  found_at timestamptz not null default now(),
  sentiment text,
  sentiment_score numeric,
  issue text,
  ward text,
  reach integer,
  status text not null default 'new',
  created_at timestamptz not null default now()
);
create unique index listening_mentions_url_key on public.listening_mentions (url);
create index listening_mentions_found_idx on public.listening_mentions (found_at desc);
create index listening_mentions_topic_idx on public.listening_mentions (topic_id);

create table public.listening_alerts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  topic_id uuid references public.listening_topics(id) on delete cascade,
  keywords text[] not null default '{}',
  sentiments text[] not null default '{negative}',
  channel text not null default 'email',
  destination text not null,
  min_matches integer not null default 1,
  frequency text not null default 'instant',
  active boolean not null default true,
  last_fired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listening_alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid references public.listening_alerts(id) on delete cascade,
  mention_id uuid references public.listening_mentions(id) on delete set null,
  channel text not null,
  destination text not null,
  subject text,
  body text,
  status text not null default 'staged',
  detail text,
  created_at timestamptz not null default now()
);
create index listening_alert_events_created_idx on public.listening_alert_events (created_at desc);

create table public.listening_jobs (
  key text primary key,
  locked_until timestamptz,
  last_run_at timestamptz,
  status text not null default 'idle',
  paused_reason text,
  detail text,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.listening_topics to authenticated;
grant select, insert, update, delete on public.listening_mentions to authenticated;
grant select, insert, update, delete on public.listening_alerts to authenticated;
grant select, insert, update, delete on public.listening_alert_events to authenticated;
grant select on public.listening_jobs to authenticated;
grant all on public.listening_topics to service_role;
grant all on public.listening_mentions to service_role;
grant all on public.listening_alerts to service_role;
grant all on public.listening_alert_events to service_role;
grant all on public.listening_jobs to service_role;

alter table public.listening_topics enable row level security;
alter table public.listening_mentions enable row level security;
alter table public.listening_alerts enable row level security;
alter table public.listening_alert_events enable row level security;
alter table public.listening_jobs enable row level security;

create policy "topics readable by team" on public.listening_topics for select to authenticated using (public.is_team_member(auth.uid()));
create policy "topics managed by staff" on public.listening_topics for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy "mentions readable by team" on public.listening_mentions for select to authenticated using (public.is_team_member(auth.uid()));
create policy "mentions managed by staff" on public.listening_mentions for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy "alerts readable by team" on public.listening_alerts for select to authenticated using (public.is_team_member(auth.uid()));
create policy "alerts managed by staff" on public.listening_alerts for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy "alert events readable by team" on public.listening_alert_events for select to authenticated using (public.is_team_member(auth.uid()));
create policy "alert events managed by staff" on public.listening_alert_events for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy "jobs readable by team" on public.listening_jobs for select to authenticated using (public.is_team_member(auth.uid()));

create trigger listening_topics_touch before update on public.listening_topics for each row execute function public.touch_updated_at();
create trigger listening_alerts_touch before update on public.listening_alerts for each row execute function public.touch_updated_at();

insert into public.listening_jobs (key, status) values ('listening_scan', 'idle');

insert into public.listening_topics (label, query, keywords, kind) values
  ('Our candidate', 'Sakaja Nairobi governor', array['sakaja','governor nairobi'], 'campaign'),
  ('Nairobi County government', 'Nairobi County government news', array['nairobi county','city hall'], 'campaign'),
  ('Water and sanitation', 'Nairobi water shortage county', array['water','sewer','sanitation'], 'issue'),
  ('Garbage and cleanliness', 'Nairobi garbage collection county', array['garbage','rubbish','dumpsite'], 'issue'),
  ('Rivals and challengers', 'Nairobi governor race 2027 candidates', array['2027','governor race'], 'rival'),
  ('Bursaries and youth', 'Nairobi bursary youth jobs county', array['bursary','youth','jobs'], 'issue');

insert into public.listening_alerts (name, keywords, sentiments, channel, destination, min_matches, frequency)
select 'Angry mentions of the candidate', array['sakaja'], array['negative'], 'email', 'justin@glab.africa', 1, 'instant';
insert into public.listening_alerts (name, keywords, sentiments, channel, destination, min_matches, frequency)
select 'Water crisis coverage', array['water'], array['negative','neutral'], 'whatsapp', '+254700000000', 1, 'daily';
