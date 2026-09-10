/* ============================================================
   tierlist.js — 曙光英雄梯度排行榜核心引擎
   （LoLM 已解耦：算法/分路/全局排名相关代码不在本项目中）
   ============================================================ */

"use strict";

// ---- 全局状态 ----
let gameConfig = null;      // 曙光英雄 config.json
let gameData = null;        // 计算后的结构化数据
const currentMethod = "weighted"; // 固定为加权和
let currentViewMode = "table"; // "table"|"grid" — 展示模式
let currentDate = null;      // 当前选中的日期 (YYYY-MM-DD)
let currentGridLane = null;  // 网格视图：常用分路过滤（null=全部），取自 英雄介绍.json

// ---- 工具函数 ----
function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

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

// 曙光英雄算法（从 Python validate_pure.py 移植）
// ============================================================
function computeSG(rawData) {
  // 战力信号字段可配置：combatField 默认取展示用 combatPower（国9+50+100 求和）；
  // 设为 "国9战力" 等原始字段时，算法用该字段打分（高端局信号），展示列仍用 combatPower。
  const combatField = (gameConfig.algorithm && gameConfig.algorithm.combatField) || "combatPower";
  const heroes = rawData.map(h => {
    const rawCombat = h[combatField];
    return {
      name: h.heroName,
      headIcon: gameConfig.headIconPath ? gameConfig.headIconPath.replace("{name}", h.heroName) : null,
      appearanceRank: parseInt(h.appearanceRank),
      combatPower: parseFloat(h.combatPower),
      combatSignal: parseFloat(rawCombat != null && rawCombat !== "" ? rawCombat : h.combatPower),
      // 暴露战力信号原始字段（如 国9战力），供 columns 配置引用展示/排序
      [combatField]: parseFloat(rawCombat != null && rawCombat !== "" ? rawCombat : h.combatPower),
      winRate: parseFloat(String(h.winRate).replace("%", "")) / 100,
      lane: null
    };
  });

  const N = heroes.length;
  const weights = gameConfig.algorithm.weights;

  // 出场分：rank 越小越好，转换为 1 → 1.0, N → 0.0
  const appearanceScores = heroes.map(h => 1 - (h.appearanceRank - 1) / (N - 1));

  // 战力分 min-max 归一化
  const combatVals = heroes.map(h => h.combatSignal);
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
  
  // 多期日期数据：当前日期 + 上一期（用于梯度/名次变化对比）
  let dataFile;
  if (gameConfig.hasDates && gameConfig.dates && gameConfig.dates.length > 0) {
    const dateEntry = gameConfig.dates.find(d => d.date === currentDate) || gameConfig.dates[0];
    dataFile = dateEntry.file;
    if (!currentDate) currentDate = dateEntry.date;
  } else {
    throw new Error("未发现日期数据：请用 bun server.js 启动（需 曙光英雄_YYYY-MM-DD.json）");
  }
  const resp = await fetch(dataFile);
  if (!resp.ok) throw new Error(`加载数据失败: ${resp.status}`);
  const rawData = await resp.json();
  const data = computeSG(rawData);
  gameData = {
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
          const prevResp = await fetch(prevEntry.file);
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

// ============================================================
// 获取当前有效的字段
// ============================================================
function getScoreField(hero) {
  return "score";
}

function getTierField(hero) {
  return "tier";
}

function getGlobalRank(hero) {
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
      } else if (col.field === "tier") {
        displayVal = h.tier;
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
        // 显示与上一期的梯度变化箭头（有 prevTier 数据时）
        if (h.prevTier && h.prevTier !== displayVal) {
          const tierOrder = ["T4", "T3", "T2", "T1", "T0.5", "T0"];
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
          const clickable = gameConfig.hasDates ? ` style="cursor:pointer" onclick="showHeroDetail('${h.name.replace(/'/g, "\\'")}')"` : '';
          txt = `<div class="hero-cell"${clickable}><img class="hero-icon" src="${h.headIcon}" alt="${h.name}" onerror="this.style.display='none'"> <span class="hero-name">${txt}</span></div>`;
        } else if (col.type === "text" && col.field === "name") {
          const clickable = gameConfig.hasDates ? ` style="cursor:pointer" onclick="showHeroDetail('${h.name.replace(/'/g, "\\'")}')"` : '';
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
    const tier = h.tier;
    if (tier && validTiers.has(tier)) {
      groups[tier].push(h);
    } else {
      console.warn("[梯度异常] 英雄:", h.name, "| 梯度值:", tier);
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
  if (!gameConfig) return "";
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

// ============================================================
// 表格视图：梯度排行（全量，含波动横幅）
// ============================================================
function renderLaneView() {
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

// ---- 曙光网格：常用分路筛选（分路来自 英雄介绍.json 的「常用分路」字段） ----
function getIntroLaneOptions() {
  const counts = new Map();
  if (heroIntroMap) {
    for (const h of Object.values(heroIntroMap)) {
      for (const lane of (Array.isArray(h["常用分路"]) ? h["常用分路"] : [])) {
        if (lane) counts.set(lane, (counts.get(lane) || 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(e => e[0]);
}

function gridLaneTabsHtml() {
  const lanes = getIntroLaneOptions();
  if (lanes.length === 0) return "";
  let html = '<div class="grid-lane-tabs"><span class="label">分路：</span>';
  html += `<button class="${currentGridLane === null ? "active" : ""}" onclick="switchGridLane(null)">全部</button>`;
  lanes.forEach(l => {
    const safe = String(l).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/'/g, "\\'");
    html += `<button class="${currentGridLane === l ? "active" : ""}" onclick="switchGridLane('${safe}')">${String(l).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</button>`;
  });
  html += '</div>';
  return html;
}

function filterByGridLane(heroes) {
  if (!currentGridLane || !heroIntroMap) return heroes;
  return heroes.filter(h => {
    const e = heroIntroMap[h.name];
    return e && Array.isArray(e["常用分路"]) && e["常用分路"].indexOf(currentGridLane) !== -1;
  });
}

function switchGridLane(lane) {
  currentGridLane = lane;
  renderAll();
}

function renderAll() {
  if (!gameData) return;
  const content = document.getElementById("content");

  // 网格视图 — 单独处理
  if (currentViewMode === "grid") {
    const heroes = filterByGridLane(gameData.heroes);
    const dateBadge = currentDate ? `<span class="count-badge" style="background:#238636">📅 ${currentDate}</span>` : '';
    const laneBadge = currentGridLane ? `<span class="count-badge" style="background:#8957e5">${currentGridLane}</span>` : '';
    const titleHtml = `<div class="section-header">
        <h2>${gameConfig.gameIcon} ${gameConfig.gameName} 梯度排行</h2>
        <span class="count-badge">${heroes.length} 个英雄</span>${laneBadge}${dateBadge}</div>`;
    content.innerHTML = titleHtml + gridLaneTabsHtml() + renderGridView(heroes, null);
    return;
  }

  // 表格视图
  content.innerHTML = renderLaneView();
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
  const results = gameData.heroes.filter(h => h.name.toLowerCase().includes(q));

  if (results.length === 0) {
    document.getElementById("content").innerHTML =
      `<p style="text-align:center;padding:40px;color:#8b949e;">未找到匹配 "${query}" 的英雄</p>`;
    return;
  }

  // Sort by score descending
  const scoreKey = getScoreField();
  results.sort((a, b) => b[scoreKey] - a[scoreKey]);

  // Search result columns
  const searchCols = gameConfig.columns;

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
  const heroes = gameData.heroes;

  // Build column definitions
  const cols = gameConfig.columns;

  // Handle lane-specific rank column
  const col = (colIdx < cols.length) ? cols[colIdx] : { field: "rank", type: "rank" };

  // 动态找到英雄名列的索引（而非硬编码 cells[1]）
  const nameColIdx = cols.findIndex(c => c.field === "name");
  rows.sort((a, b) => {
    const heroA = heroes.find(h => h.name === a.cells[nameColIdx]?.textContent?.trim());
    const heroB = heroes.find(h => h.name === b.cells[nameColIdx]?.textContent?.trim());
    const va = heroA ? heroA[col.field] : 0;
    const vb = heroB ? heroB[col.field] : 0;

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
// 控制栏 / 展示模式
// ============================================================
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

  // 日期切换 — 下拉列表
  if (gameConfig.hasDates && gameConfig.dates && gameConfig.dates.length > 1) {
    const sortedDates = [...gameConfig.dates].sort((a, b) => b.date.localeCompare(a.date));
    html += `<span style="margin-left:16px" class="label">日期：</span>
      <select class="date-select" onchange="switchDate(this.value)" title="切换数据日期">
        ${sortedDates.map(d => {
          const label = d.date + (d.date === gameConfig.defaultDate ? "（最新）" : "");
          return `<option value="${d.date}"${d.date === currentDate ? " selected" : ""}>${label}</option>`;
        }).join("")}
      </select>`;
  }

  // 展示模式切换
  html += `<span style="margin-left:16px" class="label">展示：</span>
    <button id="btn-table" class="${currentViewMode === "table" ? "active" : ""}" onclick="switchViewMode('table')">📋 表格</button>
    <button id="btn-grid" class="${currentViewMode === "grid" ? "active" : ""}" onclick="switchViewMode('grid')">🎨 网格</button>`;

  html += `<input type="text" class="search-box" placeholder="🔍 搜索英雄..." oninput="doSearch(this.value)" style="margin-left:16px">`;
  controls.innerHTML = html;
}

// ============================================================
// 加载曙光英雄（单一游戏）
// ============================================================
async function switchGame() {
    try {
    gameConfig = await DataSource.loadConfig();
  } catch (e) {
    throw new Error(`加载曙光英雄配置失败: ${e.message}`);
  }

  // Reset state
  currentDate = null;
  if (gameConfig.hasDates) {
    if (!gameConfig.dates || gameConfig.dates.length === 0) {
      throw new Error("未发现日期数据：请用 bun server.js 启动后访问（日期文件由服务器自动扫描）");
    }
    currentDate = gameConfig.defaultDate || gameConfig.dates[0].date;
  }
  heroTimelineLoaded = false; heroTimeline = null; heroTimelineDates = [];
  heroIntroLoaded = false; heroIntroMap = null; currentGridLane = null;
  // Clear search box
  const searchBox = document.querySelector(".search-box");
  if (searchBox) searchBox.value = "";

  // Load data
  document.getElementById("content").innerHTML =
    '<p style="text-align:center;padding:60px;color:#8b949e;">⏳ 加载中...</p>';

  await loadGameData();

  // Rebuild UI
  buildControls();
  updateHeader();
  renderAll();
  updateFooter();

  // 预热英雄介绍数据（网格分路按钮依赖它）；加载完若在网格视图则重绘一次
  if (gameConfig.introFile) {
    loadHeroIntro().then(() => {
      if (currentViewMode === "grid") renderAll();
    });
  }
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
  if (currentViewMode !== "table") params.set("viewmode", currentViewMode);
  if (gameConfig && gameConfig.hasDates && currentDate) params.set("date", currentDate);
  const newUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
  if (window.location.pathname + window.location.search !== newUrl) {
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
  if (!gameConfig || !gameConfig.hasDates || !gameConfig.dates || gameConfig.dates.length === 0) return;

  heroTimelineDates = gameConfig.dates.map(d => d.date).sort();
  heroTimeline = {};
  
  for (const dateStr of heroTimelineDates) {
    const entry = gameConfig.dates.find(e => e.date === dateStr);
    if (!entry) continue;
    try {
      const resp = await fetch(entry.file);
      if (!resp.ok) continue;
      const raw = await resp.json();
      const result = computeSG(raw);
      const map = {};
      result.heroes.forEach(h => {
        map[h.name] = { score: h.score, winRate: h.winRate, combatPower: h.combatSignal, rank: h.rank, tier: h.tier, appearanceRank: h.appearanceRank };
      });
      heroTimeline[dateStr] = map;
    } catch (e) { }
  }
  heroTimelineLoaded = true;
}

// ============================================================
// HeroIntro — 英雄介绍数据（introFile，可选；无则详情只显示数据）
// ============================================================
let heroIntroMap = null;      // name -> {name, bannerUrl, 常用分路[], 擅长选手[]}
let heroIntroLoaded = false;

async function loadHeroIntro() {
  if (heroIntroLoaded) return;
  heroIntroLoaded = true;
  heroIntroMap = {};
  if (!gameConfig || !gameConfig.introFile) return;
    try {
    const resp = await fetch(gameConfig.introFile);
    if (!resp.ok) return;
    const list = await resp.json();
    // 本地横幅图：banner/<英雄名>.<扩展名>，文件名清单由服务器 /api/{dir}/banners 提供
    let bannerByName = null;
    try {
      const br = await fetch("/api/banners");
      if (br.ok) {
        const bd = await br.json();
        if (Array.isArray(bd.files)) {
          const bdir = bd.bannerDir || "banner";
          bannerByName = new Map(bd.files.map(f => [f.replace(/\.(png|jpe?g|webp|gif)$/i, ""), bdir + "/" + f]));
        }
      }
    } catch (e) { /* banners 接口不可用 → 无横幅图 */ }
    (Array.isArray(list) ? list : []).forEach(h => {
      if (!h || !h.name) return;
      const banner = bannerByName ? (bannerByName.get(h.name) || null) : null;
      heroIntroMap[h.name] = { name: h.name, 常用分路: h["常用分路"], 擅长选手: h["擅长选手"], banner };
    });
  } catch (e) { /* 静默失败：无介绍数据时详情只显示数据部分 */ }
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// 详情页上部"英雄介绍"卡：样式参考 英雄介绍详情.html
// h.banner = 本地横幅图相对路径（如 banner/鲁智深.jpg）；无图则纯暗底卡片
function buildHeroIntroHtml(h) {
  const name = escHtml(h.name);
  const bg = h.banner ? escHtml(h.banner) : "";
  const lanes = (Array.isArray(h["常用分路"]) ? h["常用分路"] : []).filter(Boolean);
  const players = (Array.isArray(h["擅长选手"]) ? h["擅长选手"] : []).filter(Boolean);
  const laneVal = lanes.length ? escHtml(lanes.join(" / ")) : '<span class="hd-intro-empty">待补充</span>';
  const playersChips = players.length
    ? players.map(p => `<span class="hd-intro-player">${escHtml(p)}</span>`).join("")
    : '<span class="hd-intro-empty">待补充</span>';
  const bgDiv = bg
    ? `<div class="hd-intro-bg" style="background-image:url('${bg}')"></div><div class="hd-intro-mask"></div>`
    : `<div class="hd-intro-mask hd-intro-mask-none"></div>`;
  return `<div class="hd-intro">
      ${bgDiv}
      <div class="hd-intro-content">
        <h2 class="hd-intro-name">${name}</h2>
        <div class="hd-intro-lane">
          <span class="hd-intro-label">常用分路</span>
          <span class="hd-intro-value">${laneVal}</span>
        </div>
        <div class="hd-intro-players">
          <span class="hd-intro-label">擅长选手</span>
          <span class="hd-intro-chips">${playersChips}</span>
        </div>
      </div>
    </div>`;
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
        <a class="hd-prep-link" id="hdPrepLink" href="#" target="_blank" rel="noopener" title="在新标签页打开该英雄的备战方案（符文 + 出装）">🧩 备战方案</a>
        <button class="hero-detail-close" onclick="closeHeroDetail()">✕</button>
      </div>
      <div class="hero-detail-body" id="hdBody"></div>
    </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) closeHeroDetail(); });
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  document.getElementById('hdTitle').textContent = name + ' 英雄详情';
  // 入口：跳到备战管理器页面，并预选该英雄
  const prepLink = document.getElementById('hdPrepLink');
  if (prepLink) prepLink.href = "/备战.html?hero=" + encodeURIComponent(name);
  document.getElementById('hdBody').innerHTML = '<p style="text-align:center;padding:40px;color:#8b949e">⏳ 加载趋势数据...</p>';
  Promise.all([loadHeroTimeline(), loadHeroIntro()]).then(() => renderHeroDetail(name));
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
  // 上部：英雄介绍卡（英雄介绍.json 里有该英雄才显示）
  const intro = (heroIntroMap && heroIntroMap[name]) || null;
  const introHtml = intro ? buildHeroIntroHtml(intro) : "";
  if (points.length === 0) {
    document.getElementById('hdBody').innerHTML = introHtml + '<p style="text-align:center;padding:40px;color:#8b949e">暂无历史数据</p>';
    return;
  }

  const heroCount = Math.max(...heroTimelineDates.map(d => heroTimeline[d] ? Object.keys(heroTimeline[d]).length : 0), 0);
  const combatLabel = (gameConfig.algorithm && gameConfig.algorithm.combatField) || "战力";

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

  let html = introHtml;
  html += '<div class="chart-box"><canvas id="chartHeroTimeline" style="height:360px"></canvas></div>';
  html += `<table class="mini-table"><thead><tr><th>日期</th><th>梯度</th><th>排名</th><th>评分</th><th>胜率</th><th>${combatLabel}</th><th>出场排名</th></tr></thead><tbody>`;
  points.forEach(p => {
    html += `<tr><td>${p.date}</td><td>${getTierBadge(p.tier)}</td><td>#${p.rank}</td><td>${p.score.toFixed(1)}</td><td>${(p.winRate * 100).toFixed(2)}%</td><td>${p.combatPower}</td><td>#${p.appearanceRank}</td></tr>`;
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
        { label: combatLabel, data: points.map(p => norm(p.combatPower, gMin.combatPower, gMax.combatPower)), borderColor: '#d2991d', backgroundColor: '#d2991d', tension: 0.2, borderWidth: 2.5, pointRadius: 5 },
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
    // 单游戏：所有数据变化都与本页相关
    clearTimeout(timer);
    timer = setTimeout(reloadFromDisk, 400);
  };
  es.onerror = () => { /* EventSource 会自动重连 */ };
}

let watchReloading = false;
async function reloadFromDisk() {
  if (!gameConfig || watchReloading) return;
  watchReloading = true;
    try {
    const cfg = await DataSource.loadConfig();
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
  if (params.get("viewmode") === "grid") currentViewMode = "grid";
  const urlDate = params.get("date");

  await switchGame();

  // URL 里指定了日期且属于日期列表 → 切换到它
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
