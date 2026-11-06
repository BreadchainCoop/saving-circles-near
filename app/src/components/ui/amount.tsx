import { NEAR_CONFIG } from "@/lib/near/config";
import { splitAmount } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * A token amount as "$12.50" with the cents smaller, as in the Bread apps.
 * tUSDC is a test dollar token, so it is shown in dollars.
 * `value` is in the token's smallest unit; undefined shows a dash.
 */
export function Amount({
  value,
  className,
  centsClassName,
}: {
  value: string | undefined;
  className?: string;
  centsClassName?: string;
}) {
  if (value === undefined) return <span className={cn("font-bold", className)}>–</span>;
  const [whole, cents] = splitAmount(value, NEAR_CONFIG.token.decimals);
  return (
    <span className={cn("font-bold whitespace-nowrap", className)}>
      ${whole}
      <span className={cn("text-[0.75em]", centsClassName)}>.{cents}</span>
    </span>
  );
}
