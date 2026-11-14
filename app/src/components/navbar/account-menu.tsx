"use client";

import { useCallback, useRef, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { useWallet } from "@/providers/wallet";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { shortAccount } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Amount } from "@/components/ui/amount";
import { AccountDetails } from "./account-details";
import { Avatar } from "./avatar";
import { FaucetButton } from "./faucet-button";
import { useClickOutside } from "./use-click-outside";

/** Desktop: balance, faucet and account in one bordered box, with a dropdown. */
export function AccountMenu() {
  const { accountId } = useWallet();
  const { data: balance } = useTokenBalance();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  if (!accountId) return null;

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2.5 border border-surface-ink bg-paper-main p-2">
        <span className="border border-surface-grey px-2 py-1">
          <Amount value={balance} />
        </span>
        <FaucetButton />
        <span aria-hidden className="h-7 w-px shrink-0 bg-surface-grey/40" />
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((o) => !o)}
          className="flex cursor-pointer items-center gap-2.5 px-1"
        >
          <Avatar accountId={accountId} />
          <span className="max-w-12 truncate font-bold" title={accountId}>
            {shortAccount(accountId)}
          </span>
          <CaretDownIcon
            size={22}
            className={cn("text-primary-blue transition-transform duration-300", open && "rotate-180")}
          />
        </button>
      </div>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-screen max-w-110">
          <AccountDetails className="border border-paper-2 shadow-[0px_4px_12px_0px_#1B201A26]" />
        </div>
      )}
    </div>
  );
}
