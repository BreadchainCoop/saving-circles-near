"use client";

import "@near-wallet-selector/modal-ui/styles.css";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  setupWalletSelector,
  type WalletSelector,
} from "@near-wallet-selector/core";
import {
  setupModal,
  type WalletSelectorModal,
} from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { actionCreators } from "@near-js/transactions";
import { NEAR_CONFIG } from "@/lib/near/config";
import type { Call } from "@/lib/near/types";

const TGAS = BigInt(10) ** BigInt(12);

type WalletContextValue = {
  ready: boolean;
  accountId: string | null;
  signIn: () => void;
  signOut: () => Promise<void>;
  /**
   * Signs and sends calls. Consecutive calls to the same receiver share one
   * transaction; the wallet asks for approval once.
   */
  send: (calls: Call[]) => Promise<unknown>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const [modal, setModal] = useState<WalletSelectorModal | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setupWalletSelector({
      network: NEAR_CONFIG.networkId,
      modules: [setupMyNearWallet(), setupMeteorWallet(), setupHereWallet()],
    }).then((ws) => {
      if (cancelled) return;
      setSelector(ws);
      // No contractId: no function-call access key is created, so every call
      // goes through the wallet. Deposits attach 1 yocto and need that anyway.
      setModal(setupModal(ws, { description: "Sign in to Saving Circles" }));
      const active = ws.store.getState().accounts.find((a) => a.active);
      setAccountId(active?.accountId ?? null);
      ws.subscribeOnAccountChange((id) => setAccountId(id || null));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(() => modal?.show(), [modal]);

  const signOut = useCallback(async () => {
    if (!selector) return;
    const wallet = await selector.wallet();
    await wallet.signOut();
    setAccountId(null);
  }, [selector]);

  const send = useCallback(
    async (calls: Call[]) => {
      if (!selector || !accountId) throw new Error("Connect a wallet first");
      const wallet = await selector.wallet();
      const transactions = groupByReceiver(calls).map((group) => ({
        signerId: accountId,
        receiverId: group[0].receiverId,
        actions: group.map((c) =>
          actionCreators.functionCall(
            c.methodName,
            c.args,
            BigInt(c.gasTGas) * TGAS,
            BigInt(c.depositYocto)
          )
        ),
      }));
      return transactions.length === 1
        ? wallet.signAndSendTransaction(transactions[0])
        : wallet.signAndSendTransactions({ transactions });
    },
    [selector, accountId]
  );

  const value = useMemo(
    () => ({ ready: !!selector, accountId, signIn, signOut, send }),
    [selector, accountId, signIn, signOut, send]
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}

function groupByReceiver(calls: Call[]): Call[][] {
  const groups: Call[][] = [];
  for (const c of calls) {
    const last = groups[groups.length - 1];
    if (last && last[0].receiverId === c.receiverId) last.push(c);
    else groups.push([c]);
  }
  return groups;
}
