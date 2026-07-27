/*
  # Add team names and pending/cancelled status to entries

  1. Modified Tables
    - `entries`
      - Added `home_team` (text) - name of the home team
      - Added `away_team` (text) - name of the away team
      - Updated `result` check constraint to allow 'pending' and 'cancelled'

  2. Notes
    - Entries now start as 'pending' until resolved as green, red, or cancelled
    - Cancelled entries do not affect bankroll
    - Existing entries keep their current result values
*/

-- Add team name columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entries' AND column_name = 'home_team'
  ) THEN
    ALTER TABLE entries ADD COLUMN home_team text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entries' AND column_name = 'away_team'
  ) THEN
    ALTER TABLE entries ADD COLUMN away_team text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Update constraint to allow pending and cancelled
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_result_check;
ALTER TABLE entries ADD CONSTRAINT entries_result_check
  CHECK (result IN ('green', 'red', 'pending', 'cancelled'));