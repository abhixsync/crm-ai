"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";

type CallCustomer = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
};

export type CallHistoryRow = {
  id: string;
  status: string | null;
  summary: string | null;
  intent: string | null;
  nextAction: string | null;
  transcript: string | null;
  customer: CallCustomer | null;
};

function formatCustomerName(customer: CallCustomer | null) {
  if (!customer) return "Unknown";
  return `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "Unknown";
}

interface CallsHistoryTableProps {
  callLogs: CallHistoryRow[];
}

export function CallsHistoryTable({ callLogs }: CallsHistoryTableProps) {
  const columns = useMemo<ColumnDef<CallHistoryRow>[]>(
    () => [
      {
        id: "customer",
        header: "Customer",
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-foreground">{formatCustomerName(row.original.customer)}</div>
            <div className="text-xs text-muted-foreground">{row.original.customer?.phone || ""}</div>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => row.original.status || "-",
      },
      {
        accessorKey: "summary",
        header: "Summary",
        cell: ({ row }) => row.original.summary || "-",
      },
      {
        accessorKey: "intent",
        header: "Intent",
        cell: ({ row }) => row.original.intent || "-",
      },
      {
        accessorKey: "nextAction",
        header: "Next Action",
        cell: ({ row }) => row.original.nextAction || "-",
      },
      {
        accessorKey: "transcript",
        header: "Transcript",
        enableSorting: false,
        cell: ({ row }) => {
          const transcript = row.original.transcript;
          if (!transcript) {
            return "-";
          }

          return (
            <details className="max-w-[360px]">
              <summary className="cursor-pointer text-foreground underline underline-offset-2">View transcript</summary>
              <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs text-muted-foreground">
                {transcript}
              </pre>
            </details>
          );
        },
      },
    ],
    []
  );

  return (
    <DataTable
      columns={columns}
      data={callLogs}
      emptyMessage="No call logs available yet."
      enableColumnFilters={false}
      enableGlobalFilter
    />
  );
}
