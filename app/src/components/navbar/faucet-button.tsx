"use client";

import { useFaucet } from "@/hooks/use-token-balance";
import { NEAR_CONFIG } from "@/lib/near/config";
import { cn } from "@/lib/cn";

/**
 * Small outlined button that mints test tUSDC. Takes the place of the Bread
 * apps' "Deposit" button (ported from web/'s NavDepositButton).
 */
export function FaucetButton({ className }: { className?: string }) {
  const { mint, pending } = useFaucet();
  return (
    <button
      type="button"
      onClick={mint}
      disabled={pending}
      title={`Mint 100 test ${NEAR_CONFIG.token.symbol} (testnet only)`}
      className={cn("group relative inline-flex shrink-0 cursor-pointer disabled:cursor-wait", className)}
    >
      <span aria-hidden className="absolute inset-0 translate-x-0.5 translate-y-0.5 bg-surface-grey-2" />
      <span
        className={cn(
          "relative flex w-full items-center justify-center whitespace-nowrap border border-primary-blue bg-paper-main px-4 py-1 font-bold text-primary-blue transition-[transform,background-color,color] duration-100",
          pending
            ? "opacity-60"
            : "group-hover:bg-primary-blue group-hover:text-paper-main group-active:translate-x-0.5 group-active:translate-y-0.5"
        )}
      >
        {pending ? "Minting…" : `Get ${NEAR_CONFIG.token.symbol}`}
      </span>
    </button>
  );
}
