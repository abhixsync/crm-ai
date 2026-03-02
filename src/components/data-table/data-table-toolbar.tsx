"use client";

import type { Table } from "@tanstack/react-table";
import { Input } from "@/components/ui/input";

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  enableGlobalFilter?: boolean;
}

export function DataTableToolbar<TData>({
  table,
  enableGlobalFilter = true,
}: DataTableToolbarProps<TData>) {
  const globalFilter = (table.getState().globalFilter as string | undefined) ?? "";
  const toggleableColumns = table
    .getAllColumns()
    .filter((column) => column.getCanHide() && column.id !== "__select");

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {enableGlobalFilter ? (
        <Input
          value={globalFilter}
          onChange={(event) => table.setGlobalFilter(event.target.value)}
          placeholder="Search..."
          className="w-full sm:max-w-sm"
          aria-label="Search table"
        />
      ) : (
        <div />
      )}

      {toggleableColumns.length > 0 ? (
        <details className="relative">
          <summary className="cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Columns
          </summary>
          <div className="absolute right-0 z-20 mt-2 min-w-[220px] rounded-md border border-border bg-background p-2 shadow-sm">
            <ul className="space-y-1">
              {toggleableColumns.map((column) => (
                <li key={column.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-foreground hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={column.getIsVisible()}
                      onChange={column.getToggleVisibilityHandler()}
                      aria-label={`Toggle ${column.id} column`}
                    />
                    <span className="truncate">{column.columnDef.header?.toString?.() ?? column.id}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}
    </div>
  );
}
