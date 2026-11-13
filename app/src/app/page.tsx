"use client";

import Link from "next/link";
import { useWallet } from "@/providers/wallet";
import { useAllCircles, useMyCircles } from "@/hooks/use-circles";
import { CircleList } from "@/components/circle-list";
import { HeroBanner } from "@/components/hero-banner";
import { Button } from "@/components/ui/button";
import { NEAR_CONFIG } from "@/lib/near/config";

export default function Home() {
  const { accountId } = useWallet();
  const mine = useMyCircles();
  const all = useAllCircles();
  const allCircles = all.data?.pages.flatMap((p) => p.circles);

  return (
    <div className="flex flex-col gap-12">
      <HeroBanner />

      {accountId && (
        <CircleList
          title="Your circles"
          circles={mine.data}
          isLoading={mine.isLoading}
          empty={
            <>
              You&apos;re not in a circle yet.{" "}
              <Link href="/new/" className="font-bold text-primary-blue underline">
                Start one
              </Link>{" "}
              or ask a friend to add your account.
            </>
          }
        />
      )}

      <CircleList
        title="All circles"
        description={`Peek into every circle on ${NEAR_CONFIG.networkName}, newest first.`}
        circles={allCircles}
        isLoading={all.isLoading}
        empty="No circles yet."
        footer={
          all.hasNextPage && (
            <div>
              <Button variant="light" onClick={() => all.fetchNextPage()} isLoading={all.isFetchingNextPage}>
                Show older circles
              </Button>
            </div>
          )
        }
      />
    </div>
  );
}
