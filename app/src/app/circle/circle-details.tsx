"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/providers/wallet";
import { circleCalls, circles } from "@/lib/near/circles";
import { NEAR_CONFIG } from "@/lib/near/config";
import type { Call } from "@/lib/near/types";
import {
  formatInterval,
  formatUnits,
  nsToDate,
  shortAccount,
} from "@/lib/format";
import { Button } from "@/components/ui/button";

export function CircleDetails({ circleId }: { circleId: string }) {
  const { accountId, signIn, send } = useWallet();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newMembers, setNewMembers] = useState("");

  const circle = useQuery({
    queryKey: ["circle", circleId],
    queryFn: () => circles.get(circleId),
  });
  const state = useQuery({
    queryKey: ["circle-state", circleId],
    queryFn: () => circles.state(circleId),
  });
  const withdrawer = useQuery({
    queryKey: ["withdrawer", circleId],
    queryFn: () => circles.currentWithdrawer(circleId),
  });
  const memberViews = useQuery({
    queryKey: ["member-views", circleId, circle.data?.members],
    queryFn: () => circles.memberViews(circleId, circle.data!.members),
    enabled: !!circle.data,
  });
  const me = {
    data: memberViews.data?.find((m) => m.account_id === accountId),
    isLoading: memberViews.isLoading,
  };
  const canWithdraw = useQuery({
    queryKey: ["can-withdraw", circleId, accountId],
    queryFn: () => circles.isMemberWithdrawable(circleId, accountId!),
    enabled: !!accountId && !!me.data,
  });
  const canDecommission = useQuery({
    queryKey: ["can-decommission", circleId],
    queryFn: () => circles.isDecommissionable(circleId),
    enabled: !!me.data,
  });

  if (circle.isLoading) return <p>Loading circle…</p>;
  if (circle.error || !circle.data) return <p>Circle {circleId} not found.</p>;

  const c = circle.data;
  const { decimals, symbol } = NEAR_CONFIG.token;
  const amount = (v: string) => `${formatUnits(v, decimals)} ${symbol}`;
  const isOwner = accountId === c.owner;
  const notStarted = state.data === "NotStarted";
  const round = Number(c.current_index);
  const depositedThisRound =
    me.data && BigInt(me.data.deposits[round] ?? "0") >= BigInt(c.deposit_amount);

  const run = async (label: string, calls: Call[]) => {
    setPending(label);
    setError(null);
    try {
      await send(calls);
      await queryClient.invalidateQueries();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  };

  const actions: { label: string; calls: Call[]; variant?: "destructive" }[] = [];
  if (me.data) {
    if (isOwner && notStarted) {
      actions.push({
        label: "Start circle",
        calls: [circleCalls.start(c.id, c.members.length)],
      });
    }
    if (c.active && !depositedThisRound) {
      actions.push({
        label: `Deposit ${amount(c.deposit_amount)}`,
        calls: [circleCalls.deposit(c)],
      });
    }
    if (canWithdraw.data) {
      actions.push({ label: "Withdraw the pot", calls: [circleCalls.withdraw(c.id)] });
    }
    if (canDecommission.data) {
      actions.push({
        label: "Decommission",
        calls: [circleCalls.decommission(c.id)],
        variant: "destructive",
      });
    }
    if (BigInt(me.data.refund_owed) > BigInt(0)) {
      actions.push({
        label: `Claim refund of ${amount(me.data.refund_owed)}`,
        calls: [circleCalls.claimRefund(c.id, me.data.account_id)],
      });
    }
  }

  const addMembers = () => {
    const ids = newMembers
      .split(/[\s,]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (ids.length) run("Add members", [circleCalls.addMembers(c.id, ids)]);
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-h3 m-0 text-primary-blue">Circle #{c.id}</h1>
        {state.data && (
          <span className="border border-current px-3 py-1 text-body-bold">
            {state.data}
          </span>
        )}
      </header>

      <section className="card">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Stat label="Deposit per round" value={amount(c.deposit_amount)} />
          <Stat label="Round length" value={formatInterval(c.deposit_interval)} />
          <Stat
            label="Pot per round"
            value={amount(
              (BigInt(c.deposit_amount) * BigInt(c.members.length)).toString()
            )}
          />
          <Stat
            label="Round"
            value={notStarted ? "Not started" : `${Math.min(round + 1, c.members.length)} of ${c.members.length}`}
          />
          {c.start_time && (
            <Stat label="Started" value={nsToDate(c.start_time).toLocaleString()} />
          )}
          {c.end_time && (
            <Stat label="Ends" value={nsToDate(c.end_time).toLocaleString()} />
          )}
          {withdrawer.data && (
            <Stat label="This round's recipient" value={shortAccount(withdrawer.data)} />
          )}
        </dl>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h4 m-0">Members (payout order)</h2>
        <ol className="card gap-2">
          {c.members.map((m, i) => (
            <li key={m} className="flex justify-between gap-2 text-body-bold">
              <span>
                {i + 1}. {shortAccount(m)}
                {m === c.owner && " (owner)"}
                {m === accountId && " (you)"}
              </span>
              {memberViews.data?.[i]?.has_claimed && (
                <span className="text-system-green">Paid</span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {!accountId ? (
        <Button onClick={signIn}>Connect wallet to take part</Button>
      ) : !me.data && !me.isLoading ? (
        <p className="m-0 text-surface-grey-2">You are not a member of this circle.</p>
      ) : (
        <section className="flex flex-wrap gap-4">
          {actions.map((a) => (
            <Button
              key={a.label}
              variant={a.variant}
              disabled={!!pending}
              onClick={() => run(a.label, a.calls)}
            >
              {pending === a.label ? "Waiting for wallet…" : a.label}
            </Button>
          ))}
          {!actions.length && !(isOwner && notStarted) && (
            <p className="m-0 text-surface-grey-2">Nothing to do right now.</p>
          )}
        </section>
      )}

      {isOwner && notStarted && (
        <section className="card">
          <h2 className="text-h4 m-0">Add members</h2>
          <p className="m-0 text-surface-grey-2">
            NEAR account IDs, separated by commas or spaces. Payout order follows
            the order members are added.
          </p>
          <textarea
            className="field min-h-24"
            value={newMembers}
            onChange={(e) => setNewMembers(e.target.value)}
            placeholder="alice.testnet, bob.testnet"
          />
          <Button variant="secondary" onClick={addMembers} disabled={!!pending}>
            {pending === "Add members" ? "Waiting for wallet…" : "Add members"}
          </Button>
        </section>
      )}

      {error && <p className="m-0 text-system-red">{error}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption uppercase text-surface-grey-2">{label}</dt>
      <dd className="m-0 text-body-bold">{value}</dd>
    </div>
  );
}
