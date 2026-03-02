"use client";

import { useEffect, useRef, useState } from "react";
import type { Table } from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface DataTableColumnMeta {
  label?: string;
  filterVariant?: "select";
  filterOptions?: Array<{ label: string; value: string }>;
}

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  enableGlobalFilter?: boolean;
  globalFilterPlaceholder?: string;
}

export function DataTableToolbar<TData>({
  table,
  enableGlobalFilter = true,
  globalFilterPlaceholder = "Search...",
}: DataTableToolbarProps<TData>) {
  const hideColumnsToggle =
    process.env.NEXT_PUBLIC_HIDE_DATA_TABLE_COLUMNS_TOGGLE === "true" ||
    process.env.NEXT_PUBLIC_HIDE_DATA_TABLE_FILTERS === "true";
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement | null>(null);
  const globalFilter = (table.getState().globalFilter as string | undefined) ?? "";
  const toggleableColumns = table
    .getAllColumns()
    .filter((column) => column.getCanHide() && column.id !== "__select");
  const filterableColumns = table
    .getAllLeafColumns()
    .filter((column) => {
      const meta = (column.columnDef.meta ?? {}) as DataTableColumnMeta;
      return column.getCanFilter() && meta.filterVariant === "select";
    });

  useEffect(() => {
    if (!columnsMenuOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (!columnsMenuRef.current?.contains(event.target as Node)) {
        setColumnsMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setColumnsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [columnsMenuOpen]);

  function getColumnLabel(columnId: string) {
    const column = table.getColumn(columnId);
    const meta = (column?.columnDef.meta ?? {}) as DataTableColumnMeta;
    const header = column?.columnDef.header;

    if (typeof meta.label === "string" && meta.label.trim()) {
      return meta.label;
    }

    if (typeof header === "string" && header.trim()) {
      return header;
    }

    return columnId;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
        {enableGlobalFilter ? (
          <Input
            value={globalFilter}
            onChange={(event) => table.setGlobalFilter(event.target.value)}
            placeholder={globalFilterPlaceholder}
            className="w-full sm:max-w-sm"
            aria-label="Search table"
          />
        ) : null}

        {filterableColumns.map((column) => {
          const meta = (column.columnDef.meta ?? {}) as DataTableColumnMeta;
          const selectedValue = (column.getFilterValue() as string | undefined) ?? "";

          return (
            <Select
              key={column.id}
              className="w-full sm:w-[180px]"
              value={selectedValue}
              onChange={(event) => column.setFilterValue(event.target.value || undefined)}
              aria-label={`Filter ${meta.label || column.id}`}
            >
              <option value="">All {meta.label || column.id}</option>
              {(meta.filterOptions || []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          );
        })}
      </div>

      {!hideColumnsToggle && toggleableColumns.length > 0 ? (
        <div className="relative" ref={columnsMenuRef}>
          <button
            type="button"
            onClick={() => setColumnsMenuOpen((current) => !current)}
            className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-haspopup="menu"
            aria-expanded={columnsMenuOpen}
            aria-label="Toggle column visibility menu"
          >
            Columns
          </button>
          <div
            className={`absolute right-0 top-full z-30 mt-2 min-w-[220px] rounded-md border border-border bg-background p-2 shadow-sm ${
              columnsMenuOpen ? "block" : "hidden"
            }`}
            role="menu"
            aria-label="Column visibility"
          >
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
                    <span className="truncate">{getColumnLabel(column.id)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
