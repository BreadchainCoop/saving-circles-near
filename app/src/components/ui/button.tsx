import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  ComponentProps,
  ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "light" | "destructive" | "burn";
type Size = "sm" | "default" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary-blue text-paper-main hover:bg-blue-2",
  secondary: "bg-[#B9D5FF] text-primary-blue hover:bg-[#99C2FF]",
  light: "bg-paper-main text-surface-ink border-surface-ink! hover:bg-paper-2",
  destructive: "bg-system-red text-paper-main hover:bg-[#BF0A00]",
  burn: "bg-red-0 text-red-main hover:bg-red-1",
};

type Style = {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

/**
 * Bread's Stacks button: flat colour with a hard grey shadow that presses in.
 * Ported from `bread-ui-kit/src/components/buttons/button.tsx` (app="stacks");
 * the kit's own component isn't imported because its entry point loads Privy.
 */
const buttonClasses = ({
  variant = "primary",
  size = "default",
  fullWidth,
}: Style) =>
  cn(
    "inline-flex cursor-pointer items-center justify-center gap-2 border border-transparent font-bold transition-all duration-200",
    "disabled:cursor-not-allowed disabled:bg-surface-grey disabled:text-paper-main disabled:shadow-none",
    VARIANTS[variant],
    size === "icon" ? "p-2.5" : size === "sm" ? "px-4 py-1" : "px-8 py-4",
    size === "sm"
      ? "shadow-[0.125rem_0.125rem_0_0_#595959] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
      : "shadow-[0.25rem_0.25rem_0_0_#595959] active:translate-x-1 active:translate-y-1 active:shadow-none",
    fullWidth && "w-full"
  );

export function Button({
  variant,
  size,
  fullWidth,
  leftIcon,
  rightIcon,
  isLoading,
  className,
  disabled,
  type = "button",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & Style & { isLoading?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      className={cn(buttonClasses({ variant, size, fullWidth }), className)}
      {...rest}
    >
      {isLoading ? <Spinner /> : leftIcon}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
}

/** Same look as `Button`, for navigation. */
export function ButtonLink({
  variant,
  size,
  fullWidth,
  leftIcon,
  rightIcon,
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & Style) {
  return (
    <Link
      className={cn(buttonClasses({ variant, size, fullWidth }), className)}
      {...rest}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </Link>
  );
}
