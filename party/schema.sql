-- Rimoboy party mode: database schema (BUILD.md section 16.7).
-- Applied to the Supabase project "rimoboy" as 3 migrations, in this order: "party_schema"
-- (everything up to the review section), "party_drop_unused_delete_policy" and
-- "party_review_fixes" (the section at the end). Run the whole file on a fresh project.
-- Everyone (host laptop and guest phones) uses Anonymous Sign-Ins, so every caller has
-- the `authenticated` role and an auth.uid(). The `anon` role gets no access.
-- Guests write only through RPCs (join_room, touch_room) and their own vote rows.
-- The host writes rooms.state and rounds; round and vote lifecycle go through RPCs that
-- use the server clock.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

-- ---------- tables ----------

create table public.rooms (
  id         text primary key check (id ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host       uuid not null default auth.uid() references auth.users on delete cascade,
  state      jsonb not null default '{"phase":"lobby"}'::jsonb,
  created_at timestamptz not null default now()
);
create index rooms_host_idx on public.rooms (host, created_at);

create table public.people (
  room      text not null references public.rooms on delete cascade,
  uid       uuid not null references auth.users on delete cascade,
  name      text not null check (char_length(btrim(name)) between 1 and 16),
  hidden    boolean not null default false,          -- set by the host (bad words)
  joined_at timestamptz not null default now(),
  seen_at   timestamptz not null default now(),
  primary key (room, uid)
);
create index people_uid_idx on public.people (uid);

create table public.rounds (
  room         text not null references public.rooms on delete cascade,
  round        int  not null check (round > 0),
  mode         text not null check (mode in ('duet', '1v1')),
  left_name    text not null check (char_length(btrim(left_name)) between 1 and 24),
  right_name   text not null check (char_length(btrim(right_name)) between 1 and 24),
  started_at   timestamptz not null default now(),
  vote_ends_at timestamptz,
  hype         jsonb,
  results      jsonb,
  primary key (room, round)
);

create table public.votes (
  room       text not null,
  round      int  not null,
  uid        uuid not null,
  side       text not null check (side in ('L', 'R')),
  stars      smallint not null check (stars between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (room, round, uid, side),
  foreign key (room, round) references public.rounds on delete cascade,
  foreign key (room, uid) references public.people on delete cascade   -- only members vote
);
create index votes_room_uid_idx on public.votes (room, uid);

-- ---------- helpers for policies (not exposed through the API) ----------

create function private.is_host(r text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rooms where id = r and host = (select auth.uid()));
$$;

create function private.is_member(r text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.people where room = r and uid = (select auth.uid()));
$$;

create function private.can_see(r text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_host(r) or private.is_member(r);
$$;

-- true while the room is in its vote phase for this round and the window is open
create function private.vote_open(r text, rd int) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.rooms ro
    join public.rounds rn on rn.room = ro.id and rn.round = rd
    where ro.id = r
      and ro.state ->> 'phase' = 'vote'
      and ro.state ->> 'round' = rd::text
      and rn.vote_ends_at is not null
      and now() < rn.vote_ends_at + interval '2 seconds'
  );
$$;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger votes_touch before update on public.votes
for each row execute function private.touch_updated_at();

-- ---------- RPCs (called with supabase.rpc) ----------

-- host: new room with a random 6-character code; at most 10 rooms per host per hour
create function public.create_room() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  abc  constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  me   uuid := auth.uid();
  code text;
  b    bytea;
begin
  if me is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if (select count(*) from public.rooms
      where host = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too many rooms' using errcode = 'P0001';
  end if;
  loop
    b := extensions.gen_random_bytes(6);
    code := '';
    for i in 0..5 loop
      code := code || substr(abc, 1 + (get_byte(b, i) % 32), 1);
    end loop;
    begin
      insert into public.rooms (id, host) values (code, me);
      return code;
    exception when unique_violation then
      -- taken: try another code
    end;
  end loop;
end $$;

-- guest: join (or rejoin / rename) and get the room state plus the server time
create function public.join_room(p_room text, p_name text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r  text := upper(btrim(p_room));
  st jsonb;
begin
  if me is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select state into st from public.rooms where id = r;
  if st is null then raise exception 'room not found' using errcode = 'P0002'; end if;
  if st ->> 'phase' = 'closed' then raise exception 'room closed' using errcode = 'P0001'; end if;
  insert into public.people (room, uid, name) values (r, me, btrim(p_name))
  on conflict (room, uid) do update set name = excluded.name, seen_at = now();
  return jsonb_build_object('room', r, 'state', st, 'now', now());
end $$;

-- guest: heartbeat (every 30 s); returns the server time
create function public.touch_room(p_room text) returns timestamptz
language sql volatile security definer set search_path = '' as $$
  update public.people set seen_at = now()
  where room = upper(btrim(p_room)) and uid = (select auth.uid());
  select now();
$$;

-- host: hide or show a guest's name on the TV
create function public.set_hidden(p_room text, p_uid uuid, p_hidden boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not private.is_host(p_room) then raise exception 'not the host' using errcode = '42501'; end if;
  update public.people set hidden = p_hidden where room = p_room and uid = p_uid;
end $$;

-- host: start a battle; returns the new round number
create function public.start_round(p_room text, p_mode text, p_left text, p_right text) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  if not private.is_host(p_room) then raise exception 'not the host' using errcode = '42501'; end if;
  select coalesce(max(round), 0) + 1 into n from public.rounds where room = p_room;
  insert into public.rounds (room, round, mode, left_name, right_name)
  values (p_room, n, p_mode, btrim(p_left), btrim(p_right));
  update public.rooms
  set state = jsonb_build_object(
    'phase', 'live', 'round', n, 'mode', p_mode, 'part', 1,
    'left', btrim(p_left), 'right', btrim(p_right), 'turn', null)
  where id = p_room;
  return n;
end $$;

-- host: open the vote of the current round for p_seconds (5..120) on the server clock
create function public.start_vote(p_room text, p_seconds int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  n    int;
  ends timestamptz := now() + make_interval(secs => greatest(5, least(120, p_seconds)));
begin
  if not private.is_host(p_room) then raise exception 'not the host' using errcode = '42501'; end if;
  select (state ->> 'round')::int into n from public.rooms where id = p_room;
  if n is null then raise exception 'no round' using errcode = 'P0001'; end if;
  update public.rounds set vote_ends_at = ends where room = p_room and round = n;
  update public.rooms
  set state = state || jsonb_build_object('phase', 'vote', 'voteEndsAt', ends, 'turn', null)
  where id = p_room;
  return jsonb_build_object('round', n, 'voteEndsAt', ends, 'now', now());
end $$;

-- ---------- row level security ----------

alter table public.rooms  enable row level security;
alter table public.people enable row level security;
alter table public.rounds enable row level security;
alter table public.votes  enable row level security;

-- rooms: created by create_room(); the host updates the state (turn, phase, part)
create policy rooms_select on public.rooms for select to authenticated
  using (host = (select auth.uid()) or private.is_member(id));
create policy rooms_update on public.rooms for update to authenticated
  using (host = (select auth.uid())) with check (host = (select auth.uid()));
-- no delete: rooms are kept as history ("Нова стая" makes a new one)

-- people: written only through join_room / touch_room / set_hidden
create policy people_select on public.people for select to authenticated
  using (private.can_see(room));

-- rounds: created by start_round(); the host writes hype and results
create policy rounds_select on public.rounds for select to authenticated
  using (private.can_see(room));
create policy rounds_update on public.rounds for update to authenticated
  using (private.is_host(room)) with check (private.is_host(room));

-- votes: everyone in the room sees them (the TV shows who rated whom);
-- a guest writes only their own stars, only while the vote is open
create policy votes_select on public.votes for select to authenticated
  using (private.can_see(room));
create policy votes_insert on public.votes for insert to authenticated
  with check (uid = (select auth.uid()) and private.vote_open(room, round));
create policy votes_update on public.votes for update to authenticated
  using (uid = (select auth.uid()))
  with check (uid = (select auth.uid()) and private.vote_open(room, round));

-- ---------- privileges ----------

revoke all on public.rooms, public.people, public.rounds, public.votes from anon;
revoke insert, delete on public.rooms from authenticated;
revoke insert, update, delete on public.people from authenticated;
revoke insert, delete on public.rounds from authenticated;
revoke delete on public.votes from authenticated;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon;
grant execute on function private.is_host(text), private.is_member(text),
  private.can_see(text), private.vote_open(text, int) to authenticated;

revoke all on function public.create_room(), public.join_room(text, text),
  public.touch_room(text), public.set_hidden(text, uuid, boolean),
  public.start_round(text, text, text, text), public.start_vote(text, int)
  from public, anon;
grant execute on function public.create_room(), public.join_room(text, text),
  public.touch_room(text), public.set_hidden(text, uuid, boolean),
  public.start_round(text, text, text, text), public.start_vote(text, int)
  to authenticated;

-- ---------- realtime (Postgres Changes respects RLS) ----------

alter publication supabase_realtime add table public.rooms, public.people, public.votes;

-- =====================================================================================
-- review fixes (migration "party_review_fixes", 2026-11-26)
-- =====================================================================================

-- names: no control, zero-width, line/paragraph separator or bidi characters
alter table public.people add constraint people_name_clean
  check (name !~ '[[:cntrl:]\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]');

-- join_room: strip those characters, cap 150 guests per room (errcode P0003 = full)
create or replace function public.join_room(p_room text, p_name text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r  text := upper(btrim(p_room));
  nm text := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]', '', 'g'));
  st jsonb;
begin
  if me is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select state into st from public.rooms where id = r;
  if st is null then raise exception 'room not found' using errcode = 'P0002'; end if;
  if st ->> 'phase' = 'closed' then raise exception 'room closed' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.people where room = r and uid = me)
     and (select count(*) from public.people where room = r) >= 150 then
    raise exception 'room full' using errcode = 'P0003';
  end if;
  insert into public.people (room, uid, name) values (r, me, nm)
  on conflict (room, uid) do update set name = excluded.name, seen_at = now();
  return jsonb_build_object('room', r, 'state', st, 'now', now());
end $$;

-- votes: an update needs an open window on the OLD row too, and the keys never change
drop policy votes_update on public.votes;
create policy votes_update on public.votes for update to authenticated
  using (uid = (select auth.uid()) and private.vote_open(room, round))
  with check (uid = (select auth.uid()) and private.vote_open(room, round));

create function private.votes_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.room, new.round, new.uid, new.side) is distinct from (old.room, old.round, old.uid, old.side) then
    raise exception 'vote keys are fixed' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger votes_touch on public.votes;
create trigger votes_guard before update on public.votes
for each row execute function private.votes_guard();
drop function private.touch_updated_at();

-- finish_vote: ends the vote at once (phase -> results, so vote_open turns false) and
-- returns the tally with names in the same call: {round, votes:[{uid,name,hidden,side,stars}], now}
create function public.finish_vote(p_room text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare n int; v jsonb;
begin
  if not private.is_host(p_room) then raise exception 'not the host' using errcode = '42501'; end if;
  select (state ->> 'round')::int into n from public.rooms where id = p_room for update;
  if n is null then raise exception 'no round' using errcode = 'P0001'; end if;
  update public.rooms set state = state || jsonb_build_object('phase', 'results') where id = p_room;
  select coalesce(jsonb_agg(jsonb_build_object(
           'uid', vo.uid, 'name', pe.name, 'hidden', pe.hidden, 'side', vo.side, 'stars', vo.stars)
           order by pe.name, vo.side), '[]'::jsonb)
    into v
    from public.votes vo join public.people pe on pe.room = vo.room and pe.uid = vo.uid
    where vo.room = p_room and vo.round = n;
  return jsonb_build_object('round', n, 'votes', v, 'now', now());
end $$;
revoke all on function public.finish_vote(text) from public, anon;
grant execute on function public.finish_vote(text) to authenticated;

-- Realtime Authorization: all party channels are private (client: config.private = true)
--   rb-up-<room>   reactions: members send, only the host receives
--   rb-db-<room>   host feed (Postgres Changes on people/votes): host only
--   rb-room-<room> phone feed (Postgres Changes on rooms): host and members
create function private.rt_can_read(t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when t like 'rb-up-%'   then private.is_host(substr(t, 7))
    when t like 'rb-db-%'   then private.is_host(substr(t, 7))
    when t like 'rb-room-%' then private.can_see(substr(t, 9))
    else false end;
$$;
create function private.rt_can_send(t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select t like 'rb-up-%' and private.is_member(substr(t, 7));
$$;
revoke all on function private.rt_can_read(text), private.rt_can_send(text) from public, anon;
grant execute on function private.rt_can_read(text), private.rt_can_send(text) to authenticated;

create policy party_rt_read on realtime.messages for select to authenticated
  using ((select private.rt_can_read(realtime.topic())));
create policy party_rt_send on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and (select private.rt_can_send(realtime.topic())));
