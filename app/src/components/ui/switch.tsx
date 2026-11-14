import { cn } from "@/lib/cn";

/** On/off switch, ported from the web app's Radix switch without the dependency. */
export function Switch({
  checked,
  onChange,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-5.5 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary-blue" : "bg-surface-grey"
      )}
    >
      <span
        className={cn(
          "block size-[1.1rem] rounded-full bg-paper-0 transition-transform",
          checked ? "translate-x-[1.525rem]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
