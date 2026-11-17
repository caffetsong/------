export interface AlgorithmConfig {
  headFraction?: number;
  headMin?: number;
  metricWeights?: { head?: number; mean?: number };
  weights?: { appearance?: number; combat?: number; winrate?: number };
}

export interface TierThreshold {
  tier: string;
  pct: number;
}

export interface AppConfig {
  gameName?: string;
  hasDates?: boolean;
  dates?: { date: string; file: string }[];
  defaultDate?: string;
  algorithm?: AlgorithmConfig;
  tiers?: { thresholds?: TierThreshold[] };
}

export interface ApiHero {
  name: string;
  appearanceRank: number | null;
  winRate: number | null;
  rankCount: number;
  hasPower: boolean;
  powerTop1?: number | null;
  powerTop9?: number | null;
  powerTop50?: number | null;
  powerTop100?: number | null;
  powerMedian?: number | null;
  legacyGuo9?: number | null;
  power: number[];
}

export interface Period {
  date: string;
  capturedAt: string | null;
  heroCount: number;
  rowCount: number;
  rawRowCount?: number;
  blacklistRemoved?: number;
  blacklistCount?: number;
  hasPower: boolean;
  heroes: ApiHero[];
}

export interface PeriodSummary {
  date: string;
  capturedAt: string | null;
  heroCount: number;
  rowCount: number;
  hasPower: boolean;
}

export interface ComputedHero extends ApiHero {
  rank: number;
  tier: string;
  score: number;
  combatScore: number;
  headCount: number;
  headMean: number;
  fullMean: number;
  leaderPower: number;
  lastPower: number;
}

export interface UidAppearance {
  uid: string;
  found: boolean;
  allCount: number;
  names: string[];
  latest: { hero: string; rank: number; power: number; player: string }[];
  latestNames: string[];
}

export interface BlacklistEntry {
  uid: string;
  reason: string;
}

export interface BlacklistResponse {
  ok?: boolean;
  file: string;
  count: number;
  uids: string[];
  entries?: BlacklistEntry[];
  reasons?: Record<string, string>;
  updatedAt: string | null;
  latestDate: string | null;
  appearances: Record<string, UidAppearance>;
  missingUids: string[];
  noLatestUids: string[];
}

export interface HeroProfile {
  name: string;
  lanes: string[];
  players: string[];
}

export interface ProfilesResponse {
  profiles: HeroProfile[];
}

export interface HeroHistoryPoint {
  date: string;
  capturedAt: string | null;
  appearanceRank: number | null;
  winRate: number | null;
  rankCount: number;
  powerTop1: number | null;
  powerTop9: number | null;
  powerTop50: number | null;
  powerTop100: number | null;
  powerMedian: number | null;
  legacyGuo9: number | null;
}

export interface HeroHistoryResponse {
  name: string;
  periods: HeroHistoryPoint[];
}

export interface PlayerLookupResponse {
  latestDate: string | null;
  appearances: Record<string, UidAppearance>;
  missingUids: string[];
  noLatestUids: string[];
}
