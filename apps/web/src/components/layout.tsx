import { useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, BookOpen, FileJson, ShieldAlert, Swords, Trophy, Upload } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

const navItems = [
  { to: "/", label: "梯度排行", icon: BarChart3 },
  { to: "/power", label: "战力排行", icon: Trophy },
  { to: "/prepare", label: "备战方案", icon: BookOpen },
  { to: "/blacklist", label: "失信名单", icon: ShieldAlert }
];

type JsonRow = Record<string, unknown>;

function parseTextStats(text: string) {
  const stats = new Map<string, { rank: number; winRate: string }>();
  const invalid: string[] = [];
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const cells = line.split(/[,\t，]/).map((cell) => cell.trim().replace(/^"(.*)"$/, "$1").trim());
    if (!/^\d+$/.test(cells[0] || "")) {
      if (!stats.size && /登场排名|排名|英雄|胜率/.test(line)) continue;
      invalid.push(line);
      continue;
    }
    const rank = Number.parseInt(cells[0], 10);
    const hero = cells[1] || "";
    const raw = String(cells[2] || "").replace("%", "").trim();
    let winRate = Number.parseFloat(raw);
    if (!hero || !Number.isFinite(rank) || !Number.isFinite(winRate)) {
      invalid.push(line);
      continue;
    }
    if (!String(cells[2]).includes("%") && winRate > 0 && winRate <= 1) winRate *= 100;
    stats.set(hero, { rank, winRate: `${winRate.toFixed(2)}%` });
  }
  return { stats, invalid };
}

export function Layout() {
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState("");
  const [importDate, setImportDate] = useState("");
  const [rows, setRows] = useState<JsonRow[]>([]);
  const [importText, setImportText] = useState("");
  const [fileError, setFileError] = useState("");

  const parsed = useMemo(() => parseTextStats(importText), [importText]);
  const matched = useMemo(
    () => rows.filter((row) => {
      const name = String(row.heroName ?? row.name ?? "").trim();
      return parsed.stats.has(name);
    }).length,
    [rows, parsed]
  );

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!rows.length) throw new Error("请选择 JSON 数据文件");
      if (!parsed.stats.size) throw new Error("请粘贴有效的出场排名/胜率文本");
      if (!importDate) throw new Error("无法确定数据日期");
      const data = rows.map((row) => {
        const next = { ...row };
        const name = String(next.heroName ?? next.name ?? "").trim();
        const stat = parsed.stats.get(name);
        if (stat) {
          next.appearanceRank = stat.rank;
          next.winRate = stat.winRate;
        }
        delete next["职业"];
        delete next.profession;
        return next;
      });
      return api.importPeriod({ date: importDate, file: importFile, data });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      queryClient.invalidateQueries({ queryKey: ["period", result.date] });
      queryClient.invalidateQueries({ queryKey: ["power-ranking"] });
      toast.success(`已导入 ${result.date}：${result.heroCount} 英雄 / ${result.rowCount} 行`);
      closeImport();
    },
    onError: (error) => toast.error(`导入失败：${error.message}`)
  });

  async function selectFile(file: File | undefined) {
    setFileError("");
    if (!file) return;
    try {
      const parsedJson = JSON.parse(await file.text());
      if (!Array.isArray(parsedJson)) throw new Error("JSON 顶层必须是数组");
      if (!parsedJson.length) throw new Error("JSON 数据为空");
      setRows(parsedJson as JsonRow[]);
      setImportFile(file.name);
      const match = file.name.match(/(\d{4}-\d{2}-\d{2})/);
      setImportDate(match?.[1] ?? "");
    } catch (error) {
      setRows([]);
      setImportFile("");
      setFileError(error instanceof Error ? error.message : String(error));
    }
  }

  function closeImport() {
    setImportOpen(false);
    setImportFile("");
    setImportDate("");
    setRows([]);
    setImportText("");
    setFileError("");
  }

  const rowCount = rows.reduce((sum, row) => {
    const power = row.power;
    return sum + (Array.isArray(power) ? power.length : 0);
  }, 0);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-zinc-800/70 bg-zinc-950/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-4 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-emerald-400 text-zinc-950">
              <Swords className="h-4 w-4" />
            </span>
            <span className="hidden text-sm font-bold tracking-wide text-zinc-100 sm:block">
              曙光英雄 <span className="font-normal text-zinc-500">Tier List</span>
            </span>
          </NavLink>

          <nav className="flex items-center gap-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) => cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" />
              导入数据
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 text-[11px] text-zinc-600 sm:px-6">
        曙光英雄梯度 · 数据驱动 / 算法透明 · 非商业项目
      </footer>

      <Dialog open={importOpen} onOpenChange={(open) => { if (!open) closeImport(); }}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>导入数据</DialogTitle>
          <DialogDescription>
            选择一份 JSON 数据文件，再粘贴出场排名与胜率文本；只更新这两项，不修改 power / players。
          </DialogDescription>

          <div className="mt-4 space-y-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-300">
                <FileJson className="h-3.5 w-3.5" />
                JSON 数据文件
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800">
                  <Upload className="h-3.5 w-3.5" />
                  选择 JSON
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="sr-only"
                    onChange={(event) => selectFile(event.target.files?.[0])}
                  />
                </label>
                {importFile ? (
                  <span className="text-[11px] text-zinc-400">
                    {importFile} · {rows.length} 英雄 · {rowCount} 行
                  </span>
                ) : (
                  <span className="text-[11px] text-zinc-600">未选择文件</span>
                )}
              </div>
              {fileError ? <div className="mt-1 text-[11px] text-rose-400">{fileError}</div> : null}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-300">出场排名 / 胜率文本</span>
                <span className="text-[10px] text-zinc-600">格式：登场排名,英雄,胜率,…</span>
              </div>
              <textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder={"登场排名,英雄,胜率,击杀/死亡比,辅助数,场均经济\n1,艾璐妮,46.79%,0.73,15.02,12317\n2,貂蝉,51.87%,1.52,7.56,14027"}
                spellCheck={false}
                className="min-h-40 w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2 font-mono text-xs text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-sky-400/60"
              />
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-600">
                <span>识别 {parsed.stats.size} 个英雄</span>
                <span>匹配当前 JSON {matched} / {rows.length}</span>
                {parsed.invalid.length ? <span className="text-amber-500">{parsed.invalid.length} 行无法解析</span> : null}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[10px] text-zinc-500">
                数据日期
                <Input
                  type="date"
                  value={importDate}
                  onChange={(event) => setImportDate(event.target.value)}
                  className="h-9 w-40 text-xs"
                />
              </label>
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" size="sm" onClick={closeImport}>取消</Button>
                <Button
                  size="sm"
                  onClick={() => importMutation.mutate()}
                  disabled={importMutation.isPending || !rows.length || !parsed.stats.size || !importDate}
                >
                  {importMutation.isPending ? "导入中…" : "导入数据库"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
