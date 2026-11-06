import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

/** "← Return to dashboard" style link. Pass `onClick` instead of `href` for in-page steps. */
export function BackLink({
  href,
  onClick,
  children,
}: {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const className =
    "inline-flex w-max cursor-pointer items-center gap-3 font-bold text-primary-blue hover:text-blue-2";
  const inner = (
    <>
      <ArrowLeftIcon size={24} aria-hidden />
      {children}
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}
