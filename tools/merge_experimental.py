#!/usr/bin/env python3
"""合并大神榜 XLSX 与周期统计 JSON（实验性数据）。

用法：
  # 有当期统计（出场排名/胜率）时
  python tools/merge_experimental.py <xlsx> <stats.json> <输出.json>

  # 只有战力分布、当期还没有胜率/出场排名时（不会复制任何旧统计）
  python tools/merge_experimental.py <xlsx> --no-stats <输出.json>

安全约束：统计 JSON 的日期与输出文件日期不一致时，默认拒绝，
避免把上一期的 winRate / appearanceRank 复制到新一期。
"""
import json
import os
import re
import sys
from collections import defaultdict

from openpyxl import load_workbook

DEFAULT_XLSX = r"E:\download\获取排行榜\曙光英雄_大神榜_全英雄_20261025.xlsx"
DEFAULT_STATS = r"E:\kaifa\曙光英雄梯度\曙光英雄_2026-10-19.json"
DEFAULT_OUT = DEFAULT_STATS
BUILTIN_ALIASES = {"许禇": "许褚"}


def date_of(path):
    if not path:
        return None
    m = re.search(r"(\d{4}-\d{2}-\d{2})", os.path.basename(path))
    return m.group(1) if m else None


def load_aliases(intro_path=r"E:\kaifa\曙光英雄梯度\英雄介绍.json"):
    aliases = dict(BUILTIN_ALIASES)
    try:
        intro = json.load(open(intro_path, encoding="utf-8"))
    except Exception:
        return aliases
    for item in intro:
        name = item.get("name")
        if not name:
            continue
        aliases.setdefault(name, name)
        for alias in item.get("aliases", []) or []:
            aliases[alias] = name
    return aliases


def main():
    if len(sys.argv) == 1:
        raise SystemExit(
            "为避免误覆盖，请显式传入参数：\n"
            "  python tools/merge_experimental.py <xlsx> <stats.json> <输出.json>\n"
            "  python tools/merge_experimental.py <xlsx> --no-stats <输出.json>"
        )
    power_only = "--no-stats" in sys.argv
    allow_copy = "--allow-copy-stats" in sys.argv
    argv = [a for a in sys.argv[1:] if not a.startswith("--")]

    xlsx = argv[0] if len(argv) > 0 else DEFAULT_XLSX
    if power_only:
        stats_path = None
        out_path = argv[1] if len(argv) > 1 else None
        if not out_path:
            raise SystemExit("--no-stats 需要显式指定输出文件")
    else:
        stats_path = argv[1] if len(argv) > 1 else DEFAULT_STATS
        out_path = argv[2] if len(argv) > 2 else DEFAULT_OUT

    stats_date = date_of(stats_path)
    out_date = date_of(out_path)
    if not power_only and stats_date and out_date and stats_date != out_date and not allow_copy:
        raise SystemExit(
            f"统计 JSON 日期 {stats_date} 与输出 {out_date} 不一致；"
            "拒绝把旧 winRate / appearanceRank 复制到新一期。\n"
            "只要战力分布请加 --no-stats；确需复制旧统计请加 --allow-copy-stats。"
        )

    wb = load_workbook(xlsx, data_only=True, read_only=True)
    if "全英雄榜单" not in wb.sheetnames:
        raise SystemExit("缺少工作表：全英雄榜单")
    rows = list(wb["全英雄榜单"].iter_rows(min_row=2, values_only=True))
    wb.close()

    by_hero = defaultdict(list)
    for hero, _param, rank, player, power, uid in rows:
        if hero is None or rank is None or power is None:
            continue
        by_hero[str(hero).strip()].append({
            "rank": int(rank),
            "power": int(power),
            "player": player,
            "uid": None if uid is None else str(uid),
        })

    aliases = load_aliases()
    if power_only:
        # 只保留 XLSX 能提供的东西；胜率/出场排名留空，等待后续统计导入
        stats = [{"heroName": name, "appearanceRank": "", "winRate": ""} for name in by_hero]
    else:
        stats = json.load(open(stats_path, encoding="utf-8"))
        if not isinstance(stats, list):
            raise SystemExit("统计 JSON 必须是数组")

    heroes = []
    missing = []
    for src in stats:
        raw_name = str(src.get("heroName") or src.get("name") or "").strip()
        name = aliases.get(raw_name, raw_name)
        players = sorted(by_hero.get(name, []), key=lambda x: x["rank"])
        power = [p["power"] for p in players]
        if not power:
            missing.append(name)
        # 国9战力：第 9 名；不足 9 名时取最后一名
        guo9 = power[8] if len(power) >= 9 else (power[-1] if power else "")
        ar = src.get("appearanceRank")
        ar = "" if ar is None or str(ar).strip() == "" else int(ar)
        heroes.append({
            "heroName": name,
            "appearanceRank": ar,
            "国9战力": guo9,
            "winRate": src.get("winRate") or "",
            "rankCount": len(power),
            "power": power,
            "players": players,
        })

    extras = sorted(set(by_hero) - {h["heroName"] for h in heroes})
    if extras:
        print("警告：XLSX 中有未出现在统计 JSON 的英雄：", "、".join(extras))

    # 校验
    for h in heroes:
        ranks = [p["rank"] for p in h["players"]]
        if ranks and ranks != list(range(1, len(ranks) + 1)):
            raise SystemExit(f"{h['heroName']} 名次不连续")
        for i in range(1, len(h["power"])):
            if h["power"][i] > h["power"][i - 1]:
                raise SystemExit(f"{h['heroName']} 战力不是按名次递减")

    lines = ",\n".join(
        "  " + json.dumps(h, ensure_ascii=False, separators=(", ", ": "))
        for h in heroes
    )
    text = "[\n" + lines + "\n]\n"
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)

    sizes = sorted(len(h["power"]) for h in heroes)
    print(f"英雄 {len(heroes)} | 榜单行 {sum(sizes)} | 满100名 {sum(1 for n in sizes if n == 100)} | 最短 {sizes[0]} | 缺分布 {len(missing)}")
    print(f"输出 {out_path} ({len(text.encode('utf-8')) / 1024:.1f} KB)")
    if missing:
        print("缺分布英雄：", "、".join(missing))


if __name__ == "__main__":
    main()
