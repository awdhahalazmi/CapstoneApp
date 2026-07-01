-- WhatsApp messages: stores incoming WA chat messages captured by the server manager
-- Run in: https://supabase.com/dashboard/project/kebhtnqckauasimoutta/sql

CREATE TABLE IF NOT EXISTS wa_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  wa_jid         text NOT NULL,          -- WhatsApp group JID (e.g. 12345@g.us)
  sender_jid     text NOT NULL DEFAULT '',
  sender_name    text NOT NULL DEFAULT '',
  content        text NOT NULL DEFAULT '',
  is_from_me     boolean NOT NULL DEFAULT false,
  wa_message_id  text,                   -- WA message key ID (dedup)
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Unique index on wa_message_id (NULLs are excluded so multiple NULLs are OK)
CREATE UNIQUE INDEX IF NOT EXISTS wa_messages_wa_message_id_unique
  ON wa_messages (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wa_messages_group_created
  ON wa_messages (group_id, created_at DESC);

ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;

-- Group members can read messages for their groups
CREATE POLICY "Group members read WA messages"
  ON wa_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = wa_messages.group_id
        AND group_members.member_id = auth.uid()
    )
  );

-- Enable realtime so the client receives new messages instantly
ALTER PUBLICATION supabase_realtime ADD TABLE wa_messages;

-- SECURITY DEFINER function so the server-side manager (using anon key) can insert
-- messages even though RLS would otherwise block unauthenticated writes.
CREATE OR REPLACE FUNCTION store_wa_message(
  p_group_id      uuid,
  p_wa_jid        text,
  p_sender_jid    text,
  p_sender_name   text,
  p_content       text,
  p_is_from_me    boolean,
  p_wa_message_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_wa_message_id IS NOT NULL THEN
    -- Deduplicate by wa_message_id
    INSERT INTO wa_messages
      (group_id, wa_jid, sender_jid, sender_name, content, is_from_me, wa_message_id)
    VALUES
      (p_group_id, p_wa_jid, p_sender_jid, p_sender_name, p_content, p_is_from_me, p_wa_message_id)
    ON CONFLICT (wa_message_id) DO NOTHING;
  ELSE
    INSERT INTO wa_messages
      (group_id, wa_jid, sender_jid, sender_name, content, is_from_me)
    VALUES
      (p_group_id, p_wa_jid, p_sender_jid, p_sender_name, p_content, p_is_from_me);
  END IF;
END;
$$;
