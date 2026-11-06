import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import Providers from "@/providers";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "Saving Circles on NEAR",
  description:
    "Rotating savings circles on NEAR: members deposit each round and one member takes the pot.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <Providers>
          <Navbar />
          <main className="page-layout flex-1 py-8">{children}</main>
          <footer className="page-layout py-8 text-caption text-surface-grey-2">
            Built by Bread Cooperative. Testnet demo.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
