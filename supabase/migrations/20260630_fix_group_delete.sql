-- Fix group deletion: add missing RLS DELETE policy + cascade FKs
-- Run this in: https://supabase.com/dashboard/project/kebhtnqckauasimoutta/sql

-- 1. Allow group owners to delete their own group
CREATE POLICY IF NOT EXISTS "owner can delete group"
  ON groups FOR DELETE
  USING (auth.uid() = owner_id);

-- 2. Fix group_members FK → cascade delete when group is deleted
ALTER TABLE group_members
  DROP CONSTRAINT IF EXISTS group_members_group_id_fkey;
ALTER TABLE group_members
  ADD CONSTRAINT group_members_group_id_fkey
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

-- 3. Fix group_messages FK → cascade delete when group is deleted
ALTER TABLE group_messages
  DROP CONSTRAINT IF EXISTS group_messages_group_id_fkey;
ALTER TABLE group_messages
  ADD CONSTRAINT group_messages_group_id_fkey
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
