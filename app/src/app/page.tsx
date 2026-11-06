"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/providers/wallet";
import { circles } from "@/lib/near/circles";
import { CircleCard } from "@/components/circle-card";
import { Faucet } from "@/components/faucet";

/** Seeded on testnet by scripts/seed-demo.sh. */
const DEMO_CIRCLE_ID = "0";

export default function Home() {
  const { accountId } = useWallet();
  const { data: mine } = useQuery({
    queryKey: ["member-circles", accountId],
    queryFn: () => circles.ofMember(accountId!),
    enabled: !!accountId,
  });

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h1 className="text-h2 m-0 text-primary-orange">Save together</h1>
        <p className="text-h5 m-0 max-w-2xl">
          A group agrees on a deposit and a schedule. Each round everyone
          deposits and one member takes the pot, until everyone has been paid.
        </p>
      </section>

      <Faucet />

      {accountId && (
        <section className="flex flex-col gap-4">
          <h2 className="text-h4 m-0">Your circles</h2>
          {mine?.length ? (
            <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {mine.map((id) => (
                <CircleCard key={id} circleId={id} />
              ))}
            </ul>
          ) : (
            <p className="m-0 text-surface-grey-2">
              You are not in a circle yet.
            </p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-h4 m-0">Demo circle</h2>
        <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <CircleCard circleId={DEMO_CIRCLE_ID} />
        </ul>
      </section>
    </div>
  );
}
