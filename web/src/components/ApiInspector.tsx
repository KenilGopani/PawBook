/**
 * Live view of every Edge Function the UI touches.
 *
 * The point: PawBook's behaviour lives in ~50 small functions, and
 * from a finished screen you can't tell which one a tap hit, or
 * what it did to Postgres/Neo4j/APNs afterwards. This panel makes
 * that visible in real time — tap something, watch the call land.
 */

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Activity, ChevronRight, Trash2, X } from "lucide-react";
import { clearApiLog, subscribeApiLog, type ApiLogEntry } from "../lib/apiLog";
import { isLive } from "../lib/api";
import { cn } from "../lib/cn";
import { GlassButton } from "./glass";

const AREA_TONE: Record<string, string> = {
  "User & Pet": "text-brand-600 dark:text-brand-200 bg-brand-400/18",
  "Social Graph": "text-grape-500 bg-grape-400/18",
  Feed: "text-sky-500 bg-sky-400/18",
  Meetup: "text-mint-500 bg-mint-400/18",
  Location: "text-sky-500 bg-sky-400/18",
  Alerts: "text-rose-500 bg-rose-400/18",
  Notifications: "text-grape-500 bg-grape-400/18",
  Health: "text-mint-500 bg-mint-400/18",
};

export function ApiInspector({
  open, onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<ApiLogEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => subscribeApiLog(setEntries), []);

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: 420, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 420, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 32 }}
          className={cn(
            "glass glass-specular glass-raised fixed top-3 right-3 bottom-3 z-50",
            "flex w-[min(390px,calc(100vw-24px))] flex-col rounded-[var(--radius-glass)]",
          )}
        >
          <header className="flex items-center gap-3 border-b px-5 py-4">
            <div className="grid size-9 place-items-center rounded-full bg-mint-400/20 text-mint-500">
              <Activity size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold t1">API Inspector</h3>
              <p className="truncate text-[12px] t3">
                {isLive ? "Live Supabase" : "Demo data — no backend running"}
              </p>
            </div>
            <button
              onClick={clearApiLog}
              className="grid size-8 place-items-center rounded-full t3 transition hover:bg-[rgb(var(--glass-tint)/0.2)] hover:t1"
              aria-label="Clear log"
            >
              <Trash2 size={15} />
            </button>
            <button
              onClick={onClose}
              className="grid size-8 place-items-center rounded-full t3 transition hover:bg-[rgb(var(--glass-tint)/0.2)] hover:t1"
              aria-label="Close inspector"
            >
              <X size={16} />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {entries.length === 0 ? (
              <div className="px-4 py-16 text-center">
                <p className="text-sm t2">Nothing yet.</p>
                <p className="mt-1.5 text-[13px] leading-relaxed t3">
                  Move around the app — every Edge Function call shows up
                  here with what it wrote to Postgres, Neo4j and APNs.
                </p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {entries.map((e) => {
                    const isOpen = expanded === e.id;
                    return (
                      <motion.li
                        key={e.id}
                        layout
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ type: "spring", stiffness: 340, damping: 28 }}
                        className="overflow-hidden rounded-[var(--radius-glass-sm)] bg-[rgb(var(--glass-tint)/0.15)]"
                      >
                        <button
                          onClick={() => setExpanded(isOpen ? null : e.id)}
                          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-[rgb(var(--glass-tint)/0.12)]"
                        >
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              e.status === "pending" && "animate-pulse bg-brand-400",
                              e.status === "ok" && "bg-mint-400",
                              e.status === "mock" && "bg-sky-400",
                              e.status === "error" && "bg-rose-400",
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <code className="truncate font-mono text-[12.5px] font-medium t1">
                                {e.fn}
                              </code>
                            </div>
                            <div className="mt-1 flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "rounded px-1.5 py-px text-[10px] font-semibold tracking-wide",
                                  AREA_TONE[e.area] ?? "bg-[rgb(var(--glass-tint)/0.2)] t3",
                                )}
                              >
                                {e.area}
                              </span>
                              <span className="font-mono text-[10.5px] t3">{e.method}</span>
                              {e.ms != null && (
                                <span className="font-mono text-[10.5px] t3">{e.ms}ms</span>
                              )}
                            </div>
                          </div>
                          {!!e.effects?.length && (
                            <ChevronRight
                              size={14}
                              className={cn("shrink-0 t3 transition", isOpen && "rotate-90")}
                            />
                          )}
                        </button>

                        <AnimatePresence>
                          {isOpen && !!e.effects?.length && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                              className="overflow-hidden"
                            >
                              <ul className="space-y-1 border-t px-3 py-2.5 pl-[26px]">
                                {e.effects.map((fx, i) => (
                                  <li
                                    key={i}
                                    className="flex gap-2 text-[11.5px] leading-relaxed t2"
                                  >
                                    <span className="mt-[7px] size-1 shrink-0 rounded-full bg-[var(--text-3)]" />
                                    {fx}
                                  </li>
                                ))}
                              </ul>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </div>

          <footer className="border-t px-4 py-3">
            <p className="text-[11.5px] leading-relaxed t3">
              Tip: create a post or send a friend request — those carry an{" "}
              <code className="font-mono t2">Idempotency-Key</code>, so a
              retry replays the cached result instead of double-writing.
            </p>
          </footer>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/** Floating toggle — sits above content, bottom-right. */
export function InspectorFab({
  onClick, open,
}: {
  onClick: () => void;
  open: boolean;
}) {
  const [pulse, setPulse] = useState(false);

  useEffect(
    () =>
      subscribeApiLog((e) => {
        if (e.length) {
          setPulse(true);
          setTimeout(() => setPulse(false), 700);
        }
      }),
    [],
  );

  if (open) return null;

  return (
    <GlassButton
      onClick={onClick}
      className="fixed right-5 bottom-24 z-40 !size-13 !rounded-full !p-0 shadow-lg md:bottom-6"
      aria-label="Open API inspector"
    >
      <span className="relative grid place-items-center">
        <Activity size={19} className="text-mint-500" />
        {pulse && (
          <span className="pulse-ring absolute inset-0 rounded-full border-2 border-mint-400" />
        )}
      </span>
    </GlassButton>
  );
}
