"use client";

import { useState } from "react";
import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  CoinsIcon,
  HandDepositIcon,
  PaperPlaneTiltIcon,
  SparkleIcon,
  UsersThreeIcon,
  type Icon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

type Step = { Icon: Icon; title: string; body: string; note?: string; flip?: boolean };

// Adapted from web/src/app/new/_components/onboarding/tutorial-content.ts.
// Invites need Supabase, so members are added by NEAR account ID instead.
const STEPS: Step[] = [
  {
    Icon: CoinsIcon,
    title: "Collective savings, no banks or credit",
    body: "Everyone contributes, everyone takes turns to receive the full pot.",
    note: "Generations-tested savings circles, now on NEAR.",
  },
  {
    Icon: PaperPlaneTiltIcon,
    title: "What are you saving for?",
    body: "Use a circle for individual and shared goals.",
    note: "Big expense or small, your group decides.",
  },
  {
    Icon: UsersThreeIcon,
    title: "Add your members",
    body: "Add each member by their NEAR account ID, between 2 and 25 people.",
    note: "The order you add them is the order they get paid.",
  },
  {
    Icon: HandDepositIcon,
    title: "Agree on your contributions",
    body: "Choose how much each member deposits, and how often.",
    note: "Every member deposits the same amount every round.",
    flip: true,
  },
  {
    Icon: ArrowClockwiseIcon,
    title: "Receive your payout",
    body: "Each round, one member takes the whole pot.",
    note: "Everyone gets one turn, so each member gets back what they put in.",
  },
];

export function Tutorial({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  return (
    <section className="card mx-auto w-full max-w-155 items-center gap-0 text-center">
      <div className="mb-3 flex w-full items-center justify-between">
        {i > 0 ? (
          <button
            type="button"
            onClick={() => setI(i - 1)}
            className="cursor-pointer font-bold text-primary-blue hover:text-blue-2"
          >
            Back
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onDone}
          className="cursor-pointer font-bold text-primary-blue hover:text-blue-2"
        >
          Skip tutorial
        </button>
      </div>
      <step.Icon
        size={56}
        aria-hidden
        className={cn("mb-4 text-primary-blue", step.flip && "rotate-180")}
      />
      <h2 className="mb-5 font-breadDisplay text-2xl font-black leading-tight">{step.title}</h2>
      <p className="m-0 mb-3 text-lg text-surface-grey-2">{step.body}</p>
      {step.note && <p className="m-0 text-sm text-surface-grey">{step.note}</p>}
      <div className="my-6 flex gap-2" aria-label={`Step ${i + 1} of ${STEPS.length}`}>
        {STEPS.map((_, n) => (
          <span
            key={n}
            className={cn("h-1 w-10 transition-colors", n === i ? "bg-blue-2" : "bg-blue-0")}
          />
        ))}
      </div>
      <Button
        onClick={last ? onDone : () => setI(i + 1)}
        leftIcon={last ? <SparkleIcon size={20} /> : undefined}
        rightIcon={last ? undefined : <ArrowRightIcon size={20} />}
      >
        {last ? "Start" : "Next"}
      </Button>
    </section>
  );
}
