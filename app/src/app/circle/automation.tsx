"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  ArrowsClockwiseIcon,
  CalendarIcon,
  HandDepositIcon,
  HandWithdrawIcon,
} from "@phosphor-icons/react";
import { useWallet } from "@/providers/wallet";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { automationCalls, type Automation } from "@/lib/near/automation";
import { NEAR_CONFIG } from "@/lib/near/config";
import type { Call, CircleView } from "@/lib/near/types";
import { formatInterval, shortAccount } from "@/lib/format";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Modal, ModalStatus } from "@/components/ui/modal";
import { StatRow } from "@/components/ui/stat-row";
import { Switch } from "@/components/ui/switch";
import { FaucetButton } from "@/components/navbar/faucet-button";

/*
 * Automatic deposits and claims, ported from web/'s automatic-deposits/ and
 * automatic-claim. On EVM, activating approves an ERC20 spend; on NEAR the
 * member turns automation on and pre-funds the remaining deposits instead, and
 * a keeper runs them each round (see lib/near/automation).
 */

const ZERO = BigInt(0);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

type TxStatus = "idle" | "loading" | "success" | "error";

/** Sends calls and tracks the outcome for a modal. */
function useTx(onDone: () => Promise<unknown>) {
  const { send } = useWallet();
  const [status, setStatus] = useState<TxStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const run = async (calls: Call[]) => {
    setStatus("loading");
    setError(null);
    try {
      // Redirect wallets leave the page here; the circle page refetches on return.
      await send(calls, { callbackUrl: window.location.href });
      await onDone();
      setStatus("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  return { run, status, setStatus, error };
}

function ToggleRow({
  id,
  icon,
  name,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  icon: ReactNode;
  name: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <label htmlFor={id} className="flex flex-wrap items-center gap-2 text-left">
      {icon}
      <span className="mr-auto">
        Activate <strong>{name}</strong>
      </span>
      <Switch id={id} checked={checked} disabled={disabled} onChange={onChange} />
    </label>
  );
}

function ModalTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {icon}
      <h2 className="m-0 font-breadDisplay text-2xl font-black">{title}</h2>
      {subtitle && <p className="m-0 font-bold text-surface-grey-2">{subtitle}</p>}
    </div>
  );
}

// ------------------------------------------------------------ deposits

/**
 * Toggle for automatic deposits, plus the web app's post-claim warning: once a
 * member has their pot, the only thing keeping the circle alive is their
 * remaining deposits.
 */
export function AutomaticDeposits({
  circle,
  automation,
  pendingDeposits,
  hasClaimed,
  disabled,
  onDone,
}: {
  circle: CircleView;
  automation: Automation;
  /** Deposits still owed by this member, including the current round's if unpaid. */
  pendingDeposits: number;
  hasClaimed: boolean;
  disabled?: boolean;
  onDone: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState<null | "toggle" | "topUp">(null);
  const enabled = automation.deposits;
  const covered = coveredRounds(automation.balance, circle.deposit_amount, pendingDeposits);

  return (
    <>
      {hasClaimed && !enabled && pendingDeposits > 0 && (
        <Callout title="Secure your next deposits" className="text-left">
          <p className="m-0">
            <strong>{plural(pendingDeposits, "deposit")}</strong> left in this circle. Missing one ends the circle
            for everyone. Activate automatic deposits and they are made for you from a balance you pre-fund.
          </p>
        </Callout>
      )}
      {enabled && covered === 0 && (
        <Callout title="Top up to keep automatic deposits going" className="text-left">
          <p className="m-0">
            Your pre-funded balance doesn&apos;t cover your next deposit, so it won&apos;t be made for you. Top up,
            or deposit yourself before the round ends.
          </p>
        </Callout>
      )}
      <ToggleRow
        id="automatic-deposits"
        icon={<HandDepositIcon size={24} className="shrink-0" aria-hidden />}
        name="Automatic Deposits"
        checked={enabled}
        disabled={disabled}
        onChange={() => setOpen("toggle")}
      />
      {enabled && (
        <div className="flex flex-wrap items-center gap-2 text-left text-sm text-surface-grey-2">
          <span className="mr-auto">
            Pre-funded <Amount value={automation.balance} />: covers {covered} of your{" "}
            {plural(pendingDeposits, "remaining deposit")}.
          </span>
          {covered < pendingDeposits && (
            <Button size="sm" variant="light" disabled={disabled} onClick={() => setOpen("topUp")}>
              Top up
            </Button>
          )}
        </div>
      )}
      {open && (
        <AutomaticDepositsModal
          mode={open}
          circle={circle}
          automation={automation}
          pendingDeposits={pendingDeposits}
          onClose={() => setOpen(null)}
          onDone={onDone}
        />
      )}
    </>
  );
}

/** Whole deposits a pre-funded balance pays for, capped at what's still owed. */
function coveredRounds(balance: string, depositAmount: string, pending: number) {
  const deposit = BigInt(depositAmount);
  if (deposit === ZERO) return pending;
  const rounds = BigInt(balance) / deposit;
  return rounds > BigInt(pending) ? pending : Number(rounds);
}

/** Picks how many of the remaining rounds the pre-funded balance should cover. */
function RoundsPicker({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span id="rounds-label" className="font-bold">
        Rounds to cover
      </span>
      <div role="group" aria-labelledby="rounds-label" className="flex items-center gap-2">
        <Button size="sm" variant="light" aria-label="Fewer rounds" disabled={value <= 1} onClick={() => onChange(value - 1)}>
          −
        </Button>
        <span className="min-w-16 text-center" aria-live="polite">
          {value} of {max}
        </span>
        <Button size="sm" variant="light" aria-label="More rounds" disabled={value >= max} onClick={() => onChange(value + 1)}>
          +
        </Button>
        {value < max && (
          <Button size="sm" variant="light" onClick={() => onChange(max)}>
            All
          </Button>
        )}
      </div>
    </div>
  );
}

function AutomaticDepositsModal({
  mode,
  circle,
  automation,
  pendingDeposits,
  onClose,
  onDone,
}: {
  /** "toggle" turns automatic deposits on or off; "topUp" adds to the balance while they're on. */
  mode: "toggle" | "topUp";
  circle: CircleView;
  automation: Automation;
  pendingDeposits: number;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  // Captured on open so the copy doesn't flip when the refetch lands.
  const [topUpOnly] = useState(mode === "topUp" && automation.deposits);
  const [enabling] = useState(topUpOnly || !automation.deposits);
  const [step, setStep] = useState<"intro" | "summary" | "insufficient">(topUpOnly ? "summary" : "intro");
  const { run, status, setStatus, error } = useTx(onDone);
  const tokenBalance = useTokenBalance();
  // Until the balance loads, don't call it insufficient.
  const balanceKnown = tokenBalance.data !== undefined;
  const balance = BigInt(tokenBalance.data ?? "0");

  const deposit = BigInt(circle.deposit_amount);
  const prefunded = BigInt(automation.balance);
  const max = Math.max(1, pendingDeposits);
  // Activating covers the next deposit, or whatever an earlier balance already
  // covers; topping up starts at one round more than is covered now.
  const [rounds, setRounds] = useState(() => {
    const covered = coveredRounds(automation.balance, circle.deposit_amount, pendingDeposits);
    return Math.min(max, topUpOnly ? covered + 1 : Math.max(1, covered));
  });
  const total = deposit * BigInt(rounds);
  const topUp = total > prefunded ? total - prefunded : ZERO;
  const missing = topUp > balance ? topUp - balance : ZERO;

  const activate = () => {
    if (!balanceKnown) return;
    if (missing > ZERO) return setStep("insufficient");
    if (topUpOnly) return run([automationCalls.prefund(circle, topUp.toString())]);
    // Settings first: the contract refuses a pre-fund until they exist.
    const calls = [automationCalls.set(circle.id, { deposits: true, claims: automation.claims })];
    if (topUp > ZERO) calls.push(automationCalls.prefund(circle, topUp.toString()));
    run(calls);
  };

  const deactivate = () => {
    // Turning off keeps the balance, so take it back in the same transaction.
    const calls = [automationCalls.set(circle.id, { deposits: false, claims: automation.claims })];
    if (prefunded > ZERO) calls.push(automationCalls.withdrawPrefund(circle.id));
    run(calls);
  };

  const icon = <HandDepositIcon size={48} weight="fill" className="text-primary-blue" />;

  if (status === "loading") {
    return (
      <Modal onClose={onClose} status="loading">
        <ModalStatus status="loading" />
        <h2 className="m-0 text-center font-breadDisplay text-2xl font-black">Automatic Deposits</h2>
      </Modal>
    );
  }

  if (status === "success") {
    return (
      <Modal onClose={onClose} status="success">
        <ModalStatus
          status="success"
          message={
            topUpOnly ? "Pre-funded balance topped up!" : `Automatic deposits ${enabling ? "activated" : "deactivated"}!`
          }
        />
        <p className="m-0 text-center text-surface-grey-2">
          {enabling
            ? `A keeper makes your deposit from the balance you pre-funded within about a minute of each round opening, including this one if it's still unpaid. Your balance covers ${plural(rounds, "round")}; top up from the circle page to cover more.`
            : "Automatic deposits are off, and any unused pre-funded balance is back in your wallet."}
        </p>
        <Button fullWidth onClick={onClose}>
          Return to circle
        </Button>
      </Modal>
    );
  }

  if (status === "error") {
    return (
      <Modal onClose={onClose} status="error">
        <ModalStatus status="error" />
        <h2 className="m-0 text-center font-breadDisplay text-2xl font-black">Automatic Deposits failed</h2>
        <p className="m-0 break-words text-center font-bold text-surface-grey-2">
          {error ?? "Something went wrong. Please try again!"}
        </p>
        <Button
          variant="destructive"
          fullWidth
          onClick={() => {
            setStatus("idle");
            setStep("summary");
          }}
        >
          Try again
        </Button>
      </Modal>
    );
  }

  if (!enabling) {
    return (
      <Modal onClose={onClose}>
        <ModalTitle icon={icon} title="Deactivate Automatic Deposits" />
        <p className="m-0 text-center text-surface-grey-2">
          You will need to deposit yourself each round before the deadline.
          {prefunded > ZERO && (
            <>
              {" "}
              Your unused pre-funded <Amount value={prefunded.toString()} /> goes back to your wallet.
            </>
          )}
        </p>
        <Button fullWidth onClick={deactivate}>
          Deactivate automatic deposits
        </Button>
      </Modal>
    );
  }

  if (step === "insufficient") {
    return (
      <Modal onClose={onClose} status="error">
        <ModalStatus
          status="error"
          message={`You don't have enough balance to ${topUpOnly ? "top up" : "activate this"}`}
        />
        <h2 className="m-0 -mt-2 text-center font-breadDisplay text-2xl font-black">Automatic Deposits</h2>
        <p className="m-0 text-center font-bold text-surface-grey-2">
          Your wallet needs more funds, or cover fewer rounds
        </p>
        <dl className="m-0 flex flex-col gap-4 border border-blue-0 p-4">
          <StatRow label="Required" value={<Amount value={topUp.toString()} />} />
          <StatRow label="Your balance" value={<Amount value={balance.toString()} />} />
          <StatRow
            label="Missing"
            value={<Amount value={missing.toString()} className="border border-system-green px-2 py-1" />}
          />
        </dl>
        {!NEAR_CONFIG.faucet && (
          <p className="m-0 text-center text-surface-grey-2">
            Add {NEAR_CONFIG.token.symbol} to your wallet, then try again.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <FaucetButton />
          <Button variant="light" onClick={() => setStep("summary")}>
            Back to summary
          </Button>
        </div>
      </Modal>
    );
  }

  if (step === "intro") {
    return (
      <Modal onClose={onClose}>
        <ModalTitle icon={icon} title="Automatic Deposits" subtitle="You pre-fund the rounds you choose" />
        <p className="m-0 text-center text-surface-grey-2">
          NEAR tokens can&apos;t grant a spending permission, so you pre-fund a balance in the circle contract
          instead. Each round, a keeper moves exactly one deposit from that balance. Cover as few as one round and
          top up later, and turn this off anytime to get the rest back.
        </p>
        <Callout title="Keep the balance topped up">
          If your balance doesn&apos;t cover a round, that round&apos;s automatic deposit isn&apos;t made. Deposit
          yourself before the round ends, or the round is missed and the circle can be ended. You still owe{" "}
          {plural(pendingDeposits, "deposit")}.
        </Callout>
        <Button fullWidth rightIcon={<ArrowRightIcon size={20} />} onClick={() => setStep("summary")}>
          Continue
        </Button>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <ModalTitle
        icon={icon}
        title={topUpOnly ? "Top up Automatic Deposits" : "Automatic Deposits"}
        subtitle="You pre-fund the rounds you choose"
      />
      <RoundsPicker value={rounds} max={max} onChange={setRounds} />
      <div className="flex flex-col gap-4 bg-paper-1 p-4">
        <h3 className="m-0 border-b border-paper-2 pb-3 font-breadDisplay text-2xl font-black">Summary</h3>
        <dl className="m-0 flex flex-col gap-4">
          <StatRow
            label="Contract"
            value={
              <a
                href={`${NEAR_CONFIG.explorerUrl}/address/${NEAR_CONFIG.contractId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-normal hover:text-primary-blue"
              >
                {shortAccount(NEAR_CONFIG.contractId)}
                <ArrowUpRightIcon size={20} className="text-primary-blue" />
              </a>
            }
          />
          <StatRow
            label="Round duration"
            value={
              <span className="inline-flex items-center gap-1">
                {formatInterval(circle.deposit_interval)}
                <CalendarIcon size={20} className="text-blue-2" />
              </span>
            }
          />
          <StatRow
            label="Rounds covered"
            value={
              <span className="inline-flex items-center gap-1">
                {rounds} of {plural(pendingDeposits, "remaining round")}
                <ArrowsClockwiseIcon size={20} className="text-blue-2" />
              </span>
            }
          />
          <StatRow label="Deposit per round" value={<Amount value={circle.deposit_amount} />} />
          <StatRow label={`Balance for ${plural(rounds, "round")}`} value={<Amount value={total.toString()} />} />
          {prefunded > ZERO && (
            <StatRow label="Already pre-funded" value={<Amount value={prefunded.toString()} />} />
          )}
          <StatRow
            label="Pre-fund now"
            value={<Amount value={topUp.toString()} className="border border-system-green px-2 py-1" />}
          />
        </dl>
      </div>
      <p className="m-0 text-center text-surface-grey-2">
        {topUpOnly
          ? "Your wallet asks you to approve the pre-fund transfer."
          : "Your wallet asks you to approve turning automation on (0.01 NEAR for storage the first time, the unused part refunded) and, if needed, the pre-fund transfer."}
      </p>
      <Button
        fullWidth
        className="bg-system-green hover:bg-system-green/90"
        rightIcon={<HandDepositIcon size={20} />}
        disabled={!balanceKnown || (topUpOnly && topUp === ZERO)}
        onClick={activate}
      >
        {topUpOnly ? "Top up" : topUp > ZERO ? "Pre-fund and activate" : "Activate"}
      </Button>
    </Modal>
  );
}

// ------------------------------------------------------------ claims

export function AutomaticClaims({
  circleId,
  automation,
  disabled,
  onDone,
}: {
  circleId: string;
  automation: Automation;
  disabled?: boolean;
  onDone: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const enabled = automation.claims;

  return (
    <>
      <ToggleRow
        id="automatic-claims"
        icon={<HandWithdrawIcon size={24} className="shrink-0" aria-hidden />}
        name="Automatic Claims"
        checked={enabled}
        disabled={disabled}
        onChange={() => setOpen(true)}
      />
      {open && (
        <AutomaticClaimsModal
          circleId={circleId}
          automation={automation}
          onClose={() => setOpen(false)}
          onDone={onDone}
        />
      )}
    </>
  );
}

function AutomaticClaimsModal({
  circleId,
  automation,
  onClose,
  onDone,
}: {
  circleId: string;
  automation: Automation;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const [enabling] = useState(!automation.claims);
  const { run, status, setStatus, error } = useTx(onDone);

  if (status !== "idle") {
    return (
      <Modal onClose={onClose} status={status}>
        <ModalStatus
          status={status}
          message={
            status === "success"
              ? `Automatic claims ${enabling ? "activated" : "deactivated"}!`
              : status === "error"
                ? "Transaction failed"
                : undefined
          }
        />
        {status === "success" && (
          <>
            <p className="m-0 text-center text-surface-grey-2">
              {enabling
                ? "Your pot is sent to your wallet shortly after your round ends."
                : "Automatic claims are off. Withdraw your pot yourself when it's your turn."}
            </p>
            <Button fullWidth onClick={onClose}>
              Return to circle
            </Button>
          </>
        )}
        {status === "error" && (
          <>
            <p className="m-0 break-words text-center font-bold text-surface-grey-2">
              {error ?? "Something went wrong. Please try again!"}
            </p>
            <Button variant="destructive" fullWidth onClick={() => setStatus("idle")}>
              Try again
            </Button>
          </>
        )}
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <ModalTitle
        icon={<HandWithdrawIcon size={48} className="text-primary-blue" />}
        title={`${enabling ? "Activate" : "Deactivate"} automatic claims`}
        subtitle={enabling ? "Send your pot to your wallet" : "Stop automatic payouts"}
      />
      <p className="m-0 text-center text-surface-grey-2">
        {enabling
          ? "Once your round ends and every deposit is in, a keeper sends the pot to your wallet, without you having to withdraw it."
          : "You will need to withdraw your pot yourself when it's your turn."}
      </p>
      <Button fullWidth onClick={() => run([automationCalls.set(circleId, { deposits: automation.deposits, claims: enabling })])}>
        {enabling ? "Activate" : "Deactivate"} automatic claims
      </Button>
    </Modal>
  );
}
