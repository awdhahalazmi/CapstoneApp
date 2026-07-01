-- AI Plan Event: events created from WhatsApp group poll analysis, plus reminders
-- Run in: https://supabase.com/dashboard/project/kebhtnqckauasimoutta/sql

create table if not exists events (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references groups(id) on delete cascade,
  title          text not null,
  description    text,
  place_name     text,
  place_lat      double precision,
  place_lng      double precision,
  event_date     date,
  event_time     text,
  poll_summary   text,
  source_poll_id uuid references whatsapp_polls(id),
  wa_jid         text,
  wa_message_id  text,
  sent_at        timestamptz,
  created_by     uuid not null references profiles(id),
  created_at     timestamptz default now()
);
create index if not exists events_group_id_idx on events(group_id);

create table if not exists event_reminders (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  remind_at  timestamptz not null,
  label      text not null,
  status     text not null default 'pending',
  created_by uuid not null references profiles(id),
  created_at timestamptz default now()
);
create index if not exists event_reminders_due_idx on event_reminders(status, remind_at);

alter table events enable row level security;
alter table event_reminders enable row level security;

-- Group members can view events for their groups
create policy "Group members view events"
  on events for select
  using (
    exists (
      select 1 from group_members
      where group_members.group_id = events.group_id
        and group_members.member_id = auth.uid()
    )
  );

-- Only the group owner can create/update events
create policy "Owner creates events"
  on events for insert
  with check (
    auth.uid() = created_by
    and exists (
      select 1 from groups
      where groups.id = events.group_id
        and groups.owner_id = auth.uid()
    )
  );

create policy "Owner updates events"
  on events for update
  using (
    exists (
      select 1 from groups
      where groups.id = events.group_id
        and groups.owner_id = auth.uid()
    )
  );

-- Reminders: readable/manageable by the owner of the parent event's group
create policy "Owner manages reminders"
  on event_reminders for all
  using (
    exists (
      select 1 from events
      join groups on groups.id = events.group_id
      where events.id = event_reminders.event_id
        and groups.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from events
      join groups on groups.id = events.group_id
      where events.id = event_reminders.event_id
        and groups.owner_id = auth.uid()
    )
  );

alter publication supabase_realtime add table events;
alter publication supabase_realtime add table event_reminders;

-- SECURITY DEFINER helpers so the server-side reminder scheduler (anon key, no user JWT)
-- can read due reminders and mark them sent — same pattern as store_wa_message().
create or replace function get_due_reminders()
returns table (
  reminder_id    uuid,
  event_id       uuid,
  label          text,
  title          text,
  description    text,
  place_name     text,
  event_date     date,
  event_time     text,
  poll_summary   text,
  group_id       uuid,
  wa_jid         text,
  sender_user_id uuid
)
language sql
security definer
set search_path = public
as $$
  select r.id, e.id, r.label, e.title, e.description, e.place_name,
         e.event_date, e.event_time, e.poll_summary,
         e.group_id, e.wa_jid, l.user_id
  from event_reminders r
  join events e on e.id = r.event_id
  left join whatsapp_group_links l on l.group_id = e.group_id and l.wa_jid = e.wa_jid
  where r.status = 'pending' and r.remind_at <= now();
$$;

create or replace function mark_reminder_sent(p_reminder_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update event_reminders set status = 'sent' where id = p_reminder_id;
$$;
