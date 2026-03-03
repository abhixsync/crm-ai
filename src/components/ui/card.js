import { cn } from "@/lib/utils";

export function Card({ className = undefined, ...props }) {
  return (
    <div
      className={cn(
        "border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_rgba(15,23,42,0.08)]",
        className
      )}
      style={{
        borderColor: "var(--border)",
        backgroundColor: "var(--card)",
        color: "var(--card-foreground)",
        borderRadius: "var(--card-radius, var(--radius, 0.75rem))",
      }}
      {...props}
    />
  );
}

export function CardHeader({ className = undefined, ...props }) {
  return <div className={cn("mb-5 space-y-1", className)} {...props} />;
}

export function CardTitle({ className = undefined, ...props }) {
  return <h3 className={cn("text-lg font-semibold tracking-tight", className)} style={{ color: "var(--foreground)" }} {...props} />;
}

export function CardDescription({ className = undefined, ...props }) {
  return <p className={cn("text-sm leading-5", className)} style={{ color: "var(--muted-foreground)" }} {...props} />;
}

export function CardContent({ className = undefined, ...props }) {
  return <div className={cn("space-y-3", className)} {...props} />;
}