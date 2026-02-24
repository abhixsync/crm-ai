"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Pencil, Phone, PhoneCall, Plus, Trash2, Upload } from "lucide-react";
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

const STATUS_OPTIONS = ["NEW", "INTERESTED", "FOLLOW_UP", "NOT_INTERESTED", "DO_NOT_CALL", "CONVERTED"];
const TERMINAL_CALL_STATUSES = ["COMPLETED", "FAILED", "NO_ANSWER"];
const SOFTPHONE_PROVIDER_TYPES = ["TWILIO"];
const STATUS_SELECT_CLASS = {
  NEW: "border-slate-300 bg-slate-50 text-slate-700",
  INTERESTED: "border-emerald-300 bg-emerald-50 text-emerald-800",
  FOLLOW_UP: "border-blue-300 bg-blue-50 text-blue-800",
  NOT_INTERESTED: "border-amber-300 bg-amber-50 text-amber-800",
  DO_NOT_CALL: "border-rose-300 bg-rose-50 text-rose-800",
  CONVERTED: "border-teal-300 bg-teal-50 text-teal-800",
};

const EMPTY_CUSTOMER_FORM = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  city: "",
  state: "",
  source: "Manual Entry",
  loanType: "",
  loanAmount: "",
  monthlyIncome: "",
  status: "NEW",
  notes: "",
};

export function DashboardClient({
  user,
  initialMetrics,
  initialCustomers,
  initialPagination,
}) {
  const [metrics, setMetrics] = useState(initialMetrics);
  const [customers, setCustomers] = useState(initialCustomers);
  const [pagination, setPagination] = useState(initialPagination);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [busyCallId, setBusyCallId] = useState("");
  const [editingCustomerId, setEditingCustomerId] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [deletingCustomerId, setDeletingCustomerId] = useState("");
  const [deletingAllCustomers, setDeletingAllCustomers] = useState(false);
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER_FORM);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [creationMode, setCreationMode] = useState("manual");
  const [showAiCallPanel, setShowAiCallPanel] = useState(false);
  const [activeTelephonyProvider, setActiveTelephonyProvider] = useState(null);
  const [enabledTelephonyProviders, setEnabledTelephonyProviders] = useState([]);
  const [loadingActiveTelephony, setLoadingActiveTelephony] = useState(false);
  const [activeTelephonyError, setActiveTelephonyError] = useState("");
  const [activeCall, setActiveCall] = useState(null);
  const [softphoneTo, setSoftphoneTo] = useState("");
  const [softphoneCustomerName, setSoftphoneCustomerName] = useState("");
  const [softphoneReady, setSoftphoneReady] = useState(false);
  const [softphoneStatus, setSoftphoneStatus] = useState("Not initialized");
  const [softphoneError, setSoftphoneError] = useState("");
  const [softphoneIdentity, setSoftphoneIdentity] = useState("");
  const [softphoneInCall, setSoftphoneInCall] = useState(false);
  const [softphoneMuted, setSoftphoneMuted] = useState(false);
  const [softphoneLoading, setSoftphoneLoading] = useState(false);
  const [softphoneHealthLoading, setSoftphoneHealthLoading] = useState(false);
  const [softphoneHealth, setSoftphoneHealth] = useState(null);

  const deviceRef = useRef(null);
  const connectionRef = useRef(null);
  const filtersInitializedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (connectionRef.current) {
        connectionRef.current.disconnect();
        connectionRef.current = null;
      }

      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    fetchActiveTelephonyProvider();
  }, []);

  async function fetchMetrics() {
    const response = await fetch("/api/dashboard/metrics");
    const data = await response.json();
    setMetrics(data.metrics);
  }

  async function fetchActiveTelephonyProvider() {
    setLoadingActiveTelephony(true);
    setActiveTelephonyError("");

    try {
      const response = await fetch("/api/telephony/active");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load active telephony provider.");
      }

      setActiveTelephonyProvider(data.provider || null);
      setEnabledTelephonyProviders(Array.isArray(data.providers) ? data.providers : []);
      return data.provider || null;
    } catch (error) {
      const message = error?.message || "Unable to load active telephony provider.";
      setActiveTelephonyError(message);
      toast.error(message);
      setActiveTelephonyProvider(null);
      setEnabledTelephonyProviders([]);
      return null;
    } finally {
      setLoadingActiveTelephony(false);
    }
  }

  async function toggleAiCallPanel() {
    const nextOpen = !showAiCallPanel;
    setShowAiCallPanel(nextOpen);

    if (nextOpen) {
      const provider = await fetchActiveTelephonyProvider();
      if (provider?.type === "TWILIO" && !deviceRef.current && !softphoneLoading) {
        await initSoftphone();
      }
    }
  }

  async function fetchCustomers(nextPage = pagination.page) {
    setLoadingCustomers(true);
    const params = new URLSearchParams();

    if (query) params.set("q", query);
    if (statusFilter) params.set("status", statusFilter);
    params.set("page", String(nextPage));
    params.set("pageSize", String(pagination.pageSize));

    const response = await fetch(`/api/customers?${params.toString()}`);
    const data = await response.json();
    setCustomers(data.customers || []);
    setPagination(data.pagination || initialPagination);
    setLoadingCustomers(false);
  }

  useEffect(() => {
    if (!filtersInitializedRef.current) {
      filtersInitializedRef.current = true;
      return;
    }

    const timeout = setTimeout(() => {
      fetchCustomers(1);
    }, 250);

    return () => clearTimeout(timeout);
  }, [query, statusFilter]);

  async function pollCallStatus(callLogId) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const response = await fetch(`/api/calls/${callLogId}`);
      if (!response.ok) {
        break;
      }

      const data = await response.json();
      const latest = data.callLog;

      setActiveCall((previous) => {
        if (!previous || previous.callLogId !== callLogId) return previous;

        return {
          ...previous,
          status: latest.status,
          summary: latest.summary || "",
          intent: latest.intent || "",
          nextAction: latest.nextAction || "",
          transcript: latest.transcript || "",
        };
      });

      if (TERMINAL_CALL_STATUSES.includes(latest.status)) {
        break;
      }
    }
  }

  async function fetchSoftphoneToken() {
    const response = await fetch("/api/twilio/voice/token");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to fetch softphone token");
    }

    return data;
  }

  async function initSoftphone() {
    setSoftphoneLoading(true);
    setSoftphoneError("");
    setSoftphoneStatus("Initializing...");

    try {
      const tokenData = await fetchSoftphoneToken();
      const { Device } = await import("@twilio/voice-sdk");

      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
      }

      const device = new Device(tokenData.token, {
        logLevel: 1,
        codecPreferences: ["opus", "pcmu"],
      });

      deviceRef.current = device;
      setSoftphoneIdentity(tokenData.identity || "");

      device.on("registering", () => {
        setSoftphoneStatus("Registering...");
      });

      device.on("registered", () => {
        setSoftphoneReady(true);
        setSoftphoneStatus("Registered");
      });

      device.on("unregistered", () => {
        setSoftphoneReady(false);
        setSoftphoneStatus("Unregistered");
      });

      device.on("error", (error) => {
        const errorCode = error?.code;
        const baseMessage = error?.message || "Softphone error";

        if (errorCode === 31202) {
          const message =
            "Twilio token rejected (31202). Verify TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET are a matching pair from the same Twilio account/subaccount as TWILIO_ACCOUNT_SID.";
          setSoftphoneError(message);
          toast.error(message);
        } else {
          setSoftphoneError(baseMessage);
          toast.error(baseMessage);
        }

        setSoftphoneStatus("Error");
      });

      device.on("tokenWillExpire", async () => {
        try {
          const refreshed = await fetchSoftphoneToken();
          device.updateToken(refreshed.token);
        } catch {
          const message = "Failed to refresh softphone token.";
          setSoftphoneError(message);
          toast.error(message);
        }
      });

      await device.register();
    } catch (error) {
      const message = error?.message || "Unable to initialize softphone";
      setSoftphoneError(message);
      toast.error(message);
      setSoftphoneStatus("Failed");
      setSoftphoneReady(false);
    } finally {
      setSoftphoneLoading(false);
    }
  }

  async function runSoftphoneHealthCheck() {
    setSoftphoneHealthLoading(true);
    setSoftphoneError("");

    try {
      const response = await fetch("/api/twilio/voice/health");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to run softphone health check");
      }

      setSoftphoneHealth(data);
      setSoftphoneStatus(data.ok ? "Health check passed" : "Health check found issues");
    } catch (error) {
      const message = error?.message || "Unable to run softphone health check";
      setSoftphoneError(message);
      toast.error(message);
      setSoftphoneHealth(null);
    } finally {
      setSoftphoneHealthLoading(false);
    }
  }

  function attachConnectionListeners(connection) {
    connection.on("accept", () => {
      setSoftphoneInCall(true);
      setSoftphoneStatus("In call");
    });

    connection.on("disconnect", () => {
      setSoftphoneInCall(false);
      setSoftphoneMuted(false);
      setSoftphoneStatus("Call ended");
      connectionRef.current = null;
    });

    connection.on("cancel", () => {
      setSoftphoneInCall(false);
      setSoftphoneMuted(false);
      setSoftphoneStatus("Call canceled");
      connectionRef.current = null;
    });

    connection.on("reject", () => {
      setSoftphoneInCall(false);
      setSoftphoneMuted(false);
      setSoftphoneStatus("Call rejected");
      connectionRef.current = null;
    });

    connection.on("error", (error) => {
      const message = error?.message || "Call connection error";
      setSoftphoneError(message);
      toast.error(message);
      setSoftphoneStatus("Call error");
    });
  }

  async function startBrowserCall() {
    if (!softphoneTo) {
      const message = "Enter a destination phone number.";
      setSoftphoneError(message);
      toast.error(message);
      return;
    }

    if (!softphoneReady || !deviceRef.current) {
      await initSoftphone();

      if (!deviceRef.current) {
        const message = "Unable to initialize softphone for browser call.";
        setSoftphoneError(message);
        toast.error(message);
        return;
      }
    }

    setSoftphoneError("");
    setSoftphoneStatus("Connecting...");

    try {
      const connection = await deviceRef.current.connect({
        params: {
          To: softphoneTo,
        },
      });

      connectionRef.current = connection;
      attachConnectionListeners(connection);
    } catch (error) {
      const message = error?.message || "Unable to start browser call";
      setSoftphoneError(message);
      toast.error(message);
      setSoftphoneStatus("Failed");
      setSoftphoneInCall(false);
    }
  }

  function hangupBrowserCall() {
    if (connectionRef.current) {
      connectionRef.current.disconnect();
      connectionRef.current = null;
    }

    if (deviceRef.current) {
      deviceRef.current.disconnectAll();
    }

    setSoftphoneInCall(false);
    setSoftphoneMuted(false);
    setSoftphoneStatus("Call ended");
  }

  function toggleMuteBrowserCall() {
    if (!connectionRef.current) {
      return;
    }

    const nextMuted = !softphoneMuted;
    connectionRef.current.mute(nextMuted);
    setSoftphoneMuted(nextMuted);
  }

  function setSoftphoneTarget(customer) {
    const name = `${customer.firstName} ${customer.lastName || ""}`.trim();
    setSoftphoneCustomerName(name);
    setSoftphoneTo(customer.phone || "");
    toast.info(`Softphone target selected: ${name} (${customer.phone || "N/A"})`);
  }

  async function onUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.set("file", file);

    await fetch("/api/leads/upload", {
      method: "POST",
      body: formData,
    });

    setUploading(false);
    event.target.value = "";
    setShowAddCustomerModal(false);
    await fetchMetrics();
    await fetchCustomers();
  }

  async function triggerCall(customer) {
    setBusyCallId(customer.id);
    setActiveCall(null);

    const response = await fetch("/api/calls/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: customer.id }),
    });

    const data = await response.json();

    if (!response.ok) {
      setBusyCallId("");
      toast.error(`Call failed: ${data.error || "Unknown error"}`);
      setActiveCall({
        customerName: `${customer.firstName} ${customer.lastName || ""}`.trim(),
        phone: customer.phone,
        status: "FAILED",
        provider: "-",
        error: data.error || "Unknown error",
      });
      return;
    }

    toast.success(data.info || `Call initiated via ${data.provider || "provider"}.`);
    setActiveCall({
      customerName: `${customer.firstName} ${customer.lastName || ""}`.trim(),
      phone: customer.phone,
      status: data.callLog?.status || "INITIATED",
      provider: data.provider || "unknown",
      callLogId: data.callLog?.id,
      summary: "",
      intent: "",
      nextAction: "",
      transcript: "",
      error: "",
    });
    setBusyCallId("");
    await fetchMetrics();
    await fetchCustomers();

    if (data.callLog?.id) {
      pollCallStatus(data.callLog.id);
    }
  }

  async function updateStatus(customerId, status) {
    await fetch(`/api/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await fetchCustomers();
  }

  function resetCustomerForm() {
    setEditingCustomerId("");
    setCustomerForm(EMPTY_CUSTOMER_FORM);
  }

  function startCreateCustomer() {
    setEditingCustomerId("");
    setCustomerForm(EMPTY_CUSTOMER_FORM);
    setCreationMode("manual");
    setShowAddCustomerModal(true);
  }

  function startEditCustomer(customer) {
    setEditingCustomerId(customer.id);
    setCreationMode("manual");
    setShowAddCustomerModal(true);
    setCustomerForm({
      firstName: customer.firstName || "",
      lastName: customer.lastName || "",
      phone: customer.phone || "",
      email: customer.email || "",
      city: customer.city || "",
      state: customer.state || "",
      source: customer.source || "Manual Entry",
      loanType: customer.loanType || "",
      loanAmount: customer.loanAmount || "",
      monthlyIncome: customer.monthlyIncome || "",
      status: customer.status || "NEW",
      notes: customer.notes || "",
    });
  }

  function handleFormChange(field, value) {
    setCustomerForm((previous) => ({ ...previous, [field]: value }));
  }

  async function saveCustomer() {
    if (!customerForm.firstName || !customerForm.phone) {
      toast.error("First name and phone are required.");
      return;
    }

    setSavingCustomer(true);

    const payload = {
      ...customerForm,
      loanAmount: customerForm.loanAmount ? Number(customerForm.loanAmount) : null,
      monthlyIncome: customerForm.monthlyIncome ? Number(customerForm.monthlyIncome) : null,
    };

    const response = await fetch(
      editingCustomerId ? `/api/customers/${editingCustomerId}` : "/api/customers",
      {
        method: editingCustomerId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const data = await response.json();
      toast.error(data.error || "Unable to save customer.");
      setSavingCustomer(false);
      return;
    }

    setSavingCustomer(false);
    toast.success(editingCustomerId ? "Customer updated." : "Customer created.");
    resetCustomerForm();
    setShowAddCustomerModal(false);
    await fetchMetrics();
    await fetchCustomers(1);
  }

  async function deleteCustomer(customer) {
    const confirmed = window.confirm(`Delete customer ${customer.firstName} ${customer.lastName || ""}?`);
    if (!confirmed) return;

    setDeletingCustomerId(customer.id);

    await fetch(`/api/customers/${customer.id}`, {
      method: "DELETE",
    });

    setDeletingCustomerId("");
    if (editingCustomerId === customer.id) {
      resetCustomerForm();
    }
    await fetchMetrics();
    await fetchCustomers(pagination.page);

    if (activeCall?.phone === customer.phone) {
      setActiveCall(null);
    }
  }

  async function deleteAllCustomers() {
    const confirmed = window.confirm(
      "Delete ALL customers and related call data? This action cannot be undone."
    );
    if (!confirmed) return;

    setDeletingAllCustomers(true);

    try {
      const response = await fetch("/api/customers/delete-all", {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "Unable to delete all customers.");
        return;
      }

      setActiveCall(null);
      await fetchMetrics();
      await fetchCustomers(1);
      toast.success("All customer data has been deleted.");
    } finally {
      setDeletingAllCustomers(false);
    }
  }

  const hasSoftphoneProvider = enabledTelephonyProviders.some((provider) =>
    SOFTPHONE_PROVIDER_TYPES.includes(provider.type)
  );
  const canShowDirectCallButton = false;
  const webCallDisabledReason = hasSoftphoneProvider
    ? ""
    : "No AI provider is available for Web Call. Please enable one, or check for other Web Call providers.";

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Loan Enterprise CRM</h1>
          <p className="mt-1 text-sm text-slate-600">Welcome, {user.name} ({user.role})</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {["ADMIN", "SUPER_ADMIN"].includes(user.role) ? (
            <>
              <Link href="/admin/providers">
                <Button variant="secondary">Providers</Button>
              </Link>
            </>
          ) : null}
          <Button variant="secondary" onClick={toggleAiCallPanel}>
            <PhoneCall className="mr-1 h-4 w-4" />
            {showAiCallPanel ? "Close AI Call" : "AI Call"}
          </Button>
          <Button variant="secondary" onClick={() => signOut({ callbackUrl: "/login" })}>
            Logout
          </Button>
        </div>
      </div>

      {activeCall ? (
        <Card>
          <CardHeader>
            <CardTitle>Call Module</CardTitle>
            <CardDescription>
              Live call workflow for {activeCall.customerName || "customer"} ({activeCall.phone || "N/A"})
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-4">
              <p className="text-sm text-slate-700">
                <span className="font-semibold">Provider:</span> {activeCall.provider || "-"}
              </p>
              <p className="text-sm text-slate-700">
                <span className="font-semibold">Status:</span> {activeCall.status || "-"}
              </p>
              <p className="text-sm text-slate-700 md:col-span-2">
                <span className="font-semibold">Next Action:</span> {activeCall.nextAction || "Awaiting call outcome"}
              </p>
            </div>

            {activeCall.summary ? (
              <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <span className="font-semibold">Summary:</span> {activeCall.summary}
              </p>
            ) : null}

            {activeCall.intent ? (
              <p className="mt-2 text-sm text-slate-700">
                <span className="font-semibold">Intent:</span> {activeCall.intent}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  if (activeCall.phone) {
                    window.location.href = `tel:${activeCall.phone}`;
                  }
                }}
              >
                Open Dialer
              </Button>
              <Link href="/calls">
                <Button variant="secondary">Open Call History Page</Button>
              </Link>
              <Button variant="secondary" onClick={() => setActiveCall(null)}>
                Close Module
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showAiCallPanel ? (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>AI Call</CardTitle>
                <CardDescription>
                  Active telephony provider: {activeTelephonyProvider?.name || "-"}
                  {activeTelephonyProvider?.type ? ` (${activeTelephonyProvider.type})` : ""}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Link href="/calls">
                  <Button variant="secondary">Open Call History</Button>
                </Link>
                {activeTelephonyProvider?.type === "TWILIO" ? (
                  <>
                    <Button variant="secondary" onClick={initSoftphone} disabled={softphoneLoading}>
                      {softphoneLoading ? "Initializing..." : softphoneReady ? "Reinitialize Softphone" : "Initialize Softphone"}
                    </Button>
                    {user.role === "SUPER_ADMIN" ? (
                      <Button variant="secondary" onClick={runSoftphoneHealthCheck} disabled={softphoneHealthLoading}>
                        {softphoneHealthLoading ? "Checking Status..." : "Check Status"}
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingActiveTelephony ? (
              <p className="text-sm text-slate-600">Loading active telephony provider...</p>
            ) : null}

            {!loadingActiveTelephony && !activeTelephonyError && !activeTelephonyProvider ? (
              <p className="text-sm text-slate-600">No active telephony provider found.</p>
            ) : null}

            {!loadingActiveTelephony && !activeTelephonyError && activeTelephonyProvider?.type === "TWILIO" ? (
              <>
                <div className="grid gap-3 lg:grid-cols-5">
                  <div className="lg:col-span-2">
                    <Input
                      value={softphoneTo}
                      onChange={(event) => setSoftphoneTo(event.target.value)}
                      placeholder="Destination phone (E.164)"
                    />
                  </div>
                  <p className="flex items-center rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span className="font-semibold">Status:</span>&nbsp;{softphoneStatus}
                  </p>
                  <p className="flex items-center rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700 lg:col-span-2">
                    <span className="font-semibold">Identity:</span>&nbsp;{softphoneIdentity || "Not registered"}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={startBrowserCall} disabled={softphoneInCall || softphoneLoading}>
                    Start Browser Call
                  </Button>
                  <Button variant="secondary" onClick={toggleMuteBrowserCall} disabled={!softphoneInCall}>
                    {softphoneMuted ? "Unmute" : "Mute"}
                  </Button>
                  <Button variant="destructive" onClick={hangupBrowserCall} disabled={!softphoneInCall}>
                    Hang Up
                  </Button>
                </div>

                {softphoneHealth ? (
                  <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-800">
                      Setup Check: {softphoneHealth.ok ? "Ready" : "Action Required"}
                    </p>
                    <div className="mt-2 space-y-1">
                      {softphoneHealth.checks?.map((check) => (
                        <p key={check.name} className="text-xs text-slate-700">
                          <span className="font-semibold">{check.ok ? "✓" : "✕"} {check.name}:</span> {check.message}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {!loadingActiveTelephony && !activeTelephonyError && activeTelephonyProvider && activeTelephonyProvider.type !== "TWILIO" ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                Browser softphone is available only when Twilio is the active telephony provider. Current provider is
                {` ${activeTelephonyProvider.name} (${activeTelephonyProvider.type}). `}
                Use the customer row Call action for AI calls with this provider.
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-gradient-to-b from-white to-slate-50">
          <CardHeader>
            <CardDescription>Total Customers</CardDescription>
            <CardTitle className="text-3xl">{metrics?.totalCustomers ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-gradient-to-b from-white to-slate-50">
          <CardHeader>
            <CardDescription>Interested Leads</CardDescription>
            <CardTitle className="text-3xl">{metrics?.interestedCustomers ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-gradient-to-b from-white to-slate-50">
          <CardHeader>
            <CardDescription>Follow Ups</CardDescription>
            <CardTitle className="text-3xl">{metrics?.followUps ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-gradient-to-b from-white to-slate-50">
          <CardHeader>
            <CardDescription>Total Calls</CardDescription>
            <CardTitle className="text-3xl">{metrics?.totalCalls ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Customers</CardTitle>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Button onClick={startCreateCustomer}>
                <Plus className="mr-1 h-4 w-4" />
                Add Customer
              </Button>
              {user.role === "SUPER_ADMIN" ? (
                <Button variant="destructive" onClick={deleteAllCustomers} disabled={deletingAllCustomers}>
                  {deletingAllCustomers ? "Deleting All..." : "Delete All"}
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              placeholder="Search by name, phone, email"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option value={status} key={status}>
                  {status}
                </option>
              ))}
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Name</TableHead>
                <TableHead className="min-w-[140px]">Phone</TableHead>
                <TableHead className="min-w-[180px]">Loan</TableHead>
                <TableHead className="min-w-[180px]">Status</TableHead>
                <TableHead className="min-w-[340px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingCustomers && (
                <TableRow>
                  <TableCell colSpan={5}>Loading customers...</TableCell>
                </TableRow>
              )}

              {!loadingCustomers && customers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>No customers found.</TableCell>
                </TableRow>
              )}

              {!loadingCustomers &&
                customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      {customer.firstName} {customer.lastName || ""}
                    </TableCell>
                    <TableCell>{customer.phone}</TableCell>
                    <TableCell>
                      {customer.loanType || "N/A"}
                      {customer.loanAmount ? ` • ₹${customer.loanAmount}` : ""}
                    </TableCell>
                    <TableCell>
                      <Select
                        className={`h-8 w-full max-w-none font-medium sm:max-w-[180px] ${STATUS_SELECT_CLASS[customer.status] || STATUS_SELECT_CLASS.NEW}`}
                        value={customer.status}
                        onChange={(event) => updateStatus(customer.id, event.target.value)}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="grid min-w-[220px] grid-cols-2 gap-2 sm:flex sm:min-w-[320px] sm:flex-wrap sm:justify-start">
                        {canShowDirectCallButton ? (
                          <Button
                            className="h-8 w-full justify-center px-2 sm:w-auto sm:px-3"
                            variant="secondary"
                            onClick={() => triggerCall(customer)}
                            disabled={busyCallId === customer.id}
                            aria-label={busyCallId === customer.id ? "Calling" : "Call"}
                            title={busyCallId === customer.id ? "Calling" : "Call"}
                          >
                            <Phone className="h-3.5 w-3.5 sm:mr-1" />
                            <span className="hidden sm:inline">{busyCallId === customer.id ? "Calling..." : "Call"}</span>
                          </Button>
                        ) : null}
                        <span className="block w-full sm:w-auto" title={webCallDisabledReason || "Web Call"}>
                          <Button
                            className="h-8 w-full justify-center px-2 sm:w-auto sm:px-3"
                            variant="secondary"
                            onClick={() => setSoftphoneTarget(customer)}
                            aria-label="Web Call"
                            title={webCallDisabledReason || "Web Call"}
                            disabled={!hasSoftphoneProvider}
                          >
                            <PhoneCall className="h-3.5 w-3.5 sm:mr-1" />
                            <span className="hidden sm:inline">Web Call</span>
                          </Button>
                        </span>
                        <Button
                          className="h-8 w-full justify-center px-2 sm:w-auto sm:px-3"
                          variant="secondary"
                          onClick={() => startEditCustomer(customer)}
                          aria-label="Edit"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5 sm:mr-1" />
                          <span className="hidden sm:inline">Edit</span>
                        </Button>
                        <Button
                          className="h-8 w-full justify-center px-2 sm:w-auto sm:px-3"
                          variant="destructive"
                          onClick={() => deleteCustomer(customer)}
                          disabled={deletingCustomerId === customer.id}
                          aria-label={deletingCustomerId === customer.id ? "Deleting" : "Delete"}
                          title={deletingCustomerId === customer.id ? "Deleting" : "Delete"}
                        >
                          <Trash2 className="h-3.5 w-3.5 sm:mr-1" />
                          <span className="hidden sm:inline">{deletingCustomerId === customer.id ? "Deleting..." : "Delete"}</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} records)
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => fetchCustomers(pagination.page - 1)}
                disabled={loadingCustomers || pagination.page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                onClick={() => fetchCustomers(pagination.page + 1)}
                disabled={loadingCustomers || pagination.page >= pagination.totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {showAddCustomerModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-4xl rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingCustomerId ? "Edit Customer" : "Add Customer"}
              </h3>
              <div className="flex flex-wrap gap-2">
                {!editingCustomerId ? (
                  <>
                    <Button
                      variant={creationMode === "manual" ? "default" : "secondary"}
                      onClick={() => setCreationMode("manual")}
                    >
                      Manual Entry
                    </Button>
                    <Button
                      variant={creationMode === "upload" ? "default" : "secondary"}
                      onClick={() => setCreationMode("upload")}
                    >
                      Excel Upload
                    </Button>
                  </>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowAddCustomerModal(false);
                    if (!editingCustomerId) {
                      resetCustomerForm();
                    }
                  }}
                >
                  Close
                </Button>
              </div>
            </div>

            {creationMode === "upload" && !editingCustomerId ? (
              <div>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-600">
                    Download sample Excel file, fill in your customer data, and upload it. Accepted formats: .xlsx, .xls, .csv.
                  </p>
                  <Link href="/samples/sample.xlsx" target="_blank" rel="noopener noreferrer">
                    <Button variant="secondary" className="w-fit">Download (sample.xlsx)</Button>
                  </Link>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <Upload className="h-4 w-4" />
                  {uploading ? "Uploading..." : "Select Excel File"}
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={onUpload}
                    disabled={uploading}
                  />
                </label>
              </div>
            ) : (
              <div>
                <div className="grid gap-3 md:grid-cols-4">
                  <Input
                    placeholder="First Name"
                    value={customerForm.firstName}
                    onChange={(event) => handleFormChange("firstName", event.target.value)}
                  />
                  <Input
                    placeholder="Last Name"
                    value={customerForm.lastName}
                    onChange={(event) => handleFormChange("lastName", event.target.value)}
                  />
                  <Input
                    placeholder="Phone"
                    value={customerForm.phone}
                    onChange={(event) => handleFormChange("phone", event.target.value)}
                  />
                  <Input
                    placeholder="Email"
                    value={customerForm.email}
                    onChange={(event) => handleFormChange("email", event.target.value)}
                  />
                  <Input
                    placeholder="City"
                    value={customerForm.city}
                    onChange={(event) => handleFormChange("city", event.target.value)}
                  />
                  <Input
                    placeholder="State"
                    value={customerForm.state}
                    onChange={(event) => handleFormChange("state", event.target.value)}
                  />
                  <Input
                    placeholder="Loan Type"
                    value={customerForm.loanType}
                    onChange={(event) => handleFormChange("loanType", event.target.value)}
                  />
                  <Select
                    value={customerForm.status}
                    onChange={(event) => handleFormChange("status", event.target.value)}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </Select>
                  <Input
                    placeholder="Loan Amount"
                    value={customerForm.loanAmount}
                    onChange={(event) => handleFormChange("loanAmount", event.target.value)}
                  />
                  <Input
                    placeholder="Monthly Income"
                    value={customerForm.monthlyIncome}
                    onChange={(event) => handleFormChange("monthlyIncome", event.target.value)}
                  />
                  <Input
                    placeholder="Source"
                    value={customerForm.source}
                    onChange={(event) => handleFormChange("source", event.target.value)}
                  />
                  <Input
                    placeholder="Notes"
                    value={customerForm.notes}
                    onChange={(event) => handleFormChange("notes", event.target.value)}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={saveCustomer} disabled={savingCustomer}>
                    {savingCustomer ? "Saving..." : editingCustomerId ? "Update Customer" : "Create Customer"}
                  </Button>
                  <Button variant="secondary" onClick={resetCustomerForm}>
                    Clear
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}