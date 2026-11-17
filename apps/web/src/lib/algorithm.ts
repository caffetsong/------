import type { ApiHero, AppConfig, ComputedHero, TierThreshold } from "./types";

const DEFAULT_TIERS: TierThreshold[] = [
  { tier: "T0", pct: 0.92 },
  { tier: "T0.5", pct: 0.88 },
  { tier: "T1", pct: 0.7 },
  { tier: "T2", pct: 0.4 },
  { tier: "T3", pct: 0.12 },
  { tier: "T4", pct: 0 }
];

function parseRate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  let n = typeof value === "number" ? value : Number(String(value).replace(/[%％]/g, ""));
  if (!Number.isFinite(n)) return null;
  if (n > 1) n /= 100;
  return Math.min(1, Math.max(0, n));
}

function mean(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function minMax(values: number[]) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return values.map(() => 0);
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  const range = hi - lo || 1;
  return values.map((v) => (Number.isFinite(v) ? (v - lo) / range : 0));
}

function percentileRanks(values: number[]) {
  const n = values.length;
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; ) {
    let j = i + 1;
    while (j < n && order[j].value === order[i].value) j++;
    const pct = (i + 1 + j) / 2 / n;
    for (let k = i; k < j; k++) out[order[k].index] = pct;
    i = j;
  }
  return out;
}

export function computeTierList(heroes: ApiHero[], config?: AppConfig): ComputedHero[] {
  const algo = config?.algorithm ?? {};
  const headFraction = Number(algo.headFraction) > 0 ? Number(algo.headFraction) : 0.1;
  const headMin = Number.isFinite(Number(algo.headMin)) ? Math.max(1, Number(algo.headMin)) : 3;
  const metricWeights = {
    head: Number(algo.metricWeights?.head ?? 0.5),
    mean: Number(algo.metricWeights?.mean ?? 0.5)
  };
  const weights = {
    appearance: Number(algo.weights?.appearance ?? 0.15),
    combat: Number(algo.weights?.combat ?? 0.7),
    winrate: Number(algo.weights?.winrate ?? 0.15)
  };
  const thresholds = config?.tiers?.thresholds?.length ? config.tiers.thresholds : DEFAULT_TIERS;

  const rows = heroes.map((hero) => {
    const power = (Array.isArray(hero.power) ? hero.power : [])
      .map(Number)
      .filter((v) => Number.isFinite(v) && v > 0);
    const n = power.length;
    const headCount = n ? Math.min(n, Math.max(headMin, Math.ceil(n * headFraction))) : 0;
    const headMean = headCount ? Math.round(mean(power.slice(0, headCount))) : 0;
    const fullMean = n ? Math.round(mean(power)) : 0;
    return {
      ...hero,
      power,
      rankCount: n,
      winRate: parseRate(hero.winRate),
      headCount,
      headMean,
      fullMean,
      leaderPower: n ? power[0] : 0,
      lastPower: n ? power[n - 1] : 0
    };
  });

  if (!rows.length) return [];

  const headPct = percentileRanks(rows.map((h) => h.headMean));
  const meanPct = percentileRanks(rows.map((h) => h.fullMean));
  const winPct = minMax(rows.map((h) => h.winRate ?? 0));
  const n = rows.length;

  const withCombat = rows.map((hero, i) => {
    const combat = metricWeights.head * headPct[i] + metricWeights.mean * meanPct[i];
    const appearance = hero.appearanceRank == null || n === 1
      ? (n === 1 ? 1 : 0)
      : 1 - (hero.appearanceRank - 1) / (n - 1);
    return {
      hero,
      combat,
      combatScore: Math.round(combat * 1000) / 10,
      raw: weights.appearance * appearance + weights.combat * combat + weights.winrate * winPct[i]
    };
  });

  const rawScores = withCombat.map((x) => x.raw);
  const rawMin = Math.min(...rawScores);
  const rawMax = Math.max(...rawScores);
  const rawRange = rawMax - rawMin || 1;

  const sorted = withCombat
    .map(({ hero, combatScore, raw }) => ({
      ...hero,
      combatScore,
      score: ((raw - rawMin) / rawRange) * 100,
      tier: "T4",
      rank: 0
    }) as ComputedHero)
    .sort((a, b) => b.score - a.score);

  sorted.forEach((hero, index) => {
    const pct = 1 - index / n;
    hero.rank = index + 1;
    hero.tier = thresholds.find((t) => pct >= t.pct)?.tier ?? "T4";
  });

  return sorted;
}

export const TIER_ORDER = ["T0", "T0.5", "T1", "T2", "T3", "T4"] as const;
