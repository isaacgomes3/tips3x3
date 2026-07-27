/*
  # Add cashout_odd column to entries table

  1. Modified Tables
    - `entries`
      - `cashout_odd` (numeric, nullable) - the back odd at which the entry was cashed out
        When set, the profit is calculated as: stake * (1/(lay_odd - 1) - 1/(cashout_odd - 1))
        This represents closing a lay position early via a back bet

  2. Notes
    - Column is nullable: NULL means the entry was resolved normally (full green/red)
    - When cashout_odd is set and result is 'green', the profit uses the cashout formula
    - This allows partial profit/loss from early position closure
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entries' AND column_name = 'cashout_odd'
  ) THEN
    ALTER TABLE entries ADD COLUMN cashout_odd numeric DEFAULT NULL;
  END IF;
END $$;
