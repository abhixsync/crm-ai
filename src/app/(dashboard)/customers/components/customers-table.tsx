"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableAvatarCell,
  DataTableStatusBadge,
  formatDataTableDate,
} from "@/components/data-table";

type CustomerRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  status: string;
  createdAt: string;
};

const MOCK_CUSTOMERS: CustomerRow[] = Array.from({ length: 42 }).map((_, index) => ({
  id: `cust-${index + 1}`,
  firstName: `Customer${index + 1}`,
  lastName: "Demo",
  phone: `+91-90000${String(index).padStart(4, "0")}`,
  email: `customer${index + 1}@example.com`,
  status: index % 3 === 0 ? "ACTIVE" : index % 3 === 1 ? "PENDING" : "INACTIVE",
  createdAt: new Date(Date.now() - index * 86_400_000).toISOString(),
}));

async function fetchCustomersPage(pageIndex: number, pageSize: number) {
  await new Promise((resolve) => setTimeout(resolve, 350));
  const start = pageIndex * pageSize;
  const end = start + pageSize;
  return {
    rows: MOCK_CUSTOMERS.slice(start, end),
    total: MOCK_CUSTOMERS.length,
  };
}

export function CustomersTable() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [pageCount, setPageCount] = useState(1);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      const data = await fetchCustomersPage(pagination.pageIndex, pagination.pageSize);
      if (!isMounted) return;
      setRows(data.rows);
      setPageCount(Math.max(Math.ceil(data.total / pagination.pageSize), 1));
      setIsLoading(false);
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [pagination.pageIndex, pagination.pageSize]);

  const columns = useMemo<ColumnDef<CustomerRow>[]>(
    () => [
      {
        id: "customer",
        header: "Customer",
        cell: ({ row }) => (
          <DataTableAvatarCell
            name={`${row.original.firstName} ${row.original.lastName}`}
            subtitle={row.original.email}
          />
        ),
      },
      {
        accessorKey: "phone",
        header: "Phone",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <DataTableStatusBadge value={row.original.status} />,
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => formatDataTableDate(row.original.createdAt),
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <Button variant="secondary" className="h-8" onClick={() => console.log("Open customer", row.original.id)}>
            Open
          </Button>
        ),
      },
    ],
    []
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      isLoading={isLoading}
      emptyMessage="No customers found."
      serverSide
      pageCount={pageCount}
      pagination={pagination}
      onPaginationChange={setPagination}
      enableRowSelection
      enableGlobalFilter
      enableColumnFilters={false}
      pageSizeOptions={[10, 20, 50]}
    />
  );
}
