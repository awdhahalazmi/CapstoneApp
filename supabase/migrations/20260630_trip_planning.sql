-- Trip Planning Tables for Beyond Kw
-- Run this in your Supabase SQL editor: https://supabase.com/dashboard/project/kebhtnqckauasimoutta/sql

-- Group places (pins on the shared trip map)
create table if not exists group_places (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade not null,
  added_by uuid references profiles(id) not null,
  added_by_name text not null,
  title text not null,
  description text,
  category text not null default 'other',
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz default now()
);
create index if not exists group_places_group_id_idx on group_places(group_id);
alter table group_places enable row level security;

create policy "group members can read places"
  on group_places for select using (
    exists (select 1 from group_members where group_id = group_places.group_id and member_id = auth.uid())
  );
create policy "group members can add places"
  on group_places for insert with check (
    auth.uid() = added_by and
    exists (select 1 from group_members where group_id = group_places.group_id and member_id = auth.uid())
  );
create policy "place owner can delete"
  on group_places for delete using (auth.uid() = added_by);

-- Votes (one per user per place, primary key enforces uniqueness)
create table if not exists place_votes (
  place_id uuid references group_places(id) on delete cascade not null,
  user_id uuid references profiles(id) not null,
  created_at timestamptz default now(),
  primary key (place_id, user_id)
);
alter table place_votes enable row level security;

create policy "anyone can read votes"
  on place_votes for select using (true);
create policy "users can vote"
  on place_votes for insert with check (auth.uid() = user_id);
create policy "users can unvote"
  on place_votes for delete using (auth.uid() = user_id);

-- Availability slots
create table if not exists group_availability (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade not null,
  user_id uuid references profiles(id) not null,
  user_name text not null,
  date date not null,
  time_slot text not null,
  created_at timestamptz default now(),
  unique (group_id, user_id, date, time_slot)
);
create index if not exists group_availability_group_id_idx on group_availability(group_id);
alter table group_availability enable row level security;

create policy "group members can read availability"
  on group_availability for select using (
    exists (select 1 from group_members where group_id = group_availability.group_id and member_id = auth.uid())
  );
create policy "members can set availability"
  on group_availability for insert with check (
    auth.uid() = user_id and
    exists (select 1 from group_members where group_id = group_availability.group_id and member_id = auth.uid())
  );
create policy "members can delete their availability"
  on group_availability for delete using (auth.uid() = user_id);

-- Enable realtime for all three tables
alter publication supabase_realtime add table group_places;
alter publication supabase_realtime add table place_votes;
alter publication supabase_realtime add table group_availability;
