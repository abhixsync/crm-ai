"use client";

import type { Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  pageSizeOptions?: number[];
  serverSide?: boolean;
}

export function DataTablePagination<TData>({
  table,
  pageSizeOptions = [10, 20, 50, 100],
  serverSide = false,
}: DataTablePaginationProps<TData>) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const canPreviousPage = table.getCanPreviousPage();
  const canNextPage = table.getCanNextPage();

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted-foreground">
        Page {pageIndex + 1} of {Math.max(pageCount, 1)}
        {!serverSide ? ` • ${table.getFilteredRowModel().rows.length} rows` : ""}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <span>Rows</span>
          <Select
            className="h-8 w-[90px]"
            value={String(pageSize)}
            onChange={(event) => table.setPageSize(Number(event.target.value))}
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </label>

        <Button variant="secondary" className="h-8 px-3" onClick={() => table.setPageIndex(0)} disabled={!canPreviousPage}>
          First
        </Button>
        <Button variant="secondary" className="h-8 px-3" onClick={() => table.previousPage()} disabled={!canPreviousPage}>
          Prev
        </Button>
        <Button variant="secondary" className="h-8 px-3" onClick={() => table.nextPage()} disabled={!canNextPage}>
          Next
        </Button>
        <Button
          variant="secondary"
          className="h-8 px-3"
          onClick={() => table.setPageIndex(Math.max(pageCount - 1, 0))}
          disabled={!canNextPage}
        >
          Last
        </Button>
      </div>
    </div>
  );
}
