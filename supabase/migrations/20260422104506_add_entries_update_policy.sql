/*
  # Add UPDATE policy for entries table

  1. Security Changes
    - Add RLS policy to allow anon users to update entries
    - Required for resolving pending entries (changing result, profit, bankroll_after)

  2. Notes
    - Without this policy, updates to entries were silently blocked by RLS
    - This caused resolved entries to revert to 'pending' on page reload
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'entries' AND policyname = 'Allow anon update entries'
  ) THEN
    CREATE POLICY "Allow anon update entries"
      ON entries FOR UPDATE
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;