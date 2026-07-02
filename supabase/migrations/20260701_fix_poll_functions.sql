-- Fix poll vote functions
-- Run in: https://supabase.com/dashboard/project/kebhtnqckauasimoutta/sql

-- Drop old version (may have different signature)
DROP FUNCTION IF EXISTS update_poll_votes(text, text, integer[]);
DROP FUNCTION IF EXISTS update_poll_votes(text, text, int[]);

-- New function: manager passes full aggregated vote_counts directly
-- (SECURITY DEFINER so anon key / server can call it without RLS)
CREATE OR REPLACE FUNCTION update_poll_votes(
  p_wa_message_id text,
  p_vote_counts    jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE whatsapp_polls
  SET vote_counts = p_vote_counts
  WHERE wa_message_id = p_wa_message_id;
END;
$$;

-- Function so the manager (anon key, no auth context) can load the poll
-- registry on startup without being blocked by RLS
CREATE OR REPLACE FUNCTION get_active_polls()
RETURNS TABLE(wa_message_id text, group_id uuid, options jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.wa_message_id, p.group_id, p.options::jsonb
  FROM whatsapp_polls p
  WHERE p.wa_message_id IS NOT NULL;
END;
$$;
