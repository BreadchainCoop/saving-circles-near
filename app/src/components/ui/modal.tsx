"use client";

import { useEffect, type ReactNode } from "react";
import { CheckCircleIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

type Status = "loading" | "success" | "error";

/**
 * Centred pop-up over a dimmed page, ported from the web app's ModalContainer.
 * The border turns green or red with the outcome. Escape and the backdrop close it.
 */
export function Modal({
  onClose,
  status,
  children,
}: {
  onClose: () => void;
  status?: Status;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-surface-ink/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative flex max-h-[calc(100vh-2rem)] w-full max-w-142 flex-col gap-6 overflow-y-auto border bg-paper-0 p-5 text-left shadow-[0px_4px_12px_0px_#1B201A26]",
          status === "success" ? "border-system-green" : status === "error" ? "border-system-red" : "border-transparent"
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto cursor-pointer text-primary-blue"
        >
          <XIcon size={24} />
        </button>
        {children}
      </div>
    </div>
  );
}

/** Big status icon with a one-line message, as in the web app's ModalStatus. */
export function ModalStatus({ status, message }: { status: Status; message?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {status === "loading" ? (
        <>
          <Spinner className="size-12" />
          <p className="m-0 font-bold text-primary-blue">{message ?? "Confirm in your wallet…"}</p>
        </>
      ) : status === "success" ? (
        <>
          <CheckCircleIcon size={48} weight="fill" className="text-system-green" />
          <p className="m-0 font-bold text-system-green">{message ?? "Complete"}</p>
        </>
      ) : (
        <>
          <WarningCircleIcon size={48} weight="fill" className="text-system-red" />
          <p className="m-0 font-bold text-system-red">{message ?? "Transaction failed"}</p>
        </>
      )}
    </div>
  );
}
