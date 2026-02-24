import { cn } from "@/lib/utils";

const badgeStyles = {
  NEW: "bg-blue-100 text-blue-700",
  INTERESTED: "bg-emerald-100 text-emerald-700",
  FOLLOW_UP: "bg-amber-100 text-amber-700",
  NOT_INTERESTED: "bg-slate-200 text-slate-700",
  DO_NOT_CALL: "bg-red-100 text-red-700",
  CONVERTED: "bg-purple-100 text-purple-700",
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