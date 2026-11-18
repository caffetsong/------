import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Save, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import type { BlacklistEntry, BlacklistResponse } from "../lib/types";

export function BlacklistPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["blacklist"], queryFn: api.blacklist });
  const [rows, setRows] = useState<BlacklistEntry[] | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!query.data || rows !== null) return;
    const entries = query.data.entries?.length
      ? query.data.entries
      : query.data.uids.map((uid) => ({ uid, reason: "" }));
    setRows(entries);
  }, [query.data, rows]);

  const mutation = useMutation({
    mutationFn: api.saveBlacklist,
    onSuccess: (data) => {
      setRows(data.entries ?? data.uids.map((uid) => ({ uid, reason: "" })));
      setDirty(false);
      queryClient.setQueryData(["blacklist"], data);
      const missing = data.missingUids?.length ?? 0;
      toast.success(missing
        ? `已保存；${missing} 个 UID 在所有期数中都未找到（仅提示）`
        : "失信名单已保存");
    },
    onError: (error) => toast.error(`保存失败：${error.message}`)
  });

  const data = query.data;
  const list = rows ?? [];
  const latestDate = data?.latestDate ?? "—";

  const missing = useMemo(
    () => new Set(dirty ? [] : (data?.missingUids ?? [])),
    [data, dirty]
  );

  function updateRow(index: number, patch: Partial<BlacklistEntry>) {
    setRows((current) => {
      const next = [...(current ?? [])];
      next[index] = { ...next[index], ...patch };
      return next;
    });
    setDirty(true);
  }

  function addRow() {
    setRows((current) => [...(current ?? []), { uid: "", reason: "" }]);
    setDirty(true);
  }

  function removeRow(index: number) {
    const uid = rows?.[index]?.uid?.trim();
    if (uid && !window.confirm(`确定从名单移除 UID ${uid}？`)) return;
    setRows((current) => (current ?? []).filter((_, i) => i !== index));
    setDirty(true);
  }

  async function reload() {
    if (dirty && !window.confirm("有未保存修改，重新读取会丢失。继续？")) return;
    await query.refetch();
    setRows(null);
    setDirty(false);
  }

  function save() {
    const entries = (rows ?? [])
      .map((row) => ({ uid: row.uid.trim(), reason: row.reason.trim() }))
      .filter((row) => row.uid);
    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.uid)) {
        toast.error(`UID 重复：${entry.uid}`);
        return;
      }
      seen.add(entry.uid);
    }
    if (!entries.length && !window.confirm("名单为空，保存后会清空失信名单。继续？")) return;
    if (entries.length && !window.confirm(`保存后榜单会剔除 ${entries.length} 个 UID，继续？`)) return;
    mutation.mutate(entries);
  }

  return (
    <div>
      <section className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="danger" className="gap-1">
            <ShieldAlert className="h-3 w-3" />
            UID 黑名单
          </Badge>
          <Badge variant="outline">最新榜单 {latestDate}</Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-50">失信名单</h1>
      </section>

      {query.isLoading && (
        <div className="panel flex h-56 items-center justify-center text-sm text-zinc-500">读取中…</div>
      )}

      {query.error && (
        <div className="panel border-red-500/30 p-6 text-sm text-red-300">
          读取失败：{query.error.message}
        </div>
      )}

      {!query.isLoading && !query.error && (
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/80 px-4 py-3">
            <div className="text-sm font-medium text-zinc-200">UID 名单</div>
            <span className="text-xs text-zinc-500">
              当前 {list.length} 个{dirty ? " · 有未保存修改" : ""}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={addRow}>
                <Plus className="h-3.5 w-3.5" /> 新增 UID
              </Button>
              <Button size="sm" onClick={save} disabled={mutation.isPending}>
                <Save className="h-3.5 w-3.5" /> {mutation.isPending ? "保存中…" : "保存名单"}
              </Button>
              <Button variant="ghost" size="sm" onClick={reload}>
                <RefreshCw className="h-3.5 w-3.5" /> 重新读取
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-3 font-semibold">UID</th>
                  <th className="px-4 py-3 font-semibold">失信原因</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {list.map((row, index) => {
                  return (
                    <BlacklistRow
                      key={index}
                      uid={row.uid}
                      reason={row.reason}
                      missing={missing.has(row.uid.trim())}
                      onChange={(patch) => updateRow(index, patch)}
                      onRemove={() => removeRow(index)}
                    />
                  );
                })}
                {!list.length && (
                  <tr>
                    <td colSpan={3} className="px-4 py-16 text-center text-sm text-zinc-600">
                      名单为空
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function BlacklistRow({
  uid,
  reason,
  missing,
  onChange,
  onRemove
}: {
  uid: string;
  reason: string;
  missing: boolean;
  onChange: (patch: Partial<BlacklistEntry>) => void;
  onRemove: () => void;
}) {
  return (
    <tr className="border-b border-zinc-800/60 last:border-0">
      <td className="px-4 py-2.5">
        <Input
          value={uid}
          onChange={(event) => onChange({ uid: event.target.value })}
          placeholder="输入 UID"
          spellCheck={false}
          aria-invalid={missing}
          className={`w-44 font-mono text-xs ${
            missing ? "border-rose-500/60 bg-rose-500/5 text-rose-200 focus:border-rose-400" : ""
          }`}
        />
      </td>
      <td className="px-4 py-2.5">
        <Input
          value={reason}
          onChange={(event) => onChange({ reason: event.target.value })}
          placeholder="填写失信原因"
          className="h-8 w-full min-w-56 text-xs"
        />
      </td>
      <td className="px-4 py-2.5 text-right">
        <Button variant="ghost" size="sm" onClick={onRemove} className="text-red-400 hover:text-red-300">
          <Trash2 className="h-3.5 w-3.5" />
          移除
        </Button>
      </td>
    </tr>
  );
}
