"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/providers/wallet";
import { circleCalls, circles } from "@/lib/near/circles";
import { NEAR_CONFIG } from "@/lib/near/config";
import { daysToNs, parseUnits } from "@/lib/format";
import { Button } from "@/components/ui/button";

export default function NewCircle() {
  const { accountId, signIn, send } = useWallet();
  const router = useRouter();
  const [amount, setAmount] = useState("10");
  const [days, setDays] = useState("7");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { id: tokenId, decimals, symbol } = NEAR_CONFIG.token;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      // `create` returns the id, but redirect wallets drop return values, so
      // read the id the contract will assign before sending.
      const id = await circles.nextId();
      await send([
        circleCalls.create({
          token: tokenId,
          deposit_amount: parseUnits(amount, decimals),
          deposit_interval: daysToNs(Number(days)).toString(),
        }),
      ]);
      router.push(`/circle/?id=${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="card mx-auto max-w-xl">
      <h1 className="text-h3 m-0">New circle</h1>
      <label className="flex flex-col gap-2">
        <span className="text-body-bold">Deposit per round ({symbol})</span>
        <input
          className="field"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-body-bold">Round length (days)</span>
        <input
          className="field"
          inputMode="decimal"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          required
        />
        <span className="text-caption text-surface-grey-2">
          Use a fraction such as 0.01 (about 15 minutes) to demo a full circle
          quickly.
        </span>
      </label>
      <p className="m-0 text-surface-grey-2">
        You join as the first member and receive the first payout. Add members
        on the next screen, then start the circle.
      </p>
      {accountId ? (
        <Button type="submit" disabled={pending} fullWidth>
          {pending ? "Waiting for wallet…" : "Create circle"}
        </Button>
      ) : (
        <Button onClick={signIn} fullWidth>
          Connect wallet
        </Button>
      )}
      {error && <p className="m-0 text-system-red">{error}</p>}
    </form>
  );
}
