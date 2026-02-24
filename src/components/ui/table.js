import { cn } from "@/lib/utils";

export function Table({ className, ...props }) {
  return (
    <div className="w-full overflow-auto rounded-lg border border-slate-200/80 bg-white">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader(props) {
  return <thead className="border-b border-slate-200 bg-slate-50/60" {...props} />;
}

export function TableBody(props) {
  return <tbody className="[&_tr:last-child]:border-0 [&_tr:nth-child(even)]:bg-slate-50/40" {...props} />;
}

export function TableRow(props) {
  return <tr className="border-b border-slate-200/80 transition-colors hover:bg-slate-100/70" {...props} />;
}

export function TableHead(props) {
  return (
    <th
      className="h-11 px-3.5 text-left align-middle text-sm font-medium tracking-normal text-slate-700"
      {...props}
    />
  );
}

export function TableCell(props) {
  return <td className="p-3.5 align-middle text-sm text-slate-800" {...props} />;
}