begin;
set local role service_role;
do $$
declare own_token uuid; expired_token uuid; result jsonb; bad integer;
begin
  own_token := public.blackjack_start_session();
  update public.blackjack_sessions set started_at = now() - interval '1 minute' where token = own_token;
  result := public.blackjack_submit_score(own_token, ' QA transaction ', 3750, 1);
  assert result->>'player_name' = 'QA transaction';
  assert (result->>'profit_cents')::integer = 3750;
  assert not (result ? 'token');
  result := public.blackjack_submit_score(own_token, 'QA transaction', 3750, 1);
  assert (select count(*) from public.blackjack_sessions where token = own_token) = 1;
  result := public.blackjack_submit_score(own_token, 'QA transaction', 6250, 2);
  assert (result->>'profit_cents')::integer = 6250;
  result := public.blackjack_submit_score(own_token, 'QA transaction', 1250, 3);
  assert (result->>'profit_cents')::integer = 6250, 'A lower score replaced a personal best';
  assert (result->>'hands')::integer = 2;
  foreach bad in array array[1, -100250, 1000000250] loop
    begin
      perform public.blackjack_submit_score(own_token, 'QA transaction', bad, 4);
      raise exception 'Invalid score accepted';
    exception when raise_exception then if sqlerrm <> 'BJ_SCORE' then raise; end if; end;
  end loop;
  begin
    perform public.blackjack_submit_score(own_token, 'QA transaction', 7500, 1);
    raise exception 'Stale hand accepted';
  exception when raise_exception then if sqlerrm <> 'BJ_SCORE' then raise; end if; end;
  begin
    perform public.blackjack_submit_score(gen_random_uuid(), 'QA transaction', 2500, 1);
    raise exception 'Unknown token accepted';
  exception when raise_exception then if sqlerrm <> 'BJ_SESSION' then raise; end if; end;
  expired_token := public.blackjack_start_session();
  update public.blackjack_sessions set started_at = now() - interval '2 days' where token = expired_token;
  begin
    perform public.blackjack_submit_score(expired_token, 'QA transaction', 2500, 1);
    raise exception 'Expired token accepted';
  exception when raise_exception then if sqlerrm <> 'BJ_SESSION' then raise; end if; end;
  assert not has_table_privilege('anon', 'public.blackjack_sessions', 'SELECT');
  assert not has_table_privilege('authenticated', 'public.blackjack_sessions', 'UPDATE');
  assert not has_function_privilege('anon', 'public.blackjack_start_session()', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.blackjack_submit_score(uuid,text,integer,integer)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.blackjack_top_scores()', 'EXECUTE');
  assert (select count(*) from public.blackjack_top_scores()) <= 10;
end;
$$;
rollback;
