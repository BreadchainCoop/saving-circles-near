import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * One label/value line, as in the overview and details cards.
 * `boxed` gives the beige band used on the circle details card.
 */
export function StatRow({
  label,
  value,
  icon,
  boxed = false,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  boxed?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4",
        boxed && "bg-paper-1 px-5 py-3",
        className
      )}
    >
      <dt className="flex items-center gap-2 text-surface-grey-2">
        {icon && (
          <span className="text-primary-blue" aria-hidden>
            {icon}
          </span>
        )}
        {label}
      </dt>
      <dd className="m-0 text-right font-bold">{value}</dd>
    </div>
  );
}
