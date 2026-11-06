"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (http, iframe); nothing useful to show.
    }
  };
  return { copied, copy };
}

/** Icon-only copy button; turns into a green tick for 1.5s. */
export function CopyIconButton({
  text,
  label = "Copy",
  size = 20,
  className,
}: {
  text: string;
  label?: string;
  size?: number;
  className?: string;
}) {
  const { copied, copy } = useCopy(text);
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className={cn(
        "inline-flex cursor-pointer items-center text-primary-blue hover:text-blue-2",
        copied && "text-system-green",
        className
      )}
    >
      {copied ? <CheckIcon size={size} /> : <CopyIcon size={size} />}
    </button>
  );
}

/** Bordered "Copy … link" button with a light shadow, as on the circle page. */
export function CopyTextButton({
  text,
  children,
  className,
}: {
  text: string;
  children: ReactNode;
  className?: string;
}) {
  const { copied, copy } = useCopy(text);
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 border border-surface-ink bg-paper-main px-4 py-2 shadow-[0.25rem_0.25rem_0_0_#595959] transition-all active:translate-x-1 active:translate-y-1 active:shadow-none",
        copied && "bg-system-green font-bold text-paper-main",
        className
      )}
    >
      {copied ? (
        "Copied!"
      ) : (
        <>
          <CopyIcon size={18} aria-hidden />
          {children}
        </>
      )}
    </button>
  );
}
