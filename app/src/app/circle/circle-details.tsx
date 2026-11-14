"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRightIcon,
  CalendarIcon,
  CoinsIcon,
  HandCoinsIcon,
  PlayIcon,
  SignOutIcon,
} from "@phosphor-icons/react";
import { useWallet } from "@/providers/wallet";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { circleCalls, circles } from "@/lib/near/circles";
import { automationCalls, getAutomation } from "@/lib/near/automation";
import { NEAR_CONFIG } from "@/lib/near/config";
import { accountExists } from "@/lib/near/rpc";
import { isAccountId, MAX_MEMBERS, MIN_MEMBERS, normalizeAccountId } from "@/lib/near/account";
import type { Call, CircleState, CircleView, MemberView, RoundState } from "@/lib/near/types";
import { formatInterval, nsToDate, shortAccount } from "@/lib/format";
import { BackLink } from "@/components/back-link";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Chip } from "@/components/ui/chip";
import { CopyIconButton, CopyTextButton } from "@/components/ui/copy-button";
import { StatRow } from "@/components/ui/stat-row";
import { FaucetButton } from "@/components/navbar/faucet-button";
import { RoundCountdown, useNow } from "./countdown";
import { MembersList, type MemberRow } from "./members-list";
import { AutomaticClaims, AutomaticDeposits } from "./automation";

const REFRESH_MS = 15_000;
const ZERO = BigInt(0);
const big = (v: string | undefined) => BigInt(v ?? "0");
const NS_PER_MS = BigInt(1_000_000);
const nsToMs = (ns: bigint) => Number(ns / NS_PER_MS);
const day = (ns: string | bigint) => nsToDate(ns).toLocaleDateString(undefined, { dateStyle: "medium" });

type Tone = "neutral" | "blue" | "green" | "warning" | "red";

/** One human label per contract state, used for the header chip and the round status. */
function statusLabel(state: CircleState | undefined, round: RoundState | undefined): [string, Tone] {
  switch (state) {
    case "NotStarted":
      return ["Not started", "neutral"];
    // circle_state says "Active" for all of round 1, so read the round itself.
    case "Active":
    case "DepositInProgress":
    case "DepositComplete":
      if (round === "Claimable") return ["Pot ready to claim", "green"];
      if (round === "Claimed") return ["Pot paid out", "green"];
      return ["Collecting deposits", "blue"];
    case "MissedDeposit":
      return ["Deposit missed", "red"];
    case "Expired":
      return ["Finished", "neutral"];
    case "Decommissioned":
      return ["Ended early", "red"];
    default:
      return ["…", "neutral"];
  }
}

export function CircleDetails({ circleId }: { circleId: string }) {
  const { accountId, signIn, send } = useWallet();
  const queryClient = useQueryClient();
  const now = useNow(1000);

  const circle = useQuery({
    queryKey: ["circle", circleId],
    queryFn: () => circles.get(circleId),
    refetchInterval: REFRESH_MS,
  });
  const state = useQuery({
    queryKey: ["circle-state", circleId],
    queryFn: () => circles.state(circleId),
    refetchInterval: REFRESH_MS,
  });
  const roundState = useQuery({
    queryKey: ["round-state", circleId],
    queryFn: () => circles.roundState(circleId),
    refetchInterval: REFRESH_MS,
  });
  const memberViews = useQuery({
    queryKey: ["member-views", circleId, circle.data?.members],
    queryFn: () => circles.memberViews(circleId, circle.data!.members),
    enabled: !!circle.data,
    refetchInterval: REFRESH_MS,
  });
  const isMember = !!accountId && !!circle.data?.members.includes(accountId);
  const canWithdraw = useQuery({
    queryKey: ["can-withdraw", circleId, accountId],
    queryFn: () => circles.isMemberWithdrawable(circleId, accountId!),
    enabled: isMember,
    refetchInterval: REFRESH_MS,
  });
  const canDecommission = useQuery({
    queryKey: ["can-decommission", circleId],
    queryFn: () => circles.isDecommissionable(circleId),
    enabled: isMember,
    refetchInterval: REFRESH_MS,
  });
  const automation = useQuery({
    queryKey: ["automation", circleId, accountId],
    queryFn: () => getAutomation(circleId, accountId!),
    enabled: isMember,
    refetchInterval: REFRESH_MS,
  });
  const balance = useTokenBalance();

  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => queryClient.invalidateQueries(), [queryClient]);

  const run = async (label: string, calls: Call[]) => {
    setPending(label);
    setError(null);
    try {
      await send(calls, { callbackUrl: window.location.href });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  };

  if (circle.isLoading) return <p className="text-surface-grey-2">Loading circle…</p>;
  if (circle.error || !circle.data) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink href="/">Return to dashboard</BackLink>
        <p className="m-0">Circle {circleId} doesn&apos;t exist.</p>
      </div>
    );
  }

  const c = circle.data;
  const n = c.members.length;
  const deposit = big(c.deposit_amount);
  const pot = deposit * BigInt(n);
  const interval = big(c.deposit_interval);
  const started = c.start_time !== null;
  const notStarted = state.data === "NotStarted" || (!started && !c.decommissioned);
  const isOwner = accountId === c.owner;

  // Round from the device clock so the countdown and deposit chips roll over
  // without waiting for a refetch. Mirrors Circle::current_round.
  const startNs = started ? big(c.start_time!) : ZERO;
  const nowNs = BigInt(now) * NS_PER_MS;
  const round = started && interval > ZERO && nowNs >= startNs ? Number((nowNs - startNs) / interval) : 0;
  const collecting =
    started && !c.decommissioned && round < n && state.data !== "MissedDeposit" && state.data !== "Expired";
  const roundStartMs = started ? nsToMs(startNs + interval * BigInt(round)) : null;
  const roundEndMs = started ? nsToMs(startNs + interval * BigInt(round + 1)) : null;

  const views = new Map<string, MemberView>((memberViews.data ?? []).map((v) => [v.account_id, v]));
  const depositedIn = (v: MemberView | undefined, r: number) => big(v?.deposits[r]) >= deposit;
  const me = accountId ? views.get(accountId) : undefined;
  const myIndex = accountId ? c.members.indexOf(accountId) : -1;

  const rows: MemberRow[] = c.members.map((m, i) => ({
    accountId: m,
    view: views.get(m),
    isOwner: m === c.owner,
    isYou: m === accountId,
    depositedThisRound: collecting && memberViews.data ? depositedIn(views.get(m), round) : undefined,
    receivesThisRound: started && !c.decommissioned && i === round,
  }));
  const depositedCount = rows.filter((r) => r.depositedThisRound).length;
  const roundTotal = c.members.reduce((sum, m) => sum + big(views.get(m)?.deposits[round]), ZERO);
  const paidCount = (memberViews.data ?? []).filter((v) => v.has_claimed).length;
  const overall = (memberViews.data ?? []).reduce(
    (sum, v) => sum + v.deposits.reduce((s, d) => s + big(d), ZERO),
    ZERO
  );
  const myDeposited = me ? me.deposits.reduce((s, d) => s + big(d), ZERO) + big(me.refund_owed) : ZERO;
  const [label, tone] = statusLabel(state.data, roundState.data);
  const ended = c.decommissioned || state.data === "MissedDeposit" || state.data === "Expired";
  // The switches only make sense where a keeper runs `process_due`; a pre-funded
  // balance can still be withdrawn anywhere.
  const automatable = !!NEAR_CONFIG.keeper && !ended;
  // Deposits this member still owes: every round from the current one, minus
  // the current one if already paid. Before the start, all of them.
  const pendingDeposits = !me || ended ? 0 : !started ? n : collecting ? n - round - (depositedIn(me, round) ? 1 : 0) : 0;
  const prefunded = big(automation.data?.balance);

  // ------------------------------------------------------------ actions
  const actions: { label: string; calls: Call[]; variant?: "destructive" | "light"; icon?: ReactNode }[] = [];
  if (me) {
    if (isOwner && notStarted) {
      actions.push({
        label: "Start circle",
        calls: [circleCalls.start(c.id, n)],
        icon: <PlayIcon size={20} weight="fill" />,
      });
    }
    if (canWithdraw.data) {
      actions.push({ label: "Withdraw the pot", calls: [circleCalls.withdraw(c.id)], icon: <HandCoinsIcon size={20} /> });
    }
    if (collecting && !depositedIn(me, round)) {
      actions.push({ label: "Deposit", calls: [circleCalls.deposit(c)], icon: <CoinsIcon size={20} /> });
    }
    if (big(me.refund_owed) > ZERO) {
      actions.push({ label: "Claim refund", calls: [circleCalls.claimRefund(c.id, me.account_id)] });
    }
    // Left over after the last round, or when the circle ended early.
    if (prefunded > ZERO && (ended || !automation.data?.deposits)) {
      actions.push({ label: "Withdraw pre-funded", calls: [automationCalls.withdrawPrefund(c.id)] });
    }
    if (canDecommission.data) {
      actions.push({ label: "End circle", calls: [circleCalls.decommission(c.id)], variant: "destructive" });
    }
  }
  const needsTokens =
    actions.some((a) => a.label === "Deposit") && balance.data !== undefined && big(balance.data) < deposit;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <BackLink href="/">Return to dashboard</BackLink>
        <CopyTextButton text={typeof window === "undefined" ? "" : window.location.href}>
          Copy circle link
        </CopyTextButton>
      </div>

      <header className="flex flex-wrap items-center gap-4">
        <h1 className="m-0 font-breadDisplay text-5xl font-black tracking-tight text-primary-blue md:text-6xl">
          Circle {c.id}
        </h1>
        <Chip tone={tone} className="text-base">
          {label}
        </Chip>
      </header>

      <Banner
        state={state.data}
        notStarted={notStarted}
        isOwner={isOwner}
        missedRound={round}
      />

      <div className="grid items-stretch gap-6 lg:grid-cols-[3fr_2fr]">
        {/* Deposit overview */}
        <section className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="m-0 font-breadDisplay text-3xl font-black">Deposit overview</h2>
            <p className="m-0 text-sm">
              Circle status:{" "}
              <strong>
                {paidCount} of {n} rounds paid out
              </strong>
            </p>
          </div>
          <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Figure label="Deposits made by">
              {collecting ? (
                <>
                  <strong>{depositedCount}</strong> of <strong>{n}</strong> members
                </>
              ) : (
                "–"
              )}
            </Figure>
            <Figure label="Round total" center>
              {collecting ? <Amount value={roundTotal.toString()} /> : "–"}
            </Figure>
            <Figure label="Round" right>
              <strong>{started && round < n ? `${round + 1} of ${n}` : started ? "All closed" : "Not started"}</strong>
            </Figure>
          </dl>
          <hr className="m-0 border-paper-2" />
          <RoundCountdown
            startMs={collecting ? roundStartMs : null}
            endMs={collecting ? roundEndMs : null}
            onEnd={refresh}
          />
        </section>

        {/* Your position */}
        <section className="card items-center justify-center border-[#CBE9E5] text-center">
          <h2 className="m-0 w-full border-b border-paper-2 pb-4 font-breadDisplay text-2xl font-black">
            {me ? "Your position" : "Take part"}
          </h2>
          {!accountId ? (
            <>
              <p className="m-0 text-surface-grey-2">Sign in to deposit, withdraw your pot, or follow your turn.</p>
              <Button onClick={signIn}>Sign in</Button>
            </>
          ) : !isMember ? (
            <p className="m-0 text-surface-grey-2">
              You&apos;re not a member of this circle. Only the owner can add members, before it starts.
            </p>
          ) : !me ? (
            <p className="m-0 text-surface-grey-2">Loading your position…</p>
          ) : (
            <>
              <div className="flex flex-col items-center gap-1">
                <Amount value={myDeposited.toString()} className="text-5xl" />
                <p className="m-0 text-sm text-surface-grey-2">deposited by you</p>
              </div>
              <p className="m-0">
                {me.has_claimed ? (
                  <>
                    You received your pot of <Amount value={pot.toString()} />.
                  </>
                ) : (
                  <>
                    Your turn: <strong>round {myIndex + 1}</strong>
                    {started && (
                      <> (from {day(startNs + interval * BigInt(myIndex))})</>
                    )}
                    , <Amount value={pot.toString()} />
                  </>
                )}
              </p>
              <div className="flex w-full flex-col gap-3">
                {actions.map((a) => (
                  <Button
                    key={a.label}
                    variant={a.variant}
                    fullWidth
                    leftIcon={a.icon}
                    isLoading={pending === a.label}
                    disabled={!!pending && pending !== a.label}
                    onClick={() => run(a.label, a.calls)}
                  >
                    {a.label === "Deposit" ? (
                      <>
                        Deposit <Amount value={c.deposit_amount} />
                      </>
                    ) : a.label === "Withdraw the pot" ? (
                      <>
                        Withdraw <Amount value={pot.toString()} />
                      </>
                    ) : a.label === "Withdraw pre-funded" ? (
                      <>
                        Withdraw pre-funded <Amount value={prefunded.toString()} />
                      </>
                    ) : a.label === "Claim refund" ? (
                      <>
                        Claim refund of <Amount value={me.refund_owed} />
                      </>
                    ) : (
                      a.label
                    )}
                  </Button>
                ))}
                {isOwner && notStarted && n < MIN_MEMBERS && (
                  <p className="m-0 text-sm text-surface-grey-2">Add at least one more member to start.</p>
                )}
                {needsTokens && (
                  <p className="m-0 flex flex-wrap items-center justify-center gap-2 text-sm text-surface-grey-2">
                    Not enough {NEAR_CONFIG.token.symbol} for this deposit. <FaucetButton />
                  </p>
                )}
                {!actions.length && (
                  <p className="m-0 text-sm text-surface-grey-2">
                    {notStarted
                      ? "Waiting for the owner to start the circle."
                      : collecting
                        ? "You've deposited for this round. Nothing else to do right now."
                        : "Nothing to do right now."}
                  </p>
                )}
                {notStarted && !isOwner && (
                  <Button
                    variant="light"
                    fullWidth
                    rightIcon={<SignOutIcon size={20} />}
                    isLoading={pending === "Leave"}
                    onClick={() => run("Leave", [circleCalls.removeMember(c.id, me.account_id)])}
                  >
                    Leave circle
                  </Button>
                )}
              </div>
              {automatable && (pendingDeposits > 0 || !me.has_claimed) && !automation.data && (
                <div className="flex w-full flex-col items-center gap-2 border-t border-paper-2 pt-4 text-sm text-surface-grey-2">
                  {automation.isError ? (
                    <>
                      <p className="m-0">Couldn&apos;t load your automatic deposits and claims.</p>
                      <Button size="sm" variant="light" onClick={() => automation.refetch()}>
                        Try again
                      </Button>
                    </>
                  ) : (
                    <p className="m-0">Loading automatic deposits and claims…</p>
                  )}
                </div>
              )}
              {automation.data && automatable && (pendingDeposits > 0 || !me.has_claimed) && (
                <div className="flex w-full flex-col gap-4 border-t border-paper-2 pt-4">
                  {pendingDeposits > 0 && (
                    <AutomaticDeposits
                      circle={c}
                      automation={automation.data}
                      pendingDeposits={pendingDeposits}
                      hasClaimed={me.has_claimed}
                      disabled={!!pending}
                      onDone={refresh}
                    />
                  )}
                  {!me.has_claimed && (
                    <AutomaticClaims
                      circleId={c.id}
                      automation={automation.data}
                      disabled={!!pending}
                      onDone={refresh}
                    />
                  )}
                </div>
              )}
            </>
          )}
          {error && <p className="m-0 break-words text-sm text-system-red">{error}</p>}
        </section>
      </div>

      {/* Details */}
      <section className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-paper-2 pb-4">
          <h2 className="m-0 font-breadDisplay text-3xl font-black">Circle details</h2>
          <p className="m-0 flex items-center gap-2 text-sm text-surface-grey-2">
            ID: <strong className="text-surface-ink">{c.id}</strong>
            {started && (
              <>
                <span aria-hidden>·</span> Started
                <CalendarIcon size={16} className="text-primary-blue" aria-hidden />
                <strong className="text-surface-ink">{day(c.start_time!)}</strong>
              </>
            )}
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col justify-between gap-4">
            <p className="m-0 flex flex-wrap items-baseline gap-3">
              <Amount value={pot.toString()} className="font-breadDisplay text-6xl font-black" />
              <span className="text-surface-grey-2">pot each round</span>
            </p>
            <dl className="m-0">
              <StatRow label="Deposited by members so far" value={<Amount value={overall.toString()} />} />
            </dl>
          </div>
          <dl className="m-0 flex flex-col gap-2">
            <StatRow boxed label="Deposit per member" value={<Amount value={c.deposit_amount} />} />
            <StatRow boxed label="Members deposit every" value={formatInterval(c.deposit_interval)} />
            <StatRow
              boxed
              label={c.end_time ? "Last round closes" : "Circle lasts"}
              value={
                c.end_time
                  ? day(c.end_time)
                  : `${n} round${n === 1 ? "" : "s"}`
              }
            />
          </dl>
        </div>
      </section>

      <MembersList
        rows={rows}
        viewerIsOwner={isOwner}
        onRemove={notStarted ? (m) => run("Remove", [circleCalls.removeMember(c.id, m)]) : undefined}
        removeDisabled={!!pending}
      />

      {isOwner && notStarted && <AddMembers circle={c} pending={!!pending} onAdd={(ids) => run("Add members", [circleCalls.addMembers(c.id, ids)])} />}

      <dl className="m-0 flex flex-col gap-2">
        <StatRow
          boxed
          label="Contract"
          value={
            <a
              href={`${NEAR_CONFIG.explorerUrl}/address/${NEAR_CONFIG.contractId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-normal hover:text-primary-blue"
            >
              {shortAccount(NEAR_CONFIG.contractId)} <ArrowUpRightIcon size={20} className="text-primary-blue" />
            </a>
          }
        />
        <StatRow
          boxed
          label="Created by"
          value={
            <span className="inline-flex items-center gap-2 font-normal">
              {shortAccount(c.owner)} <CopyIconButton text={c.owner} label="Copy owner account" />
            </span>
          }
        />
      </dl>
    </div>
  );
}

function Figure({ label, children, center, right }: { label: string; children: ReactNode; center?: boolean; right?: boolean }) {
  return (
    <div className={center ? "sm:text-center" : right ? "sm:text-right" : undefined}>
      <dt className="text-surface-grey-2">{label}</dt>
      <dd className="m-0 mt-1">{children}</dd>
    </div>
  );
}

function Banner({
  state,
  notStarted,
  isOwner,
  missedRound,
}: {
  state: CircleState | undefined;
  notStarted: boolean;
  isOwner: boolean;
  missedRound: number;
}) {
  if (state === "Decommissioned") {
    return (
      <Callout tone="info" title="This circle has ended">
        It was ended after a missed deposit. Deposits for rounds that weren&apos;t paid out are refunded:
        each member can claim theirs below.
      </Callout>
    );
  }
  if (state === "MissedDeposit") {
    return (
      <Callout title="A deposit was missed">
        Round {missedRound} closed without every deposit. Any member can now end the circle, and deposits for
        rounds not yet paid out are refunded.
      </Callout>
    );
  }
  if (state === "Expired") {
    return (
      <Callout tone="info" title="Every round has closed">
        Anyone who hasn&apos;t withdrawn their pot yet can still do it.
      </Callout>
    );
  }
  if (notStarted) {
    return (
      <Callout tone="info" title={isOwner ? "Ready when you are" : "Waiting for the owner to start"}>
        {isOwner
          ? "Add or remove members, then start the circle. Payout order follows the member list and is fixed once it starts."
          : "Members can still be added or removed. Deposits open when the owner starts the circle."}
      </Callout>
    );
  }
  return (
    <Callout title="Missing a deposit ends the circle">
      If any member misses a deposit, any member can end the circle, and deposits for rounds not yet paid out
      are refunded.
    </Callout>
  );
}

function AddMembers({
  circle,
  pending,
  onAdd,
}: {
  circle: CircleView;
  pending: boolean;
  onAdd: (ids: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    setError(null);
    const ids = [...new Set(text.split(/[\s,]+/).map(normalizeAccountId).filter(Boolean))];
    if (!ids.length) return;
    const bad = ids.find((id) => !isAccountId(id));
    if (bad) return setError(`"${bad}" isn't a valid NEAR account ID.`);
    const dup = ids.find((id) => circle.members.includes(id));
    if (dup) return setError(`${dup} is already a member.`);
    if (circle.members.length + ids.length > MAX_MEMBERS) {
      return setError(`A circle can have at most ${MAX_MEMBERS} members.`);
    }
    setChecking(true);
    try {
      const exists = await Promise.all(ids.map(accountExists));
      const missing = ids.filter((_, i) => !exists[i]);
      if (missing.length) return setError(`Not found on ${NEAR_CONFIG.networkName}: ${missing.join(", ")}`);
      onAdd(ids);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="card">
      <h2 className="m-0 font-breadDisplay text-2xl font-black">Add members</h2>
      <p className="m-0 text-surface-grey-2">
        NEAR account IDs, separated by commas or spaces. They join the end of the payout order.
      </p>
      <textarea
        className="field min-h-24"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`alice.${NEAR_CONFIG.accountSuffix}, bob.${NEAR_CONFIG.accountSuffix}`}
        autoCapitalize="none"
        spellCheck={false}
      />
      {error && <p className="m-0 text-sm text-system-red">{error}</p>}
      <div>
        <Button variant="secondary" onClick={submit} isLoading={checking} disabled={pending}>
          Add members
        </Button>
      </div>
    </section>
  );
}
