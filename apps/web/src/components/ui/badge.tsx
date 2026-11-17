import * as React from "react";
import { cn } from "../../lib/utils";

type BadgeVariant = "default" | "outline" | "success" | "warning" | "danger" | "muted";

const styles: Record<BadgeVariant, string> = {
  default: "border-zinc-700 bg-zinc-800 text-zinc-200",
  outline: "border-zinc-700 bg-transparent text-zinc-300",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  danger: "border-red-500/30 bg-red-500/10 text-red-300",
  muted: "border-zinc-800 bg-zinc-900 text-zinc-500"
};

export function Badge({
  children,
  variant = "default",
  className
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5",
      styles[variant],
      className
    )}>
      {children}
    </span>
  );
}
