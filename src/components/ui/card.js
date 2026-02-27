import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Card = forwardRef(function Card({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border border-slate-200/80 bg-white p-5 text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)]",
        className
      )}
      {...props}
    />
  );
});

export function CardHeader({ className, ...props }) {
  return <div className={cn("mb-5 space-y-1", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn("text-lg font-semibold tracking-tight text-slate-900", className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn("text-sm leading-5 text-slate-600", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn("space-y-3", className)} {...props} />;
}