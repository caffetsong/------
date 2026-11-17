import * as React from "react";
import { cn } from "../../lib/utils";

type Variant = "default" | "secondary" | "outline" | "ghost" | "danger";
type Size = "default" | "sm" | "icon";

const variants: Record<Variant, string> = {
  default: "bg-zinc-100 text-zinc-950 hover:bg-white",
  secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
  outline: "border border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800/70 hover:border-zinc-600",
  ghost: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60",
  danger: "bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25"
};

const sizes: Record<Size, string> = {
  default: "h-9 px-4 text-sm",
  sm: "h-8 px-3 text-xs",
  icon: "h-9 w-9"
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function buttonVariants({ variant = "default", size = "default", className }: {
  variant?: Variant;
  size?: Size;
  className?: string;
} = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={buttonVariants({ variant, size, className })} {...props} />
  )
);
Button.displayName = "Button";
