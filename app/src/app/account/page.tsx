"use client";

import { ArrowUpRightIcon, SignOutIcon } from "@phosphor-icons/react";
import { useWallet } from "@/providers/wallet";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { isFinished, useMyCircles } from "@/hooks/use-circles";
import { NEAR_CONFIG } from "@/lib/near/config";
import { BackLink } from "@/components/back-link";
import { CircleList } from "@/components/circle-list";
import { FaucetButton } from "@/components/navbar/faucet-button";
import { Avatar } from "@/components/navbar/avatar";
import { Amount } from "@/components/ui/amount";
import { Button, ButtonLink } from "@/components/ui/button";
import { CopyIconButton } from "@/components/ui/copy-button";

export default function AccountPage() {
  const { ready, accountId, signIn, signOut } = useWallet();
  const { data: balance } = useTokenBalance();
  const mine = useMyCircles();

  if (!accountId) {
    return (
      <div className="flex flex-col gap-8">
        <BackLink href="/">Return to dashboard</BackLink>
        <section className="card mx-auto w-full max-w-md items-center text-center">
          <h1 className="m-0 font-breadDisplay text-3xl font-black">My account</h1>
          <p className="m-0 text-surface-grey-2">Sign in to see your balance and your circles.</p>
          <Button onClick={signIn} disabled={!ready}>
            Sign in
          </Button>
        </section>
      </div>
    );
  }

  const active = mine.data?.filter((c) => !isFinished(c));
  const finished = mine.data?.filter((c) => isFinished(c));

  return (
    <div className="flex flex-col gap-10">
      <BackLink href="/">Return to dashboard</BackLink>
      <h1 className="m-0 font-breadDisplay text-5xl font-black tracking-tight text-primary-blue md:text-6xl">
        My account
      </h1>

      <section className="card md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar accountId={accountId} className="size-10 text-base" />
          <span className="truncate text-xl font-bold" title={accountId}>
            {accountId}
          </span>
          <CopyIconButton text={accountId} label="Copy account ID" size={22} />
          <a
            href={`${NEAR_CONFIG.explorerUrl}/address/${accountId}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View account on NearBlocks"
            className="text-surface-grey hover:text-primary-blue"
          >
            <ArrowUpRightIcon size={22} />
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex flex-col">
            <span className="text-sm text-surface-grey-2">{NEAR_CONFIG.token.symbol} balance · NEAR testnet</span>
            <Amount value={balance} className="text-3xl" />
          </span>
          <FaucetButton />
          <Button variant="burn" size="sm" rightIcon={<SignOutIcon size={18} />} onClick={signOut}>
            Sign out
          </Button>
        </div>
      </section>

      <CircleList
        title="Active circles"
        circles={active}
        isLoading={mine.isLoading}
        empty={
          <div className="flex flex-col items-start gap-4">
            <p className="m-0">You&apos;re not in an active circle.</p>
            <ButtonLink href="/new/">Start a circle</ButtonLink>
          </div>
        }
      />
      {!!finished?.length && <CircleList title="Finished circles" circles={finished} empty={null} />}
    </div>
  );
}
