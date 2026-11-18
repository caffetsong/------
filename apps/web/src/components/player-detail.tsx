import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { formatNumber } from "../lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { PlayerDetailResponse } from "../lib/types";

export function PlayerDetailDialog({
  open,
  onOpenChange,
  date,
  uid,
  hero
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  uid: string;
  hero?: string;
}) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["player-detail", date, uid, hero],
    queryFn: () => api.playerDetail(date, uid, hero),
    enabled: open && Boolean(date && uid)
  });
  const blacklist = useQuery({
    queryKey: ["blacklist"],
    queryFn: api.blacklist,
    enabled: open
  });
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (detail.data) setReason(detail.data.reason || "");
  }, [detail.data]);

  const saveReason = useMutation({
    mutationFn: async () => {
      const data = detail.data;
      const current = blacklist.data;
      if (!data || !current) throw new Error("数据尚未读取完成");
      const entries = (current.entries?.length
        ? current.entries
        : current.uids.map((entryUid) => ({ uid: entryUid, reason: "" })))
        .map((entry) => ({ ...entry }));
      const index = entries.findIndex((entry) => entry.uid === data.uid);
      if (index < 0) throw new Error("该 UID 不在失信名单中");
      entries[index].reason = reason.trim();
      return api.saveBlacklist(entries);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["blacklist"], saved);
      queryClient.invalidateQueries({ queryKey: ["player-detail"] });
      toast.success("失信原因已保存");
    },
    onError: (error) => toast.error(`保存失败：${error.message}`)
  });

  const data: PlayerDetailResponse | undefined = detail.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>玩家详情</DialogTitle>
        <DialogDescription>
          {data?.player ?? "—"} · UID {uid}
        </DialogDescription>

        {detail.isLoading ? (
          <div className="py-10 text-center text-sm text-zinc-600">读取玩家详情…</div>
        ) : detail.error ? (
          <div className="py-10 text-center text-sm text-rose-300">{detail.error.message}</div>
        ) : data ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <Info label="当前英雄" value={data.current ? `${data.current.hero} #${data.current.rank}` : "—"} />
              <Info label="当前战力" value={data.current ? formatNumber(data.current.power) : "—"} />
              <Info label="失信状态" value={data.blacklisted ? "失信" : "正常"} danger={data.blacklisted} />
              <Info label="战绩公开" value={flagLabel(data.publicRecord, "公开", "不公开")} />
              <Info label="单排过" value={flagLabel(data.soloPlayed, "是", "否")} />
              <Info label="组排过" value={flagLabel(data.partyPlayed, "是", "否")} />
            </div>

            <div>
              <div className="mb-2 text-xs font-medium text-zinc-300">国前十英雄</div>
              {data.topHeroes.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {data.topHeroes.slice(0, 10).map((item) => (
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

            {data.blacklisted ? (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-300">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  失信原因
                </div>
                <div className="flex gap-2">
                  <Input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="填写失信原因"
                  />
                  <Button size="sm" onClick={() => saveReason.mutate()} disabled={saveReason.isPending}>
                    {saveReason.isPending ? "保存中…" : "保存"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-zinc-600">当前未标记失信。</div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
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
