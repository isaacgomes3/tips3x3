export type EntryResult = 'green' | 'red' | 'pending' | 'cancelled';

export interface Entry {
  id: string;
  home_team: string;
  away_team: string;
  odd: number;
  stake: number;
  result: EntryResult;
  profit: number;
  bankroll_after: number;
  cashout_odd: number | null;
  created_at: string;
}

export interface Settings {
  id: string;
  initial_bankroll: number;
  stake_percentage: number;
  telegram_bot_token?: string | null;
  telegram_chat_id?: string | null;
}

export interface DayEvolution {
  day: number;
  date: string;
  start: number;
  end: number;
  profit: number;
  percentage: number;
}

export type TabKey = 'statistics' | 'entries' | 'stake' | 'criativos' | 'telegram';
