/**
 * Motion primitives, in the spirit of motion-primitives.com.
 *
 * Deliberately spring-based rather than duration-based: Liquid
 * Glass reads as a physical material, and physical materials
 * settle, they don't ease to a stop on a timer.
 */

import {
  motion, useMotionValue, useSpring, useTransform,
  type Variant, type Variants,
} from "motion/react";
import {
  useEffect, useRef, useState, type ReactNode,
} from "react";
import { cn } from "../lib/cn";

/* ── AnimatedGroup — staggered reveal of a list ──────────── */

const PRESETS: Record<string, { hidden: Variant; show: Variant }> = {
  fade: { hidden: { opacity: 0 }, show: { opacity: 1 } },
  slide: { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } },
  scale: { hidden: { opacity: 0, scale: 0.94 }, show: { opacity: 1, scale: 1 } },
  blur: {
    hidden: { opacity: 0, filter: "blur(8px)", y: 12 },
    show: { opacity: 1, filter: "blur(0px)", y: 0 },
  },
};

export function AnimatedGroup({
  children, className, itemClassName, preset = "slide", stagger = 0.055, delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Applied to each item wrapper. Pass "h-full" in grids so
      cards stretch to a shared row height. */
  itemClassName?: string;
  preset?: keyof typeof PRESETS;
  stagger?: number;
  delay?: number;
}) {
  const p = PRESETS[preset];
  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren: delay } },
  };
  const item: Variants = {
    hidden: p.hidden,
    show: { ...p.show, transition: { type: "spring", stiffness: 260, damping: 26 } },
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={className}
    >
      {Array.isArray(children)
        ? children.map((c, i) => (
            <motion.div key={i} variants={item} className={itemClassName}>
              {c}
            </motion.div>
          ))
        : (
          <motion.div variants={item} className={itemClassName}>
            {children}
          </motion.div>
        )}
    </motion.div>
  );
}

/* ── TextEffect — word-by-word entrance ──────────────────── */

export function TextEffect({
  children, className, per = "word", delay = 0,
}: {
  children: string;
  className?: string;
  per?: "word" | "char";
  delay?: number;
}) {
  const units = per === "word" ? children.split(" ") : children.split("");
  return (
    <motion.span
      className={cn("inline-block", className)}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: per === "word" ? 0.06 : 0.02, delayChildren: delay } },
      }}
    >
      {units.map((u, i) => (
        <motion.span
          key={i}
          className="inline-block whitespace-pre"
          variants={{
            hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
            show: {
              opacity: 1, y: 0, filter: "blur(0px)",
              transition: { type: "spring", stiffness: 280, damping: 24 },
            },
          }}
        >
          {u}
          {per === "word" && i < units.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </motion.span>
  );
}

/* ── Tilt — 3D parallax on pointer ───────────────────────── */

export function Tilt({
  children, className, max = 9,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 240, damping: 20 });
  const sy = useSpring(y, { stiffness: 240, damping: 20 });
  const rotateX = useTransform(sy, [-0.5, 0.5], [max, -max]);
  const rotateY = useTransform(sx, [-0.5, 0.5], [-max, max]);

  return (
    <motion.div
      ref={ref}
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        x.set((e.clientX - r.left) / r.width - 0.5);
        y.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      className={cn("will-change-transform", className)}
    >
      {children}
    </motion.div>
  );
}

/* ── BorderTrail — a light travelling the rim ────────────── */

export function BorderTrail({
  className, size = 70, duration = 5,
}: {
  className?: string;
  size?: number;
  duration?: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <motion.div
        className={cn("absolute aspect-square rounded-full", className)}
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          filter: "blur(14px)",
        }}
        animate={{ offsetDistance: ["0%", "100%"] }}
        transition={{ duration, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

/* ── Magnetic — pulls toward the cursor ──────────────────── */

export function Magnetic({
  children, strength = 0.28, className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 22 });
  const sy = useSpring(y, { stiffness: 300, damping: 22 });

  return (
    <motion.div
      ref={ref}
      style={{ x: sx, y: sy }}
      className={className}
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
    >
      {children}
    </motion.div>
  );
}

/* ── AnimatedNumber — spring-counts to a value ───────────── */

export function AnimatedNumber({
  value, className, decimals = 0,
}: {
  value: number;
  className?: string;
  decimals?: number;
}) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 150, damping: 24 });
  const [display, setDisplay] = useState("0");

  useEffect(() => { mv.set(value); }, [value, mv]);
  useEffect(
    () => spring.on("change", (v) => setDisplay(v.toFixed(decimals))),
    [spring, decimals],
  );

  return <span className={className}>{display}</span>;
}

/* ── Ambient background field ────────────────────────────── */

export function AmbientField() {
  return (
    <div className="ambient" aria-hidden>
      <div
        className="ambient-orb orb-a"
        style={{
          width: "46vw", height: "46vw", left: "-8vw", top: "-10vh",
          background: "radial-gradient(circle, #fa8b16 0%, transparent 68%)",
        }}
      />
      <div
        className="ambient-orb orb-b"
        style={{
          width: "42vw", height: "42vw", right: "-6vw", top: "6vh",
          background: "radial-gradient(circle, #8b5cf6 0%, transparent 68%)",
        }}
      />
      <div
        className="ambient-orb orb-c"
        style={{
          width: "40vw", height: "40vw", left: "26vw", bottom: "-16vh",
          background: "radial-gradient(circle, #14b585 0%, transparent 68%)",
        }}
      />
    </div>
  );
}
