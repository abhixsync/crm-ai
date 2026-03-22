"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";

type CallCustomer = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
};

export type CallHistoryRow = {
  id: string;
  status: string | null;
  mode: string | null;
  summary: string | null;
  intent: string | null;
  nextAction: string | null;
  transcript: string | null;
  metadata?: unknown;
  customer: CallCustomer | null;
};

type CallHistoryRowWithSource = CallHistoryRow & {
  sourceKey: string;
};

type CallSourceFilterOption = {
  key: string;
  count: number;
};

const SOURCE_ALL_KEY = "__all__";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toSourceLabel(sourceKey: string) {
  return String(sourceKey || "")
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function resolveSourceKey(callLog: CallHistoryRow) {
  const metadata = callLog.metadata;
  if (isRecord(metadata)) {
    const source = metadata.source;
    if (typeof source === "string" && source.trim()) {
      return source.trim();
    }
  }

  if (String(callLog.mode || "").toUpperCase() === "MANUAL") {
    return "manual_call";
  }

  return "ai_outbound";
}

function formatCustomerName(customer: CallCustomer | null) {
  if (!customer) return "Unknown";
  return `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "Unknown";
}

interface CallsHistoryTableProps {
  callLogs: CallHistoryRow[];
}

export function CallsHistoryTable({ callLogs }: CallsHistoryTableProps) {
  const [selectedSource, setSelectedSource] = useState(SOURCE_ALL_KEY);

  const callLogsWithSource = useMemo<CallHistoryRowWithSource[]>(
    () =>
      (callLogs || []).map((callLog) => ({
        ...callLog,
        sourceKey: resolveSourceKey(callLog),
      })),
    [callLogs]
  );

  const sourceOptions = useMemo<CallSourceFilterOption[]>(() => {
    const counts = new Map<string, number>();

    for (const callLog of callLogsWithSource) {
      const sourceKey = callLog.sourceKey;
      counts.set(sourceKey, (counts.get(sourceKey) || 0) + 1);
    }

    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
  }, [callLogsWithSource]);

  const filteredCallLogs = useMemo(
    () =>
      selectedSource === SOURCE_ALL_KEY
        ? callLogsWithSource
        : callLogsWithSource.filter((callLog) => callLog.sourceKey === selectedSource),
    [callLogsWithSource, selectedSource]
  );

  const columns = useMemo<ColumnDef<CallHistoryRowWithSource>[]>(
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
        accessorKey: "sourceKey",
        header: "Source",
        cell: ({ row }) => row.original.sourceKey || "-",
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
    <div className="calls-history-root space-y-4">
      <div className="calls-history-filters flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Source</span>
        <Button
          size="sm"
          variant={selectedSource === SOURCE_ALL_KEY ? "default" : "secondary"}
          onClick={() => setSelectedSource(SOURCE_ALL_KEY)}
        >
          All ({callLogsWithSource.length})
        </Button>
        {sourceOptions.map((option) => (
          <Button
            key={option.key}
            size="sm"
            variant={selectedSource === option.key ? "default" : "secondary"}
            onClick={() => setSelectedSource(option.key)}
          >
            {toSourceLabel(option.key)} ({option.count})
          </Button>
        ))}
      </div>

      {selectedSource !== SOURCE_ALL_KEY ? (
        <p className="text-xs text-muted-foreground">
          Showing source: <span className="font-medium text-foreground">{toSourceLabel(selectedSource)}</span>
        </p>
      ) : null}

      <DataTable
        columns={columns}
        data={filteredCallLogs}
        className="calls-history-table"
        emptyMessage="No call logs available yet."
        enableColumnFilters={false}
        enableGlobalFilter
        globalFilterPlaceholder="Search calls..."
      />
    </div>
  );
}
