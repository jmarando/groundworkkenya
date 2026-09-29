-- Campaign websites: who reads and changes a campaign's site, publishing and
-- its history, and who may add photos. Run with tests/sql/run.sh; each test
-- rolls back.

\ir fixtures.sql

-- An organiser in Sakaja, beside the fixtures' candidate, manager and agent.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b7', 'organiser.sakaja@example.test');
insert into public.campaign_members (campaign_id, user_id, role)
values ('ca000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-0000000000b7', 'organiser');

-- test: the team reads its own site and nobody else does
begin;
insert into public.campaign_sites (campaign_id, draft, draft_rev)
values ('ca000000-0000-4000-8000-000000000002', '{"v": 1}', 1);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin assert (select count(*) from public.campaign_sites) = 1, 'an agent reads their site'; end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b7';
do $$ begin assert (select count(*) from public.campaign_sites) = 1, 'an organiser reads their site'; end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin assert (select count(*) from public.campaign_sites) = 0, 'Mathira reads Sakaja''s site'; end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
do $$ begin assert (select count(*) from public.campaign_sites) = 0, 'a pending account reads a site'; end $$;
reset role;
set local role anon;
do $$
begin
  perform count(*) from public.campaign_sites;
  assert false, 'anon reads a site';
exception when insufficient_privilege then null;
end $$;
rollback;

-- test: only the candidate or manager saves, and an older copy cannot overwrite a newer one
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b7';
do $$
begin
  assert pg_temp.fails_with($q$select public.save_site_draft('{"v": 1}', 0)$q$,
    'Only the candidate or campaign manager can change the website.');
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$
begin
  assert pg_temp.fails_with($q$select public.save_site_draft('{"v": 1}', 0)$q$,
    'Only the candidate or campaign manager can change the website.');
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
begin
  assert public.save_site_draft('{"v": 1, "a": 1}', 0) = 1, 'the first save creates the site';
  assert public.save_site_draft('{"v": 1, "a": 2}', 1) = 2;
  assert pg_temp.fails_with($q$select public.save_site_draft('{"v": 1, "a": 3}', 1)$q$,
    'Someone else changed the website while you were editing. Reload to see their changes.');
  assert (select draft->>'a' from public.campaign_sites) = '2', 'the stale save changed nothing';
  assert (select updated_by from public.campaign_sites) = '00000000-0000-0000-0000-0000000000a1';
  assert pg_temp.fails_with($q$select public.save_site_draft('[1, 2]', 2)$q$, 'Nothing to save.');
  assert pg_temp.fails_with(
    format('select public.save_site_draft(%L, 2)', jsonb_build_object('x', repeat('a', 300000))),
    'The website is too big to save.');
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin assert public.save_site_draft('{"v": 1, "a": 4}', 2) = 3, 'the manager saves too'; end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
do $$ begin assert public.save_site_draft('{"v": 1, "a": 5}', 3) = 4, 'the super admin saves the site they have open'; end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$
begin
  assert public.save_site_draft('{"v": 1, "m": 1}', 0) = 1, 'Mathira''s first save is its own site';
  assert (select count(*) from public.campaign_sites) = 1, 'and it sees only that one';
end $$;
reset role;
do $$ begin assert (select count(*) from public.campaign_sites) = 2; end $$;
rollback;

-- test: nobody writes the site table directly, so every publish is on record
begin;
insert into public.campaign_sites (campaign_id, draft, draft_rev)
values ('ca000000-0000-4000-8000-000000000002', '{"v": 1}', 1);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
begin
  begin
    update public.campaign_sites set published = '{"v": 1, "sneaky": true}';
    assert false, 'the candidate updated published directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.site_versions (campaign_id, content) values ('ca000000-0000-4000-8000-000000000002', '{}');
    assert false, 'the candidate wrote a version directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.campaign_sites;
    assert false, 'the candidate deleted the site';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- test: publishing copies the draft, keeps a version, and keeps only the newest 20
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare
  i integer;
  s public.campaign_sites;
begin
  assert pg_temp.fails_with('select public.publish_site()', 'Write something on the website before publishing it.');
  perform public.save_site_draft('{"v": 1, "n": 0}', 0);
  assert public.publish_site() is not null;
  select * into s from public.campaign_sites;
  assert s.published = '{"v": 1, "n": 0}' and s.published_by = '00000000-0000-0000-0000-0000000000a1';
  assert (select count(*) from public.site_versions) = 1;
  for i in 1..21 loop
    perform public.save_site_draft(jsonb_build_object('v', 1, 'n', i), i);
    perform public.publish_site();
  end loop;
  assert (select count(*) from public.site_versions) = 20, 'keeps 20';
  assert (select min((content->>'n')::int) from public.site_versions) = 2, 'drops the oldest';
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b7';
do $$
begin
  assert (select count(*) from public.site_versions) = 20, 'the team reads the history';
  assert pg_temp.fails_with('select public.publish_site()',
    'Only the candidate or campaign manager can change the website.');
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin assert (select count(*) from public.site_versions) = 0, 'Mathira reads Sakaja''s history'; end $$;
rollback;

-- test: restoring puts an old version back in the draft, from this campaign only
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$
begin
  perform public.save_site_draft('{"v": 1, "who": "mathira"}', 0);
  perform public.publish_site();
end $$;
reset role;
do $$
begin
  perform set_config('test.mathira_version', (select id::text from public.site_versions), true);
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare
  first_id uuid;
begin
  perform public.save_site_draft('{"v": 1, "n": "first"}', 0);
  perform public.publish_site();
  select id into first_id from public.site_versions;
  perform public.save_site_draft('{"v": 1, "n": "second"}', 1);
  perform public.publish_site();
  assert public.restore_site_version(first_id) = 3, 'restoring is a new revision of the draft';
  assert (select draft->>'n' from public.campaign_sites) = 'first';
  assert (select published->>'n' from public.campaign_sites) = 'second', 'restoring does not publish';
  assert pg_temp.fails_with(
    format('select public.restore_site_version(%L)', current_setting('test.mathira_version')),
    'That version is not available.');
end $$;
rollback;

-- test: taking the site offline clears what the public sees and keeps the draft
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
begin
  perform public.save_site_draft('{"v": 1}', 0);
  perform public.publish_site();
  perform public.unpublish_site();
  assert (select published from public.campaign_sites) is null;
  assert (select draft from public.campaign_sites) = '{"v": 1}';
end $$;
rollback;

-- test: the photo bucket is public, takes only JPEGs up to 2 MB, and nobody signed in writes to it
do $$
declare
  b storage.buckets;
begin
  select * into b from storage.buckets where id = 'site-media';
  assert b.public, 'public to read';
  assert b.file_size_limit = 2097152;
  assert b.allowed_mime_types = array['image/jpeg'];
end $$;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
begin
  insert into storage.objects (bucket_id, name) values ('site-media', 'ca000000-0000-4000-8000-000000000002/a.jpg');
  assert false, 'a browser wrote to the photo bucket';
exception when insufficient_privilege then null;
end $$;
rollback;
