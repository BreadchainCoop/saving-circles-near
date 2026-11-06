"use client";

import Link from "next/link";
import { useWallet } from "@/providers/wallet";
import { shortAccount } from "@/lib/format";
import { Button } from "./ui/button";

export function Navbar() {
  const { ready, accountId, signIn, signOut } = useWallet();

  return (
    <header className="page-layout flex items-center justify-between gap-4 py-6">
      <Link href="/" className="text-breadDisplay-bold text-2xl text-primary-orange">
        Saving Circles
      </Link>
      <nav className="flex items-center gap-4">
        <Link href="/new/" className="text-body-bold hover:text-primary-orange">
          New circle
        </Link>
        {accountId ? (
          <Button variant="light" onClick={signOut} title="Sign out">
            {shortAccount(accountId)}
          </Button>
        ) : (
          <Button onClick={signIn} disabled={!ready}>
            Connect wallet
          </Button>
        )}
      </nav>
    </header>
  );
}
