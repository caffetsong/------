import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { Badge } from "../components/ui/badge";

/**
 * 原版备战管理器直接嵌入，保留查看、编辑、保存能力。
 * 通过 hero 参数进入对应英雄，页面内部仍使用原版 /api 接口。
 */
export function PreparePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryHero = searchParams.get("hero") ?? "";
  const heroesQuery = useQuery<string[]>({
    queryKey: ["legacy-heroes"],
    queryFn: async () => {
      const response = await fetch("/api/heroes", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return Array.isArray(data.heroes) ? data.heroes : [];
    }
  });

  const heroes = useMemo(
    () => [...(heroesQuery.data ?? [])].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [heroesQuery.data]
  );
  const [hero, setHero] = useState(queryHero);
  useEffect(() => {
    if (!heroes.length) return;
    if (queryHero && heroes.includes(queryHero)) {
      if (hero !== queryHero) setHero(queryHero);
      return;
    }
    if (!hero || !heroes.includes(hero)) {
      setHero(heroes.includes("白浩") ? "白浩" : heroes[0]);
    }
  }, [heroes, hero, queryHero]);

  const src = `/备战.html${hero ? `?hero=${encodeURIComponent(hero)}` : ""}`;

  return (
    <div>
      <section className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1 border-sky-500/30 bg-sky-500/10 text-sky-300">
          <BookOpen className="h-3 w-3" />
          备战方案
        </Badge>
        <select
          value={hero}
          onChange={(event) => {
            const value = event.target.value;
            setHero(value);
            setSearchParams({ hero: value }, { replace: true });
          }}
          className="h-8 rounded-lg border border-zinc-800 bg-zinc-950/70 px-2 text-[11px] text-zinc-200 outline-none focus:border-sky-400/60"
        >
          {heroes.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <span className="text-[11px] text-zinc-600">原版管理器 · 支持新建、编辑、保存</span>
      </section>
      <iframe
        key={src}
        title="英雄备战管理器"
        src={src}
        className="h-[calc(100vh-190px)] min-h-[640px] w-full rounded-2xl border border-zinc-800/80 bg-[#0d1117]"
      />
    </div>
  );
}
