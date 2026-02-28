import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export function Card({ className = undefined, ...props }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-default)] border p-6 shadow-soft",
        className
      )}
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-card)",
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
  return <h3 className={cn("text-lg font-semibold tracking-tight", className)} style={{ color: "var(--color-text-primary)" }} {...props} />;
}

export function CardDescription({ className = undefined, ...props }) {
  return <p className={cn("text-sm leading-5", className)} style={{ color: "var(--color-text-secondary)" }} {...props} />;
}

export function CardContent({ className = undefined, ...props }) {
  return <div className={cn("space-y-3", className)} {...props} />;
}