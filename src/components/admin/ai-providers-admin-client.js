"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, PlugZap, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PROVIDER_TYPES = ["OPENAI", "DIALOGFLOW", "RASA", "GENERIC_HTTP"];

const EMPTY_FORM = {
  name: "",
  type: "OPENAI",
  endpoint: "",
  apiKey: "",
  model: "",
  priority: 100,
  timeoutMs: 12000,
  enabled: true,
  isActive: false,
};

export function AiProvidersAdminClient({ initialProviders, embedded = false }) {
  const [providers, setProviders] = useState(initialProviders || []);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [testingConnectionId, setTestingConnectionId] = useState("");
  const [testingAllConnections, setTestingAllConnections] = useState(false);
  const [connectionResults, setConnectionResults] = useState({});
  const [allConnectionResults, setAllConnectionResults] = useState([]);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState("");

  const orderedProviders = useMemo(
    () =>
      [...providers].sort((left, right) => {
        if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
        if (left.priority !== right.priority) return left.priority - right.priority;
        return left.name.localeCompare(right.name);
      }),
    [providers]
  );

  async function fetchProviders(options = {}) {
    const { withLoading = true } = options;

    if (withLoading) {
      setLoading(true);
    }

    const response = await fetch("/api/admin/ai-providers");
    const data = await response.json();

    if (!response.ok) {
      toast.error(data.error || "Unable to load providers.");
      setLoading(false);
      return;
    }

    setProviders(data.providers || []);
    setLoading(false);
  }

  function updateProviderDraft(providerId, field, value) {
    setProviders((current) =>
      current.map((provider) =>
        provider.id === providerId
          ? {
              ...provider,
              [field]: value,
            }
          : provider
      )
    );
  }

  async function saveProvider(provider) {
    setSavingId(provider.id);

    const response = await fetch(`/api/admin/ai-providers/${provider.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: provider.name,
        endpoint: provider.endpoint,
        apiKey: provider.apiKey,
        model: provider.model,
        priority: Number(provider.priority),
        enabled: provider.enabled,
        timeoutMs: Number(provider.timeoutMs),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      toast.error(data.error || "Failed to save provider.");
      setSavingId("");
      return;
    }

    toast.success(`Saved provider: ${data.provider.name}`);
    setSavingId("");
    await fetchProviders();
  }

  async function setActiveProvider(providerId) {
    setSavingId(providerId);

    const response = await fetch(`/api/admin/ai-providers/${providerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });

    const data = await response.json();

    if (!response.ok) {
      toast.error(data.error || "Failed to activate provider.");
      setSavingId("");
      return;
    }

    toast.success(`Active provider set to ${data.provider.name}.`);
    setSavingId("");
    await fetchProviders();
  }

  async function toggleProviderEnabled(provider) {
    setSavingId(provider.id);

    const response = await fetch(`/api/admin/ai-providers/${provider.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !Boolean(provider.enabled) }),
    });

    const data = await response.json();

    if (!response.ok) {
      toast.error(data.error || "Failed to toggle provider state.");
      setSavingId("");
      return;
    }

    toast.success(`${data.provider.name} ${data.provider.enabled ? "enabled" : "disabled"}.`);
    setSavingId("");
    await fetchProviders();
  }

  async function deleteProvider(providerId) {
    const confirmed = window.confirm("Delete this AI provider configuration?");
    if (!confirmed) return;

    setDeletingId(providerId);

    const response = await fetch(`/api/admin/ai-providers/${providerId}`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (!response.ok) {
      toast.error(data.error || "Failed to delete provider.");
      setDeletingId("");
      return;
    }

    setDeletingId("");
    toast.success("Provider deleted.");
    await fetchProviders();
  }

  async function createProvider() {
    if (!createForm.name.trim()) {
      toast.error("Provider name is required.");
      return;
    }

    const method = editingProviderId ? "PATCH" : "POST";
    const url = editingProviderId
      ? `/api/admin/ai-providers/${editingProviderId}`
      : "/api/admin/ai-providers";

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...createForm,
        priority: Number(createForm.priority),
        timeoutMs: Number(createForm.timeoutMs),
        enabled: Boolean(createForm.enabled),
        isActive: Boolean(createForm.isActive),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      toast.error(data.error || (editingProviderId ? "Failed to update provider." : "Failed to create provider."));
      return;
    }

    setCreateForm(EMPTY_FORM);
    setEditingProviderId("");
    setShowCreateForm(false);
    toast.success(
      editingProviderId
        ? `Provider updated: ${data.provider.name}`
        : `Provider created: ${data.provider.name}`
    );
    await fetchProviders();
  }

  function openCreateModal() {
    setEditingProviderId("");
    setCreateForm(EMPTY_FORM);
    setShowCreateForm(true);
  }

  function openEditModal(provider) {
    setEditingProviderId(provider.id);
    setCreateForm({
      name: provider.name || "",
      type: provider.type || "OPENAI",
      endpoint: provider.endpoint || "",
      apiKey: provider.apiKey || "",
      model: provider.model || "",
      priority: Number(provider.priority ?? 100),
      timeoutMs: Number(provider.timeoutMs ?? 12000),
      enabled: Boolean(provider.enabled),
      isActive: Boolean(provider.isActive),
    });
    setShowCreateForm(true);
  }

  async function testProviderConnection(providerId) {
    setTestingConnectionId(providerId);

    const response = await fetch("/api/admin/ai-providers/test-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId }),
    });

    const data = await response.json();
    setConnectionResults((current) => ({
      ...current,
      [providerId]: data,
    }));

    if (data.ok) {
      toast.success(`Connectivity check passed: ${data.provider?.name || providerId}`);
    } else {
      toast.error(data.error || "Connectivity check failed.");
    }

    setTestingConnectionId("");
  }

  async function testAllProviderConnections() {
    setTestingAllConnections(true);

    const response = await fetch("/api/admin/ai-providers/test-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testAll: true }),
    });

    const data = await response.json();

    if (!response.ok) {
      toast.error(data.error || "Failed to run connectivity checks.");
      setAllConnectionResults([]);
      setTestingAllConnections(false);
      return;
    }

    const mapped = {};
    for (const result of data.results || []) {
      const providerId = result?.provider?.id;
      if (providerId) {
        mapped[providerId] = result;
      }
    }

    setConnectionResults((current) => ({ ...current, ...mapped }));
    setAllConnectionResults(data.results || []);
    toast.info(
      `Provider checks completed. Success: ${data.successCount || 0}, Failed: ${data.failedCount || 0}.`
    );
    setTestingAllConnections(false);
  }

  return (
    <main className={embedded ? "space-y-4" : "mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8"}>
      {!embedded ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">AI Providers</h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage active AI engine, priorities, and failover order.
            </p>
          </div>
          <Link href="/dashboard">
            <Button variant="secondary">Back to Dashboard</Button>
          </Link>
        </div>
      ) : null}

      {!embedded ? (
      <Card>
        <CardHeader>
          <CardTitle>Connectivity Checks</CardTitle>
          <CardDescription>
            Run live checks for all configured providers in active/priority order.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={testAllProviderConnections} disabled={testingAllConnections}>
              {testingAllConnections ? "Testing All..." : "Test All Providers"}
            </Button>
          </div>

          {allConnectionResults.length ? (
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Provider</TableHead>
                    <TableHead className="min-w-[120px]">Type</TableHead>
                    <TableHead className="min-w-[90px]">Priority</TableHead>
                    <TableHead className="min-w-[110px]">Status</TableHead>
                    <TableHead className="min-w-[90px]">Latency</TableHead>
                    <TableHead className="min-w-[320px]">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allConnectionResults.map((result) => (
                    <TableRow key={result.provider?.id || result.provider?.name}>
                      <TableCell>
                        {result.provider?.name}
                        {result.provider?.isActive ? (
                          <p className="text-xs font-semibold text-emerald-700">Active</p>
                        ) : null}
                      </TableCell>
                      <TableCell>{result.provider?.type}</TableCell>
                      <TableCell>{result.provider?.priority}</TableCell>
                      <TableCell className={result.ok ? "text-emerald-700" : "text-rose-700"}>
                        {result.ok ? "PASS" : "FAIL"}
                      </TableCell>
                      <TableCell>{result.latencyMs} ms</TableCell>
                      <TableCell className="text-xs text-slate-700">
                        {result.ok ? result.message : result.error}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Configured Providers</CardTitle>
              <CardDescription>
                Lower priority value means higher failover preference. Active provider is tried first.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button variant="secondary" onClick={testAllProviderConnections} disabled={testingAllConnections}>
                {testingAllConnections ? "Testing All..." : "Test All Connections"}
              </Button>
              <Button variant="secondary" onClick={openCreateModal}>
                Add Provider
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Name</TableHead>
                  <TableHead className="min-w-[140px]">Type</TableHead>
                  <TableHead className="min-w-[110px]">Priority</TableHead>
                  <TableHead className="min-w-[120px]">Timeout</TableHead>
                  <TableHead className="min-w-[120px]">Status</TableHead>
                  <TableHead className="min-w-[360px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6}>Loading provider configs...</TableCell>
                  </TableRow>
                ) : null}

                {!loading && orderedProviders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>No AI providers configured.</TableCell>
                  </TableRow>
                ) : null}

                {!loading &&
                  orderedProviders.map((provider) => (
                    <TableRow key={provider.id}>
                      <TableCell>
                        <p className="text-sm text-slate-900">{provider.name}</p>
                        {provider.isActive ? (
                          <p className="mt-1 text-xs font-semibold text-emerald-700">Active</p>
                        ) : null}
                      </TableCell>
                      <TableCell>{provider.type}</TableCell>
                      <TableCell>{provider.priority}</TableCell>
                      <TableCell>{provider.timeoutMs || 12000} ms</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            provider.isActive
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {provider.isActive ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-[340px] flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            className="h-8"
                            onClick={() => openEditModal(provider)}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            variant="secondary"
                            className="h-8"
                            onClick={() => testProviderConnection(provider.id)}
                            disabled={testingConnectionId === provider.id}
                          >
                            <PlugZap className="mr-1 h-3.5 w-3.5" />
                            {testingConnectionId === provider.id ? "Testing..." : "Test Connection"}
                          </Button>
                          <Button
                            variant="destructive"
                            className="h-8"
                            onClick={() => deleteProvider(provider.id)}
                            disabled={deletingId === provider.id}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            {deletingId === provider.id ? "Deleting..." : "Delete"}
                          </Button>
                        </div>
                        {connectionResults[provider.id] ? (
                          <p
                            className={`mt-2 text-xs ${
                              connectionResults[provider.id].ok ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            {connectionResults[provider.id].ok
                              ? `✓ ${connectionResults[provider.id].message} (${connectionResults[provider.id].latencyMs} ms)`
                              : `✕ ${connectionResults[provider.id].error || "Connectivity check failed."}`}
                          </p>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {showCreateForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-4xl rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingProviderId ? "Edit AI Provider" : "Add AI Provider"}
              </h3>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCreateForm(false);
                  setEditingProviderId("");
                  setCreateForm(EMPTY_FORM);
                }}
              >
                Close
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <Input
                placeholder="Provider Name"
                value={createForm.name}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <Select
                value={createForm.type}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, type: event.target.value }))}
              >
                {PROVIDER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
              <Input
                placeholder="API Key"
                value={createForm.apiKey}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, apiKey: event.target.value }))}
              />
              <Input
                placeholder="Model"
                value={createForm.model}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, model: event.target.value }))}
              />
              <Input
                type="number"
                placeholder="Priority"
                value={createForm.priority}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, priority: event.target.value }))}
              />
              <Input
                type="number"
                placeholder="Timeout ms"
                value={createForm.timeoutMs}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, timeoutMs: event.target.value }))}
              />
              <div className="flex items-center gap-2 rounded-md border border-slate-200 px-3">
                <input
                  id="create-enabled"
                  type="checkbox"
                  checked={createForm.enabled}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, enabled: event.target.checked }))}
                />
                <label htmlFor="create-enabled" className="text-sm text-slate-700">
                  Enabled
                </label>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-slate-200 px-3">
                <input
                  id="create-active"
                  type="checkbox"
                  checked={createForm.isActive}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                />
                <label htmlFor="create-active" className="text-sm text-slate-700">
                  Active
                </label>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <Button onClick={createProvider} disabled={Boolean(savingId)}>
                {editingProviderId ? "Update Provider" : "Create Provider"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
