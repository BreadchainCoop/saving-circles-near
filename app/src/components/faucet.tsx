"use client";

import { useWallet } from "@/providers/wallet";
import { NEAR_CONFIG } from "@/lib/near/config";
import { FAUCET_AMOUNT, useFaucet, useTokenBalance } from "@/hooks/use-token-balance";
import { Amount } from "./ui/amount";
import { Button } from "./ui/button";

/** Testnet only: mint test USDC so anyone can try a circle. */
export function Faucet() {
  const { accountId } = useWallet();
  const { data: balance } = useTokenBalance();
  const { mint, pending } = useFaucet();

  if (!accountId) return null;

  return (
    <div className="card flex-row flex-wrap items-center justify-between">
      <p className="m-0">
        Balance: <Amount value={balance} />
      </p>
      <Button variant="secondary" onClick={mint} isLoading={pending}>
        Get {FAUCET_AMOUNT} test {NEAR_CONFIG.token.symbol}
      </Button>
    </div>
  );
}
