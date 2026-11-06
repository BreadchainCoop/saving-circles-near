import { cn } from "@/lib/cn";

/** First letter of the NEAR account in a blue disc. */
export function Avatar({ accountId, className }: { accountId: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-blue text-xs font-bold uppercase leading-none text-paper-main",
        className
      )}
    >
      {accountId[0]}
    </span>
  );
}
