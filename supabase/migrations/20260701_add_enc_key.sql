-- Add enc_key column to whatsapp_polls for vote decryption
-- Run in: https://supabase.com/dashboard/project/kebhtnqckauasimoutta/sql

ALTER TABLE whatsapp_polls ADD COLUMN IF NOT EXISTS enc_key text;

-- Update get_active_polls to return enc_key so the server can decrypt votes
CREATE OR REPLACE FUNCTION get_active_polls()
RETURNS TABLE(wa_message_id text, group_id uuid, options jsonb, enc_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT p.wa_message_id, p.group_id, p.options::jsonb, p.enc_key
  FROM whatsapp_polls p WHERE p.wa_message_id IS NOT NULL;
END;
$$;
