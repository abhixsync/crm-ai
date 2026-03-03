import { cn } from "@/lib/utils";
import { LoadingSpinner } from "@/components/ui/loader";

const variants = {
  default:
    "text-white shadow-sm hover:brightness-95 focus-visible:ring-primary",
  secondary:
    "border hover:brightness-95 focus-visible:ring-secondary",
  ghost: "hover:opacity-90 focus-visible:ring-slate-300",
  destructive:
    "shadow-sm hover:brightness-95 focus-visible:ring-destructive",
  accent:
    "text-white shadow-sm hover:brightness-95 focus-visible:ring-accent",
};

export function Button({
  className = undefined,
  variant = "default",
  type = "button",
  disabled = undefined,
  loading = false,
  loadingText = "Loading...",
  children,
  ...props
}) {
  const baseClasses = "inline-flex h-9 items-center justify-center gap-1 px-4 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ring-offset-white disabled:cursor-not-allowed disabled:opacity-50";
  const variantClasses = variants[variant];
  
  const style =
    variant === "default"
      ? { backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }
      : variant === "secondary"
        ? {
            backgroundColor: "var(--secondary)",
            color: "var(--secondary-foreground)",
            borderColor: "var(--border)",
          }
        : variant === "ghost"
          ? { color: "var(--foreground)" }
          : variant === "destructive"
            ? {
                backgroundColor: "var(--destructive)",
                color: "var(--destructive-foreground)",
              }
          : variant === "accent"
            ? { backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }
          : undefined;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(baseClasses, variantClasses, className)}
      style={{
        borderRadius: "var(--button-radius, var(--radius, 0.75rem))",
        ...style,
      }}
      {...props}
    >
      {loading ? (
        <>
          <LoadingSpinner className="h-4 w-4" />
          <span>{loadingText}</span>
        </>
      ) : children}
    </button>
  );
}