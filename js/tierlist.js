/* ============================================================
   tierlist.js — 英雄梯度排行榜核心引擎
   支持 LOLM（分路/Z-score） 和 曙光英雄（无分路/加权和）
   ============================================================ */

"use strict";

// ---- 全局状态 ----
let gameConfig = null;      // 当前游戏的 config.json
let gameData = null;        // 计算后的结构化数据
let currentMethod = "zscore"; // LOLM: "zscore"|"simple", SG: "weighted"
let currentView = "lane";   // "lane"|"global"
let currentLane = null;     // 当前分路名（仅 hasLanes）
let currentViewMode = "table"; // "table"|"grid" — 展示模式
let currentDate = null;      // 当前选中的日期 (YYYY-MM-DD)，仅 hasDates 游戏

// ---- 工具函数 ----
function parsePct(s) {
  if (typeof s === "number") return s / 100;
  return parseFloat(String(s).replace("%", "")) / 100;
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr) {
  const m = mean(arr);
  const v = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(v) || 1;
}

function zScores(arr) {
  const m = mean(arr);
  const s = stdDev(arr);
  if (s === 0) return arr.map(() => 0);
  return arr.map(v => (v - m) / s);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function getRankClass(rank) {
  if (rank === 1) return "rank-1";
  if (rank === 2) return "rank-2";
  if (rank === 3) return "rank-3";
  return "";
}

function getWrClass(val) {
  if (val >= 0.52) return "wr-high";
  if (val >= 0.49) return "wr-mid";
  return "wr-low";
}

function getCwClass(val) {
  // 战力分：高(>140) 中(80-140) 低(<80)
  if (val >= 140) return "cw-high";
  if (val >= 80) return "cw-mid";
  return "cw-low";
}

// ---- 梯度系统 ----
function getTierColors() {
  return gameConfig.tiers.colors;
}

function getTierThresholds() {
  return gameConfig.tiers.thresholds;
}

function getTierBadge(tier) {
  const color = getTierColors()[tier] || "#8c8c8c";
  return `<span class="tier-badge" style="background:${color}">${tier}</span>`;
}

function getScoreBar(score, tier) {
  const color = getTierColors()[tier] || "#8c8c8c";
  return `<div class="score-bar-wrap">
    <div class="score-bar"><div class="score-bar-fill" style="width:${score}%;background:${color}"></div></div>
    <span class="score-value">${score.toFixed(1)}</span></div>`;
}

function assignTiers(heroes, scoreKey) {
  const sorted = [...heroes].sort((a, b) => b[scoreKey] - a[scoreKey]);
  const n = sorted.length;
  const thresholds = getTierThresholds();
  sorted.forEach((h, rank) => {
    const pct = 1 - rank / n;
    let tier = "T4";
    for (const t of thresholds) {
      if (pct >= t.pct) { tier = t.tier; break; }
    }
    h.tier = tier;
    h.rank = rank + 1;
  });
}

// ============================================================
// LOLM 算法
// ============================================================
function computeLOLM(rawData) {
  const hasLanes = gameConfig.hasLanes;
  const lanes = {};
  const allHeroes = [];

  for (const laneCfg of gameConfig.lanes) {
    const raw = rawData[laneCfg.name];
    if (!raw) continue;
    const heroes = raw.map(h => ({
      name: h.heroName,
      lane: laneCfg.name,
      headIcon: gameConfig.headIconPath ? (gameConfig.gameId + "/" + gameConfig.headIconPath.replace("{name}", h.heroName)) : null,
      wr: parsePct(h.winRate),
      pr: parsePct(h.pickRate),
      br: parsePct(h.banRate),
      bp: parsePct(h.pickRate) + parsePct(h.banRate)
    }));
    lanes[laneCfg.name] = heroes;
    allHeroes.push(...heroes);
  }

  // Z-score 加权（分路内计算 Z-score）
  for (const [laneName, heroes] of Object.entries(lanes)) {
    const zWr = zScores(heroes.map(h => h.wr));
    const zPr = zScores(heroes.map(h => h.pr));
    const zBr = zScores(heroes.map(h => h.br));
    heroes.forEach((h, i) => {
      h.z_wr = zWr[i]; h.z_pr = zPr[i]; h.z_br = zBr[i];
      h.raw_zscore = 0.5 * zWr[i] + 1.0 * zPr[i] + 3.0 * zBr[i];
    });
  }

  // 简易公式
  for (const [laneName, heroes] of Object.entries(lanes)) {
    heroes.forEach(h => {
      h.raw_simple = Math.pow(h.wr, 0.3) * (h.pr + 2.5 * h.br) * 100;
    });
  }

  // 分路内 min-max 归一化
  function normalize(heroes, rawKey, normKey) {
    const vals = heroes.map(h => h[rawKey]);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const rng = hi - lo || 1;
    heroes.forEach(h => { h[normKey] = ((h[rawKey] - lo) / rng) * 100; });
  }

  for (const [, heroes] of Object.entries(lanes)) {
    normalize(heroes, "raw_zscore", "score_zscore");
    normalize(heroes, "raw_simple", "score_simple");
  }

  // 全局归一化
  normalize(allHeroes, "raw_zscore", "score_zscore_global");
  normalize(allHeroes, "raw_simple", "score_simple_global");

  // 分配梯度
  for (const [, heroes] of Object.entries(lanes)) {
    assignTiersWithKey(heroes, "score_zscore", "tier_zscore");
    assignTiersWithKey(heroes, "score_simple", "tier_simple");
    assignTiersWithKey(heroes, "score_zscore_global", "tier_global");
  }

  function assignTiersWithKey(heroes, scoreKey, tierKey) {
    const sorted = [...heroes].sort((a, b) => b[scoreKey] - a[scoreKey]);
    const n = sorted.length;
    const thresholds = getTierThresholds();
    sorted.forEach((h, i) => {
      const pct = 1 - i / n;
      let tier = "T4";
      for (const t of thresholds) {
        if (pct >= t.pct) { tier = t.tier; break; }
      }
      h[tierKey] = tier;
      // Store lane rank under a consistent key: _rank_zscore / _rank_simple
      if (tierKey === "tier_zscore") h._rank_zscore = i + 1;
      if (tierKey === "tier_simple") h._rank_simple = i + 1;
    });
  }

  // 全局排名
  const globalZ = [...allHeroes].sort((a, b) => b.score_zscore_global - a.score_zscore_global);
  globalZ.forEach((h, i) => { h.global_rank_zscore = i + 1; });
  const globalSimple = [...allHeroes].sort((a, b) => b.score_simple_global - a.score_simple_global);
  globalSimple.forEach((h, i) => { h.global_rank_simple = i + 1; });

  return { lanes, allHeroes, globalZ, globalSimple };
}

// ============================================================
// 曙光英雄算法（从 Python validate_pure.py 移植）
// ============================================================
function computeSG(rawData) {
  const heroes = rawData.map(h => ({
    name: h.heroName,
    headIcon: gameConfig.headIconPath ? ("曙光英雄/" + gameConfig.headIconPath.replace("{name}", h.heroName)) : null,
    appearanceRank: parseInt(h.appearanceRank),
    combatPower: parseFloat(h.combatPower),
    winRate: parseFloat(String(h.winRate).replace("%", "")) / 100,
    lane: null
  }));

  const N = heroes.length;
  const weights = gameConfig.algorithm.weights;

  // 出场分：rank 越小越好，转换为 1 → 1.0, N → 0.0
  const appearanceScores = heroes.map(h => 1 - (h.appearanceRank - 1) / (N - 1));

  // 战力分 min-max 归一化
  const combatVals = heroes.map(h => h.combatPower);
  const combatMin = Math.min(...combatVals), combatMax = Math.max(...combatVals);
  const combatRange = combatMax - combatMin || 1;
  const combatScores = combatVals.map(v => (v - combatMin) / combatRange);

  // 胜率 min-max 归一化
  const wrVals = heroes.map(h => h.winRate);
  const wrMin = Math.min(...wrVals), wrMax = Math.max(...wrVals);
  const wrRange = wrMax - wrMin || 1;
  const wrScores = wrVals.map(v => (v - wrMin) / wrRange);

  // 加权和
  heroes.forEach((h, i) => {
    h.raw_weighted = weights.appearance * appearanceScores[i]
                   + weights.combat * combatScores[i]
                   + weights.winrate * wrScores[i];
  });

  // 最终 min-max 归一化 → 0~100
  const rawVals = heroes.map(h => h.raw_weighted);
  const rawMin = Math.min(...rawVals), rawMax = Math.max(...rawVals);
  const rawRange = rawMax - rawMin || 1;
  heroes.forEach(h => { h.score = ((h.raw_weighted - rawMin) / rawRange) * 100; });

  // 分配梯度
  const sorted = [...heroes].sort((a, b) => b.score - a.score);
  const thresholds = getTierThresholds();
  sorted.forEach((h, i) => {
    const pct = 1 - i / N;
    let tier = "T4";
    for (const t of thresholds) {
      if (pct >= t.pct) { tier = t.tier; break; }
    }
    h.tier = tier;
    h.rank = i + 1;
  });

  return { heroes, sorted };
}

// ============================================================
// 数据加载 + 计算调度
// ============================================================
async function loadGameData() {
  const base = gameConfig.gameId === "lolm" ? "lolm" : "曙光英雄";

  if (gameConfig.hasLanes) {
    // LOLM: 加载所有分路 JSON
    const results = await Promise.all(
      gameConfig.lanes.map(async lane => {
        const resp = await fetch(base + "/" + lane.dataFile);
        if (!resp.ok) throw new Error(`加载 ${lane.dataFile} 失败: ${resp.status}`);
        return [lane.name, await resp.json()];
      })
    );
    const rawData = Object.fromEntries(results);
    const data = computeLOLM(rawData);

    // 转换为标准格式
    gameData = {
      hasLanes: true,
      lanes: {},
      allHeroes: data.allHeroes,
      globalZ: data.globalZ,
      globalSimple: data.globalSimple
    };
    for (const [name, heroes] of Object.entries(data.lanes)) {
      gameData.lanes[name] = heroes;
    }
  } else {
    // 无分路模式：支持多日期或单文件
    let dataFile;
    if (gameConfig.hasDates && gameConfig.dates && gameConfig.dates.length > 0) {
      const dateEntry = gameConfig.dates.find(d => d.date === currentDate) || gameConfig.dates[0];
      dataFile = dateEntry.file;
      if (!currentDate) currentDate = dateEntry.date;
    } else {
      dataFile = gameConfig.dataFile;
    }
    const resp = await fetch(base + "/" + dataFile);
    if (!resp.ok) throw new Error(`加载数据失败: ${resp.status}`);
    const rawData = await resp.json();
    const data = computeSG(rawData);
    gameData = {
      hasLanes: false,
      heroes: data.heroes,
      sorted: data.sorted
    };

    // 如果有历史数据，加载上一期数据用于梯度变化对比
    if (gameConfig.hasDates && gameConfig.dates && gameConfig.dates.length >= 2) {
      const sortedDates = gameConfig.dates.map(d => d.date).sort();
      const curIdx = sortedDates.indexOf(currentDate);
      if (curIdx > 0) {
        const prevDate = sortedDates[curIdx - 1];
        const prevEntry = gameConfig.dates.find(d => d.date === prevDate);
        if (prevEntry) {
          try {
            const prevResp = await fetch(base + "/" + prevEntry.file);
            if (prevResp.ok) {
              const prevRaw = await prevResp.json();
              const prevResult = computeSG(prevRaw);
              const prevMap = new Map(prevResult.heroes.map(h => [h.name, h]));
              data.heroes.forEach(h => {
                const prev = prevMap.get(h.name);
                if (prev) {
                  h.prevTier = prev.tier;
                  h.prevScore = prev.score;
                  h.prevRank = prev.rank;
                }
              });
            }
          } catch (e) { /* 静默失败，不影响当前数据展示 */ }
        }
      }
    }
  }
}

// ============================================================
// 获取当前有效的字段
// ============================================================
function getScoreField(hero) {
  if (gameConfig.hasLanes) {
    return currentMethod === "zscore" ? "score_zscore" : "score_simple";
  }
  return "score";
}

function getTierField(hero) {
  if (gameConfig.hasLanes) {
    return currentMethod === "zscore" ? "tier_zscore" : "tier_simple";
  }
  return "tier";
}

function getGlobalRank(hero) {
  if (gameConfig.hasLanes) {
    return hero[currentMethod === "zscore" ? "global_rank_zscore" : "global_rank_simple"];
  }
  return hero.rank;
}

// ============================================================
// 渲染
// ============================================================
function formatCellValue(hero, col) {
  const val = hero[col.field];
  if (val == null) return "-";

  switch (col.type) {
    case "rank":
      return `<span class="rank-num ${getRankClass(val)}">${val}</span>`;
    case "tier":
      return getTierBadge(val);
    case "score":
      return getScoreBar(val, hero.tier || hero[getTierField(hero)] || "T4");
    case "pct": {
      const pctVal = val * 100;
      let cls = "";
      if (col.colorClass === "wr") cls = getWrClass(val);
      if (col.colorClass === "cw") cls = getCwClass(val);
      return cls ? `<span class="${cls}">${pctVal.toFixed(2)}%</span>` : `${pctVal.toFixed(2)}%`;
    }
    case "int":
      return val.toString();
    default:
      return String(val);
  }
}

function getSortValue(hero, col) {
  const val = hero[col.field];
  if (val == null) return 0;
  if (col.type === "tier") {
    const order = ["T0", "T0.5", "T1", "T2", "T3", "T4"];
    return order.indexOf(val);
  }
  if (typeof val === "number") return val;
  return String(val);
}

function renderTable(heroes, columns, highlightLane) {
  // highlightLane: if set, highlight heroes from that lane
  let html = '<div class="table-wrapper"><table><thead><tr>';
  columns.forEach((col, idx) => {
    html += `<th onclick="sortTable(this, ${idx})" data-col-idx="${idx}">
      ${col.label} <span class="sort-icon">↕</span></th>`;
  });
  html += '</tr></thead><tbody>';

  heroes.forEach(h => {
    let rowClass = "";
    if (highlightLane && h.lane === highlightLane) rowClass = ' class="current-highlight"';
    html += `<tr${rowClass}>`;
    columns.forEach(col => {
      // Resolve field value — some are computed
      let displayVal;
      if (col.field === "score") {
        displayVal = h[getScoreField(h)];
      } else if (col.field === "scoreGlobal") {
        displayVal = h[gameConfig.hasLanes ? (currentMethod === "zscore" ? "score_zscore_global" : "score_simple_global") : "score"];
      } else if (col.field === "tier") {
        displayVal = gameConfig.hasLanes ? h[getTierField(h)] : h.tier;
      } else if (col.field === "globalRank") {
        displayVal = getGlobalRank(h);
      } else {
        displayVal = h[col.field];
      }

      // Format
      if (col.type === "rank") {
        html += `<td class="rank-num ${getRankClass(displayVal)}">${displayVal}</td>`;
      } else if (col.type === "tier") {
        let badge = getTierBadge(displayVal);
        // 显示与上一期的梯度变化箭头（仅无分路游戏 + 有 prevTier 数据）
        if (!gameConfig.hasLanes && h.prevTier && h.prevTier !== displayVal) {
          const tierOrder = ["T4","T3","T2","T1","T0.5","T0"];
          const arrow = tierOrder.indexOf(displayVal) > tierOrder.indexOf(h.prevTier)
            ? ' <span style="color:#3fb950;font-size:0.7rem">▲</span>'
            : ' <span style="color:#f85149;font-size:0.7rem">▼</span>';
          badge += arrow;
        }
        html += `<td>${badge}</td>`;
      } else if (col.type === "score") {
        html += `<td>${getScoreBar(displayVal, h.tier || displayVal)}</td>`;
      } else if (col.type === "pct" && displayVal != null) {
        const pctVal = displayVal * 100;
        let cls = "";
        if (col.colorClass === "wr") cls = getWrClass(displayVal);
        if (col.colorClass === "cw") cls = getCwClass(displayVal);
        html += `<td class="${cls}">${pctVal.toFixed(2)}%</td>`;
      } else if (col.type === "int" && displayVal != null) {
        let cls = "";
        if (col.colorClass === "cw") cls = getCwClass(displayVal);
        html += `<td class="${cls}">${displayVal}</td>`;
      } else {
        let txt = displayVal != null ? displayVal : "-";
        // Render head icon + name for text columns when hero has an icon
        if (col.type === "text" && col.field === "name" && h.headIcon) {
          const clickable = !gameConfig.hasLanes && gameConfig.hasDates ? ` style="cursor:pointer" onclick="showHeroDetail('${h.name.replace(/'/g, "\\'")}')"` : '';
          txt = `<div class="hero-cell"${clickable}><img class="hero-icon" src="${h.headIcon}" alt="${h.name}" onerror="this.style.display='none'"> <span class="hero-name">${txt}</span></div>`;
        } else if (col.type === "text" && col.field === "name") {
          const clickable = !gameConfig.hasLanes && gameConfig.hasDates ? ` style="cursor:pointer" onclick="showHeroDetail('${h.name.replace(/'/g, "\\'")}')"` : '';
          txt = `<span class="hero-name"${clickable}>${txt}</span>`;
        }
        html += `<td>${txt}</td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  return html;
}

function renderGridView(heroes, highlightLane) {
  // 按梯度分组
  const tierOrder = ["T0", "T0.5", "T1", "T2", "T3", "T4"];
  const validTiers = new Set(tierOrder);
  const colors = getTierColors();
  const groups = {};
  tierOrder.forEach(t => { groups[t] = []; });

  // 兜底组：收集无法解析梯度的英雄（避免污染 T4）
  const unknownGroup = [];

  heroes.forEach(h => {
    const tierField = gameConfig.hasLanes ? getTierField(h) : "tier";
    const tier = h[tierField];
    if (tier && validTiers.has(tier)) {
      groups[tier].push(h);
    } else {
      // 诊断：捕获异常梯度值
      console.warn("[梯度异常] 英雄:", h.name,
        "| 分路:", h.lane || "-",
        "| 梯度字段:", tierField,
        "| 梯度值:", tier,
        "| 有效字段存在:", {
          tier_zscore: "tier_zscore" in h ? h.tier_zscore : "缺失",
          tier_simple: "tier_simple" in h ? h.tier_simple : "缺失",
          tier: "tier" in h ? h.tier : "缺失"
        });
      unknownGroup.push(h);
    }
  });

  // 组内按分数排序
  const scoreKey = getScoreField();
  tierOrder.forEach(t => {
    if (groups[t]) groups[t].sort((a, b) => b[scoreKey] - a[scoreKey]);
  });

  let html = '<div class="tier-grid">';
  tierOrder.forEach(t => {
    const list = groups[t] || [];
    const color = colors[t] || "#8c8c8c";
    html += `<div class="tier-row${list.length === 0 ? " tier-row-empty" : ""}">`;
    html += `<div class="tier-label" style="background:${color}">${t}</div>`;
    html += '<div class="tier-icons">';
    if (list.length === 0) {
      html += '暂无英雄';
    } else {
      list.forEach(h => {
        const name = h.name;
        html += `<div class="tier-hero" title="${name}" onclick="showHeroDetail('${name.replace(/'/g, "\\'")}')">`;
        if (h.headIcon) {
          html += `<div class="tier-hero-img-wrap">`;
          html += `<img src="${h.headIcon}" alt="${name}" loading="lazy" onerror="this.style.display='none'">`;
          html += `<span class="tier-hero-name">${name}</span>`;
          html += '</div>';
        } else {
          html += `<div class="tier-hero-img-wrap">`;
          html += `<div class="hero-icon-placeholder" style="width:80px;height:80px;background:#21262d"></div>`;
          html += `<span class="tier-hero-name">${name}</span>`;
          html += '</div>';
        }
        html += '</div>';
      });
    }
    html += '</div></div>';
  });
  html += '</div>';

  // 诊断：如果有无法解析梯度的英雄，渲染一个诊断行
  if (unknownGroup.length > 0) {
    console.error(`[梯度异常] 共 ${unknownGroup.length} 个英雄无法解析梯度:`,
      unknownGroup.map(h => h.name).join("、"));
    html += `<div class="tier-row" style="border:2px dashed #f85149;margin-top:8px;">`;
    html += `<div class="tier-label" style="background:#f85149">⚠️</div>`;
    html += '<div class="tier-icons">';
    html += `<span style="color:#f85149;font-size:0.75rem;margin-right:8px;">梯度未知(${unknownGroup.length})</span>`;
    unknownGroup.forEach(h => {
      const name = h.name;
      html += `<div class="tier-hero" title="${name} (梯度异常)" style="opacity:0.6">`;
      html += `<div class="tier-hero-img-wrap" style="border:1px dashed #f85149">`;
      html += `<div class="hero-icon-placeholder" style="width:48px;height:48px;background:#21262d"></div>`;
      html += `<span class="tier-hero-name" style="color:#f85149">${name}</span>`;
      html += '</div></div>';
    });
    html += '</div></div>';
  }

  return html;
}

function renderStatCards(heroes) {
  const cards = gameConfig.statCards;
  let html = '<div class="stats-row">';
  cards.forEach(card => {
    let displayVal;
    if (card.field === "winRateRange") {
      const wrVals = heroes.map(h => h.winRate * 100);
      displayVal = `${Math.min(...wrVals).toFixed(1)}% ~ ${Math.max(...wrVals).toFixed(1)}%`;
    } else if (card.field === "count") {
      displayVal = heroes.length;
    } else if (card.format === "pct") {
      const vals = heroes.map(h => h[card.field] * 100);
      displayVal = mean(vals).toFixed(1) + "%";
    } else if (card.format === "int") {
      const vals = heroes.map(h => h[card.field]);
      displayVal = Math.round(mean(vals));
    } else {
      displayVal = String(heroes.length);
    }
    html += `<div class="stat-card">
      <div class="stat-value">${displayVal}</div>
      <div class="stat-label">${card.label}</div></div>`;
  });
  html += '</div>';
  return html;
}

// ============================================================
// 大幅波动横幅（曙光英雄表格页）
// 英雄名次相比上一期变化达到 VOLATILITY_THRESHOLD 及以上时，
// 在表格上方横幅展示。可切换 VOLATILITY_METRIC 改为按梯度分(0~100)波动。
//   'rank'  = 名次变化（delta < 0 = 排名上升/变好，绿色）
//   'score' = 梯度分变化（delta > 0 = 分数上升，绿色）
//   箭头统一语义：▲=上升(变好/绿) ▼=下降(变差/红)。如名次 11→32 显示 ▼21。
// ============================================================
const VOLATILITY_METRIC = 'rank';   // 'rank' | 'score'
const VOLATILITY_THRESHOLD = 10;    // 波动 ≥ 该值才进横幅

function renderVolatilityBanner(heroes) {
  if (!gameConfig || gameConfig.hasLanes) return "";   // 仅无分路游戏
  if (!heroes || !heroes.length) return "";
  if (!gameConfig.hasDates) return "";                 // 需有日期对比（上一期数据）

  const useScore = VOLATILITY_METRIC === 'score';
  const metricName = useScore ? "梯度分" : "名次";

  // 筛选波动 ≥ 阈值
  const movers = [];
  heroes.forEach(h => {
    if (useScore) {
      if (h.prevScore == null || h.score == null) return;
      const delta = h.score - h.prevScore;
      if (Math.abs(delta) < VOLATILITY_THRESHOLD) return;
      movers.push({ h, delta });
    } else {
      if (h.prevRank == null || h.rank == null) return;
      const delta = h.rank - h.prevRank;
      if (Math.abs(delta) < VOLATILITY_THRESHOLD) return;
      movers.push({ h, delta });
    }
  });
  if (!movers.length) return "";

  // 按波动幅度降序
  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // 名次：delta<0 上升(变好) / delta>0 下降(变差)
  // 分数：delta>0 上升 / delta<0 下降
  const isUp = m => (useScore ? m.delta > 0 : m.delta < 0);

  // 箭头跟随语义：▲=上升(变好/绿)，▼=下降(变差/红)，不随 delta 数值符号翻转
  const fmtDelta = m => (isUp(m) ? "▲" : "▼") + Math.abs(m.delta).toFixed(useScore ? 1 : 0);
  const fmtVal = m => useScore
    ? `${m.h.prevScore.toFixed(1)}→${m.h.score.toFixed(1)}`
    : `${m.h.prevRank}→${m.h.rank}`;
  const chip = m => {
    const cls = isUp(m) ? "up" : "down";
    const icon = m.h.headIcon
      ? `<img class="volatility-icon" src="${m.h.headIcon}" alt="" onerror="this.style.display='none'">`
      : "";
    // 副信息：名次模式附梯度分变化，分数模式附名次变化
    const sub = useScore
      ? (m.h.prevRank != null ? `名次 ${m.h.prevRank}→${m.h.rank}` : "")
      : (m.h.prevScore != null ? `梯度分 ${m.h.prevScore.toFixed(1)}→${m.h.score.toFixed(1)}` : "");
    // 英雄名可点击查看详情（与表格一致）
    const clickable = gameConfig.hasDates
      ? ` style="cursor:pointer" onclick="showHeroDetail('${m.h.name.replace(/'/g, "\\'")}')"`
      : "";
    return `<span class="volatility-chip ${cls}" title="${sub}">${icon}<b class="hero-name"${clickable}>${m.h.name}</b>` +
      `<span class="volatility-val">${fmtVal(m)}</span><em class="volatility-delta ${cls}">${fmtDelta(m)}</em></span>`;
  };

  let html = `<div class="volatility-banner">`;
  html += `<div class="volatility-head">`;
  html += `<span class="volatility-title">📊 大幅波动</span>`;
  html += `<span class="volatility-count">${movers.length}</span>`;
  html += `<span class="volatility-note">${metricName}较上一期变化 ≥ ${VOLATILITY_THRESHOLD}</span>`;
  html += `</div>`;
  // 合并展示：全部波动英雄排在同一列表，按各自方向着色
  html += `<div class="volatility-chips">${movers.map(chip).join("")}</div>`;
  html += `</div>`;
  return html;
}

function renderLaneView(laneName) {
  if (!gameData.hasLanes) {
    // 曙光：无分路，直接全量渲染
    const heroes = gameData.heroes;
    const sorted = [...heroes].sort((a, b) => a.rank - b.rank);
    const dateBadge = currentDate ? `<span class="count-badge" style="background:#238636">📅 ${currentDate}</span>` : '';
    let html = `<div class="section-header">
      <h2>${gameConfig.gameIcon} ${gameConfig.gameName} 梯度排行</h2>
      <span class="count-badge">${heroes.length} 个英雄</span>${dateBadge}</div>`;
    html += renderVolatilityBanner(heroes);   // 大幅波动横幅（无则空串）
    html += renderTable(sorted, gameConfig.columns, null);
    return html;
  }

  // LOLM：分路渲染
  const heroes = gameData.lanes[laneName];
  if (!heroes) return "<p>无数据</p>";

  const scoreKey = getScoreField();
  const tierKey = getTierField();
  const rankKey = currentMethod === "zscore" ? "_rank_zscore" : "_rank_simple";
  const sorted = [...heroes].sort((a, b) => b[scoreKey] - a[scoreKey]);
  // Set display rank from precomputed lane rank
  sorted.forEach((h) => { h.laneRank = h[rankKey]; });

  // Build lane-specific columns (with global rank column appended)
  const laneCols = gameConfig.columns.map(col => {
    if (col.field === "rank") return { ...col, field: "laneRank" };
    return col;
  });
  // Append global rank column
  laneCols.push({ label: "全局排名", field: "globalRank", type: "rank" });

  let html = `<div class="section-header">
    <h2>${laneName}</h2>
    <span class="count-badge">${heroes.length} 个英雄</span></div>`;
  html += renderStatCards(heroes);
  html += renderTable(sorted, laneCols, null);
  return html;
}

function renderGlobalView() {
  if (!gameData.hasLanes) {
    // 曙光无分路模式没有"全局"视图，显示一个汇总
    return renderLaneView();
  }

  const all = currentMethod === "zscore" ? gameData.globalZ : gameData.globalSimple;
  // Re-rank
  all.forEach((h, i) => { h.globalRank = i + 1; });

  let html = `<div class="section-header">
    <h2>🌍 全局排名（跨分路对比）</h2>
    <span class="count-badge">${all.length} 个英雄</span>
    <span class="hint">⚠️ 不同分路英雄职责不同，建议以分路内排名为主</span></div>`;
  html += renderTable(all, gameConfig.globalColumns, null);
  return html;
}

function renderAll() {
  if (!gameData) return;
  const content = document.getElementById("content");

  // 网格视图 — 单独处理
  if (currentViewMode === "grid") {
    let heroes;
    if (!gameData.hasLanes) {
      heroes = gameData.heroes;
    } else if (currentView === "global") {
      heroes = currentMethod === "zscore" ? gameData.globalZ : gameData.globalSimple;
    } else {
      heroes = gameData.lanes[currentLane] || [];
    }

    let titleHtml;
    if (!gameData.hasLanes) {
      const dateBadge = currentDate ? `<span class="count-badge" style="background:#238636">📅 ${currentDate}</span>` : '';
      titleHtml = `<div class="section-header">
        <h2>${gameConfig.gameIcon} ${gameConfig.gameName} 梯度排行</h2>
        <span class="count-badge">${heroes.length} 个英雄</span>${dateBadge}</div>`;
    } else if (currentView === "global") {
      titleHtml = `<div class="section-header">
        <h2>🌍 全局排名（跨分路对比）</h2>
        <span class="count-badge">${heroes.length} 个英雄</span>
        <span class="hint">⚠️ 不同分路英雄职责不同，建议以分路内排名为主</span></div>`;
    } else {
      titleHtml = `<div class="section-header">
        <h2>${currentLane}</h2>
        <span class="count-badge">${heroes.length} 个英雄</span></div>`;
    }
    content.innerHTML = titleHtml + renderGridView(heroes, null);
    return;
  }

  // 表格视图
  if (!gameData.hasLanes) {
    content.innerHTML = renderLaneView();
    return;
  }

  if (currentView === "global") {
    content.innerHTML = renderGlobalView();
  } else {
    content.innerHTML = renderLaneView(currentLane);
  }
}

// ============================================================
// 搜索
// ============================================================
function doSearch(query) {
  if (!query || query.trim().length === 0) {
    renderAll();
    return;
  }
  const q = query.trim().toLowerCase();
  let results = [];

  if (gameData.hasLanes) {
    for (const heroes of Object.values(gameData.lanes)) {
      for (const h of heroes) {
        if (h.name.toLowerCase().includes(q)) results.push(h);
      }
    }
  } else {
    results = gameData.heroes.filter(h => h.name.toLowerCase().includes(q));
  }

  if (results.length === 0) {
    document.getElementById("content").innerHTML =
      `<p style="text-align:center;padding:40px;color:#8b949e;">未找到匹配 "${query}" 的英雄</p>`;
    return;
  }

  // Sort by score descending
  const scoreKey = getScoreField();
  const rankKey = gameData.hasLanes ? (currentMethod === "zscore" ? "_rank_zscore" : "_rank_simple") : "rank";
  results.sort((a, b) => b[scoreKey] - a[scoreKey]);
  // Set laneRank for display
  results.forEach(h => { h.laneRank = h[rankKey] || 0; });

  // Search result columns
  let searchCols;
  if (gameData.hasLanes) {
    searchCols = [
      { label: "分路排名", field: "laneRank", type: "rank" },
      { label: "英雄", field: "name", type: "text" },
      { label: "分路", field: "lane", type: "text" },
      { label: "梯度", field: "tier", type: "tier" },
      { label: "评分", field: "score", type: "score" },
      { label: "胜率", field: "wr", type: "pct", colorClass: "wr" },
      { label: "出场率", field: "pr", type: "pct" },
      { label: "Ban率", field: "br", type: "pct" },
      { label: "BP率", field: "bp", type: "pct" },
      { label: "全局排名", field: "globalRank", type: "rank" }
    ];
  } else {
    searchCols = gameConfig.columns;
  }

  let html = `<div class="section-header">
    <h2>🔍 搜索结果："${query}"</h2>
    <span class="count-badge">${results.length} 个英雄</span></div>`;
  html += renderTable(results, searchCols, null);
  document.getElementById("content").innerHTML = html;
}

// ============================================================
// 表格排序
// ============================================================
function sortTable(th, colIdx) {
  const table = th.closest("table");
  const tbody = table.querySelector("tbody");
  const rows = Array.from(tbody.querySelectorAll("tr"));
  const isDesc = th.classList.contains("sorted") && !th.classList.contains("desc");

  table.querySelectorAll("th").forEach(h => { h.classList.remove("sorted", "desc"); });
  th.classList.add("sorted");
  if (isDesc) th.classList.add("desc");

  // Determine which heroes list is active
  let heroes;
  if (gameData.hasLanes) {
    if (currentView === "global") {
      heroes = currentMethod === "zscore" ? gameData.globalZ : gameData.globalSimple;
    } else {
      heroes = gameData.lanes[currentLane] || [];
    }
  } else {
    heroes = gameData.heroes;
  }

  // Build column definitions
  let cols;
  if (gameData.hasLanes && currentView === "global") {
    cols = gameConfig.globalColumns;
  } else {
    cols = gameConfig.columns;
  }

  // Handle lane-specific rank column
  const col = (colIdx < cols.length) ? cols[colIdx] : { field: "globalRank", type: "rank" };

  // 动态找到英雄名列的索引（而非硬编码 cells[1]）
  const nameColIdx = cols.findIndex(c => c.field === "name");
  rows.sort((a, b) => {
    const heroA = heroes.find(h => h.name === a.cells[nameColIdx]?.textContent?.trim());
    const heroB = heroes.find(h => h.name === b.cells[nameColIdx]?.textContent?.trim());
    const va = heroA ? (col.field === "laneRank" ? heroA.laneRank : heroA[col.field]) : 0;
    const vb = heroB ? (col.field === "laneRank" ? heroB.laneRank : heroB[col.field]) : 0;

    if (col.type === "tier") {
      const order = ["T0", "T0.5", "T1", "T2", "T3", "T4"];
      const ia = order.indexOf(va), ib = order.indexOf(vb);
      return isDesc ? ib - ia : ia - ib;
    }
    const na = parseFloat(va), nb = parseFloat(vb);
    if (!isNaN(na) && !isNaN(nb)) {
      return isDesc ? nb - na : na - nb;
    }
    const sa = String(va != null ? va : ""), sb = String(vb != null ? vb : "");
    return isDesc ? sb.localeCompare(sa) : sa.localeCompare(sb);
  });

  rows.forEach(r => tbody.appendChild(r));
}

// ============================================================
// 导航与控制
// ============================================================
function switchMethod(method) {
  currentMethod = method;
  // Update buttons
  document.querySelectorAll(".controls button").forEach(b => {
    const txt = b.textContent;
    if (txt.includes("Z-score") || txt.includes("简易公式") || txt.includes("加权和")) {
      const isZ = txt.includes("Z-score");
      const isS = txt.includes("简易公式");
      const isW = txt.includes("加权和");
      b.className = (isZ && method === "zscore") || (isS && method === "simple") || (isW && method === "weighted") ? "active" : "";
    }
  });
  renderAll();
}

function switchView(view) {
  currentView = view;
  document.getElementById("btn-lane").className = view === "lane" ? "active" : "";
  const btnGlobal = document.getElementById("btn-global");
  if (btnGlobal) btnGlobal.className = view === "global" ? "active" : "";

  if (view === "lane" && gameData.hasLanes) {
    currentLane = currentLane || Object.keys(gameData.lanes)[0];
    document.querySelectorAll("#nav button").forEach(b => {
      b.className = b.textContent === currentLane ? "active" : "";
    });
  } else if (gameData.hasLanes) {
    document.querySelectorAll("#nav button").forEach(b => b.className = "");
  }
  renderAll();
}

function switchViewMode(mode) {
  currentViewMode = mode;
  document.getElementById("btn-table").className = mode === "table" ? "active" : "";
  document.getElementById("btn-grid").className = mode === "grid" ? "active" : "";
  syncURL();
  renderAll();
}

// ============================================================
// 日期切换 (hasDates 游戏)
// ============================================================
async function switchDate(date) {
  currentDate = date;
  syncURL();
  document.getElementById("content").innerHTML =
    '<p style="text-align:center;padding:60px;color:#8b949e;">⏳ 加载中...</p>';
  await loadGameData();
  buildControls();
  renderAll();
}

function buildControls() {
  const controls = document.getElementById("controls");
  if (!controls) return;

  let html = "";

  if (gameConfig.hasLanes && gameConfig.algorithm.type === "zscore") {
    html += `<span style="margin-left:16px" class="label">算法：</span>
      <button class="active" onclick="switchMethod('zscore')">Z-score 加权</button>
      <button onclick="switchMethod('simple')">简易公式</button>`;
  } else if (!gameConfig.hasLanes) {
    html += `<span style="margin-left:16px" class="label">算法：</span>
      <button id="btn-weighted" class="active" onclick="switchMethod('weighted')">加权和 (0.20/0.50/0.30)</button>`;
  }

  if (gameConfig.hasLanes) {
    html += `<span style="margin-left:16px" class="label">视图：</span>
      <button id="btn-lane" class="active" onclick="switchView('lane')">📋 分路排名</button>
      <button id="btn-global" onclick="switchView('global')">🌍 全局排名</button>`;
  }

  // 日期切换 (hasDates 游戏)
  if (gameConfig.hasDates && gameConfig.dates && gameConfig.dates.length > 1) {
    const sortedDates = [...gameConfig.dates].sort((a, b) => b.date.localeCompare(a.date));
    html += `<span style="margin-left:16px" class="label">日期：</span>`;
    sortedDates.forEach(d => {
      const active = d.date === currentDate ? 'active' : '';
      html += `<button class="${active}" onclick="switchDate('${d.date}')">${d.date}</button>`;
    });
  }

  // 展示模式切换
  html += `<span style="margin-left:16px" class="label">展示：</span>
    <button id="btn-table" class="active" onclick="switchViewMode('table')">📋 表格</button>
    <button id="btn-grid" onclick="switchViewMode('grid')">🎨 网格</button>`;

  html += `<input type="text" class="search-box" placeholder="🔍 搜索英雄..." oninput="doSearch(this.value)" style="margin-left:16px">`;
  controls.innerHTML = html;
}

function buildNav() {
  const nav = document.getElementById("nav");
  if (!nav) return;

  if (!gameData.hasLanes) {
    nav.style.display = "none";
    return;
  }

  nav.style.display = "flex";
  nav.innerHTML = "";
  if (!gameData.lanes) return;
  Object.keys(gameData.lanes).forEach(lane => {
    const btn = document.createElement("button");
    btn.textContent = lane;
    btn.className = lane === currentLane ? "active" : "";
    btn.onclick = () => {
      currentLane = lane;
      switchView("lane");
    };
    nav.appendChild(btn);
  });
}

// ============================================================
// 游戏切换
// ============================================================
async function switchGame(gameId) {
  // Update game selector buttons
  document.querySelectorAll(".game-selector button").forEach(b => {
    b.className = b.dataset.game === gameId ? "active" : "";
  });

  // Load config (via data source layer — 服务器可用时自动扫最新日期)
  const base = gameId === "lolm" ? "lolm" : "曙光英雄";
  try {
    gameConfig = await DataSource.loadConfig(base);
  } catch (e) {
    throw new Error(`加载 ${gameId} 配置失败: ${e.message}`);
  }

  // Reset state
  currentMethod = gameConfig.algorithm.type === "weighted" ? "weighted" : "zscore";
  currentView = "lane";
  currentLane = gameConfig.hasLanes ? gameConfig.lanes[0].name : null;
  currentDate = null;
  if (gameConfig.hasDates) {
    currentDate = gameConfig.defaultDate || gameConfig.dates[0].date;
  }
  heroTimelineLoaded = false; heroTimeline = null; heroTimelineDates = [];
  // Clear search box
  const searchBox = document.querySelector(".search-box");
  if (searchBox) searchBox.value = "";

  // Load data
  document.getElementById("content").innerHTML =
    '<p style="text-align:center;padding:60px;color:#8b949e;">⏳ 加载中...</p>';

  await loadGameData();

  // Rebuild UI
  buildControls();
  buildNav();
  updateHeader();
  renderAll();
  updateFooter();
}

function updateHeader() {
  const h1 = document.querySelector(".header h1");
  if (h1) h1.innerHTML = `${gameConfig.gameIcon} ${gameConfig.gameName} 英雄梯度排行榜`;
}

function updateFooter() {
  const footer = document.querySelector(".footer");
  if (footer) footer.textContent = gameConfig.footer;
}

// ============================================================
// URL 状态
// ============================================================
function syncURL() {
  const params = new URLSearchParams();
  if (gameConfig) params.set("game", gameConfig.gameId);
  if (currentMethod) params.set("method", currentMethod);
  if (currentView) params.set("view", currentView);
  if (currentLane) params.set("lane", currentLane);
  if (currentViewMode !== "table") params.set("viewmode", currentViewMode);
  if (gameConfig && gameConfig.hasDates && currentDate) params.set("date", currentDate);
  const newUrl = window.location.pathname + "?" + params.toString();
  if (window.location.search !== "?" + params.toString()) {
    window.history.replaceState(null, "", newUrl);
  }
}

// ============================================================
// HeroDetail — 英雄多版本趋势图（仅 hasDates 游戏）
// ============================================================
let heroTimeline = null;
let heroTimelineDates = [];
let heroTimelineLoaded = false;

async function loadHeroTimeline() {
  if (heroTimelineLoaded) return;
  if (!gameConfig || !gameConfig.hasDates) return;

  heroTimelineDates = gameConfig.dates.map(d => d.date).sort();
  heroTimeline = {};
  const base = gameConfig.gameId === "lolm" ? "lolm" : "曙光英雄";

  for (const dateStr of heroTimelineDates) {
    const entry = gameConfig.dates.find(e => e.date === dateStr);
    if (!entry) continue;
    try {
      const resp = await fetch(base + "/" + entry.file);
      if (!resp.ok) continue;
      const raw = await resp.json();
      const result = computeSG(raw);
      const map = {};
      result.heroes.forEach(h => {
        map[h.name] = { score: h.score, winRate: h.winRate, combatPower: h.combatPower, rank: h.rank, tier: h.tier, appearanceRank: h.appearanceRank };
      });
      heroTimeline[dateStr] = map;
    } catch (e) {}
  }
  heroTimelineLoaded = true;
}

function showHeroDetail(name) {
  if (!gameConfig || !gameConfig.hasDates) return;

  let overlay = document.getElementById('heroDetailOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'heroDetailOverlay';
    overlay.className = 'hero-detail-overlay';
    overlay.innerHTML = `<div class="hero-detail-panel">
      <div class="hero-detail-header">
        <span class="hero-detail-title" id="hdTitle"></span>
        <button class="hero-detail-close" onclick="closeHeroDetail()">✕</button>
      </div>
      <div class="hero-detail-body" id="hdBody"></div>
    </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) closeHeroDetail(); });
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  document.getElementById('hdTitle').textContent = '📈 ' + name;
  document.getElementById('hdBody').innerHTML = '<p style="text-align:center;padding:40px;color:#8b949e">⏳ 加载趋势数据...</p>';
  loadHeroTimeline().then(() => renderHeroDetail(name));
}

function closeHeroDetail() {
  const overlay = document.getElementById('heroDetailOverlay');
  if (overlay) overlay.style.display = 'none';
  const oldChart = Chart.getChart('chartHeroTimeline');
  if (oldChart) oldChart.destroy();
}

function renderHeroDetail(name) {
  const points = heroTimelineDates.map(d => {
    const h = heroTimeline[d] ? heroTimeline[d][name] : null;
    return h ? { date: d, ...h } : null;
  }).filter(Boolean);
  if (points.length === 0) {
    document.getElementById('hdBody').innerHTML = '<p style="text-align:center;padding:40px;color:#8b949e">暂无历史数据</p>';
    return;
  }

  const heroCount = Math.max(...heroTimelineDates.map(d => heroTimeline[d] ? Object.keys(heroTimeline[d]).length : 0), 0);

  let gMin = { score: Infinity, winRate: Infinity, combatPower: Infinity, rank: Infinity, appearanceRank: Infinity };
  let gMax = { score: -Infinity, winRate: -Infinity, combatPower: -Infinity, rank: -Infinity, appearanceRank: -Infinity };
  for (const d of heroTimelineDates) {
    if (!heroTimeline[d]) continue;
    for (const [, h] of Object.entries(heroTimeline[d])) {
      gMin.score = Math.min(gMin.score, h.score);
      gMax.score = Math.max(gMax.score, h.score);
      gMin.winRate = Math.min(gMin.winRate, h.winRate);
      gMax.winRate = Math.max(gMax.winRate, h.winRate);
      gMin.combatPower = Math.min(gMin.combatPower, h.combatPower);
      gMax.combatPower = Math.max(gMax.combatPower, h.combatPower);
      const invRank = heroCount - h.rank + 1;
      gMin.rank = Math.min(gMin.rank, invRank);
      gMax.rank = Math.max(gMax.rank, invRank);
      const invAR = heroCount - h.appearanceRank + 1;
      gMin.appearanceRank = Math.min(gMin.appearanceRank, invAR);
      gMax.appearanceRank = Math.max(gMax.appearanceRank, invAR);
    }
  }

  function norm(val, min, max) { return ((val - min) / (max - min || 1)) * 100; }

  let html = '<div class="chart-box"><canvas id="chartHeroTimeline" style="height:360px"></canvas></div>';
  html += `<table class="mini-table"><thead><tr><th>日期</th><th>梯度</th><th>排名</th><th>评分</th><th>胜率</th><th>战力</th><th>出场排名</th></tr></thead><tbody>`;
  points.forEach(p => {
    html += `<tr><td>${p.date}</td><td>${getTierBadge(p.tier)}</td><td>#${p.rank}</td><td>${p.score.toFixed(1)}</td><td>${(p.winRate*100).toFixed(2)}%</td><td>${p.combatPower}</td><td>#${p.appearanceRank}</td></tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('hdBody').innerHTML = html;

  new Chart(document.getElementById('chartHeroTimeline'), {
    type: 'line',
    data: {
      labels: points.map(p => p.date),
      datasets: [
        { label: '评分', data: points.map(p => norm(p.score, gMin.score, gMax.score)), borderColor: '#58a6ff', backgroundColor: '#58a6ff', tension: 0.2, borderWidth: 2.5, pointRadius: 5 },
        { label: '胜率', data: points.map(p => norm(p.winRate, gMin.winRate, gMax.winRate)), borderColor: '#3fb950', backgroundColor: '#3fb950', tension: 0.2, borderWidth: 2.5, pointRadius: 5 },
        { label: '战力', data: points.map(p => norm(p.combatPower, gMin.combatPower, gMax.combatPower)), borderColor: '#d2991d', backgroundColor: '#d2991d', tension: 0.2, borderWidth: 2.5, pointRadius: 5 },
        { label: '排名', data: points.map(p => norm(heroCount - p.rank + 1, gMin.rank, gMax.rank)), borderColor: '#ff7a45', backgroundColor: '#ff7a45', tension: 0.2, borderWidth: 2.5, pointRadius: 5, borderDash: [6, 3] },
        { label: '出场排名', data: points.map(p => norm(heroCount - p.appearanceRank + 1, gMin.appearanceRank, gMax.appearanceRank)), borderColor: '#bc8cff', backgroundColor: '#bc8cff', tension: 0.2, borderWidth: 2.5, pointRadius: 5, borderDash: [3, 3] },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      backgroundColor: 'transparent',
      plugins: {
        title: { display: true, text: `${name} — 全指标趋势（归一化 0~100，越高越好）`, color: '#c9d1d9', font: { size: 14 } },
        legend: { position: 'bottom', labels: { color: '#c9d1d9', usePointStyle: true, padding: 20 } },
      },
      scales: {
        x: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } },
        y: { min: 0, max: 100, ticks: { color: '#8b949e', callback: v => v.toFixed(0) }, grid: { color: '#21262d' }, title: { display: true, text: '归一化值 (0-100)', color: '#8b949e' } }
      }
    }
  });
}

// ============================================================
// 自动刷新：订阅 server.js 的文件监听，数据变化时自动重载
// 用 ?watch=0 关闭；无服务器时 EventSource 不可用则静默跳过。
// ============================================================
async function setupWatch() {
  if (new URLSearchParams(location.search).get("watch") === "0") return;
  if (typeof EventSource !== "function") return;
  if (!(await DataSource.isServerReady())) return; // 无服务器时不订阅，避免无谓重连
  let es;
  try { es = new EventSource("/api/watch"); } catch { return; }

  let timer = null;
  es.onmessage = ev => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    const base = gameConfig && gameConfig.gameId === "lolm" ? "lolm" : "曙光英雄";
    if (msg.dir !== base) return; // 只关心当前游戏
    clearTimeout(timer);
    timer = setTimeout(reloadFromDisk, 400);
  };
  es.onerror = () => { /* EventSource 会自动重连 */ };
}

let watchReloading = false;
async function reloadFromDisk() {
  if (!gameConfig || watchReloading) return;
  watchReloading = true;
  const base = gameConfig.gameId === "lolm" ? "lolm" : "曙光英雄";
  try {
    const cfg = await DataSource.loadConfig(base);
    // 保存当前搜索词（buildControls 会重建搜索框）
    const searchBox = document.querySelector(".search-box");
    const searchVal = searchBox ? searchBox.value : "";

    // 日期列表是否有变化（新增/删除日期文件 → 重建日期按钮）
    const oldDates = (gameConfig.dates || []).map(d => d.date).join(",");
    const newDates = (cfg.dates || []).map(d => d.date).join(",");
    const datesChanged = oldDates !== newDates;

    gameConfig = cfg;
    if (gameConfig.hasDates && gameConfig.dates && gameConfig.dates.length) {
      // 当前日期已不在列表（比如新增了日期文件）→ 跳到服务器默认（最新）
      if (!gameConfig.dates.some(d => d.date === currentDate)) {
        currentDate = gameConfig.defaultDate;
      }
    }
    await loadGameData();
    if (datesChanged) {
      buildControls();
      const nb = document.querySelector(".search-box");
      if (nb) nb.value = searchVal;
    }
    renderAll();
  } catch (e) {
    console.warn("[watch] 重载失败:", e);
  } finally {
    watchReloading = false;
  }
}

// ============================================================
// 启动
// ============================================================
async function init() {
  // Parse URL params
  const params = new URLSearchParams(window.location.search);
  const gameId = params.get("game") || "lolm";
  if (params.get("viewmode") === "grid") currentViewMode = "grid";
  const urlDate = params.get("date");

  await switchGame(gameId);

  // URL 里指定了日期且属于该游戏的日期列表 → 切换到它
  if (urlDate && gameConfig && gameConfig.hasDates) {
    const validDates = (gameConfig.dates || []).map(d => d.date);
    if (validDates.includes(urlDate) && urlDate !== currentDate) {
      await switchDate(urlDate);
    }
  }

  setupWatch();
}

// ESC to close hero detail
document.addEventListener("keydown", e => { if (e.key === "Escape") closeHeroDetail(); });
// Auto-start
document.addEventListener("DOMContentLoaded", init);
