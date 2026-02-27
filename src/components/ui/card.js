import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export function Card({ className = undefined, ...props }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200/80 bg-white p-5 text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)]",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className = undefined, ...props }) {
  return <div className={cn("mb-5 space-y-1", className)} {...props} />;
}

export function CardTitle({ className = undefined, ...props }) {
  return <h3 className={cn("text-lg font-semibold tracking-tight text-slate-900", className)} {...props} />;
}

export function CardDescription({ className = undefined, ...props }) {
  return <p className={cn("text-sm leading-5 text-slate-600", className)} {...props} />;
}

export function CardContent({ className = undefined, ...props }) {
  return <div className={cn("space-y-3", className)} {...props} />;
}