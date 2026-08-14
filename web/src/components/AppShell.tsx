/**
 * The frame every screen sits in: ambient field → rail nav →
 * content. On mobile the rail becomes a bottom tab bar.
 */

import { AnimatePresence, motion } from "motion/react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Bell, CalendarHeart, Home, MapPin, Moon, PawPrint, ShieldAlert,
  Sparkles, Sun,
} from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "../lib/cn";
import { useStore } from "../lib/store";
import { SPECIES_EMOJI } from "../lib/mock";
import { Avatar, Glass } from "./glass";
import { AmbientField } from "./motion";

const NAV = [
  { to: "/", label: "Feed", icon: Home },
  { to: "/discover", label: "Discover", icon: Sparkles },
  { to: "/pets", label: "My pets", icon: PawPrint },
  { to: "/meetups", label: "Meetups", icon: CalendarHeart },
  { to: "/places", label: "Places", icon: MapPin },
  { to: "/alerts", label: "Safety", icon: ShieldAlert },
  { to: "/notifications", label: "Activity", icon: Bell },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, toggleTheme, activePet, pets, setActivePetId, toasts } = useStore();
  const loc = useLocation();

  return (
    <div className="relative min-h-full">
      <AmbientField />

      <div className="relative z-10 mx-auto flex max-w-[1400px] gap-5 px-3 py-3 md:px-5 md:py-5">
        {/* ── Rail (desktop) ─────────────────────────────── */}
        <Glass
          specular
          className="sticky top-5 hidden h-[calc(100vh-40px)] w-[228px] shrink-0 flex-col p-3 md:flex"
        >
          <div className="mb-5 flex items-center gap-2.5 px-2 pt-2">
            <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg shadow-[0_4px_14px_-2px_rgba(250,139,22,0.6)]">
              🐾
            </div>
            <span className="text-[17px] font-semibold tracking-[-0.02em] t1">
              PawBook
            </span>
          </div>

          <nav className="flex-1 space-y-0.5">
            {NAV.map(({ to, label, icon: Icon }) => {
              const active = loc.pathname === to;
              return (
                <NavLink key={to} to={to} className="relative block">
                  {active && (
                    <motion.span
                      layoutId="rail-active"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-[13px] bg-[rgb(var(--glass-tint)/0.3)] shadow-[inset_0_1px_0_var(--glass-rim)]"
                    />
                  )}
                  <span
                    className={cn(
                      "relative flex items-center gap-3 rounded-[13px] px-3 py-2.5 text-sm transition",
                      active ? "font-medium t1" : "t2 hover:t1",
                    )}
                  >
                    <Icon size={17} className={cn(active && "text-brand-500")} />
                    {label}
                  </span>
                </NavLink>
              );
            })}
          </nav>

          {/* Acting-as-pet switcher */}
          {activePet && (
            <div className="mt-3 rounded-[var(--radius-glass-sm)] bg-[rgb(var(--glass-tint)/0.18)] p-2.5">
              <p className="mb-2 px-1 text-[11px] font-medium tracking-wide t3 uppercase">
                Posting as
              </p>
              <div className="space-y-1">
                {pets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActivePetId(p.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition",
                      p.id === activePet.id
                        ? "bg-[rgb(var(--glass-tint)/0.34)]"
                        : "hover:bg-[rgb(var(--glass-tint)/0.18)]",
                    )}
                  >
                    <Avatar
                      seed={p.id}
                      emoji={SPECIES_EMOJI[p.species] ?? "🐾"}
                      size={28}
                    />
                    <span className="truncate text-[13px] font-medium t1">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={toggleTheme}
            className="mt-2 flex items-center gap-3 rounded-[13px] px-3 py-2.5 text-sm t2 transition hover:t1"
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </Glass>

        {/* ── Content ────────────────────────────────────── */}
        <main className="min-w-0 flex-1 pb-24 md:pb-0">
          {/* Mobile header */}
          <Glass className="mb-3 flex items-center gap-3 px-4 py-3 md:hidden">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-base">
              🐾
            </div>
            <span className="flex-1 text-[16px] font-semibold t1">PawBook</span>
            {activePet && (
              <Avatar
                seed={activePet.id}
                emoji={SPECIES_EMOJI[activePet.species] ?? "🐾"}
                size={30}
              />
            )}
            <button onClick={toggleTheme} className="t2" aria-label="Toggle theme">
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </Glass>

          <AnimatePresence mode="wait">
            <motion.div
              key={loc.pathname}
              initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* ── Tab bar (mobile) ─────────────────────────────── */}
      <Glass
        raised
        className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around px-1 py-1.5 md:hidden"
      >
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = loc.pathname === to;
          return (
            <NavLink
              key={to}
              to={to}
              className="relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5"
              aria-label={label}
            >
              {active && (
                <motion.span
                  layoutId="tab-active"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-xl bg-[rgb(var(--glass-tint)/0.28)]"
                />
              )}
              <Icon
                size={19}
                className={cn("relative", active ? "text-brand-500" : "t3")}
              />
              <span
                className={cn(
                  "relative text-[9.5px] font-medium",
                  active ? "t1" : "t3",
                )}
              >
                {label}
              </span>
            </NavLink>
          );
        })}
      </Glass>

      {/* ── Toasts ───────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -20, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className={cn(
                "glass glass-specular glass-raised pointer-events-auto",
                "rounded-full px-5 py-2.5 text-[13.5px] font-medium",
                t.tone === "success" && "text-mint-500",
                t.tone === "error" && "text-rose-500",
                t.tone === "info" && "t1",
              )}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
