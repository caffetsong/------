const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '曙光英雄.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const heroes = data.map(h => ({
  name: h.heroName,
  appearanceRank: parseInt(h.appearanceRank),
  combatPower: parseFloat(h.combatPower),
  winRate: parseFloat(String(h.winRate).replace('%','')) / 100,
}));
const N = heroes.length;

function mean(a) { return a.reduce((s,v)=>s+v,0)/a.length; }
function std(a) { const m=mean(a); return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length); }
function minmax(arr) { const lo=Math.min(...arr), hi=Math.max(...arr); return arr.map(v=>(v-lo)/(hi-lo||1)); }
function cv(arr) { return std(arr)/Math.abs(mean(arr)); }

function spearman(x, y) {
  const n = x.length;
  const rank = arr => { const idx = arr.map((_,i)=>i).sort((a,b)=>arr[a]-arr[b]); const r=Array(n); idx.forEach((v,i)=>r[v]=i+1); return r; };
  const rx = rank(x), ry = rank(y);
  const mx = mean(rx), my = mean(ry);
  const num = rx.reduce((s,v,i)=>s+(v-mx)*(ry[i]-my),0);
  const den = Math.sqrt(rx.reduce((s,v)=>s+(v-mx)**2,0) * ry.reduce((s,v)=>s+(v-my)**2,0));
  return num/(den||1);
}

// ===== 1. Distribution =====
console.log('=== 1. 数据分布分析 ===\n');

const ranks = heroes.map(h=>h.appearanceRank);
console.log('【出场排名】');
console.log('  范围: ' + Math.min(...ranks) + ' ~ ' + Math.max(...ranks) + ' (均匀, CV=' + cv(ranks).toFixed(2) + ')');

const combats = heroes.map(h=>h.combatPower);
console.log('【战力分】');
console.log('  均值: ' + mean(combats).toFixed(1) + ', 标准差: ' + std(combats).toFixed(1));
const cSorted = [...combats].sort((a,b)=>a-b);
console.log('  十分位: P10='+cSorted[Math.floor(N*0.1)]+' P25='+cSorted[Math.floor(N*0.25)]+' P50='+cSorted[Math.floor(N*0.5)]+' P75='+cSorted[Math.floor(N*0.75)]+' P90='+cSorted[Math.floor(N*0.9)]);

const wrs = heroes.map(h=>h.winRate);
console.log('【胜率】');
console.log('  范围: ' + (Math.min(...wrs)*100).toFixed(2) + '% ~ ' + (Math.max(...wrs)*100).toFixed(2) + '%');
console.log('  均值: ' + (mean(wrs)*100).toFixed(2) + '%, 标准差: ' + (std(wrs)*100).toFixed(3) + '%');

// ===== 2. Data structure check =====
console.log('\n=== 2. 数据结构问题检测 ===');
let wrSorted = true, prev = 999;
for (const h of heroes) { if (h.winRate > prev) { wrSorted = false; break; } prev = h.winRate; }
let arIsIndex = heroes.every((h,i) => h.appearanceRank === i + 1);
console.log('JSON按胜率严格降序: ' + (wrSorted ? '是 ⚠️' : '否'));
console.log('appearanceRank = 胜率排名: ' + (arIsIndex ? '是 ⚠️ (完全共线!)' : '否'));
if (wrSorted && arIsIndex) {
  console.log('→ 严重问题: 出场排名和胜率排名是同一个东西!');
  console.log('→ 算法中的 0.20+0.30=0.50 权重实际上都作用于同一个信号');
}

// ===== 3. Spearman =====
console.log('\n=== 3. Spearman 秩相关 ===');
const aScores = heroes.map(h => 1 - (h.appearanceRank - 1) / (N - 1));
const cScores = minmax(combats);
const wScores = minmax(wrs);
const rawPowers = heroes.map((h,i) => 0.20*aScores[i] + 0.50*cScores[i] + 0.30*wScores[i]);
const rMin=Math.min(...rawPowers), rMax=Math.max(...rawPowers), rRng=rMax-rMin||1;
const finalScores = rawPowers.map(v => ((v-rMin)/rRng)*100);

console.log('  AR vs 战力:  ρ = ' + spearman(ranks.map(r=>1/r), combats).toFixed(4));
console.log('  AR vs 胜率:  ρ = ' + spearman(ranks.map(r=>1/r), wrs).toFixed(4));
console.log('  战力 vs 胜率: ρ = ' + spearman(combats, wrs).toFixed(4));
console.log('  Score vs AR:  ρ = ' + spearman(finalScores, ranks.map(r=>r)).toFixed(4));
console.log('  Score vs 战力: ρ = ' + spearman(finalScores, combats).toFixed(4));
console.log('  Score vs 胜率: ρ = ' + spearman(finalScores, wrs).toFixed(4));

// ===== 4. Effective weights =====
console.log('\n=== 4. 有效权重分析 ===');
const rhoAR = Math.abs(spearman(finalScores, ranks.map(r=>r)));
const rhoCP = Math.abs(spearman(finalScores, combats));
const rhoWR = Math.abs(spearman(finalScores, wrs));
const totalRho = rhoAR*0.20 + rhoCP*0.50 + rhoWR*0.30;
console.log('  出场(名义20%): 有效' + (rhoAR*0.20/totalRho*100).toFixed(1) + '%');
console.log('  战力(名义50%): 有效' + (rhoCP*0.50/totalRho*100).toFixed(1) + '%');
console.log('  胜率(名义30%): 有效' + (rhoWR*0.30/totalRho*100).toFixed(1) + '%');

// ===== 5. Top anomalies =====
console.log('\n=== 5. 战力与胜率矛盾案例 ===');
const sorted = heroes.map((h,i)=>({...h, score:finalScores[i], rank:0}));
sorted.sort((a,b)=>b.score-a.score);
sorted.forEach((h,i) => h.rank = i+1);

const cpMed = cSorted[Math.floor(N*0.5)];
const wrMed = [...wrs].sort((a,b)=>a-b)[Math.floor(N*0.5)];

let n = 0;
console.log('战力高(≥140)但胜率≤48% (算法可能低估):');
for (const h of sorted) {
  if (h.combatPower >= 140 && h.winRate <= 0.48) {
    console.log('  #'+h.rank+' '+h.name+' CP='+h.combatPower+' WR='+(h.winRate*100).toFixed(1)+'% Score='+h.score.toFixed(1));
    n++;
  }
}
if (!n) console.log('  (无)');

n = 0;
console.log('战力低(≤90)但胜率≥49% (算法可能高估):');
for (const h of sorted) {
  if (h.combatPower <= 90 && h.winRate >= 0.49) {
    console.log('  #'+h.rank+' '+h.name+' CP='+h.combatPower+' WR='+(h.winRate*100).toFixed(1)+'% Score='+h.score.toFixed(1));
    n++;
  }
}
if (!n) console.log('  (无)');

// ===== 6. Scenario tests =====
console.log('\n=== 6. 场景测试: 如果让战力分真正主导排名 ===');
const altWeights = [
  { label: '基准 0.20/0.50/0.30', a:0.20, c:0.50, w:0.30 },
  { label: '强化战力 0.10/0.70/0.20', a:0.10, c:0.70, w:0.20 },
  { label: '降出场 0.05/0.55/0.40', a:0.05, c:0.55, w:0.40 },
  { label: '纯战力+胜率 0.00/0.65/0.35', a:0.00, c:0.65, w:0.35 },
];

altWeights.forEach(alt => {
  const rp = heroes.map((h,i) => alt.a*aScores[i] + alt.c*cScores[i] + alt.w*wScores[i]);
  const mn=Math.min(...rp), mx=Math.max(...rp), rg=mx-mn||1;
  const fs = rp.map(v => ((v-mn)/rg)*100);
  const altSorted = heroes.map((h,i)=>({...h, score:fs[i]})).sort((a,b)=>b.score-a.score);
  const rho = spearman(fs, combats);
  console.log('  [' + alt.label + '] finalScore vs 战力 ρ=' + rho.toFixed(4) + ' Top3: ' + altSorted.slice(0,3).map(h=>h.name).join(', '));
});