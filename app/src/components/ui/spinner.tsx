import { cn } from "@/lib/cn";

/** The kit's loading ring, in the Stacks blues. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      role="status"
      aria-label="Loading"
      viewBox="0 0 120 120"
      className={cn("size-5 shrink-0 animate-spin", className)}
    >
      <circle cx="60" cy="60" r="50" fill="none" strokeWidth="20" className="stroke-[#B9D5FF]" />
      <circle
        cx="60"
        cy="60"
        r="50"
        fill="none"
        strokeWidth="20"
        strokeDasharray="314"
        strokeDashoffset="235"
        strokeLinecap="round"
        className="stroke-primary-blue"
      />
    </svg>
  );
}
