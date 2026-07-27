/*
  # Create Projeto 3x3 Schema

  1. New Tables
    - `entries`
      - `id` (uuid, primary key) - unique entry identifier
      - `odd` (numeric) - the odd value for the bet
      - `stake` (numeric) - stake amount in R$
      - `result` (text) - 'green' or 'red'
      - `profit` (numeric) - calculated profit/loss for this entry
      - `bankroll_after` (numeric) - bankroll balance after this entry
      - `created_at` (timestamptz) - when the entry was created
    - `settings`
      - `id` (uuid, primary key) - single row identifier
      - `initial_bankroll` (numeric) - starting bankroll amount
      - `stake_percentage` (numeric) - default stake percentage
      - `created_at` (timestamptz) - when created
      - `updated_at` (timestamptz) - last update time

  2. Security
    - Enable RLS on both tables
    - Add policies for anon access (public dashboard, no auth required per design)
    - Restrict to basic CRUD for anon users

  3. Notes
    - This is a personal dashboard tool, anon policies allow single-user usage
    - Settings table has a single row for configuration
*/

-- Create entries table
CREATE TABLE IF NOT EXISTS entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  odd numeric NOT NULL DEFAULT 0,
  stake numeric NOT NULL DEFAULT 0,
  result text NOT NULL CHECK (result IN ('green', 'red')),
  profit numeric NOT NULL DEFAULT 0,
  bankroll_after numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon select entries"
  ON entries FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon insert entries"
  ON entries FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon delete entries"
  ON entries FOR DELETE
  TO anon
  USING (true);

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initial_bankroll numeric NOT NULL DEFAULT 800,
  stake_percentage numeric NOT NULL DEFAULT 2,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon select settings"
  ON settings FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon insert settings"
  ON settings FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon update settings"
  ON settings FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Insert default settings row
INSERT INTO settings (initial_bankroll, stake_percentage)
VALUES (800, 2);