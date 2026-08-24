"""
曙光英雄 Ban率预测 v2 — 基于实际Ban率排名校准
==================================================
用户提供了真实禁用率排名: 貂蝉, 布伦希尔德, 艾蒙, 青木, 瑞恩, 诸葛亮, 祝融, 嫦娥, 刘备, 黛西
用这些数据来反推: 什么特征组合最能解释Ban率?
"""

import json
import math
import os

# ============================================================
# 1. 加载数据
# ============================================================

def load_sg_data(date='2026-07-20'):
    base = os.path.dirname(__file__)
    path = os.path.join(base, f'曙光英雄_{date}.json')
    with open(path, 'r', encoding='utf-8') as f:
        heroes = json.load(f)

    result = []
    for h in heroes:
        result.append({
            'heroName': h['heroName'],
            'appearanceRank': int(h['appearanceRank']),
            'combatPower': float(h['combatPower']),
            'winRate': float(h['winRate'].replace('%', '')) / 100,
        })
    return result

# ============================================================
# 2. 特征工程 + 标签
# ============================================================

# 用户提供的实际高Ban英雄 (按Ban率从高到低排列)
ACTUAL_TOP_BAN = [
    '貂蝉', '布伦希尔德', '艾蒙', '青木', '瑞恩',
    '诸葛亮', '祝融', '嫦娥', '刘备', '黛西'
]

# 给每个英雄分配实际Ban排名 (排名越小=Ban率越高, 未上榜的给一个大排名)
ACTUAL_BAN_RANK = {}
for i, name in enumerate(ACTUAL_TOP_BAN):
    ACTUAL_BAN_RANK[name] = i + 1  # 1=最高Ban

def build_features(heroes):
    """构建特征矩阵"""
    n = len(heroes)

    # 原始特征
    ranks = [h['appearanceRank'] for h in heroes]
    combats = [h['combatPower'] for h in heroes]
    wrs = [h['winRate'] for h in heroes]

    # 归一化特征 (0~1, 越高越好)
    def minmax(arr):
        mn, mx = min(arr), max(arr)
        if mx == mn: return [0.5]*len(arr)
        return [(v-mn)/(mx-mn) for v in arr]

    # 出场排名: 排名越小越好, 归一化后反转
    rank_score = [1 - (r - 1) / (n - 1) for r in ranks]

    cp_score = minmax(combats)
    wr_score = minmax(wrs)

    # 复合特征
    # "meta强度" = 出场率 × 胜率 (又热门又强)
    meta_power = [r * w for r, w in zip(rank_score, wr_score)]
    meta_power = minmax(meta_power)

    # "毒瘤度" = 出场率 × (1-胜率) (热门但弱, LoLM中高Ban)
    troll_score = [r * (1 - w) for r, w in zip(rank_score, wrs)]
    troll_score = minmax(troll_score)

    # "战力-胜率共振" = 战力分 × 胜率 (绝活哥英雄)
    cp_wr_resonance = [c * w for c, w in zip(cp_score, wr_score)]
    cp_wr_resonance = minmax(cp_wr_resonance)

    # "综合热度" = 出场率 (非线性: 头部更集中)
    hotness = [1.0 / (r ** 0.6) for r in ranks]
    hotness = minmax(hotness)

    # 标签
    labels = []
    ban_ranks_list = []
    for h in heroes:
        if h['heroName'] in ACTUAL_BAN_RANK:
            labels.append(1)  # 高Ban
            ban_ranks_list.append(ACTUAL_BAN_RANK[h['heroName']])
        else:
            labels.append(0)
            ban_ranks_list.append(999)  # 未上榜

    return {
        'rank_score': rank_score,
        'cp_score': cp_score,
        'wr_score': wr_score,
        'meta_power': meta_power,
        'troll_score': troll_score,
        'cp_wr_resonance': cp_wr_resonance,
        'hotness': hotness,
        'labels': labels,
        'ban_ranks': ban_ranks_list,
    }

# ============================================================
# 3. 分析: 什么特征能区分高Ban英雄?
# ============================================================

def analyze_discriminative_power(features, heroes):
    """分析每个特征区分高Ban vs 非高Ban的能力"""
    labels = features['labels']
    n_top = sum(labels)
    n_rest = len(labels) - n_top

    feature_names = ['rank_score', 'cp_score', 'wr_score', 'meta_power',
                     'troll_score', 'cp_wr_resonance', 'hotness']

    print("=" * 70)
    print("特征区分能力分析: 高Ban英雄 vs 其他英雄")
    print("=" * 70)
    print(f"  高Ban英雄: {n_top}个")
    print(f"  其他英雄: {n_rest}个")
    print()

    def mean(arr): return sum(arr)/len(arr)

    results = []
    for fname in feature_names:
        fvals = features[fname]
        top_vals = [fvals[i] for i, l in enumerate(labels) if l == 1]
        rest_vals = [fvals[i] for i, l in enumerate(labels) if l == 0]

        mean_top = mean(top_vals)
        mean_rest = mean(rest_vals)

        # Cohen's d: effect size
        def std_dev(arr, m):
            return math.sqrt(sum((v-m)**2 for v in arr)/len(arr))

        sd_top = std_dev(top_vals, mean_top) if len(top_vals)>1 else 0.001
        sd_rest = std_dev(rest_vals, mean_rest) if len(rest_vals)>1 else 0.001
        pooled_sd = math.sqrt((sd_top**2 + sd_rest**2) / 2)
        cohens_d = (mean_top - mean_rest) / pooled_sd if pooled_sd > 0 else 0

        # Point-biserial correlation (equivalent to Pearson r for binary×continuous)
        def pearson_r(x, y):
            mx, my = mean(x), mean(y)
            num = sum((xi-mx)*(yi-my) for xi, yi in zip(x, y))
            den = math.sqrt(sum((xi-mx)**2 for xi in x) * sum((yi-my)**2 for yi in y))
            return num/den if den else 0

        r_pb = pearson_r(fvals, labels)

        results.append((fname, cohens_d, r_pb, mean_top, mean_rest))

        print(f"  {fname:20s}: Cohen's d={cohens_d:+.3f}  r_pb={r_pb:+.3f}  "
              f"高Ban均值={mean_top:.3f}  其他均值={mean_rest:.3f}")

    results.sort(key=lambda x: abs(x[2]), reverse=True)
    print(f"\n  区分能力排名 (按|r_pb|):")
    for i, (fname, d, r, _, _) in enumerate(results):
        print(f"    {i+1}. {fname}: r={r:+.4f}, Cohen's d={d:+.3f}")

    return results

# ============================================================
# 4. 网格搜索最优权重
# ============================================================

def grid_search_weights(features, heroes):
    """
    搜索权重组合, 使预测排名与实际Ban排名的 Spearman 相关系数最大化。
    实际Ban排名: 貂蝉=1, 布伦希尔德=2, ..., 黛西=10, 其他=999
    """
    actual_ranks = features['ban_ranks']

    # 将实际排名转换为rank分数 (越小越好 → 越大越好)
    # 对于未上榜的, 使用最大的排名
    max_rank = max(r for r in actual_ranks if r < 999) + len(heroes)

    def to_rank_score(ranks):
        # 排名越小 → 分数越高
        return [1.0 / (r ** 0.5) if r < 999 else 1.0 / (max_rank ** 0.5)
                for r in ranks]

    target = to_rank_score(actual_ranks)

    def spearman_rho(x, y):
        n = len(x)
        def rankify(arr):
            idx = sorted(range(n), key=lambda i: arr[i], reverse=True)
            r = [0]*n
            for j, i in enumerate(idx):
                r[i] = j+1
            return r
        rx, ry = rankify(x), rankify(y)
        mx = sum(rx)/n
        my = sum(ry)/n
        num = sum((rx[i]-mx)*(ry[i]-my) for i in range(n))
        den = math.sqrt(sum((rx[i]-mx)**2 for i in range(n)) *
                        sum((ry[i]-my)**2 for i in range(n)))
        return num/den if den else 0

    base_features = {
        'rank_score': features['rank_score'],
        'cp_score': features['cp_score'],
        'wr_score': features['wr_score'],
    }

    best_rho = -1
    best_weights = None

    print("\n" + "=" * 70)
    print("网格搜索: 最优权重组合 (最大化与实际Ban排名的Spearman ρ)")
    print("=" * 70)

    results_grid = []
    # 搜索权重空间
    for w_rank in [round(x*0.05, 2) for x in range(0, 21)]:  # 0.00 ~ 1.00
        for w_cp in [round(x*0.05, 2) for x in range(0, 21)]:
            w_wr = round(1.0 - w_rank - w_cp, 2)
            if w_wr < 0:
                continue

            # 合成得分
            scores = [w_rank * base_features['rank_score'][i] +
                      w_cp * base_features['cp_score'][i] +
                      w_wr * base_features['wr_score'][i]
                      for i in range(len(heroes))]

            rho = spearman_rho(scores, target)
            results_grid.append((rho, w_rank, w_cp, w_wr))

            if rho > best_rho:
                best_rho = rho
                best_weights = (w_rank, w_cp, w_wr)

    results_grid.sort(reverse=True)
    print(f"\n  最优权重: 出场={best_weights[0]:.2f}, 战力={best_weights[1]:.2f}, 胜率={best_weights[2]:.2f}")
    print(f"  最优Spearman ρ = {best_rho:.4f}")
    print(f"\n  Top 10 权重组合:")
    for i, (rho, wr, wc, ww) in enumerate(results_grid[:10]):
        print(f"    {i+1}. ρ={rho:.4f}  出场={wr:.2f}  战力={wc:.2f}  胜率={ww:.2f}")

    return best_weights, best_rho

# ============================================================
# 5. 最终预测
# ============================================================

def predict_with_weights(heroes, features, weights):
    """用最优权重生成最终预测"""
    w_rank, w_cp, w_wr = weights

    base = {
        'rank_score': features['rank_score'],
        'cp_score': features['cp_score'],
        'wr_score': features['wr_score'],
    }

    scores = [w_rank * base['rank_score'][i] +
              w_cp * base['cp_score'][i] +
              w_wr * base['wr_score'][i]
              for i in range(len(heroes))]

    # Min-max to 0-100
    mn, mx = min(scores), max(scores)
    if mx > mn:
        scores_100 = [(s - mn) / (mx - mn) * 100 for s in scores]
    else:
        scores_100 = [50] * len(scores)

    results = []
    for i, h in enumerate(heroes):
        is_top_ban = h['heroName'] in ACTUAL_BAN_RANK
        actual_rank = ACTUAL_BAN_RANK.get(h['heroName'], '-')
        results.append({
            'heroName': h['heroName'],
            'appearanceRank': h['appearanceRank'],
            'combatPower': h['combatPower'],
            'winRate': round(h['winRate'] * 100, 2),
            'banScore': round(scores_100[i], 1),
            'isActualTopBan': is_top_ban,
            'actualBanRank': actual_rank,
        })

    results.sort(key=lambda h: h['banScore'], reverse=True)

    return results

# ============================================================
# 6. 主流程
# ============================================================

def main():
    heroes = load_sg_data('2026-07-20')
    features = build_features(heroes)

    # 步骤1: 分析哪些特征最重要
    discriminative = analyze_discriminative_power(features, heroes)

    # 步骤2: 网格搜索最优权重
    best_weights, best_rho = grid_search_weights(features, heroes)

    # 步骤3: 最终预测
    predictions = predict_with_weights(heroes, features, best_weights)

    # 统计预测准确度
    actual_top_set = set(ACTUAL_TOP_BAN)
    pred_top10 = [p['heroName'] for p in predictions[:10]]
    pred_top15 = [p['heroName'] for p in predictions[:15]]
    pred_top20 = [p['heroName'] for p in predictions[:20]]

    recall_10 = len(set(pred_top10) & actual_top_set)
    recall_15 = len(set(pred_top15) & actual_top_set)
    recall_20 = len(set(pred_top20) & actual_top_set)

    # 输出
    print("\n" + "=" * 70)
    print("最终预测: 曙光英雄 高Ban率英雄 (校准后)")
    print("=" * 70)
    print(f"\n  模型: banScore = {best_weights[0]:.2f}*出场分 + {best_weights[1]:.2f}*战力分 + {best_weights[2]:.2f}*胜率分")
    print(f"  与实际Ban排名的Spearman ρ = {best_rho:.4f}")
    print(f"\n  召回率:")
    print(f"    Top-10 预测命中: {recall_10}/10 ({recall_10*10}%)")
    print(f"    Top-15 预测命中: {recall_15}/10 ({recall_15*10}%)")
    print(f"    Top-20 预测命中: {recall_20}/10 ({recall_20*10}%)")

    print(f"\n{'排名':<5} {'英雄':<10} {'出场排名':<8} {'战力分':<8} {'胜率':<8} {'Ban评分':<8} {'实际Ban排名':<10}")
    print("-" * 70)

    for i, p in enumerate(predictions):
        marker = '✓' if p['isActualTopBan'] else ''
        actual = str(p['actualBanRank']) if p['isActualTopBan'] else '-'
        print(f"{i+1:<5} {p['heroName']:<10} {p['appearanceRank']:<8} "
              f"{p['combatPower']:<8.0f} {p['winRate']:<8.2f}% "
              f"{p['banScore']:<8.1f} {actual:<10} {marker}")

    # 保存
    output_path = os.path.join(os.path.dirname(__file__), 'ban_rate_prediction_v2.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(predictions, f, ensure_ascii=False, indent=2)
    print(f"\n结果已保存: {output_path}")

    # 总结
    print("\n" + "=" * 70)
    print("关键发现")
    print("=" * 70)
    print("""
  曙光英雄 vs LoLM 的Ban文化差异:
  ┌──────────────┬─────────────────────┬─────────────────────┐
  │              │ LoLM                │ 曙光英雄             │
  ├──────────────┼─────────────────────┼─────────────────────┤
  │ 高Ban特征    │ 高出场+中等/低胜率   │ 高胜率+高端局强势    │
  │ 典型例子     │ 无极剑圣(47%WR→46%BR)│ 貂蝉(57%WR→最高Ban) │
  │ 核心驱动     │ 毒瘤/烦人程度        │ 实际强度             │
  │ 冷门高胜率   │ 很少被Ban           │ 容易被Ban            │
  └──────────────┴─────────────────────┴─────────────────────┘

  LoLM玩家Ban「队友可能坑我的英雄」
  曙光英雄玩家Ban「对手拿了就赢的英雄」
""")

    return predictions

if __name__ == '__main__':
    main()
