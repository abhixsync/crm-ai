"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
  if (status !== "SKIPPED") return "";

  const reasonCode = String(job?.result?.reason || "").trim();
  return SKIPPED_REASON_LABELS[reasonCode] || "Skipped by automation rules";
}

export function AutomationSettingsAdminClient() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningBatch, setRunningBatch] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [health, setHealth] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

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
    } catch (error) {
      toast.error(error?.message || "Unable to load automation settings.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchRecentJobs() {
    setLoadingJobs(true);

    try {
      const response = await fetch("/api/calls/automation/jobs?page=1&pageSize=25");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load campaign jobs.");
      }

      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (error) {
      toast.error(error?.message || "Unable to load campaign jobs.");
      setJobs([]);
    } finally {
      setLoadingJobs(false);
    }
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
    <Card>
      <CardHeader>
        <CardTitle>AI Campaign Controls</CardTitle>
        <CardDescription>
          Configure retries, daily limits, working hours, and batch execution for automated AI calling.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? <p className="text-sm text-slate-600">Loading automation settings...</p> : null}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Automation Enabled</span>
            <select
              className="h-9 w-full rounded-md border border-slate-300/90 bg-white px-3 text-sm text-slate-900"
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
            <details className="rounded-md border border-slate-300/90 bg-white px-3 py-2">
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

        <div className="flex flex-wrap gap-2">
          <Button onClick={saveSettings} disabled={saving || loading}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
          <Button variant="secondary" onClick={runBatchNow} disabled={runningBatch || loading || !form.enabled}>
            {runningBatch ? "Running Batch..." : "Run Campaign Batch Now"}
          </Button>
          <Button variant="secondary" onClick={fetchSettings} disabled={loading}>
            Refresh
          </Button>
          <Button variant="secondary" onClick={fetchRecentJobs} disabled={loadingJobs}>
            {loadingJobs ? "Refreshing Jobs..." : "Refresh Jobs"}
          </Button>
          <Button variant="secondary" onClick={fetchAutomationHealth} disabled={loadingHealth}>
            {loadingHealth ? "Refreshing Health..." : "Refresh Health"}
          </Button>
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold text-slate-900">Automation Runtime Health</h3>
          {loadingHealth ? <p className="text-sm text-slate-600">Loading health...</p> : null}
          {!loadingHealth && health ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <p className="text-xs font-medium text-slate-500">Worker</p>
                <p className={`mt-1 text-sm font-semibold ${health.workerOnline ? "text-emerald-700" : "text-rose-700"}`}>
                  {health.workerOnline ? "ONLINE" : "OFFLINE"}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <p className="text-xs font-medium text-slate-500">Queue Waiting</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{health.queue?.waiting ?? 0}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <p className="text-xs font-medium text-slate-500">Queue Active</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{health.queue?.active ?? 0}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <p className="text-xs font-medium text-slate-500">Queue Failed</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{health.queue?.failed ?? 0}</p>
              </div>
            </div>
          ) : null}
          {!loadingHealth && health?.heartbeat?.lastHeartbeatAt ? (
            <p className="text-xs text-slate-600">
              Last heartbeat: {new Date(health.heartbeat.lastHeartbeatAt).toLocaleString()}
            </p>
          ) : null}
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold text-slate-900">Campaign Job Status</h3>
          {loadingJobs ? <p className="text-sm text-slate-600">Loading jobs...</p> : null}
          {!loadingJobs && jobs.length === 0 ? (
            <p className="text-sm text-slate-600">No campaign jobs found yet.</p>
          ) : null}
          {!loadingJobs && jobs.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Queue Job ID</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Customer</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Reason</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Status</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Attempts</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Error</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Enqueued</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-700">{job.queueJobId}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                        {job.customer
                          ? `${job.customer.firstName || ""} ${job.customer.lastName || ""}`.trim() || job.customer.id
                          : "-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-700">{job.reason}</td>
                      <td
                        className="whitespace-nowrap px-3 py-2 text-slate-700"
                        title={getCampaignStatusTooltip(job)}
                      >
                        {getCampaignStatusLabel(job)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-700">{job.attemptsMade ?? 0}</td>
                      <td className="max-w-[280px] truncate px-3 py-2 text-slate-700" title={job.errorMessage || ""}>
                        {job.errorMessage || "-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                        {job.enqueuedAt ? new Date(job.enqueuedAt).toLocaleString() : "-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                        {job.updatedAt ? new Date(job.updatedAt).toLocaleString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
