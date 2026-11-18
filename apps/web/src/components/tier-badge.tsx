import { cn } from "../lib/utils";

const tierStyles: Record<string, string> = {
  T0: "border-rose-500/40 bg-rose-500/15 text-rose-300",
  "T0.5": "border-orange-500/40 bg-orange-500/15 text-orange-300",
  T1: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  T2: "border-sky-500/40 bg-sky-500/15 text-sky-300",
  T3: "border-zinc-600/50 bg-zinc-700/30 text-zinc-300",
  T4: "border-zinc-700/60 bg-zinc-800/40 text-zinc-500"
};

export function TierBadge({
  tier,
  change,
  className
}: {
  tier: string;
  change?: { from: string; to: string; up: boolean };
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex min-w-11 items-center justify-center rounded-md border px-2 py-0.5 text-[11px] font-bold tracking-wide",
        tierStyles[tier] ?? tierStyles.T4,
        className
      )}
      title={change ? `${change.from} → ${change.to}` : undefined}
    >
      {tier}
      {change ? (
        <span
          className={cn(
            "absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[8px] leading-none",
            change.up
              ? "border-emerald-500/50 bg-emerald-950 text-emerald-400"
              : "border-rose-500/50 bg-rose-950 text-rose-400"
          )}
        >
          {change.up ? "▲" : "▼"}
        </span>
      ) : null}
    </span>
  );
}
