import { cn } from "@/lib/utils";

const badgeStyles = {
  NEW: "bg-primary/10 text-primary-dark",
  INTERESTED: "bg-success/10 text-success",
  FOLLOW_UP: "bg-secondary/10 text-secondary",
  NOT_INTERESTED: "bg-slate-200 text-slate-700",
  DO_NOT_CALL: "bg-danger/10 text-danger",
  CONVERTED: "bg-secondary/10 text-secondary",
};

export function StatusBadge({ value }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-xs font-semibold",
        badgeStyles[value] || "bg-slate-100 text-slate-700"
      )}
    >
      {value}
    </span>
  );
}