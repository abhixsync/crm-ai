import { cn } from "@/lib/utils";

const variants = {
  default:
    "text-white shadow-sm hover:opacity-90 focus-visible:ring-primary",
  secondary:
    "border hover:opacity-90 focus-visible:ring-secondary",
  ghost: "hover:opacity-90 focus-visible:ring-slate-300",
  destructive:
    "bg-red-600 text-white shadow-sm hover:bg-red-500 focus-visible:ring-red-400",
  accent:
    "text-white shadow-sm hover:opacity-90 focus-visible:ring-accent",
};

export function Button({
  className = undefined,
  variant = "default",
  type = "button",
  disabled = undefined,
  ...props
}) {
  const baseClasses = "inline-flex h-9 items-center justify-center gap-1 rounded-[var(--radius-default)] px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ring-offset-white disabled:cursor-not-allowed disabled:opacity-50";
  const variantClasses = variants[variant];
  
  const style =
    variant === "default"
      ? {
          backgroundColor: "var(--color-primary)",
          color: "#ffffff",
          boxShadow: "var(--shadow-soft)",
        }
      : variant === "secondary"
        ? {
            backgroundColor: "var(--color-card)",
            color: "var(--color-text-primary)",
            borderColor: "var(--color-border)",
          }
        : variant === "ghost"
          ? { color: "var(--color-text-primary)" }
          : variant === "accent"
            ? {
                backgroundColor: "var(--color-accent)",
                color: "#ffffff",
                boxShadow: "var(--shadow-soft)",
              }
            : undefined;

  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(baseClasses, variantClasses, className)}
      style={style}
      {...props}
    />
  );
}