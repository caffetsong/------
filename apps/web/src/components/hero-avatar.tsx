import { useState } from "react";
import { cn } from "../lib/utils";

export function HeroAvatar({
  name,
  size = "md",
  className
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const dimensions = {
    sm: "h-7 w-7 text-[10px]",
    md: "h-9 w-9 text-xs",
    lg: "h-16 w-16 text-xl"
  }[size];

  if (failed) {
    return (
      <div className={cn(
        "flex shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 font-semibold text-zinc-400",
        dimensions,
        className
      )}>
        {name.slice(0, 1)}
      </div>
    );
  }

  return (
    <img
      src={`/HeadIcon/${encodeURIComponent(name)}.png`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-lg border border-zinc-800 bg-zinc-900 object-cover", dimensions, className)}
    />
  );
}
