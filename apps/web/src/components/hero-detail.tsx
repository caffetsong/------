import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalLink, Pencil, Plus, Save, Swords, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { HeroAvatar } from "./hero-avatar";
import { TierBadge } from "./tier-badge";
import { formatNumber, formatPercent } from "../lib/utils";
import { api } from "../lib/api";
import type { ComputedHero, HeroProfile } from "../lib/types";

const LANES = ["赏金", "中单", "争锋", "辅助", "打野"];
const LEGACY_BASE = import.meta.env.VITE_LEGACY_BASE || "http://127.0.0.1:3001";

const statLabels: { key: keyof ComputedHero; label: string }[] = [
  { key: "leaderPower", label: "榜首" },
  { key: "lastPower", label: "榜尾" },
  { key: "headMean", label: "头部均值" },
  { key: "fullMean", label: "全榜均值" },
  { key: "rankCount", label: "榜长" },
  { key: "combatScore", label: "分布分" }
];

export function HeroDetail({
  hero,
  profile,
  open,
  onOpenChange
}: {
  hero: ComputedHero | null;
  profile?: HeroProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [lanes, setLanes] = useState<string[]>([]);
  const [players, setPlayers] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftPlayers, setDraftPlayers] = useState<string[]>([]);
  const [chartMode, setChartMode] = useState<"distribution" | "history">("distribution");

  const history = useQuery({
    queryKey: ["hero-history", hero?.name],
    queryFn: () => api.heroHistory(hero!.name),
    enabled: open && Boolean(hero)
  });

  useEffect(() => {
    if (!history.data) return;
    setChartMode(history.data.periods.length > 1 ? "history" : "distribution");
  }, [history.data]);

  useEffect(() => {
    setLanes(profile?.lanes ?? []);
    setPlayers(profile?.players ?? []);
  }, [profile?.name, profile?.lanes, profile?.players]);

  const mutation = useMutation({
    mutationFn: (payload: { lanes: string[]; players: string[] }) =>
      api.saveProfile(hero!.name, payload),
    onSuccess: (saved) => {
      setLanes(saved.lanes);
      setPlayers(saved.players);
      setDraftPlayers(saved.players);
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      setEditorOpen(false);
      toast.success("英雄资料已保存");
    },
    onError: (error) => toast.error(`保存失败：${error.message}`)
  });

  if (!hero) return null;

  const data = hero.power.map((power, index) => ({ rank: index + 1, power }));
  const dataReady = profile !== undefined;

  function toggleLane(lane: string) {
    setLanes((current) => current.includes(lane)
      ? current.filter((item) => item !== lane)
      : [...current, lane]);
  }

  function openPlayerEditor() {
    setDraftPlayers(players.length ? [...players] : [""]);
    setEditorOpen(true);
  }

  function saveLanes() {
    mutation.mutate({ lanes, players });
  }

  function savePlayers() {
    const cleaned = draftPlayers.map((p) => p.trim()).filter(Boolean);
    mutation.mutate({ lanes, players: cleaned });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl overflow-x-hidden p-0">
          <HeroBanner name={hero.name} />

          <div className="px-5 pb-5">
            <div className="mt-4 flex flex-wrap items-start gap-4">
              <HeroAvatar name={hero.name} size="lg" className="relative z-10 ring-4 ring-zinc-950" />
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex flex-wrap items-center gap-2 pr-8">
                  <DialogTitle className="text-xl">{hero.name}</DialogTitle>
                  <TierBadge tier={hero.tier} />
                  <span className="text-sm font-semibold text-sky-300">{hero.score.toFixed(1)}</span>
                  <a
                    href={`${LEGACY_BASE}/备战.html?hero=${encodeURIComponent(hero.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[11px] text-zinc-300 transition-colors hover:border-sky-500/50 hover:text-sky-300"
                  >
                    <Swords className="h-3 w-3" />
                    备战方案
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                </div>
                <DialogDescription className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  <span>出场排名 #{hero.appearanceRank ?? "—"}</span>
                  <span>胜率 {formatPercent(hero.winRate)}</span>
                  <span>榜长 {hero.rankCount}</span>
                </DialogDescription>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {statLabels.map(({ key, label }) => (
                <div key={key} className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5">
                  <div className="text-lg font-semibold text-zinc-100">
                    {formatNumber(hero[key] as number | null)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-[1.05fr_1.3fr]">
              <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-300">常用分路</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={saveLanes}
                    disabled={mutation.isPending || !dataReady}
                    className="h-7 px-2 text-[11px]"
                  >
                    <Save className="h-3 w-3" /> 保存
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {LANES.map((lane) => {
                    const active = lanes.includes(lane);
                    return (
                      <button
                        key={lane}
                        type="button"
                        onClick={() => toggleLane(lane)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                          active
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                            : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                        }`}
                      >
                        {lane}
                      </button>
                    );
                  })}
                </div>
                {!dataReady && <div className="mt-2 text-[10px] text-zinc-600">读取英雄资料中…</div>}
              </section>

              <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-300">擅长选手</span>
                  <Button variant="ghost" size="sm" onClick={openPlayerEditor} className="h-7 px-2 text-[11px]">
                    <Pencil className="h-3 w-3" /> 编辑
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <PlayerChips players={players} />
                </div>
              </section>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/60 p-0.5">
                  <button
                    type="button"
                    onClick={() => setChartMode("distribution")}
                    className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                      chartMode === "distribution" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    战力分布
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMode("history")}
                    className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                      chartMode === "history" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    历史趋势
                  </button>
                </div>
                <span className="text-[10px] text-zinc-500">
                  {chartMode === "distribution"
                    ? `1–${hero.rankCount} 名`
                    : `${history.data?.periods.length ?? 0} 期`}
                </span>
              </div>

              {chartMode === "distribution" ? (
                data.length ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="powerFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="rank"
                          stroke="#52525b"
                          tick={{ fill: "#71717a", fontSize: 11 }}
                          tickLine={false}
                          axisLine={{ stroke: "#27272a" }}
                        />
                        <YAxis
                          domain={["auto", "auto"]}
                          stroke="#52525b"
                          tick={{ fill: "#71717a", fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                          width={56}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#18181b",
                            border: "1px solid #3f3f46",
                            borderRadius: 10,
                            fontSize: 12,
                            color: "#e4e4e7"
                          }}
                          labelFormatter={(label) => `第 ${label} 名`}
                          formatter={(value) => [`${Number(value).toLocaleString("zh-CN")}`, "战力"]}
                        />
                        <Area
                          type="monotone"
                          dataKey="power"
                          stroke="#38bdf8"
                          strokeWidth={2}
                          fill="url(#powerFill)"
                          dot={false}
                          activeDot={{ r: 3, fill: "#38bdf8" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-40 items-center justify-center text-sm text-zinc-600">
                    暂无战力分布数据
                  </div>
                )
              ) : history.isLoading ? (
                <div className="flex h-40 items-center justify-center text-sm text-zinc-600">读取历史数据…</div>
              ) : history.data && history.data.periods.length > 1 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history.data.periods} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke="#52525b"
                        tick={{ fill: "#71717a", fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: "#27272a" }}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        stroke="#52525b"
                        tick={{ fill: "#71717a", fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={56}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#18181b",
                          border: "1px solid #3f3f46",
                          borderRadius: 10,
                          fontSize: 12,
                          color: "#e4e4e7"
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
                      <Line type="monotone" dataKey="powerTop1" name="榜首" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="powerTop9" name="国9" stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="powerMedian" name="中位" stroke="#fbbf24" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-40 flex-col items-center justify-center gap-1 text-sm text-zinc-600">
                  <div>当前只有 {history.data?.periods.length ?? 0} 期数据，无法形成历史趋势</div>
                  {history.data?.periods[0]?.date && (
                    <div className="text-[11px] text-zinc-700">已有：{history.data.periods.map((p) => p.date).join("、")}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PlayerEditor
        open={editorOpen}
        name={hero.name}
        players={draftPlayers}
        saving={mutation.isPending}
        onChange={setDraftPlayers}
        onSave={savePlayers}
        onOpenChange={setEditorOpen}
      />
    </>
  );
}

function HeroBanner({ name }: { name: string }) {
  const [ext, setExt] = useState<"jpg" | "png" | "none">("jpg");
  if (ext === "none") return <div className="h-20 bg-gradient-to-r from-sky-500/10 to-emerald-500/10" />;
  return (
    <div className="relative flex w-full justify-center bg-zinc-950">
      <img
        src={`/banner/${encodeURIComponent(name)}.${ext}`}
        alt=""
        className="block h-auto w-full"
        onError={() => setExt(ext === "jpg" ? "png" : "none")}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-zinc-950 to-transparent" />
    </div>
  );
}

function extractUid(raw: string) {
  const matches = raw.match(/\d{9,15}/g);
  if (!matches?.length) return "";
  return matches.sort((a, b) => b.length - a.length)[0];
}

// 展示 UID 在最新榜单中的用户名；没有最新记录时回退 UID。
function PlayerChips({ players }: { players: string[] }) {
  const uids = [...new Set(players.map(extractUid).filter(Boolean))];
  const lookup = useQuery({
    queryKey: ["player-lookup", uids.join("|")],
    queryFn: () => api.lookupPlayers(uids),
    enabled: uids.length > 0,
    staleTime: 60_000
  });

  if (!players.length) {
    return <span className="text-[11px] text-zinc-600">待补充</span>;
  }

  return players.map((raw, index) => {
    const uid = extractUid(raw);
    const info = uid ? lookup.data?.appearances?.[uid] : undefined;
    const latestName = info?.latestNames?.length ? info.latestNames.join("、") : "";
    const display = latestName || uid || raw;
    return (
      <span
        key={`${uid || raw}-${index}`}
        title={raw}
        className="rounded-full border border-zinc-700/70 bg-zinc-800/60 px-2 py-0.5 text-[11px] text-zinc-300"
      >
        {display}
      </span>
    );
  });
}

function PlayerEditor({
  open,
  name,
  players,
  saving,
  onChange,
  onSave,
  onOpenChange
}: {
  open: boolean;
  name: string;
  players: string[];
  saving: boolean;
  onChange: (players: string[]) => void;
  onSave: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogTitle>编辑擅长选手 · {name}</DialogTitle>
        <DialogDescription className="mt-1">每行一个选手名，可保留 UID 后缀；保存后立即写入英雄介绍。</DialogDescription>
        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2 font-semibold">选手</th>
                <th className="w-14 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {players.map((player, index) => (
                <tr key={index} className="border-b border-zinc-800/60 last:border-0">
                  <td className="px-3 py-2">
                    <Input
                      value={player}
                      onChange={(event) => {
                        const next = [...players];
                        next[index] = event.target.value;
                        onChange(next);
                      }}
                      placeholder="选手名 / 选手名+UID"
                      className="h-8"
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300"
                      onClick={() => onChange(players.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onChange([...players, ""])}>
            <Plus className="h-3.5 w-3.5" /> 新增选手
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            <Save className="h-3.5 w-3.5" /> {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
