import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "blue" | "green" | "warning" | "red";

const TONES: Record<Tone, string> = {
  neutral: "border-surface-ink text-surface-ink",
  blue: "border-surface-ink text-primary-blue",
  green: "border-system-green text-system-green",
  warning: "border-system-warning text-system-warning",
  red: "border-system-red text-system-red",
};

/** Small bordered label, e.g. "Group owner", "Deposited", "Not deposited". */
export function Chip({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap border bg-paper-main px-3 py-0.5 text-sm font-bold",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
