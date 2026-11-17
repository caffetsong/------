/* ============================================================
   algorithm.js — 曙光英雄梯度算法 v4（大神榜全榜分布）
   纯函数，无 DOM 依赖；浏览器与 Node 分析脚本共用。

   取消旧「国9」固定口径：
     头部均值 = 前 10%（至少 3 名）的战力均值
     全榜均值 = 整条 1–N 战力曲线的均值（归一化 AUC）
     战力分   = 0.5 × 头部均值百分位 + 0.5 × 全榜均值百分位
     总分     = 0.15 × 出场 + 0.70 × 战力分 + 0.15 × 胜率

   输入：rawData = [{ heroName, appearanceRank, winRate, power: [...] }]
   输出：{ heroes, sorted, meta }
   ============================================================ */
(function (root) {
  "use strict";

  const DEFAULTS = {
    headFraction: 0.10,                 // 头部取前 10%
    headMin: 3,                         // 短榜至少取前 3 名
    metricWeights: { head: 0.50, mean: 0.50 },
    weights: { appearance: 0.15, combat: 0.70, winrate: 0.15 }
  };

  function parseRate(value) {
    if (value === null || value === undefined || value === "") return null;
    let n = typeof value === "number" ? value : parseFloat(String(value).replace(/[%％]/g, ""));
    if (!Number.isFinite(n)) return null;
    if (n > 1) n /= 100;
    return Math.min(1, Math.max(0, n));
  }

  function minMax(values) {
    const finite = values.filter((v) => Number.isFinite(v));
    if (!finite.length) return values.map(() => 0);
    const lo = Math.min(...finite), hi = Math.max(...finite);
    const range = hi - lo || 1;
    return values.map((v) => (Number.isFinite(v) ? (v - lo) / range : 0));
  }

  // 平均秩百分位：并列取平均名次，返回 0..1
  function percentileRanks(values) {
    const n = values.length;
    const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const out = new Array(n).fill(0);
    for (let i = 0; i < n;) {
      let j = i + 1;
      while (j < n && order[j].v === order[i].v) j++;
      const avgRank = (i + 1 + j) / 2;
      const pct = avgRank / n;
      for (let k = i; k < j; k++) out[order[k].i] = pct;
      i = j;
    }
    return out;
  }

  function mean(arr) {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }

  function compute(rawData, config) {
    const cfg = config || {};
    const algo = Object.assign({}, DEFAULTS, cfg.algorithm || {});
    const weights = Object.assign({}, DEFAULTS.weights, algo.weights || {});
    const metricWeights = Object.assign({}, DEFAULTS.metricWeights, algo.metricWeights || {});
    const headFraction = Number(algo.headFraction) > 0 ? Number(algo.headFraction) : DEFAULTS.headFraction;
    const headMin = Number.isFinite(Number(algo.headMin)) ? Math.max(1, Number(algo.headMin)) : DEFAULTS.headMin;

    const heroes = (Array.isArray(rawData) ? rawData : []).map((h) => {
      const power = (Array.isArray(h.power) ? h.power : [])
        .map(Number)
        .filter((v) => Number.isFinite(v) && v > 0);
      const n = power.length;
      const headCount = n ? Math.min(n, Math.max(headMin, Math.ceil(n * headFraction))) : 0;
      return {
        name: h.heroName || h.name || "",
        profession: h["职业"] || h.profession || "",
        headIcon: cfg.headIconPath ? cfg.headIconPath.replace("{name}", h.heroName || h.name || "") : null,
        appearanceRank: Number.isFinite(parseInt(h.appearanceRank)) ? parseInt(h.appearanceRank) : null,
        winRate: parseRate(h.winRate),
        power,
        rankCount: n,
        headCount,
        headMean: headCount ? Math.round(mean(power.slice(0, headCount))) : 0,
        fullMean: n ? Math.round(mean(power)) : 0,
        leaderPower: n ? power[0] : 0,
        lastPower: n ? power[n - 1] : 0,
        combatSignal: headCount ? Math.round(mean(power.slice(0, headCount))) : 0,
        lane: null
      };
    });

    const N = heroes.length;
    if (!N) return { heroes, sorted: [], meta: { count: 0 } };

    const headPct = percentileRanks(heroes.map((h) => h.headMean));
    const meanPct = percentileRanks(heroes.map((h) => h.fullMean));

    const appearanceScores = heroes.map((h) => {
      if (h.appearanceRank == null || N === 1) return N === 1 ? 1 : 0;
      return 1 - (h.appearanceRank - 1) / (N - 1);
    });
    const winRateScores = minMax(heroes.map((h) => (h.winRate == null ? 0 : h.winRate)));

    heroes.forEach((h, i) => {
      const combat = metricWeights.head * headPct[i] + metricWeights.mean * meanPct[i];
      h.combatScore = Math.round(combat * 1000) / 10; // 0..100
      h.rawWeighted = weights.appearance * appearanceScores[i]
        + weights.combat * combat
        + weights.winrate * winRateScores[i];
    });

    const rawScores = heroes.map((h) => h.rawWeighted);
    const rawMin = Math.min(...rawScores);
    const rawMax = Math.max(...rawScores);
    const rawRange = rawMax - rawMin || 1;
    heroes.forEach((h) => {
      h.score = ((h.rawWeighted - rawMin) / rawRange) * 100;
    });

    const sorted = [...heroes].sort((a, b) => b.score - a.score);
    const thresholds = (cfg.tiers && Array.isArray(cfg.tiers.thresholds))
      ? cfg.tiers.thresholds
      : [
        { tier: "T0", pct: 0.92 }, { tier: "T0.5", pct: 0.88 },
        { tier: "T1", pct: 0.70 }, { tier: "T2", pct: 0.40 },
        { tier: "T3", pct: 0.12 }, { tier: "T4", pct: 0 }
      ];
    sorted.forEach((h, i) => {
      const pct = 1 - i / N;
      let tier = "T4";
      for (const t of thresholds) {
        if (pct >= t.pct) { tier = t.tier; break; }
      }
      h.tier = tier;
      h.rank = i + 1;
    });

    return {
      heroes,
      sorted,
      meta: {
        count: N,
        headFraction,
        headMin,
        metricWeights: { ...metricWeights },
        weights: { ...weights }
      }
    };
  }

  root.SGAlgorithm = { compute, DEFAULTS };
})(typeof globalThis !== "undefined" ? globalThis : this);
