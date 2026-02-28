import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export function Card({ className = undefined, ...props }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)]",
        className
      )}
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
        color: "var(--color-text-primary)",
      }}
      {...props}
    />
  );
}

export function CardHeader({ className = undefined, ...props }) {
  return <div className={cn("mb-5 space-y-1", className)} {...props} />;
}

export function CardTitle({ className = undefined, ...props }) {
  return <h3 className={cn("text-lg font-semibold tracking-tight", className)} style={{ color: "var(--color-accent)" }} {...props} />;
}

export function CardDescription({ className = undefined, ...props }) {
  return <p className={cn("text-sm leading-5", className)} style={{ color: "var(--color-text-secondary)" }} {...props} />;
}

export function CardContent({ className = undefined, ...props }) {
  return <div className={cn("space-y-3", className)} {...props} />;
}