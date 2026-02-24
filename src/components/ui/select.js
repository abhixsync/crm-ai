import { cn } from "@/lib/utils";

export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-slate-300/90 bg-white px-3 text-sm text-slate-900 shadow-[0_1px_1px_rgba(15,23,42,0.03)] outline-none ring-offset-white focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-300",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}