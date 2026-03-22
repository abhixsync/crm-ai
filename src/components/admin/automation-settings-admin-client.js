"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { Input } from "@/components/ui/input";
import { InlineLoader } from "@/components/ui/loader";

const STATUS_OPTIONS = [
  "NEW",
  "CALL_PENDING",
  "CALLING",
  "INTERESTED",
  "NOT_INTERESTED",
  "FOLLOW_UP",
  "CONVERTED",
  "CALL_FAILED",
  "RETRY_SCHEDULED",
  "DO_NOT_CALL",
];

const INITIAL_FORM = {
  executionMode: "CRON",
  enabled: false,
  maxRetries: 3,
  batchSize: 25,
  concurrency: 5,
  dailyCap: 200,
  workingHoursStart: 9,
  workingHoursEnd: 19,
  timezone: "Asia/Kolkata",
  eligibleStatuses: ["NEW", "FOLLOW_UP", "RETRY_SCHEDULED"],
};

const SKIPPED_REASON_LABELS = {
  automation_disabled: "Automation disabled",
  daily_cap_reached: "Daily cap reached",
  customer_not_found: "Customer not found",
  not_eligible: "Customer not eligible",
};

function getCampaignStatusLabel(job) {
  const status = String(job?.status || "").trim();
  return status || "-";
}

function getCampaignStatusTooltip(job) {
  const status = String(job?.status || "").trim();
  if (status === "SKIPPED") {
    const reasonCode = String(job?.result?.reason || "").trim();
    return SKIPPED_REASON_LABELS[reasonCode] || "Skipped by automation rules";
  }

  if (status === "FAILED") {
    return String(job?.errorMessage || job?.result?.reason || "Failed") || "Failed";
  }

  return "";
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatJson(value) {
  if (!value) return "-";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getJobRuntime(job) {
  const explicitRuntime = String(job?.metadata?.executionRuntime || "")
    .trim()
    .toUpperCase();
  if (explicitRuntime === "WORKER" || explicitRuntime === "CRON") {
    return explicitRuntime;
  }

  const source = String(job?.metadata?.source || "")
    .trim()
    .toLowerCase();
  if (source.includes("cron")) return "CRON";
  if (source.includes("worker") || source.includes("enqueue-service")) return "WORKER";

  const mode = String(job?.result?.mode || "")
    .trim()
    .toUpperCase();
  if (mode === "WORKER" || mode === "CRON") {
    return mode;
  }

  return "UNKNOWN";
}

export function AutomationSettingsAdminClient() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [workerEnabled, setWorkerEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningBatch, setRunningBatch] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [jobPagination, setJobPagination] = useState({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  });
  const [health, setHealth] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(true);

  useEffect(() => {
    fetchSettings();
    fetchRecentJobs();
    fetchAutomationHealth();
  }, []);

  async function fetchSettings() {
    setLoading(true);

    try {
      const response = await fetch("/api/automation/toggle");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load automation settings.");
      }

      setForm((prev) => ({
        ...prev,
        ...data.settings,
      }));
      setWorkerEnabled(Boolean(data?.capabilities?.workerEnabled));
    } catch (error) {
      toast.error(error?.message || "Unable to load automation settings.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchRecentJobs(nextPage = jobPagination.page, nextPageSize = jobPagination.pageSize) {
    setLoadingJobs(true);

    try {
      const response = await fetch(`/api/calls/automation/jobs?page=${nextPage}&pageSize=${nextPageSize}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load campaign jobs.");
      }

      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
      if (data.pagination) {
        setJobPagination({
          page: data.pagination.page || nextPage,
          pageSize: data.pagination.pageSize || nextPageSize,
          total: data.pagination.total || 0,
          totalPages: data.pagination.totalPages || 1,
        });
      }
    } catch (error) {
      toast.error(error?.message || "Unable to load campaign jobs.");
      setJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  }

  const jobColumns = useMemo(
    () => [
      {
        id: "customer",
        header: "Customer",
        cell: ({ row }) => (
          row.original.customer
            ? `${row.original.customer.firstName || ""} ${row.original.customer.lastName || ""}`.trim() || row.original.customer.id
            : "-"
        ),
      },
      {
        id: "customerDetails",
        header: "Customer Details",
        enableSorting: false,
        cell: ({ row }) => {
          const job = row.original;
          if (!job.customer) return "-";

          return (
            <details className="group">
              <summary className="cursor-pointer text-sm text-foreground underline-offset-2 group-open:font-semibold">View</summary>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <div><span className="font-medium">ID:</span> {job.customer.id}</div>
                <div><span className="font-medium">Phone:</span> {job.customer.phone || "-"}</div>
                <div><span className="font-medium">Email:</span> {job.customer.email || "-"}</div>
                <div><span className="font-medium">City/State:</span> {job.customer.city || "-"} / {job.customer.state || "-"}</div>
                <div><span className="font-medium">Source:</span> {job.customer.source || "-"}</div>
                <div><span className="font-medium">Loan:</span> {job.customer.loanType || "-"}</div>
                <div><span className="font-medium">Loan Amount:</span> {job.customer.loanAmount ?? "-"}</div>
                <div><span className="font-medium">Monthly Income:</span> {job.customer.monthlyIncome ?? "-"}</div>
                <div><span className="font-medium">Status:</span> {job.customer.status || "-"}</div>
                <div><span className="font-medium">Retries:</span> {job.customer.retryCount ?? 0} / {job.customer.maxRetries ?? 0}</div>
                <div><span className="font-medium">In Active Call:</span> {job.customer.inActiveCall ? "Yes" : "No"}</div>
                <div><span className="font-medium">Next Follow-up:</span> {formatDateTime(job.customer.nextFollowUpAt)}</div>
                <div><span className="font-medium">Manual Review:</span> {job.customer.manualReview ? "Yes" : "No"}</div>
                <div><span className="font-medium">Last Contacted:</span> {formatDateTime(job.customer.lastContactedAt)}</div>
                <div><span className="font-medium">Assignee:</span> {job.customer.assignedTo?.name || job.customer.assignedTo?.email || "-"}</div>
              </div>
            </details>
          );
        },
      },
      {
        accessorKey: "reason",
        header: "Reason",
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <span title={getCampaignStatusTooltip(row.original)}>{getCampaignStatusLabel(row.original)}</span>
        ),
      },
      {
        id: "jobDetails",
        header: "Job Details",
        enableSorting: false,
        cell: ({ row }) => {
          const job = row.original;
          return (
            <details className="group">
              <summary className="cursor-pointer text-sm text-foreground underline-offset-2 group-open:font-semibold">View</summary>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <div><span className="font-medium">Status:</span> {job.status || "-"}</div>
                <div><span className="font-medium">Runtime:</span> {getJobRuntime(job)}</div>
                <div><span className="font-medium">Skip Reason:</span> {getCampaignStatusTooltip(job) || "-"}</div>
                <div><span className="font-medium">Error:</span> {job.errorMessage || "-"}</div>
                <div className="mt-2">
                  <span className="font-medium">Result:</span>
                  <pre className="mt-1 whitespace-pre-wrap rounded bg-muted p-2 text-[11px]">{formatJson(job.result)}</pre>
                </div>
                <div className="mt-2">
                  <span className="font-medium">Metadata:</span>
                  <pre className="mt-1 whitespace-pre-wrap rounded bg-muted p-2 text-[11px]">{formatJson(job.metadata)}</pre>
                </div>
              </div>
            </details>
          );
        },
      },
      {
        accessorKey: "enqueuedAt",
        header: "Enqueued",
        cell: ({ row }) => formatDateTime(row.original.enqueuedAt),
      },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: ({ row }) => formatDateTime(row.original.updatedAt),
      },
    ],
    []
  );

  const jobsTablePagination = useMemo(
    () => ({ pageIndex: Math.max((jobPagination.page || 1) - 1, 0), pageSize: jobPagination.pageSize || 10 }),
    [jobPagination.page, jobPagination.pageSize]
  );

  function onJobsTablePaginationChange(updater) {
    const next = typeof updater === "function" ? updater(jobsTablePagination) : updater;
    const nextPage = (next.pageIndex ?? 0) + 1;
    const nextPageSize = next.pageSize ?? jobPagination.pageSize;
    fetchRecentJobs(nextPage, nextPageSize);
  }

  async function fetchAutomationHealth() {
    setLoadingHealth(true);

    try {
      const response = await fetch("/api/calls/automation/health");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load automation health.");
      }

      setHealth(data);
    } catch (error) {
      toast.error(error?.message || "Unable to load automation health.");
      setHealth(null);
    } finally {
      setLoadingHealth(false);
    }
  }

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toggleEligibleStatus(status) {
    setForm((current) => {
      const selected = new Set(current.eligibleStatuses || []);

      if (selected.has(status)) {
        selected.delete(status);
      } else {
        selected.add(status);
      }

      return {
        ...current,
        eligibleStatuses: Array.from(selected),
      };
    });
  }

  async function saveSettings() {
    setSaving(true);

    try {
      const response = await fetch("/api/automation/toggle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: Boolean(form.enabled),
          executionMode: workerEnabled ? "WORKER" : "CRON",
          maxRetries: Number(form.maxRetries),
          batchSize: Number(form.batchSize),
          concurrency: Number(form.concurrency),
          dailyCap: Number(form.dailyCap),
          workingHoursStart: Number(form.workingHoursStart),
          workingHoursEnd: Number(form.workingHoursEnd),
          timezone: String(form.timezone || "Asia/Kolkata"),
          eligibleStatuses: Array.isArray(form.eligibleStatuses) ? form.eligibleStatuses : [],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to update automation settings.");
      }

      setForm((prev) => ({ ...prev, ...data.settings }));
      setWorkerEnabled(Boolean(data?.capabilities?.workerEnabled));
      toast.success("Automation settings saved.");
    } catch (error) {
      toast.error(error?.message || "Unable to save automation settings.");
    } finally {
      setSaving(false);
    }
  }

  async function runBatchNow() {
    setRunningBatch(true);

    try {
      const response = await fetch("/api/calls/automation/run", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to run campaign batch.");
      }

      toast.success(`Batch started. Queued ${data.queued || 0} customers.`);
      await fetchRecentJobs();
      await fetchAutomationHealth();
    } catch (error) {
      toast.error(error?.message || "Unable to run campaign batch.");
    } finally {
      setRunningBatch(false);
    }
  }

  return (
    <Card className="automation-admin-root">
      <CardHeader>
        <CardTitle>AI Campaign Controls</CardTitle>
        <CardDescription>
          Configure retries, daily limits, working hours, and batch execution for automated AI calling.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? <InlineLoader label="Loading automation settings..." /> : null}

        <div className="automation-settings-grid grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Automation Enabled</span>
            <select
              className="automation-select h-9 w-full rounded-md border border-slate-300/90 bg-white px-3 text-sm text-slate-900"
              value={form.enabled ? "on" : "off"}
              onChange={(event) => updateField("enabled", event.target.value === "on")}
            >
              <option value="off">Off</option>
              <option value="on">On</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Max Retries</span>
            <Input
              type="number"
              min={0}
              max={10}
              value={form.maxRetries}
              onChange={(event) => updateField("maxRetries", event.target.value)}
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Batch Size</span>
            <Input
              type="number"
              min={1}
              max={500}
              value={form.batchSize}
              onChange={(event) => updateField("batchSize", event.target.value)}
            />
          </label>

          {workerEnabled ? (
            <div className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Execution Mode</span>
              <div className="automation-runtime-chip h-9 w-full rounded-md border border-slate-300/90 bg-slate-50 px-3 text-sm text-slate-900 flex items-center">
                Worker (Cron disabled)
              </div>
            </div>
          ) : null}

          {workerEnabled ? (
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Concurrency</span>
              <Input
                type="number"
                min={1}
                max={50}
                value={form.concurrency}
                onChange={(event) => updateField("concurrency", event.target.value)}
              />
            </label>
          ) : null}

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Daily Call Cap</span>
            <Input
              type="number"
              min={1}
              max={100000}
              value={form.dailyCap}
              onChange={(event) => updateField("dailyCap", event.target.value)}
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Timezone</span>
            <Input
              value={form.timezone}
              onChange={(event) => updateField("timezone", event.target.value)}
              placeholder="Asia/Kolkata"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Working Hours Start</span>
            <Input
              type="number"
              min={0}
              max={23}
              value={form.workingHoursStart}
              onChange={(event) => updateField("workingHoursStart", event.target.value)}
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Working Hours End</span>
            <Input
              type="number"
              min={0}
              max={23}
              value={form.workingHoursEnd}
              onChange={(event) => updateField("workingHoursEnd", event.target.value)}
            />
          </label>

          <div className="space-y-2 md:col-span-2 lg:col-span-3">
            <span className="text-sm font-medium text-slate-700">Customer Statuses for Automation</span>
            <details className="automation-status-picker rounded-md border border-slate-300/90 bg-white px-3 py-2">
              <summary className="cursor-pointer list-none text-sm text-slate-900">
                {(form.eligibleStatuses || []).length
                  ? `${form.eligibleStatuses.length} selected: ${form.eligibleStatuses.join(", ")}`
                  : "Select customer statuses"}
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {STATUS_OPTIONS.map((status) => {
                  const checked = (form.eligibleStatuses || []).includes(status);

                  return (
                    <label key={status} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEligibleStatus(status)}
                      />
                      <span>{status}</span>
                    </label>
                  );
                })}
              </div>
            </details>
          </div>
        </div>

        <div className="automation-actions flex flex-wrap gap-2">
          <Button onClick={saveSettings} loading={saving} loadingText="Saving settings..." disabled={saving || loading}>
            Save Settings
          </Button>
          <Button
            variant="secondary"
            onClick={runBatchNow}
            loading={runningBatch}
            loadingText="Running batch..."
            disabled={runningBatch || loading || !form.enabled}
          >
            Run Campaign Batch Now
          </Button>
          {/* <Button variant="secondary" onClick={fetchSettings} disabled={loading}>
            Refresh
          </Button> */}
          <Button
            variant="secondary"
            onClick={() => fetchRecentJobs()}
            loading={loadingJobs}
            loadingText="Refreshing jobs..."
            disabled={loadingJobs}
          >
            Refresh
          </Button>
          <Button
            variant="secondary"
            onClick={fetchAutomationHealth}
            loading={loadingHealth}
            loadingText="Refreshing health..."
            disabled={loadingHealth}
          >
            Refresh Health
          </Button>
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold text-slate-900">Automation Runtime Health</h3>
          {loadingHealth ? <InlineLoader label="Loading health..." /> : null}
          {!loadingHealth && health ? (
            <div className="automation-health-grid grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="automation-health-tile rounded-md border border-slate-200 bg-white p-3">
                <p className="text-xs font-medium text-slate-500">{health.runtimeLabel || "Runtime"}</p>
                <p className={`mt-1 text-sm font-semibold ${health.runtimeOnline ? "text-emerald-700" : "text-rose-700"}`}>
                  {health.runtimeOnline ? "ONLINE" : "OFFLINE"}
                </p>
              </div>
              <div className="automation-health-tile rounded-md border border-slate-200 bg-white p-3">
                <p className="text-xs font-medium text-slate-500">Jobs Queued</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{health.queue?.waiting ?? 0}</p>
              </div>
              <div className="automation-health-tile rounded-md border border-slate-200 bg-white p-3">
                <p className="text-xs font-medium text-slate-500">Jobs Active</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{health.queue?.active ?? 0}</p>
              </div>
              <div className="automation-health-tile rounded-md border border-slate-200 bg-white p-3">
                <p className="text-xs font-medium text-slate-500">Jobs Failed</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{health.queue?.failed ?? 0}</p>
              </div>
            </div>
          ) : null}
          {!loadingHealth && health?.executionMode === "CRON" && health?.lastRunAt ? (
            <p className="text-xs text-slate-600">
              Last cron run: {new Date(health.lastRunAt).toLocaleString()} (interval: {health.intervalMinutes || 5} min)
            </p>
          ) : null}
          {!loadingHealth && health?.executionMode === "WORKER" && health?.lastHeartbeatAt ? (
            <p className="text-xs text-slate-600">
              Last worker heartbeat: {new Date(health.lastHeartbeatAt).toLocaleString()}
            </p>
          ) : null}
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold text-slate-900">Campaign Job Status</h3>
          <DataTable
            columns={jobColumns}
            data={jobs}
            className="automation-jobs-table"
            serverSide
            pageCount={jobPagination.totalPages || 1}
            pagination={jobsTablePagination}
            onPaginationChange={onJobsTablePaginationChange}
            pageSizeOptions={[10, 25, 50, 100]}
            isLoading={loadingJobs}
            emptyMessage="No campaign jobs found yet."
            enableGlobalFilter
            enableColumnFilters={false}
          />
          {!loadingJobs ? (
            <div className="text-sm text-slate-600">
              Page {jobPagination.page} of {jobPagination.totalPages} · {jobPagination.total} jobs
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
