import { cn } from "@/lib/utils";

const variants = {
  default:
    "bg-blue-600 text-white shadow-sm hover:bg-blue-500 focus-visible:ring-blue-400",
  secondary:
    "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 focus-visible:ring-slate-400",
  ghost: "text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-300",
  destructive:
    "bg-red-600 text-white shadow-sm hover:bg-red-500 focus-visible:ring-red-400",
};

export function Button({
  className = undefined,
  variant = "default",
  type = "button",
  disabled = undefined,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ring-offset-white disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}