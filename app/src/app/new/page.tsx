"use client";

import { useEffect, useState } from "react";
import { BackLink } from "@/components/back-link";
import { CreateForm } from "./create-form";
import { Tutorial } from "./tutorial";

const SEEN_KEY = "saving-circles:create-tutorial-seen";

export default function NewCirclePage() {
  // null until browser storage is read, so returning visitors don't see the
  // tutorial flash before the form.
  const [stage, setStage] = useState<"tutorial" | "form" | null>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // Storage blocked (private mode): just show the tutorial.
    }
    setStage(seen ? "form" : "tutorial");
  }, []);

  const finishTutorial = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
    setStage("form");
  };

  return (
    <div className="flex flex-col gap-8">
      {stage === "form" ? (
        <BackLink onClick={() => setStage("tutorial")}>How circles work</BackLink>
      ) : (
        <BackLink href="/">Return to dashboard</BackLink>
      )}
      {stage === "tutorial" && <Tutorial onDone={finishTutorial} />}
      {stage === "form" && (
        <>
          <h1 className="m-0 font-breadDisplay text-5xl font-black tracking-tight text-primary-blue md:text-6xl">
            New circle
          </h1>
          <CreateForm />
        </>
      )}
    </div>
  );
}
