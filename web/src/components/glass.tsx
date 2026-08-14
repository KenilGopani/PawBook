/**
 * Liquid Glass primitives.
 *
 * Everything visible in the app is built from these, so the whole
 * surface reads as one consistent material. The optical work
 * (blur, rim light, shadow) lives in .glass in index.css — these
 * components just compose it with layout + interaction.
 */

import { motion, type HTMLMotionProps } from "motion/react";
import {
  forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes,
  type ReactNode, type TextareaHTMLAttributes,
} from "react";
import { cn } from "../lib/cn";

/* ── Surface ─────────────────────────────────────────────── */

interface GlassProps extends HTMLMotionProps<"div"> {
  children?: ReactNode;
  /** Adds the diagonal light sheen. On by default. */
  specular?: boolean;
  /** Adds the chromatic edge. Use on hero/feature surfaces. */
  chroma?: boolean;
  /** Deeper drop shadow — for modals and floating panels. */
  raised?: boolean;
  padded?: boolean;
}

export function Glass({
  children, className, specular = true, chroma = false,
  raised = false, padded = false, ...rest
}: GlassProps) {
  return (
    <motion.div
      className={cn(
        "glass rounded-[var(--radius-glass)]",
        specular && "glass-specular",
        chroma && "glass-chroma",
        raised && "glass-raised",
        padded && "p-5",
        className,
      )}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/* ── Button ──────────────────────────────────────────────── */

type Variant = "primary" | "glass" | "ghost" | "danger" | "success";

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-white border-transparent shadow-[0_6px_20px_-4px_rgba(250,139,22,0.55)] " +
    "bg-gradient-to-b from-brand-400 to-brand-600 hover:brightness-110",
  glass: "glass glass-specular t1 hover:brightness-105",
  ghost: "t2 border-transparent bg-transparent hover:bg-[rgb(var(--glass-tint)/0.16)]",
  danger:
    "text-white border-transparent shadow-[0_6px_20px_-4px_rgba(244,63,94,0.5)] " +
    "bg-gradient-to-b from-rose-400 to-rose-500 hover:brightness-110",
  success:
    "text-white border-transparent shadow-[0_6px_20px_-4px_rgba(20,181,133,0.5)] " +
    "bg-gradient-to-b from-mint-400 to-mint-500 hover:brightness-110",
};

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}

export const GlassButton = forwardRef<HTMLButtonElement, BtnProps>(
  ({ variant = "glass", size = "md", loading, icon, className, children, disabled, ...rest }, ref) => (
    <motion.button
      ref={ref}
      whileHover={{ scale: disabled || loading ? 1 : 1.03 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.97 }}
      transition={{ type: "spring", stiffness: 420, damping: 26 }}
      disabled={disabled || loading}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-full border font-medium",
        "whitespace-nowrap transition-[filter,background-color] outline-none",
        "focus-visible:ring-2 focus-visible:ring-brand-400/70 focus-visible:ring-offset-0",
        "disabled:opacity-45 disabled:cursor-not-allowed",
        size === "sm" && "h-9 px-4 text-[13px]",
        size === "md" && "h-11 px-5 text-sm",
        size === "lg" && "h-13 px-7 text-[15px]",
        VARIANTS[variant],
        className,
      )}
      {...(rest as HTMLMotionProps<"button">)}
    >
      {loading ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon
      )}
      {children}
    </motion.button>
  ),
);
GlassButton.displayName = "GlassButton";

/* ── Inputs ──────────────────────────────────────────────── */

const FIELD =
  "w-full rounded-[var(--radius-glass-sm)] border bg-[rgb(var(--glass-tint)/0.22)] " +
  "px-4 py-3 text-sm t1 outline-none transition placeholder:text-[var(--text-3)] " +
  "focus:border-brand-400/70 focus:bg-[rgb(var(--glass-tint)/0.3)] " +
  "focus:ring-2 focus:ring-brand-400/25";

export const GlassInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label?: string }
>(({ label, className, ...rest }, ref) => (
  <label className="block">
    {label && (
      <span className="mb-1.5 block text-[13px] font-medium t2">{label}</span>
    )}
    <input ref={ref} className={cn(FIELD, className)} {...rest} />
  </label>
));
GlassInput.displayName = "GlassInput";

export const GlassTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }
>(({ label, className, ...rest }, ref) => (
  <label className="block">
    {label && (
      <span className="mb-1.5 block text-[13px] font-medium t2">{label}</span>
    )}
    <textarea ref={ref} className={cn(FIELD, "resize-none", className)} {...rest} />
  </label>
));
GlassTextarea.displayName = "GlassTextarea";

export function GlassSelect({
  label, className, children, ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-[13px] font-medium t2">{label}</span>
      )}
      <select className={cn(FIELD, "appearance-none", className)} {...rest}>
        {children}
      </select>
    </label>
  );
}

/* ── Chip / Badge ────────────────────────────────────────── */

export function Chip({
  children, active, onClick, tone = "neutral", className,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  tone?: "neutral" | "brand" | "mint" | "sky" | "grape" | "rose";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-[rgb(var(--glass-tint)/0.24)] t2",
    brand: "bg-brand-400/20 text-brand-700 dark:text-brand-200",
    mint: "bg-mint-400/20 text-mint-500",
    sky: "bg-sky-400/20 text-sky-500",
    grape: "bg-grape-400/22 text-grape-500",
    rose: "bg-rose-400/20 text-rose-500",
  };
  const Tag = onClick ? motion.button : motion.span;
  return (
    <Tag
      onClick={onClick}
      whileTap={onClick ? { scale: 0.94 } : undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium",
        "border transition",
        active
          ? "border-brand-400/60 bg-brand-400/25 text-brand-700 dark:text-brand-200"
          : cn("border-transparent", tones[tone]),
        onClick && "cursor-pointer hover:brightness-110",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/* ── Avatar ──────────────────────────────────────────────── */

const GRADIENTS = [
  "from-brand-400 to-rose-400", "from-mint-400 to-sky-400",
  "from-grape-400 to-rose-400", "from-sky-400 to-grape-400",
  "from-brand-400 to-mint-400", "from-rose-400 to-grape-400",
];

/** Stable gradient per id, so a given pet always looks the same. */
function gradientFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export function Avatar({
  seed, emoji, size = 44, ring, className,
}: {
  seed: string;
  emoji: string;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full",
        "bg-gradient-to-br", gradientFor(seed),
        ring && "ring-2 ring-[rgb(var(--glass-tint)/0.55)] ring-offset-2 ring-offset-transparent",
        className,
      )}
    >
      <span className="drop-shadow-sm select-none leading-none">{emoji}</span>
      {/* rim light, same physics as .glass */}
      <span className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-1px_0_rgba(0,0,0,0.12)]" />
    </div>
  );
}

/* ── Section header ──────────────────────────────────────── */

export function SectionTitle({
  title, subtitle, action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[19px] font-semibold tracking-[-0.01em] t1">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] t3">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────── */

export function EmptyState({
  icon, title, hint,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-[rgb(var(--glass-tint)/0.2)] t3">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium t2">{title}</p>
        {hint && <p className="mt-1 text-[13px] t3">{hint}</p>}
      </div>
    </div>
  );
}

/* ── Skeleton ────────────────────────────────────────────── */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-glass-sm)] bg-[rgb(var(--glass-tint)/0.16)]",
        className,
      )}
    >
      <div className="shimmer size-full" />
    </div>
  );
}
