import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ComputedHero } from "../lib/types";
import { formatNumber, formatPercent } from "../lib/utils";
import { HeroAvatar } from "./hero-avatar";
import { TierBadge } from "./tier-badge";

function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
  if (direction === "asc") return <ArrowUp className="h-3 w-3" />;
  if (direction === "desc") return <ArrowDown className="h-3 w-3" />;
  return <ArrowUpDown className="h-3 w-3 opacity-30" />;
}

export function RankingTable({
  heroes,
  onSelect
}: {
  heroes: ComputedHero[];
  onSelect: (hero: ComputedHero) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<ComputedHero>[]>(() => [
    {
      accessorKey: "rank",
      header: "#",
      size: 52,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-zinc-500">{row.original.rank}</span>
      )
    },
    {
      accessorKey: "name",
      header: "英雄",
      size: 220,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <HeroAvatar name={row.original.name} size="sm" />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-zinc-100">{row.original.name}</div>
          </div>
        </div>
      )
    },
    {
      accessorKey: "tier",
      header: "梯度",
      size: 80,
      cell: ({ row }) => <TierBadge tier={row.original.tier} />
    },
    {
      accessorKey: "score",
      header: "评分",
      size: 130,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400"
              style={{ width: `${Math.max(2, row.original.score)}%` }}
            />
          </div>
          <span className="w-10 text-right font-mono text-xs text-zinc-300">
            {row.original.score.toFixed(1)}
          </span>
        </div>
      )
    },
    {
      accessorKey: "appearanceRank",
      header: "出场",
      size: 70,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-zinc-400">#{row.original.appearanceRank ?? "—"}</span>
      )
    },
    {
      accessorKey: "headMean",
      header: "头部均值",
      size: 95,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-zinc-300">{formatNumber(row.original.headMean)}</span>
      )
    },
    {
      accessorKey: "fullMean",
      header: "全榜均值",
      size: 95,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-zinc-400">{formatNumber(row.original.fullMean)}</span>
      )
    },
    {
      accessorKey: "rankCount",
      header: "榜长",
      size: 70,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-zinc-500">{row.original.rankCount}</span>
      )
    },
    {
      accessorKey: "winRate",
      header: "胜率",
      size: 80,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-zinc-400">{formatPercent(row.original.winRate)}</span>
      )
    }
  ], []);

  const table = useReactTable({
    data: heroes,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/50">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-left">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-zinc-800 bg-zinc-900/80">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 transition-colors hover:text-zinc-200"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && <SortIcon direction={header.column.getIsSorted()} />}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                tabIndex={0}
                onClick={() => onSelect(row.original)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(row.original);
                  }
                }}
                className="cursor-pointer border-b border-zinc-800/60 transition-colors last:border-0 hover:bg-zinc-800/40 focus:bg-zinc-800/50 focus:outline-none"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2.5">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {!table.getRowModel().rows.length && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16 text-center text-sm text-zinc-600">
                  没有匹配的英雄
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
