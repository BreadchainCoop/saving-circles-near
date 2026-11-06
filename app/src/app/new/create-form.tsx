"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowsClockwiseIcon,
  CalendarIcon,
  HourglassIcon,
  PlusIcon,
  SparkleIcon,
  UsersThreeIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useWallet } from "@/providers/wallet";
import { circleCalls, circles } from "@/lib/near/circles";
import { NEAR_CONFIG } from "@/lib/near/config";
import { accountExists } from "@/lib/near/rpc";
import { parseUnits, shortAccount } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { StatRow } from "@/components/ui/stat-row";

const MIN_MEMBERS = 2; // contract MINIMUM_MEMBERS
const MAX_MEMBERS = 25; // contract MAX_MEMBERS

const SECOND_NS = BigInt(1_000_000_000);
const INTERVALS = [
  { id: "week", label: "Weekly", detail: "every 7 days", unit: "week", ns: BigInt(7 * 86_400) * SECOND_NS },
  { id: "month", label: "Monthly", detail: "every 30 days", unit: "month", ns: BigInt(30 * 86_400) * SECOND_NS },
  { id: "test", label: "Testing", detail: "every 5 minutes, to try a whole circle quickly", unit: "5 minutes", ns: BigInt(5 * 60) * SECOND_NS },
] as const;
type IntervalId = (typeof INTERVALS)[number]["id"];

// NEAR account ID rules: 2–64 chars, lowercase a–z 0–9 and - _ . separators.
const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const isAccountId = (s: string) => s.length >= 2 && s.length <= 64 && ACCOUNT_RE.test(s);

/** Deposit in token units, or null while the input isn't a valid positive amount. */
function toUnits(amount: string): string | null {
  try {
    const units = parseUnits(amount, NEAR_CONFIG.token.decimals);
    return BigInt(units) > BigInt(0) ? units : null;
  } catch {
    return null;
  }
}

export function CreateForm() {
  const { accountId, signIn, send } = useWallet();
  const router = useRouter();
  const [others, setOthers] = useState<string[]>([""]);
  const [amount, setAmount] = useState("");
  const [intervalId, setIntervalId] = useState<IntervalId>("week");
  const [memberErrors, setMemberErrors] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const interval = INTERVALS.find((i) => i.id === intervalId)!;
  const filled = others.map((m) => m.trim().toLowerCase()).filter(Boolean);
  const memberCount = 1 + filled.length;
  const units = toUnits(amount);
  const pot = units ? (BigInt(units) * BigInt(memberCount)).toString() : undefined;

  const setOther = (i: number, value: string) => {
    setOthers((list) => list.map((m, n) => (n === i ? value : m)));
    setMemberErrors((errs) => {
      const next = { ...errs };
      delete next[i];
      return next;
    });
  };
  const removeOther = (i: number) => {
    setOthers((list) => (list.length === 1 ? [""] : list.filter((_, n) => n !== i)));
    setMemberErrors({});
  };

  /** Format, duplicate and existence checks; returns the member list or null. */
  const validateMembers = async (): Promise<string[] | null> => {
    const errors: Record<number, string> = {};
    const seen = new Set([accountId!]);
    others.forEach((raw, i) => {
      const id = raw.trim().toLowerCase();
      if (!id) return;
      if (!isAccountId(id)) errors[i] = "Not a valid NEAR account ID";
      else if (seen.has(id)) errors[i] = id === accountId ? "You're already in the circle" : "Listed twice";
      seen.add(id);
    });
    if (Object.keys(errors).length === 0) {
      const exists = await Promise.all(others.map((m) => (m.trim() ? accountExists(m.trim().toLowerCase()) : true)));
      exists.forEach((ok, i) => {
        if (!ok) errors[i] = "No such account on NEAR testnet";
      });
    }
    setMemberErrors(errors);
    return Object.keys(errors).length ? null : filled;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!accountId) return signIn();
    setError(null);
    if (!units) return setError("Enter a deposit amount above zero.");
    if (memberCount < MIN_MEMBERS) return setError("Add at least one other member.");
    if (memberCount > MAX_MEMBERS) return setError(`A circle can have at most ${MAX_MEMBERS} members.`);

    setPending(true);
    try {
      const members = await validateMembers();
      if (!members) return;
      // Redirect wallets drop return values, so predict the id. Both calls go in
      // one transaction: if another circle takes this id first, add_members
      // fails with NotOwner and the whole transaction reverts.
      const id = await circles.nextId();
      const target = `/circle/?id=${id}`;
      await send(
        [
          circleCalls.create({
            token: NEAR_CONFIG.token.id,
            deposit_amount: units,
            deposit_interval: interval.ns.toString(),
          }),
          circleCalls.addMembers(id, members),
        ],
        { callbackUrl: `${window.location.origin}${target}` }
      );
      router.push(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid items-start gap-6 lg:grid-cols-2">
      <section className="card gap-5">
        <header>
          <h2 className="m-0 border-b border-blue-0 pb-4 font-breadDisplay text-2xl font-black">
            Create your circle
          </h2>
          <p className="m-0 mt-4 text-surface-grey">
            Pick the members, how much each deposits, and how often. You can add
            or remove members until you start the circle.
          </p>
        </header>

        <Field
          label="Members"
          hint={`In payout order. You're first, so you're paid in round 1. ${MIN_MEMBERS} to ${MAX_MEMBERS} people.`}
        >
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            <li className="flex items-center gap-3 bg-paper-1 px-4 py-3">
              <span className="w-5 text-surface-grey">1.</span>
              <span className="truncate font-bold">{accountId ? shortAccount(accountId) : "You"}</span>
              <span className="ml-auto text-sm text-surface-grey">you</span>
            </li>
            {others.map((m, i) => (
              <li key={i} className="flex flex-col gap-1">
                <div className="flex items-center gap-3 bg-paper-1 pl-4">
                  <span className="w-5 text-surface-grey">{i + 2}.</span>
                  <input
                    className="field flex-1 bg-transparent px-0"
                    value={m}
                    onChange={(e) => setOther(i, e.target.value)}
                    placeholder="friend.testnet"
                    aria-label={`Member ${i + 2} account ID`}
                    aria-invalid={!!memberErrors[i]}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => removeOther(i)}
                    aria-label={`Remove member ${i + 2}`}
                    className="cursor-pointer px-3 text-surface-grey hover:text-system-red"
                  >
                    <XIcon size={20} />
                  </button>
                </div>
                {memberErrors[i] && <span className="text-sm text-system-red">{memberErrors[i]}</span>}
              </li>
            ))}
          </ol>
          {1 + others.length < MAX_MEMBERS && (
            <button
              type="button"
              onClick={() => setOthers((list) => [...list, ""])}
              className="inline-flex w-max cursor-pointer items-center gap-2 font-bold text-primary-blue hover:text-blue-2"
            >
              <PlusIcon size={18} weight="bold" /> Add member
            </button>
          )}
        </Field>

        <Field label="Deposit for each member" hint="What every member puts in each round." htmlFor="amount">
          <div className="flex items-center bg-paper-1 pr-3">
            <input
              id="amount"
              className="field flex-1 bg-transparent"
              inputMode="decimal"
              placeholder="10.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span className="bg-paper-main px-2 py-1 font-bold">{NEAR_CONFIG.token.symbol}</span>
          </div>
        </Field>

        <Field label="Deposit interval">
          <div className="flex flex-col gap-2" role="radiogroup">
            {INTERVALS.map((opt) => (
              <label key={opt.id} className="flex cursor-pointer items-center gap-3 bg-paper-1 px-4 py-3">
                <input
                  type="radio"
                  name="interval"
                  value={opt.id}
                  checked={intervalId === opt.id}
                  onChange={() => setIntervalId(opt.id)}
                  className="size-4 accent-primary-blue"
                />
                <span>
                  <span className="font-bold">{opt.label}</span> ({opt.detail})
                </span>
              </label>
            ))}
          </div>
        </Field>
      </section>

      <section className="card gap-5 border-blue-0 bg-paper-main lg:sticky lg:top-6">
        <header>
          <h2 className="m-0 border-b border-blue-0 pb-4 font-breadDisplay text-2xl font-black">Overview</h2>
          <p className="m-0 mt-4 text-surface-grey">Please review your circle.</p>
        </header>
        <dl className="m-0 flex flex-col gap-3">
          <StatRow icon={<UsersThreeIcon size={22} />} label="Members" value={memberCount} />
          <StatRow icon={<CalendarIcon size={22} />} label="Members deposit every" value={cap(interval.unit)} />
          <StatRow icon={<ArrowsClockwiseIcon size={22} />} label="Payout rounds" value={memberCount} />
          <StatRow
            icon={<HourglassIcon size={22} />}
            label="Circle lasts"
            value={
              interval.id === "test"
                ? `${memberCount * 5} minutes`
                : `${memberCount} ${interval.unit}${memberCount === 1 ? "" : "s"}`
            }
          />
        </dl>
        <dl className="m-0 flex flex-col gap-3 border-t border-blue-0 pt-4">
          <StatRow label="Deposit each round" value={<Boxed><Amount value={units ?? undefined} /></Boxed>} />
          <StatRow
            label="Pot each member receives once"
            value={<Boxed className="border-system-green"><Amount value={pot} /></Boxed>}
          />
        </dl>
        <Callout tone="info" title="Not a regulated savings product">
          <p className="m-0 text-sm">
            Funds are held by the contract, not by Bread. If a member misses a
            deposit, any member can end the circle, and deposits for rounds not
            yet paid out are refunded.
          </p>
        </Callout>
        {error && <p className="m-0 text-system-red">{error}</p>}
        <Button type="submit" fullWidth isLoading={pending} leftIcon={accountId ? <SparkleIcon size={20} /> : undefined}>
          {!accountId ? "Sign in" : pending ? "Waiting for wallet…" : "Create circle"}
        </Button>
        {accountId && (
          <p className="m-0 text-center text-sm text-surface-grey">
            One wallet approval creates the circle and adds the members.
          </p>
        )}
      </section>
    </form>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="font-bold">
        {label}
      </label>
      {hint && <p className="m-0 -mt-1 text-sm text-surface-grey">{hint}</p>}
      {children}
    </div>
  );
}

function Boxed({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn("inline-block border border-paper-2 px-2 py-0.5", className)}>{children}</span>;
}
