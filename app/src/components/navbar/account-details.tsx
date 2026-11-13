"use client";

import type { ReactNode } from "react";
import {
  ArrowUpRightIcon,
  GraphIcon,
  SignOutIcon,
  UserCircleIcon,
  WalletIcon,
  type Icon,
} from "@phosphor-icons/react";
import { useWallet } from "@/providers/wallet";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { NEAR_CONFIG } from "@/lib/near/config";
import { shortAccount } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { CopyIconButton } from "@/components/ui/copy-button";

function Row({ icon: I, label, children }: { icon: Icon; label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex min-w-0 items-center gap-3">
        <I size={28} className="shrink-0 text-primary-blue" aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-3">{children}</span>
    </div>
  );
}

/** Account, balance, network and sign out: the dropdown and the mobile menu. */
export function AccountDetails({ className }: { className?: string }) {
  const { accountId, signOut } = useWallet();
  const { data: balance } = useTokenBalance();
  if (!accountId) return null;

  return (
    <section className={cn("flex flex-col gap-5 bg-paper-main p-5", className)}>
      <Row icon={UserCircleIcon} label={<span title={accountId}>{shortAccount(accountId)}</span>}>
        <CopyIconButton text={accountId} label="Copy account ID" size={24} />
        <a
          href={`${NEAR_CONFIG.explorerUrl}/address/${accountId}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View account on NearBlocks"
          className="text-surface-grey hover:text-primary-blue"
        >
          <ArrowUpRightIcon size={24} />
        </a>
      </Row>
      <Row icon={WalletIcon} label="Balance">
        <Amount value={balance} />
      </Row>
      <Row icon={GraphIcon} label="Network">
        <span className="font-bold">{NEAR_CONFIG.networkName}</span>
      </Row>
      <Button variant="burn" fullWidth rightIcon={<SignOutIcon size={22} />} onClick={signOut}>
        Sign out
      </Button>
    </section>
  );
}
