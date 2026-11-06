"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/providers/wallet";
import { NEAR_CONFIG } from "@/lib/near/config";
import { token, tokenCalls } from "@/lib/near/token";
import { parseUnits } from "@/lib/format";

const BALANCE_KEY = "ft-balance";

/** The signed-in account's tUSDC balance, in the token's smallest unit. */
export function useTokenBalance() {
  const { accountId } = useWallet();
  const { id } = NEAR_CONFIG.token;
  return useQuery({
    queryKey: [BALANCE_KEY, id, accountId],
    queryFn: () => token.balanceOf(id, accountId!),
    enabled: !!accountId,
  });
}

export const FAUCET_AMOUNT = "100";

/** Testnet only: mint test tUSDC to the signed-in account. */
export function useFaucet() {
  const { accountId, send } = useWallet();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const mint = async () => {
    if (!accountId) return;
    setPending(true);
    try {
      await send([
        tokenCalls.mintTestToken(
          accountId,
          parseUnits(FAUCET_AMOUNT, NEAR_CONFIG.token.decimals)
        ),
      ]);
      await queryClient.invalidateQueries({ queryKey: [BALANCE_KEY] });
    } catch {
      // Usually the wallet popup was closed; the balance simply doesn't change.
    } finally {
      setPending(false);
    }
  };

  return { mint, pending };
}
