"use client";

import type { ReactNode } from "react";
import type { CircleView } from "@/lib/near/types";
import { CircleCard } from "./circle-card";

/** A titled grid of circle cards with loading and empty states. */
export function CircleList({
  title,
  description,
  circles,
  isLoading,
  empty,
  footer,
}: {
  title: string;
  description?: ReactNode;
  circles: CircleView[] | undefined;
  isLoading?: boolean;
  empty: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="m-0 font-breadDisplay text-3xl font-black">{title}</h2>
      {description && <p className="m-0">{description}</p>}
      {isLoading ? (
        <ul className="m-0 grid list-none gap-6 p-0 md:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[0, 1, 2].map((k) => (
            <li key={k} className="card h-64 animate-pulse" />
          ))}
        </ul>
      ) : circles?.length ? (
        <ul className="m-0 grid list-none gap-6 p-0 md:grid-cols-2 xl:grid-cols-3">
          {circles.map((c) => (
            <CircleCard key={c.id} circle={c} />
          ))}
        </ul>
      ) : (
        <div className="m-0 text-surface-grey-2">{empty}</div>
      )}
      {footer}
    </section>
  );
}
