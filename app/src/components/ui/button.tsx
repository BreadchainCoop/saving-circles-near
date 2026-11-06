import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { cn } from "@/lib/cn";

const PRESETS = {
  primary: {
    "--btn-bg": "var(--color-primary-orange)",
    "--btn-text": "var(--color-paper-main)",
    "--btn-hover-bg": "var(--color-orange-1)",
    "--btn-hover-text": "#ffffff",
  },
  secondary: {
    "--btn-bg": "#FBDED1",
    "--btn-text": "var(--color-primary-orange)",
    "--btn-hover-bg": "#FFF1EA",
    "--btn-hover-text": "var(--color-primary-orange)",
  },
  stroke: {
    "--btn-bg": "var(--color-paper-main)",
    "--btn-text": "var(--color-surface-ink)",
    "--btn-hover-bg": "var(--color-paper-2)",
    "--btn-hover-text": "var(--color-surface-ink)",
  },
  destructive: {
    "--btn-bg": "var(--color-system-red)",
    "--btn-text": "var(--color-paper-main)",
    "--btn-hover-bg": "#BF0A00",
    "--btn-hover-text": "#ffffff",
  },
} as const;

/**
 * Bread's lifted button, built on the `lifted-button-*` classes from
 * `@breadcoop/ui/theme`. The kit's own React component is not imported: its
 * entry point also loads the Privy and wagmi components.
 */
export function Button({
  preset = "primary",
  fullWidth = false,
  className,
  disabled,
  type = "button",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  preset?: keyof typeof PRESETS;
  fullWidth?: boolean;
}) {
  return (
    <span
      className={cn(
        "group relative select-none align-middle",
        fullWidth ? "block" : "inline-block"
      )}
      style={PRESETS[preset] as CSSProperties}
    >
      {!disabled && (
        <span
          aria-hidden
          className="lifted-button-shadow translate-x-0.5 translate-y-0.5"
        />
      )}
      <button
        type={type}
        disabled={disabled}
        className={cn(
          "lifted-button-base",
          fullWidth && "w-full",
          disabled
            ? "lifted-button-disabled"
            : "lifted-button lifted-button-motion lifted-button-lifted lifted-button-active",
          className
        )}
        {...rest}
      >
        <span className="mt-1 whitespace-nowrap p-[5px] leading-none">
          {children}
        </span>
      </button>
    </span>
  );
}
