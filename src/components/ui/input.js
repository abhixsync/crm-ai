import { cn } from "@/lib/utils";

export function Input({ className = undefined, ...props }) {
  return (
    <input
      className={cn(
        "h-9 w-full border px-3 text-sm shadow-[0_1px_1px_rgba(15,23,42,0.03)] outline-none ring-offset-white focus-visible:ring-2 placeholder:opacity-90",
        className
      )}
      style={{
        borderColor: "var(--input)",
        backgroundColor: "var(--card)",
        color: "var(--foreground)",
        borderRadius: "var(--input-radius, var(--radius, 0.75rem))",
      }}
      {...props}
    />
  );
}