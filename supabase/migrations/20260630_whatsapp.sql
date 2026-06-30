-- WhatsApp group links: maps a WA group JID to an app group per user
create table if not exists whatsapp_group_links (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  wa_jid           text not null,
  wa_name          text not null,
  wa_participant_count int default 0,
  group_id         uuid not null references groups(id) on delete cascade,
  synced_at        timestamptz default now(),
  unique (user_id, wa_jid)
);

alter table whatsapp_group_links enable row level security;

create policy "Users manage own WA links"
  on whatsapp_group_links
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Polls sent to WA groups via the app
create table if not exists whatsapp_polls (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups(id) on delete cascade,
  wa_jid       text not null,
  wa_message_id text,
  question     text not null,
  options      jsonb not null,       -- string[]
  vote_counts  jsonb default '{}',   -- { "0": 3, "1": 1 }
  created_by   uuid references profiles(id),
  created_at   timestamptz default now()
);

alter table whatsapp_polls enable row level security;

create policy "Group members view polls"
  on whatsapp_polls for select
  using (
    exists (
      select 1 from group_members
      where group_members.group_id = whatsapp_polls.group_id
        and group_members.user_id  = auth.uid()
    )
  );

create policy "Group members create polls"
  on whatsapp_polls for insert
  with check (
    auth.uid() = created_by
    and exists (
      select 1 from group_members
      where group_members.group_id = whatsapp_polls.group_id
        and group_members.user_id  = auth.uid()
    )
  );

alter publication supabase_realtime add table whatsapp_polls;
