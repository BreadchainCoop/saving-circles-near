"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CircleDetails } from "./circle-details";

// Static export can't pre-render /circle/[id] for ids created later, so the id
// travels as ?id= and the page reads it in the browser.
export default function CirclePage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <CircleFromQuery />
    </Suspense>
  );
}

function CircleFromQuery() {
  const id = useSearchParams().get("id");
  if (!id || !/^\d+$/.test(id)) return <p>No circle selected.</p>;
  return <CircleDetails circleId={id} />;
}
