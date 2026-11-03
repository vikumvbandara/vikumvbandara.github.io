-- Integration checks; every fixture is rolled back.
begin;
select set_config('pinball.test_token', public.pinball_start_run()::text, true);
update public.pinball_runs set started_at = now() - interval '30 seconds'
where token = current_setting('pinball.test_token')::uuid;
set local role anon;
select public.pinball_submit_score(current_setting('pinball.test_token')::uuid, 'Integration test', 100);
select public.pinball_submit_score(current_setting('pinball.test_token')::uuid, 'Duplicate attempt', 200);
do $$
begin
  if not exists (select 1 from public.pinball_top_scores() where player_name = 'Integration test' and score = 100) then
    raise exception 'Submitted score missing';
  end if;
  if exists (select 1 from public.pinball_top_scores() where player_name = 'Duplicate attempt') then
    raise exception 'Duplicate submission changed a score';
  end if;
  if has_table_privilege('anon', 'public.pinball_runs', 'SELECT') or has_table_privilege('anon', 'public.pinball_runs', 'INSERT')
    or has_table_privilege('anon', 'public.pinball_runs', 'UPDATE') or has_table_privilege('anon', 'public.pinball_runs', 'DELETE') then
    raise exception 'Anonymous direct table access must be denied';
  end if;
  begin
    perform public.pinball_submit_score(gen_random_uuid(), 'Invalid', 123);
    raise exception 'Invalid score accepted';
  exception when raise_exception then
    if sqlerrm <> 'Invalid score.' then raise; end if;
  end;
  begin
    perform public.pinball_submit_score(gen_random_uuid(), 'Unknown run', 100);
    raise exception 'Unknown session accepted';
  exception when raise_exception then
    if sqlerrm <> 'Game session not found.' then raise; end if;
  end;
end;
$$;
reset role;
rollback;
