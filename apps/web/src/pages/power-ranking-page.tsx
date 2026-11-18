import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ShieldAlert, Trophy } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog";
import { formatNumber } from "../lib/utils";
import type { PowerRankingRow } from "../lib/types";

type FlagField = "publicRecord" | "soloPlayed" | "partyPlayed";
const LANES = ["赏金", "中单", "争锋", "辅助", "打野"];

function flagSelectValue(value: boolean | null | undefined) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

function parseFlagValue(value: string) {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

export function PowerRankingPage() {
  const queryClient = useQueryClient();
  const periodsQuery = useQuery({ queryKey: ["periods"], queryFn: api.periods });
  const periods = useMemo(
    () => [...(periodsQuery.data?.periods ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [periodsQuery.data]
  );
  const [date, setDate] = useState("");
  const activeDate = date || periods[periods.length - 1]?.date || "";
  const periodQuery = useQuery({
    queryKey: ["period", activeDate],
    queryFn: () => api.period(activeDate),
    enabled: Boolean(activeDate)
  });
  const profilesQuery = useQuery({ queryKey: ["profiles"], queryFn: api.profiles });
  const profileMap = useMemo(
    () => new Map((profilesQuery.data?.profiles ?? []).map((profile) => [profile.name, profile])),
    [profilesQuery.data]
  );

  const heroes = useMemo(
    () => [...(periodQuery.data?.heroes ?? [])].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    [periodQuery.data]
  );
  const [hero, setHero] = useState("");
  const [lane, setLane] = useState("all");
  const filteredHeroes = useMemo(
    () => heroes.filter((item) => lane === "all" || (profileMap.get(item.name)?.lanes ?? []).includes(lane)),
    [heroes, lane, profileMap]
  );
  useEffect(() => {
    if (!filteredHeroes.length) return;
    if (!hero || !filteredHeroes.some((item) => item.name === hero)) {
      setHero(filteredHeroes[0].name);
    }
  }, [filteredHeroes, hero]);

  const rankingQuery = useQuery({
    queryKey: ["power-ranking", activeDate, hero],
    queryFn: () => api.powerRanking(activeDate, hero),
    enabled: Boolean(activeDate && hero)
  });
  const blacklistQuery = useQuery({ queryKey: ["blacklist"], queryFn: api.blacklist });

  const [detail, setDetail] = useState<PowerRankingRow | null>(null);
  const [reason, setReason] = useState("");

  const saveBlacklist = useMutation({
    mutationFn: (entries: { uid: string; reason: string }[]) => api.saveBlacklist(entries),
    onSuccess: (data) => {
      queryClient.setQueryData(["blacklist"], data);
      queryClient.invalidateQueries({ queryKey: ["power-ranking"] });
      toast.success("失信名单已更新");
    },
    onError: (error) => toast.error(`保存失败：${error.message}`)
  });

  const saveFlags = useMutation({
    mutationFn: (payload: {
      key: string;
      publicRecord?: boolean | null;
      soloPlayed?: boolean | null;
      partyPlayed?: boolean | null;
    }) => api.savePlayerFlags(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["power-ranking"] });
    },
    onError: (error) => toast.error(`保存失败：${error.message}`)
  });

  function currentEntries() {
    const current = blacklistQuery.data;
    if (!current) return null;
    return (current.entries?.length
      ? current.entries
      : current.uids.map((uid) => ({ uid, reason: "" })))
      .map((entry) => ({ ...entry }));
  }

  function toggleBlacklist(row: PowerRankingRow, next: boolean) {
    if (!row.uid) {
      toast.info("该历史期玩家没有 UID，无法加入失信名单");
      return;
    }
    const entries = currentEntries();
    if (!entries) {
      toast.info("失信名单尚未读取完成");
      return;
    }
    if (next) {
      if (!entries.some((entry) => entry.uid === row.uid)) {
        entries.push({ uid: row.uid, reason: row.reason || "" });
      }
    } else {
      const index = entries.findIndex((entry) => entry.uid === row.uid);
      if (index >= 0) entries.splice(index, 1);
    }
    if (!next && !window.confirm(`确定将 ${row.player} 从失信名单移除？`)) return;
    saveBlacklist.mutate(entries);
  }

  function openDetail(row: PowerRankingRow) {
    setDetail(row);
    setReason(row.reason || "");
  }

  function saveReason() {
    if (!detail) return;
    if (!detail.uid) {
      toast.info("该历史期玩家没有 UID，无法编辑失信原因");
      return;
    }
    const entries = currentEntries();
    if (!entries) return;
    const index = entries.findIndex((entry) => entry.uid === detail.uid);
    if (index < 0) {
      toast.error("该 UID 不在失信名单中");
      return;
    }
    entries[index].reason = reason.trim();
    saveBlacklist.mutate(entries, {
      onSuccess: () => setDetail(null)
    });
  }

  function updateFlag(row: PowerRankingRow, field: FlagField, value: boolean | null) {
    saveFlags.mutate({ key: row.playerKey, [field]: value });
  }

  const rows = rankingQuery.data?.rows ?? [];

  return (
    <div>
      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-300">
            <Trophy className="h-3 w-3" />
            战力排行
          </Badge>
          <Badge variant="outline">{activeDate || "—"}</Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-50">玩家战力排行</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-500">
          按英雄查看大神榜战力排名。点击玩家名字打开详情；失信原因和战绩公开、单排/组排状态可直接编辑或补录。
        </p>
      </section>

      <section className="mb-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-300">英雄筛选</span>
            <span className="text-[10px] text-zinc-500">当前 {hero || "—"}</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={activeDate}
              onChange={(event) => setDate(event.target.value)}
              className="h-8 rounded-lg border border-zinc-800 bg-zinc-950/70 px-2 text-[11px] text-zinc-200 outline-none focus:border-sky-400/60"
            >
              {[...periods].reverse().map((period) => (
                <option key={period.date} value={period.date}>{period.date}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={() => rankingQuery.refetch()} disabled={rankingQuery.isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${rankingQuery.isFetching ? "animate-spin" : ""}`} />
              刷新
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-2">
            <div className="mb-2 px-1 text-[10px] uppercase tracking-wider text-zinc-600">分路</div>
            <div className="space-y-1">
              {["all", ...LANES].map((value) => {
                const active = lane === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLane(value)}
                    className={`w-full rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors ${
                      active
                        ? "bg-sky-500/15 text-sky-200"
                        : "text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200"
                    }`}
                  >
                    {value === "all" ? "全部分路" : value}
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[10px] text-zinc-600">
                {lane === "all" ? "全部英雄" : `${lane}英雄`}
              </span>
              <span className="text-[10px] text-zinc-600">{filteredHeroes.length} 位</span>
            </div>
            <div className="grid max-h-64 grid-cols-10 gap-1.5 overflow-y-auto pr-1">
              {filteredHeroes.map((item) => {
                const active = item.name === hero;
                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => setHero(item.name)}
                    className={`hero-filter-tile ${active ? "ring-2 ring-inset ring-sky-400" : ""}`}
                    title={item.name}
                  >
                    <div className="tier-hero-img-wrap">
                      <img
                        src={`/HeadIcon/${encodeURIComponent(item.name)}.png`}
                        alt={item.name}
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                      <span className="tier-hero-name">{item.name}</span>
                    </div>
                  </button>
                );
              })}
              {!filteredHeroes.length && (
                <div className="col-span-10 py-10 text-center text-xs text-zinc-600">该分路暂无英雄</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {rankingQuery.isLoading && (
        <div className="panel flex h-56 items-center justify-center text-sm text-zinc-500">读取战力排行…</div>
      )}

      {rankingQuery.error && (
        <div className="panel border-red-500/30 p-6 text-sm text-red-300">
          读取失败：{rankingQuery.error.message}
        </div>
      )}

      {!rankingQuery.isLoading && !rankingQuery.error && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/50">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80 text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="px-3 py-3 font-semibold">名次</th>
                  <th className="px-3 py-3 font-semibold">名字</th>
                  <th className="px-3 py-3 font-semibold">UID</th>
                  <th className="px-3 py-3 font-semibold">战力</th>
                  <th className="px-3 py-3 font-semibold">是否失信</th>
                  <th className="px-3 py-3 font-semibold">战绩是否公开</th>
                  <th className="px-3 py-3 font-semibold">是否单排过</th>
                  <th className="px-3 py-3 font-semibold">是否组排过</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.rank}-${row.playerKey}`} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                    <td className="px-3 py-2.5 font-mono text-xs text-zinc-400">#{row.rank}</td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => openDetail(row)}
                        className={row.blacklisted
                          ? "text-left text-xs font-medium text-rose-300 underline decoration-rose-500/40 underline-offset-2 hover:text-rose-200"
                          : "text-left text-xs font-medium text-zinc-200"}
                        title="查看玩家详情"
                      >
                        {row.player || "—"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-zinc-500">{row.uid || "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-zinc-200">{formatNumber(row.power)}</td>
                    <td className="px-3 py-2.5">
                      <select
                        value={row.blacklisted ? "yes" : "no"}
                        onChange={(event) => toggleBlacklist(row, event.target.value === "yes")}
                        disabled={!row.uid || !blacklistQuery.data || saveBlacklist.isPending}
                        className="h-7 rounded-md border border-zinc-800 bg-zinc-950/70 px-1.5 text-[11px] text-zinc-300 outline-none disabled:cursor-not-allowed disabled:opacity-40"
                        title={row.reason || undefined}
                      >
                        <option value="no">正常</option>
                        <option value="yes">失信</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={flagSelectValue(row.publicRecord)}
                        onChange={(event) => updateFlag(row, "publicRecord", parseFlagValue(event.target.value))}
                        disabled={saveFlags.isPending}
                        className="h-7 rounded-md border border-zinc-800 bg-zinc-950/70 px-1.5 text-[11px] text-zinc-300 outline-none"
                      >
                        <option value="unknown">未知</option>
                        <option value="yes">公开</option>
                        <option value="no">不公开</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={flagSelectValue(row.soloPlayed)}
                        onChange={(event) => updateFlag(row, "soloPlayed", parseFlagValue(event.target.value))}
                        disabled={saveFlags.isPending}
                        className="h-7 rounded-md border border-zinc-800 bg-zinc-950/70 px-1.5 text-[11px] text-zinc-300 outline-none"
                      >
                        <option value="unknown">未知</option>
                        <option value="yes">是</option>
                        <option value="no">否</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={flagSelectValue(row.partyPlayed)}
                        onChange={(event) => updateFlag(row, "partyPlayed", parseFlagValue(event.target.value))}
                        disabled={saveFlags.isPending}
                        className="h-7 rounded-md border border-zinc-800 bg-zinc-950/70 px-1.5 text-[11px] text-zinc-300 outline-none"
                      >
                        <option value="unknown">未知</option>
                        <option value="yes">是</option>
                        <option value="no">否</option>
                      </select>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-sm text-zinc-600">
                      当前英雄暂无战力记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-zinc-800/80 px-4 py-3 text-[11px] text-zinc-600">
            战绩公开、单排/组排为人工补录字段；国前十英雄在点击玩家名字后的详情中查看。
          </div>
        </div>
      )}

      <Dialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>玩家详情</DialogTitle>
          <DialogDescription>
            {detail?.player} · UID {detail?.uid || "—"} · 当前英雄第 {detail?.rank ?? "—"} 名
          </DialogDescription>
          {detail && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <Info label="战力" value={formatNumber(detail.power)} />
                <Info label="失信状态" value={detail.blacklisted ? "失信" : "正常"} danger={detail.blacklisted} />
                <Info label="战绩公开" value={flagLabel(detail.publicRecord, "公开", "不公开")} />
                <Info label="单排过" value={flagLabel(detail.soloPlayed, "是", "否")} />
                <Info label="组排过" value={flagLabel(detail.partyPlayed, "是", "否")} />
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-zinc-300">国前十英雄</div>
                {detail.topHeroes.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.topHeroes.slice(0, 10).map((item) => (
                      <span
                        key={`${item.hero}-${item.rank}`}
                        className="rounded-lg border border-zinc-700/70 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300"
                        title={`战力 ${formatNumber(item.power)}`}
                      >
                        {item.hero} <span className="text-zinc-500">#{item.rank}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-600">暂无国前十英雄</div>
                )}
              </div>

              {detail.blacklisted ? (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-300">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    失信原因
                  </div>
                  {detail.uid ? (
                    <div className="flex gap-2">
                      <Input
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="填写失信原因"
                      />
                      <Button size="sm" onClick={saveReason} disabled={saveBlacklist.isPending}>
                        {saveBlacklist.isPending ? "保存中…" : "保存"}
                      </Button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-zinc-600">该历史期玩家没有 UID，无法编辑原因。</div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-zinc-600">当前未标记失信；可在表格「是否失信」中切换。</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-2.5 py-2">
      <div className="text-[10px] text-zinc-600">{label}</div>
      <div className={danger ? "mt-0.5 text-sm font-semibold text-rose-300" : "mt-0.5 text-sm font-semibold text-zinc-200"}>
        {value}
      </div>
    </div>
  );
}

function flagLabel(value: boolean | null, yes: string, no: string) {
  if (value === true) return yes;
  if (value === false) return no;
  return "未知";
}
