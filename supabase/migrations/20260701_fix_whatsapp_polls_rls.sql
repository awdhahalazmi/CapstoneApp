-- Fix whatsapp_polls RLS policies: column is member_id, not user_id
-- Run in: https://supabase.com/dashboard/project/kebhtnqckauasimoutta/sql

-- Drop broken policies that reference the nonexistent user_id column
DROP POLICY IF EXISTS "Group members view polls"   ON whatsapp_polls;
DROP POLICY IF EXISTS "Group members create polls" ON whatsapp_polls;

-- Recreate SELECT with correct column name
CREATE POLICY "Group members view polls"
  ON whatsapp_polls FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = whatsapp_polls.group_id
        AND group_members.member_id = auth.uid()
    )
  );

-- Recreate INSERT with correct column name
CREATE POLICY "Group members create polls"
  ON whatsapp_polls FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = whatsapp_polls.group_id
        AND group_members.member_id = auth.uid()
    )
  );
