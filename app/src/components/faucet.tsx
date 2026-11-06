"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/providers/wallet";
import { NEAR_CONFIG } from "@/lib/near/config";
import { token, tokenCalls } from "@/lib/near/token";
import { formatUnits, parseUnits } from "@/lib/format";
import { Button } from "./ui/button";

const FAUCET_AMOUNT = "100";

/** Testnet only: mint test USDC so anyone can try a circle. */
export function Faucet() {
  const { accountId, send } = useWallet();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const { id, decimals, symbol } = NEAR_CONFIG.token;

  const { data: balance } = useQuery({
    queryKey: ["ft-balance", id, accountId],
    queryFn: () => token.balanceOf(id, accountId!),
    enabled: !!accountId,
  });

  if (!accountId) return null;

  const mint = async () => {
    setPending(true);
    try {
      await send([
        tokenCalls.mintTestToken(accountId, parseUnits(FAUCET_AMOUNT, decimals)),
      ]);
      await queryClient.invalidateQueries({ queryKey: ["ft-balance"] });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="card flex-row flex-wrap items-center justify-between">
      <p className="text-body-bold m-0">
        Balance: {balance ? formatUnits(balance, decimals) : "…"} {symbol}
      </p>
      <Button variant="secondary" onClick={mint} disabled={pending}>
        {pending ? "Minting…" : `Get ${FAUCET_AMOUNT} test ${symbol}`}
      </Button>
    </div>
  );
}
