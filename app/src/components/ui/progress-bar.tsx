import { cn } from "@/lib/cn";

/** Blue fill on a beige track. `value` is 0–100 and is clamped. */
export function ProgressBar({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("h-3.5 w-full bg-paper-1 p-0.75", className)}
    >
      <div className="h-full bg-primary-blue transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}
