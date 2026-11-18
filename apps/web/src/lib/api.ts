import type { AppConfig, BlacklistResponse, HeroHistoryResponse, HeroProfile, Period, PeriodSummary, PlayerDetailResponse, PlayerLookupResponse, PowerRankingResponse, ProfilesResponse } from "./types";

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, { cache: "no-store", ...init });
  const text = await resp.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text for the error message
  }
  if (!resp.ok) {
    const message = data && typeof data === "object" && "error" in data
      ? String((data as { error: unknown }).error)
      : `HTTP ${resp.status}`;
    throw new Error(message);
  }
  return data as T;
}

export const api = {
  config: () => getJson<AppConfig>("/api/config"),
  periods: () => getJson<{ periods: PeriodSummary[] }>("/api/periods"),
  period: (date: string) => getJson<Period>(`/api/periods/${encodeURIComponent(date)}`),
  profiles: () => getJson<ProfilesResponse>("/api/profiles"),
  profile: (name: string) => getJson<HeroProfile>(`/api/heroes/${encodeURIComponent(name)}/profile`),
  heroHistory: (name: string) => getJson<HeroHistoryResponse>(`/api/heroes/${encodeURIComponent(name)}/history`),
  powerRanking: (date: string, hero: string) => getJson<PowerRankingResponse>(
    `/api/power-ranking?date=${encodeURIComponent(date)}&hero=${encodeURIComponent(hero)}`
  ),
  playerDetail: (date: string, uid: string, hero?: string) => getJson<PlayerDetailResponse>(
    `/api/player-detail?date=${encodeURIComponent(date)}&uid=${encodeURIComponent(uid)}${hero ? `&hero=${encodeURIComponent(hero)}` : ""}`
  ),
  savePlayerFlags: (payload: {
    key: string;
    publicRecord?: boolean | null;
    soloPlayed?: boolean | null;
    partyPlayed?: boolean | null;
  }) => getJson<{ ok: boolean; key: string; flags: Record<string, boolean | null> }>("/api/player-flags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }),
  importPeriod: (payload: { date: string; file: string; data: unknown[] }) => getJson<{
    ok: boolean;
    date: string;
    heroCount: number;
    rowCount: number;
  }>("/api/import-period", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }),
  saveProfile: (name: string, profile: { lanes: string[]; players: string[] }) => getJson<HeroProfile>(
    `/api/heroes/${encodeURIComponent(name)}/profile`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile)
    }
  ),
  lookupPlayers: (uids: string[]) => getJson<PlayerLookupResponse>("/api/players/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uids })
  }),
  blacklist: () => getJson<BlacklistResponse>("/api/blacklist"),
  saveBlacklist: (entries: { uid: string; reason: string }[]) => getJson<BlacklistResponse>("/api/blacklist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries })
  })
};
