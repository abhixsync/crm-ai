import { cn } from "@/lib/utils";

interface DataTableStatusBadgeProps {
  value: string;
}

export function DataTableStatusBadge({ value }: DataTableStatusBadgeProps) {
  const normalized = String(value || "").toUpperCase();
  const styles: Record<string, string> = {
    ACTIVE: "bg-primary/10 text-primary",
    INACTIVE: "bg-muted text-muted-foreground",
    SUCCESS: "bg-primary/10 text-primary",
    FAILED: "bg-destructive/10 text-destructive",
    PENDING: "bg-muted text-foreground",
  };

  return (
    <span className={cn("inline-flex rounded-full px-2 py-1 text-xs font-medium", styles[normalized] ?? "bg-muted text-foreground")}>
      {value}
    </span>
  );
}

interface DataTableAvatarCellProps {
  name?: string | null;
  subtitle?: string | null;
}

export function DataTableAvatarCell({ name, subtitle }: DataTableAvatarCellProps) {
  const safeName = (name || "Unknown").trim() || "Unknown";
  const initials = safeName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
        {initials || "U"}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{safeName}</p>
        {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
    </div>
  );
}

export function formatDataTableDate(value: string | Date | null | undefined, fallback = "-") {
  if (!value) {
    return fallback;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleString();
}
