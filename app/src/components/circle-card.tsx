"use client";

import { useQuery } from "@tanstack/react-query";
import { CoinsIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { circles } from "@/lib/near/circles";
import type { CircleState, CircleView } from "@/lib/near/types";
import { formatInterval } from "@/lib/format";
import { Amount } from "@/components/ui/amount";
import { ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ProgressBar } from "@/components/ui/progress-bar";

const STATE_CHIP: Record<CircleState, { label: string; tone: "neutral" | "blue" | "green" | "red" }> = {
  NotStarted: { label: "Not started", tone: "neutral" },
  Active: { label: "Active", tone: "blue" },
  DepositInProgress: { label: "Active", tone: "blue" },
  DepositComplete: { label: "Active", tone: "blue" },
  MissedDeposit: { label: "Deposit missed", tone: "red" },
  Expired: { label: "Finished", tone: "neutral" },
  Decommissioned: { label: "Ended early", tone: "red" },
};

/** Compact card for a circle in a list, after web/'s StackCard. */
export function CircleCard({ circle }: { circle: CircleView }) {
  const { data: state } = useQuery({
    queryKey: ["circle-state", circle.id],
    queryFn: () => circles.state(circle.id),
  });
  const { data: memberViews } = useQuery({
    queryKey: ["member-views", circle.id, circle.members],
    queryFn: () => circles.memberViews(circle.id, circle.members),
  });

  const n = circle.members.length;
  // Payouts can be claimed late, so count claims rather than using the round.
  const paid = memberViews?.filter((m) => m.has_claimed).length ?? 0;
  const chip = state ? STATE_CHIP[state] : undefined;

  return (
    <li className="card h-full">
      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-2xl font-bold">Circle {circle.id}</h3>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-surface-grey">ID: {circle.id}</span>
          {chip && <Chip tone={chip.tone}>{chip.label}</Chip>}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex justify-between font-bold">
          <span>Rounds paid</span>
          <span>
            {paid}/{n}
          </span>
        </div>
        <ProgressBar value={n ? (paid / n) * 100 : 0} label="Rounds paid" />
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 font-bold text-surface-grey-2">
        <li className="flex items-center gap-2">
          <UsersThreeIcon size={22} className="shrink-0 text-primary-blue" aria-hidden />
          {n} member{n === 1 ? "" : "s"}
        </li>
        <li className="flex items-center gap-2">
          <CoinsIcon size={22} className="shrink-0 text-primary-blue" aria-hidden />
          <span>
            Deposit: <Amount value={circle.deposit_amount} /> every {formatInterval(circle.deposit_interval)}
          </span>
        </li>
      </ul>
      <ButtonLink href={`/circle/?id=${circle.id}`} variant="secondary" className="mt-auto">
        View details
      </ButtonLink>
    </li>
  );
}
