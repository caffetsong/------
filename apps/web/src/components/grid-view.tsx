import type { ComputedHero } from "../lib/types";
import { TIER_ORDER } from "../lib/algorithm";

const TIER_COLORS: Record<string, string> = {
  T0: "#ff4d4f",
  "T0.5": "#ff7a45",
  T1: "#ffa940",
  T2: "#ffc53d",
  T3: "#73d13d",
  T4: "#8c8c8c"
};

export function GridView({
  heroes,
  onSelect
}: {
  heroes: ComputedHero[];
  onSelect: (hero: ComputedHero) => void;
}) {
  return (
    <div className="tier-grid">
      {TIER_ORDER.map((tier) => {
        const list = heroes.filter((hero) => hero.tier === tier);
        return (
          <div key={tier} className={`tier-row${list.length ? "" : " tier-row-empty"}`}>
            <div className="tier-label" style={{ background: TIER_COLORS[tier] || "#8c8c8c" }}>
              {tier}
            </div>
            <div className="tier-icons">
              {list.length ? list.map((hero) => (
                <div
                  key={hero.name}
                  className="tier-hero"
                  title={hero.name}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(hero)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(hero);
                    }
                  }}
                >
                  <div className="tier-hero-img-wrap">
                    <img
                      src={`/HeadIcon/${encodeURIComponent(hero.name)}.png`}
                      alt={hero.name}
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                    <span className="tier-hero-name">{hero.name}</span>
                  </div>
                </div>
              )) : "暂无英雄"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
