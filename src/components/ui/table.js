import { cn } from "@/lib/utils";

export function Table({ className, ...props }) {
  return (
    <div className="w-full overflow-auto rounded-lg border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader(props) {
  return (
    <thead className="border-b bg-card" style={{ borderColor: "var(--color-border)" }} {...props} />
  );
}

export function TableBody(props) {
  return <tbody className="[&_tr:last-child]:border-0" {...props} />;
}

export function TableRow(props) {
  return (
    <tr
      className="border-b transition-colors hover:bg-background"
      style={{ borderColor: "var(--color-border)" }}
      {...props}
    />
  );
}

export function TableHead(props) {
  return (
    <th
      className="h-11 px-3.5 text-left align-middle text-sm font-medium tracking-normal"
      style={{ color: "var(--color-primary-dark)", backgroundColor: "var(--color-border)" }}
      {...props}
    />
  );
}

export function TableCell(props) {
  return <td className="p-3.5 align-middle text-sm" style={{ color: "var(--color-text-primary)" }} {...props} />;
}