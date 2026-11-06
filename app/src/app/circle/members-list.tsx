"use client";

import { UsersThreeIcon, XIcon } from "@phosphor-icons/react";
import type { MemberView } from "@/lib/near/types";
import { Chip } from "@/components/ui/chip";

export type MemberRow = {
  accountId: string;
  view: MemberView | undefined;
  isOwner: boolean;
  isYou: boolean;
  /** Has a full deposit in for the current round. Undefined when not collecting. */
  depositedThisRound: boolean | undefined;
  /** Their turn for the pot is the current round. */
  receivesThisRound: boolean;
};

export function MembersList({
  rows,
  onRemove,
  removeDisabled,
  viewerIsOwner = false,
}: {
  rows: MemberRow[];
  viewerIsOwner?: boolean;
  /** Shown before the circle starts: owner removes anyone, a member can leave. */
  onRemove?: (accountId: string) => void;
  removeDisabled?: boolean;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="m-0 border-b border-paper-2 pb-4 font-breadDisplay text-3xl font-black">
        Members ({rows.length})
      </h2>
      <p className="m-0 flex items-center gap-2 text-surface-grey-2">
        <UsersThreeIcon size={22} className="shrink-0 text-primary-blue" aria-hidden />
        Listed in payout order: member 1 receives the pot in round 1, and so on.
      </p>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {rows.map((r, i) => (
          <li
            key={r.accountId}
            className="flex flex-wrap items-center justify-between gap-3 border border-surface-ink bg-paper-0 px-5 py-4"
          >
            <span className="flex min-w-0 items-center gap-3 font-bold">
              <span className="text-surface-grey">{i + 1}.</span>
              <span className="truncate" title={r.accountId}>
                {r.accountId}
              </span>
              {r.isYou && <span className="font-normal text-surface-grey">(you)</span>}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {r.isOwner && <Chip tone="blue">Group owner</Chip>}
              {r.view?.has_claimed ? (
                <Chip tone="green">Paid out</Chip>
              ) : (
                r.receivesThisRound && <Chip tone="blue">Receives this round</Chip>
              )}
              {r.depositedThisRound === true && <Chip tone="green">Deposited</Chip>}
              {r.depositedThisRound === false && <Chip tone="warning">Not deposited</Chip>}
              {onRemove && !r.isOwner && (viewerIsOwner || r.isYou) && (
                <button
                  type="button"
                  onClick={() => onRemove(r.accountId)}
                  disabled={removeDisabled}
                  aria-label={r.isYou ? "Leave circle" : `Remove ${r.accountId}`}
                  title={r.isYou ? "Leave circle" : "Remove member"}
                  className="cursor-pointer p-1 text-surface-grey hover:text-system-red disabled:cursor-wait"
                >
                  <XIcon size={20} />
                </button>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
