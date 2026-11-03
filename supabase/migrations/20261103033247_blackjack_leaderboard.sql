-- Session capabilities never appear in the public ranking response. Only the
-- Edge Function's server role can access this table or these invoker functions.
create table public.blackjack_sessions (
  token uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  player_name text check (char_length(player_name) between 1 and 20),
  profit_cents integer check (profit_cents between -100000 and 1000000000 and profit_cents % 250 = 0),
  hands integer check (hands between 1 and 10000),
  check ((submitted_at is null and player_name is null and profit_cents is null and hands is null)
      or (submitted_at is not null and player_name is not null and profit_cents is not null and hands is not null))
);
alter table public.blackjack_sessions enable row level security;
revoke all on public.blackjack_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.blackjack_sessions to service_role;
create policy "Server manages blackjack sessions" on public.blackjack_sessions
  for all to service_role using (true) with check (true);
create index blackjack_sessions_ranking on public.blackjack_sessions (profit_cents desc, submitted_at asc, token)
  where submitted_at is not null;
create index blackjack_sessions_started on public.blackjack_sessions (started_at);

create function public.blackjack_start_session() returns uuid
language plpgsql security invoker set search_path = '' as $$
declare new_token uuid;
begin
  perform pg_advisory_xact_lock(831403);
  if (select count(*) from public.blackjack_sessions where started_at > now() - interval '1 hour') >= 2000 then
    raise exception 'BJ_BUSY';
  end if;
  delete from public.blackjack_sessions where submitted_at is null and started_at < now() - interval '1 day';
  insert into public.blackjack_sessions default values returning token into new_token;
  return new_token;
end;
$$;

create function public.blackjack_submit_score(session_token uuid, display_name text, net_cents integer, completed_hands integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare entry public.blackjack_sessions%rowtype; clean_name text := btrim(display_name);
begin
  if clean_name is null or char_length(clean_name) not between 1 and 20 or clean_name ~ '[[:cntrl:]]'
     or net_cents is null or net_cents not between -100000 and 1000000000 or net_cents % 250 <> 0
     or completed_hands is null or completed_hands not between 1 and 10000 then
    raise exception 'BJ_SCORE';
  end if;
  select * into entry from public.blackjack_sessions where token = session_token for update;
  if not found or entry.started_at < now() - interval '1 day' then raise exception 'BJ_SESSION'; end if;
  -- Generous timing and mathematical bounds catch malformed or impossible scores.
  -- This casual leaderboard is not authoritative game replay / anti-cheat.
  if completed_hands > floor(extract(epoch from (now() - entry.started_at))) + 5
     or net_cents > 100000 * (power(2.5::numeric, least(completed_hands, 12)) - 1) then
    raise exception 'BJ_SCORE';
  end if;
  if entry.submitted_at is not null and completed_hands <= entry.hands and net_cents <> entry.profit_cents then
    raise exception 'BJ_SCORE';
  end if;
  if entry.submitted_at is null or net_cents > entry.profit_cents then
    update public.blackjack_sessions set player_name = clean_name, profit_cents = net_cents,
      hands = completed_hands, submitted_at = now()
      where token = session_token returning * into entry;
  end if;
  return jsonb_build_object('player_name', entry.player_name, 'profit_cents', entry.profit_cents, 'hands', entry.hands);
end;
$$;

create function public.blackjack_top_scores()
returns table (player_name text, profit_cents integer, hands integer)
language sql stable security invoker set search_path = '' as $$
  select b.player_name, b.profit_cents, b.hands from public.blackjack_sessions b
  where b.submitted_at is not null order by b.profit_cents desc, b.submitted_at asc, b.token limit 10;
$$;

revoke all on function public.blackjack_start_session() from public, anon, authenticated;
revoke all on function public.blackjack_submit_score(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.blackjack_top_scores() from public, anon, authenticated;
grant execute on function public.blackjack_start_session() to service_role;
grant execute on function public.blackjack_submit_score(uuid, text, integer, integer) to service_role;
grant execute on function public.blackjack_top_scores() to service_role;
