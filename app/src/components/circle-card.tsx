"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { circles } from "@/lib/near/circles";
import { NEAR_CONFIG } from "@/lib/near/config";
import { formatInterval, formatUnits } from "@/lib/format";

export function CircleCard({ circleId }: { circleId: string }) {
  const { data: circle, isLoading, error } = useQuery({
    queryKey: ["circle", circleId],
    queryFn: () => circles.get(circleId),
  });
  const { data: state } = useQuery({
    queryKey: ["circle-state", circleId],
    queryFn: () => circles.state(circleId),
  });
  const { data: memberViews } = useQuery({
    queryKey: ["member-views", circleId, circle?.members],
    queryFn: () => circles.memberViews(circleId, circle!.members),
    enabled: !!circle,
  });

  if (isLoading) return <li className="card animate-pulse h-48" />;
  if (error || !circle) {
    return <li className="card text-system-red">Circle {circleId} not found</li>;
  }

  const rounds = circle.members.length;
  // Payouts can be claimed late, so count claims rather than using the round.
  const paid = memberViews?.filter((m) => m.has_claimed).length ?? 0;
  const progress = rounds ? Math.round((paid / rounds) * 100) : 0;
  const { decimals, symbol } = NEAR_CONFIG.token;

  return (
    <li className="card">
      <Link href={`/circle/?id=${circle.id}`} className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-h4 m-0">Circle #{circle.id}</h3>
          {state && (
            <span className="border border-current px-2 py-0.5 text-caption">
              {state}
            </span>
          )}
        </div>
        <div>
          <div className="mb-2 flex justify-between text-body-bold">
            <span>Rounds paid</span>
            <span>
              {paid}/{rounds}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Rounds paid"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-3.5 w-full bg-paper-main p-0.75"
          >
            <div className="h-full bg-primary-blue" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <ul className="flex flex-col gap-1 text-body-bold text-surface-grey-2">
          <li>
            Deposit: {formatUnits(circle.deposit_amount, decimals)} {symbol}
          </li>
          <li>Every: {formatInterval(circle.deposit_interval)}</li>
          <li>Members: {rounds}</li>
        </ul>
      </Link>
    </li>
  );
}
