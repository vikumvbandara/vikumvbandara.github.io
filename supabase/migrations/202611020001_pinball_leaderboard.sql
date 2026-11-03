-- Only these narrowly scoped functions are exposed to website visitors.
create table public.pinball_runs (
  token uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  player_name text check (char_length(player_name) between 1 and 20),
  score integer check (score between 0 and 10000000 and score % 25 = 0)
);
alter table public.pinball_runs enable row level security;
revoke all on public.pinball_runs from anon, authenticated;
create index pinball_rank on public.pinball_runs (score desc, submitted_at asc) where submitted_at is not null;
create index pinball_run_start on public.pinball_runs (started_at);

create function public.pinball_start_run() returns uuid
language plpgsql security definer set search_path = '' as $$
declare run_id uuid;
begin
  perform pg_advisory_xact_lock(831402);
  if (select count(*) from public.pinball_runs where started_at > now() - interval '1 hour') >= 2000 then
    raise exception 'Leaderboard is busy. Please try again later.';
  end if;
  -- Remove abandoned sessions without touching submitted scores.
  delete from public.pinball_runs where submitted_at is null and started_at < now() - interval '1 day';
  insert into public.pinball_runs default values returning token into run_id;
  return run_id;
end;
$$;

create function public.pinball_submit_score(run_token uuid, player_name text, final_score integer)
returns void language plpgsql security definer set search_path = '' as $$
declare entry public.pinball_runs; clean_name text;
begin
  clean_name := btrim(player_name);
  if clean_name is null or char_length(clean_name) not between 1 and 20 or clean_name ~ '[[:cntrl:]]' then
    raise exception 'A display name of 1–20 characters is required.';
  end if;
  if final_score is null or final_score not between 0 and 10000000 or final_score % 25 <> 0 then
    raise exception 'Invalid score.';
  end if;
  select * into entry from public.pinball_runs where token = run_token for update;
  if not found then raise exception 'Game session not found.'; end if;
  -- Retrying a request after a dropped response cannot add a duplicate score.
  if entry.submitted_at is not null then return; end if;
  if entry.started_at < now() - interval '1 day' or entry.started_at > now() - interval '10 seconds' then
    raise exception 'Game session expired or incomplete.';
  end if;
  if final_score > extract(epoch from (now() - entry.started_at)) * 3000 then
    raise exception 'Score exceeds game duration.';
  end if;
  update public.pinball_runs set player_name = clean_name, score = final_score, submitted_at = now() where token = run_token;
end;
$$;

create function public.pinball_top_scores()
returns table(player_name text, score integer)
language sql stable security definer set search_path = '' as $$
  select r.player_name, r.score from public.pinball_runs r
  where r.submitted_at is not null order by r.score desc, r.submitted_at asc limit 10;
$$;

revoke all on function public.pinball_start_run() from public;
revoke all on function public.pinball_submit_score(uuid, text, integer) from public;
revoke all on function public.pinball_top_scores() from public;
grant execute on function public.pinball_start_run() to anon, authenticated;
grant execute on function public.pinball_submit_score(uuid, text, integer) to anon, authenticated;
grant execute on function public.pinball_top_scores() to anon, authenticated;
