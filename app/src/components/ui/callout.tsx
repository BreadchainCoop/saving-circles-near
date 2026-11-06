import type { ReactNode } from "react";
import { InfoIcon, WarningIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

type Tone = "warning" | "info";

const TONES: Record<Tone, { box: string; title: string; Icon: typeof WarningIcon }> = {
  warning: {
    box: "bg-[#FFEDD0] border-system-warning",
    title: "text-system-warning",
    Icon: WarningIcon,
  },
  info: {
    box: "bg-blue-0 border-primary-blue",
    title: "text-primary-blue",
    Icon: InfoIcon,
  },
};

/** Banner with a coloured left edge, like the missed-deposit warning. */
export function Callout({
  tone = "warning",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  const { box, title: titleClass, Icon } = TONES[tone];
  return (
    <div
      role={tone === "warning" ? "alert" : "note"}
      className={cn("flex flex-col gap-2 border-l-4 px-6 py-4", box, className)}
    >
      <p className={cn("m-0 flex items-center gap-2 font-bold", titleClass)}>
        <Icon size={20} aria-hidden />
        {title}
      </p>
      {children && <div className="m-0 text-text-standard">{children}</div>}
    </div>
  );
}
