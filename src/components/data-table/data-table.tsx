"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnDef,
  type ColumnFiltersState,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type Updater,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { DataTableEmpty } from "@/components/data-table/data-table-empty";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  pageCount?: number;
  pagination?: PaginationState;
  onPaginationChange?: (updater: Updater<PaginationState>) => void;
  enableRowSelection?: boolean;
  enableGlobalFilter?: boolean;
  enableColumnFilters?: boolean;
  serverSide?: boolean;
  className?: string;
  emptyMessage?: string;
  pageSizeOptions?: number[];
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>;
  globalFilter?: string;
  onGlobalFilterChange?: OnChangeFn<string>;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  globalFilterPlaceholder?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  pageCount,
  pagination,
  onPaginationChange,
  enableRowSelection = false,
  enableGlobalFilter = true,
  enableColumnFilters = true,
  serverSide = false,
  className,
  emptyMessage,
  pageSizeOptions,
  sorting,
  onSortingChange,
  columnFilters,
  onColumnFiltersChange,
  globalFilter,
  onGlobalFilterChange,
  rowSelection,
  onRowSelectionChange,
  globalFilterPlaceholder,
}: DataTableProps<TData, TValue>) {
  const [internalPagination, setInternalPagination] = useState<PaginationState>(pagination ?? { pageIndex: 0, pageSize: 10 });
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [internalColumnFilters, setInternalColumnFilters] = useState<ColumnFiltersState>([]);
  const [internalGlobalFilter, setInternalGlobalFilter] = useState("");
  const [internalRowSelection, setInternalRowSelection] = useState<RowSelectionState>({});

  const currentPagination = pagination ?? internalPagination;
  const currentSorting = sorting ?? internalSorting;
  const currentColumnFilters = columnFilters ?? internalColumnFilters;
  const currentGlobalFilter = globalFilter ?? internalGlobalFilter;
  const currentRowSelection = rowSelection ?? internalRowSelection;

  const handlePaginationChange: OnChangeFn<PaginationState> = (updater) => {
    if (!pagination) {
      setInternalPagination((prev) => {
        const nextValue = typeof updater === "function" ? updater(prev) : updater;
        onPaginationChange?.(nextValue);
        return nextValue;
      });
      return;
    }

    onPaginationChange?.(updater);
  };

  const selectionColumn = useMemo<ColumnDef<TData, TValue>[]>(() => {
    if (!enableRowSelection) {
      return [];
    }

    return [
      {
        id: "__select",
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            aria-label="Select all rows"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
            aria-label="Select row"
          />
        ),
        size: 44,
      },
    ];
  }, [enableRowSelection]);

  const resolvedColumns = useMemo(() => [...selectionColumn, ...columns], [selectionColumn, columns]);

  const table = useReactTable({
    data,
    columns: resolvedColumns,
    state: {
      pagination: currentPagination,
      sorting: currentSorting,
      columnFilters: currentColumnFilters,
      globalFilter: currentGlobalFilter,
      rowSelection: currentRowSelection,
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: serverSide ? undefined : getFilteredRowModel(),
    getSortedRowModel: serverSide ? undefined : getSortedRowModel(),
    getPaginationRowModel: serverSide ? undefined : getPaginationRowModel(),
    onPaginationChange: handlePaginationChange,
    onSortingChange: onSortingChange ?? setInternalSorting,
    onColumnFiltersChange: onColumnFiltersChange ?? setInternalColumnFilters,
    onGlobalFilterChange: onGlobalFilterChange ?? setInternalGlobalFilter,
    onRowSelectionChange: onRowSelectionChange ?? setInternalRowSelection,
    enableRowSelection,
    enableColumnFilters,
    manualPagination: serverSide,
    manualSorting: serverSide,
    manualFiltering: serverSide,
    pageCount: serverSide ? pageCount : undefined,
  });

  const visibleColumnsCount = table.getVisibleLeafColumns().length;

  return (
    <div className={cn("space-y-3", className)}>
      <DataTableToolbar
        table={table}
        enableGlobalFilter={enableGlobalFilter}
        globalFilterPlaceholder={globalFilterPlaceholder}
      />

      <div className="rounded-lg border border-border bg-background">
        <div className="w-full overflow-x-auto" data-virtualization-ready="true">
          <table className="w-full caption-bottom text-sm text-foreground" role="table" aria-busy={isLoading}>
            <thead className="border-b border-border">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-border">
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sortDirection = header.column.getIsSorted();

                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className="h-11 px-3.5 text-left align-middle text-sm font-medium text-muted-foreground"
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={header.column.getToggleSortingHandler()}
                            aria-label={`Sort ${String(header.column.id)}`}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <span className="text-xs text-muted-foreground">
                              {sortDirection === "asc" ? "↑" : sortDirection === "desc" ? "↓" : "↕"}
                            </span>
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>

            <tbody className="[&_tr:last-child]:border-0">
              {isLoading ? <DataTableSkeleton columns={visibleColumnsCount} /> : null}

              {!isLoading && table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    className="border-b border-border transition-colors hover:bg-muted/50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="p-3.5 align-middle text-sm text-foreground">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : null}

              {!isLoading && table.getRowModel().rows.length === 0 ? (
                <DataTableEmpty colSpan={visibleColumnsCount} message={emptyMessage} />
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} serverSide={serverSide} />
    </div>
  );
}
