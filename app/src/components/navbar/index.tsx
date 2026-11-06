"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListIcon, PlusIcon, SignInIcon, XIcon } from "@phosphor-icons/react";
import { useWallet } from "@/providers/wallet";
import { cn } from "@/lib/cn";
import { Button, ButtonLink } from "@/components/ui/button";
import { AccountDetails } from "./account-details";
import { AccountMenu } from "./account-menu";
import { FaucetButton } from "./faucet-button";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/new/", label: "Start a circle" },
  { href: "/account/", label: "My Account" },
];

/** next.config has trailingSlash, so "/new" and "/new/" are the same page. */
const samePath = (a: string, b: string) =>
  a.replace(/\/$/, "") === b.replace(/\/$/, "");

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 text-2xl leading-none">
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, tiny SVG */}
      <img src="/logo-blue.svg" alt="" width={28} height={28} />
      <span className="font-bold tracking-tight text-surface-ink">BREAD</span>
      <span className="text-surface-grey-2">Saving Circles</span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
      {LINKS.map(({ href, label }) => {
        const active = samePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "text-lg transition-colors hover:text-primary-blue",
              active ? "text-primary-blue" : "text-surface-ink"
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SignInButton({ fullWidth }: { fullWidth?: boolean }) {
  const { ready, signIn } = useWallet();
  return (
    <Button
      onClick={signIn}
      disabled={!ready}
      fullWidth={fullWidth}
      rightIcon={<SignInIcon size={24} />}
    >
      Sign in
    </Button>
  );
}

export function Navbar() {
  const { accountId } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile menu after navigating.
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <header className="page-layout flex items-center justify-between gap-6 py-5">
      <Brand />

      {/* Desktop */}
      <div className="hidden items-center gap-8 md:flex">
        <NavLinks />
        {accountId ? <AccountMenu /> : <SignInButton />}
      </div>

      {/* Mobile */}
      <button
        type="button"
        className="text-primary-blue md:hidden"
        aria-label="Open menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(true)}
      >
        <ListIcon size={32} />
      </button>
      {menuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 flex flex-col gap-6 overflow-y-auto bg-paper-main px-4 py-5 md:hidden"
        >
          <div className="flex items-center justify-between">
            <Brand />
            <button
              type="button"
              className="text-primary-blue"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            >
              <XIcon size={32} />
            </button>
          </div>
          <ButtonLink href="/new/" fullWidth leftIcon={<PlusIcon size={20} weight="bold" />}>
            Start a circle
          </ButtonLink>
          <NavLinks onNavigate={() => setMenuOpen(false)} />
          {accountId ? (
            <div className="flex flex-col gap-4 border border-surface-grey">
              <FaucetButton className="mx-5 mt-5" />
              <AccountDetails className="pt-0" />
            </div>
          ) : (
            <SignInButton fullWidth />
          )}
        </div>
      )}
    </header>
  );
}
