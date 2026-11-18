import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, List, RefreshCw, Search, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "../lib/api";
import { computeTierList, TIER_ORDER } from "../lib/algorithm";
import type { ComputedHero, HeroProfile } from "../lib/types";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { RankingTable } from "../components/ranking-table";
import { GridView } from "../components/grid-view";

const HeroDetail = lazy(() => import("../components/hero-detail").then((m) => ({ default: m.HeroDetail })));
const LANES = ["赏金", "中单", "争锋", "辅助", "打野"];

export function RankingPage() {
  const configQuery = useQuery({ queryKey: ["config"], queryFn: api.config });
  const periodsQuery = useQuery({ queryKey: ["periods"], queryFn: api.periods });
  const profilesQuery = useQuery({ queryKey: ["profiles"], queryFn: api.profiles });
  const periods = periodsQuery.data?.periods ?? [];
  const [date, setDate] = useState<string>("");
  const activeDate = date || periods[periods.length - 1]?.date || "";

  const periodQuery = useQuery({
    queryKey: ["period", activeDate],
    queryFn: () => api.period(activeDate),
    enabled: Boolean(activeDate)
  });

  const sortedPeriods = useMemo(
    () => [...periods].sort((a, b) => a.date.localeCompare(b.date)),
    [periods]
  );
  const activeIndex = sortedPeriods.findIndex((p) => p.date === activeDate);
  const previousDate = activeIndex > 0 ? sortedPeriods[activeIndex - 1].date : "";
  const previousQuery = useQuery({
    queryKey: ["period", previousDate],
    queryFn: () => api.period(previousDate),
    enabled: Boolean(previousDate)
  });

  const [search, setSearch] = useState("");
  const [lane, setLane] = useState("all");
  const [tier, setTier] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [selected, setSelected] = useState<ComputedHero | null>(null);

  const computed = useMemo(
    () => periodQuery.data ? computeTierList(periodQuery.data.heroes, configQuery.data) : [],
    [periodQuery.data, configQuery.data]
  );

  const previousComputed = useMemo(
    () => previousQuery.data ? computeTierList(previousQuery.data.heroes, configQuery.data) : [],
    [previousQuery.data, configQuery.data]
  );

  const previousTiers = useMemo(
    () => new Map(previousComputed.map((hero) => [hero.name, hero.tier])),
    [previousComputed]
  );

  const tierChanges = useMemo(() => {
    if (!previousTiers.size) return [];
    return computed
      .map((hero) => {
        const from = previousTiers.get(hero.name);
        if (!from || from === hero.tier) return null;
        const fromIndex = TIER_ORDER.indexOf(from as (typeof TIER_ORDER)[number]);
        const toIndex = TIER_ORDER.indexOf(hero.tier as (typeof TIER_ORDER)[number]);
        return { hero, from, to: hero.tier, up: toIndex < fromIndex };
      })
      .filter((item): item is { hero: ComputedHero; from: string; to: string; up: boolean } => Boolean(item))
      .sort((a, b) => a.hero.rank - b.hero.rank);
  }, [computed, previousTiers]);

  const profileMap = useMemo(
    () => new Map<string, HeroProfile>((profilesQuery.data?.profiles ?? []).map((p) => [p.name, p])),
    [profilesQuery.data]
  );

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return computed.filter((hero) => {
      if (keyword && !hero.name.toLowerCase().includes(keyword)) return false;
      if (tier !== "all" && hero.tier !== tier) return false;
      if (lane !== "all") {
        const lanes = profileMap.get(hero.name)?.lanes ?? [];
        if (!lanes.includes(lane)) return false;
      }
      return true;
    });
  }, [computed, search, lane, tier, profileMap]);

  const loading = periodsQuery.isLoading || periodQuery.isLoading || configQuery.isLoading;
  const error = periodsQuery.error || periodQuery.error || configQuery.error;

  return (
    <div>
      <section className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-300">
              算法 v4
            </Badge>
            {periodQuery.data?.blacklistRemoved ? (
              <Badge variant="danger" className="gap-1">
                <ShieldAlert className="h-3 w-3" />
                已剔除 {periodQuery.data.blacklistRemoved} 行失信数据
              </Badge>
            ) : null}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
            曙光英雄梯度排行
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-500">
            基于大神榜完整 1–N 战力分布，头部均值与全榜均值各占 50%；出场排名与胜率作为修正项。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {periods.length > 0 && (
            <select
              value={activeDate}
              onChange={(event) => setDate(event.target.value)}
              className="h-9 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 text-xs text-zinc-200 outline-none focus:border-sky-400/60"
            >
              {[...periods].reverse().map((p) => (
                <option key={p.date} value={p.date}>{p.date}</option>
              ))}
            </select>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              periodsQuery.refetch();
              periodQuery.refetch();
              profilesQuery.refetch();
            }}
            disabled={periodQuery.isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${periodQuery.isFetching ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>
      </section>

      {loading && (
        <div className="panel flex h-64 items-center justify-center text-sm text-zinc-500">
          正在读取 SQLite 数据…
        </div>
      )}

      {!loading && error && (
        <div className="panel border-red-500/30 p-6 text-sm text-red-300">
          加载失败：{error instanceof Error ? error.message : String(error)}
        </div>
      )}

      {!loading && !error && periodQuery.data && (
        <>
          <section className="mb-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full lg:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索英雄…"
                  className="pl-9"
                />
              </div>
              <div className="ml-auto flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/60 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] transition-colors ${
                    viewMode === "table" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <List className="h-3.5 w-3.5" /> 表格
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] transition-colors ${
                    viewMode === "grid" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" /> 网格
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-[10px] uppercase tracking-wider text-zinc-600">分路</span>
              <FilterChip active={lane === "all"} onClick={() => setLane("all")}>全部</FilterChip>
              {LANES.map((l) => (
                <FilterChip key={l} active={lane === l} onClick={() => setLane(l)}>{l}</FilterChip>
              ))}
              <span className="mx-1 hidden h-4 w-px bg-zinc-800 sm:block" />
              <span className="text-[10px] uppercase tracking-wider text-zinc-600">梯度</span>
              <FilterChip active={tier === "all"} onClick={() => setTier("all")}>全部</FilterChip>
              {TIER_ORDER.map((t) => (
                <FilterChip key={t} active={tier === t} onClick={() => setTier(t)}>{t}</FilterChip>
              ))}
            </div>
          </section>

          {tierChanges.length > 0 && (
            <section className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
                <span className="text-xs font-medium text-zinc-200">📊 梯度变化</span>
                <Badge variant="warning">{tierChanges.length}</Badge>
                <span className="text-[10px] text-zinc-500">
                  较上一期（{previousDate}）梯度变化
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tierChanges.map(({ hero, from, to, up }) => (
                  <button
                    key={hero.name}
                    type="button"
                    onClick={() => setSelected(hero)}
                    title={`${hero.name}：${from} → ${to}`}
                    className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition-colors ${
                      up
                        ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                        : "border-rose-500/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                    }`}
                  >
                    <span className="font-medium">{hero.name}</span>
                    <span className="text-zinc-400">{from}→{to}</span>
                    <span className="font-semibold">{up ? "▲" : "▼"}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {viewMode === "grid" ? (
            <GridView heroes={filtered} onSelect={setSelected} />
          ) : (
            <RankingTable heroes={filtered} previousTiers={previousTiers} onSelect={setSelected} />
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-600">
            <span>显示 {filtered.length} / {computed.length} 位英雄</span>
            {periodQuery.data.capturedAt && (
              <span>采集 {new Date(periodQuery.data.capturedAt).toLocaleString("zh-CN")}</span>
            )}
            <span>点击{viewMode === "grid" ? "英雄卡片" : "任意行"}查看详情与分路/选手</span>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {TIER_ORDER.map((t) => {
              const count = computed.filter((h) => h.tier === t).length;
              if (!count) return null;
              return <Badge key={t} variant="muted">{t} · {count}</Badge>;
            })}
          </div>
        </>
      )}

      {selected && (
        <Suspense fallback={null}>
          <HeroDetail
            hero={selected}
            profile={selected ? profileMap.get(selected.name) : undefined}
            date={activeDate}
            open={selected !== null}
            onOpenChange={(open) => { if (!open) setSelected(null); }}
          />
        </Suspense>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        active
          ? "border-zinc-600 bg-zinc-800 text-zinc-100"
          : "border-zinc-800 bg-transparent text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}
