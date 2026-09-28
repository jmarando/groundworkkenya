-- What the public can send in without an account: the poll page's rate
-- limit and the demo request form. Run with tests/sql/run.sh.

\set QUIET on
\set ON_ERROR_STOP on

-- test: a key is allowed its limit, then refused until the window passes
begin;
do $$
declare
  i integer;
begin
  for i in 1..3 loop
    assert public.rate_limit_hit('poll-form:abc', 3, 600), 'hit ' || i || ' allowed';
  end loop;
  assert not public.rate_limit_hit('poll-form:abc', 3, 600), 'fourth refused';
  assert public.rate_limit_hit('poll-form:other', 3, 600), 'other keys unaffected';

  update public.rate_limits set window_start = now() - interval '11 minutes' where key = 'poll-form:abc';
  assert public.rate_limit_hit('poll-form:abc', 3, 600), 'a new window starts fresh';
  assert (select hits from public.rate_limits where key = 'poll-form:abc') = 1;
end $$;
rollback;

-- test: the counters are the server's alone
do $$
begin
  assert not has_table_privilege('anon', 'public.rate_limits', 'select');
  assert not has_table_privilege('authenticated', 'public.rate_limits', 'select');
  assert not has_function_privilege('anon', 'public.rate_limit_hit(text, integer, integer)', 'execute');
  assert not has_function_privilege('authenticated', 'public.rate_limit_hit(text, integer, integer)', 'execute');
end $$;

-- test: the demo form takes a request, refuses oversized ones, and slows a flood
begin;
set local role anon;
do $$
declare
  i integer;
begin
  insert into public.demo_leads (name, phone, seat, county) values ('Amina', '0712345678', 'MP', 'Nyeri');

  begin
    insert into public.demo_leads (name, phone) values (repeat('x', 5000), '0712345678');
    assert false, 'an oversized name was stored';
  exception when check_violation then null;
  end;

  -- A backdated row still counts as now.
  insert into public.demo_leads (name, phone, created_at) values ('Early', '0712345678', now() - interval '1 year');

  for i in 3..20 loop
    insert into public.demo_leads (name, phone) values ('Lead ' || i, '0712345678');
  end loop;
  begin
    insert into public.demo_leads (name, phone) values ('One too many', '0712345678');
    assert false, 'the twenty-first request in ten minutes was stored';
  exception when raise_exception then
    assert sqlerrm like 'Too many requests%';
  end;
end $$;
rollback;

-- test: schema version
do $$ begin assert public.groundwork_schema_version() >= 10; end $$;
