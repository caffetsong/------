import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, ExternalLink, ShieldAlert, Swords } from "lucide-react";
import { cn } from "../lib/utils";

const LEGACY_BASE = import.meta.env.VITE_LEGACY_BASE || "http://127.0.0.1:3001";

const navItems = [
  { to: "/", label: "梯度排行", icon: BarChart3 },
  { to: "/blacklist", label: "失信名单", icon: ShieldAlert }
];

export function Layout() {
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
            <a
              href={`${LEGACY_BASE}/editor.html`}
              className="hidden items-center gap-1 rounded-lg px-3 py-2 text-xs text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200 sm:flex"
            >
              数据编辑器 <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={`${LEGACY_BASE}/备战.html`}
              className="hidden items-center gap-1 rounded-lg px-3 py-2 text-xs text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200 sm:flex"
            >
              备战方案 <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 text-[11px] text-zinc-600 sm:px-6">
        曙光英雄梯度 · 数据驱动 / 算法透明 · 非商业项目
      </footer>
    </div>
  );
}
