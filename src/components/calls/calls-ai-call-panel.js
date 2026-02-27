"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const TERMINAL_CALL_STATUSES = ["COMPLETED", "FAILED", "NO_ANSWER"];
const NEW_NUMBER_OPTION = "__new_number__";

export function CallsAiCallPanel({ customers, role }) {
  const searchParams = useSearchParams();
  const openFromMenu = searchParams.get("aiCall") === "1";
  const [customerId, setCustomerId] = useState(customers[0]?.id || NEW_NUMBER_OPTION);
  const [completingManualCall, setCompletingManualCall] = useState(false);
  const [softphoneStatus, setSoftphoneStatus] = useState("Not initialized");
  const [softphoneReady, setSoftphoneReady] = useState(false);
  const [softphoneLoading, setSoftphoneLoading] = useState(false);
  const [softphoneError, setSoftphoneError] = useState("");
  const [softphoneInCall, setSoftphoneInCall] = useState(false);
  const [softphoneMuted, setSoftphoneMuted] = useState(false);
  const [softphoneTo, setSoftphoneTo] = useState("");
  const [manualDisposition, setManualDisposition] = useState("follow_up");
  const [manualCallContext, setManualCallContext] = useState(null);
  const [activeTelephonyProvider, setActiveTelephonyProvider] = useState(null);
  const [loadingActiveTelephony, setLoadingActiveTelephony] = useState(false);
  const deviceRef = useRef(null);
  const connectionRef = useRef(null);
  const newNumberInputRef = useRef(null);

  const canTrigger = role === "ADMIN" || role === "SALES" || role === "SUPER_ADMIN";

  const selectedCustomer = useMemo(
    () => (customerId === NEW_NUMBER_OPTION ? null : customers.find((customer) => customer.id === customerId) || null),
    [customers, customerId]
  );
  const isNewNumberMode = customerId === NEW_NUMBER_OPTION;

  useEffect(() => {
    if (isNewNumberMode) {
      newNumberInputRef.current?.focus();
    }
  }, [isNewNumberMode]);

  const fetchSoftphoneToken = useCallback(async () => {
    const response = await fetch("/api/twilio/voice/token");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to fetch softphone token");
    }

    return data;
  }, []);

  const initSoftphone = useCallback(async () => {
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
        const baseMessage = error?.message || "Softphone error";
        setSoftphoneError(baseMessage);
        toast.error(baseMessage);
        setSoftphoneStatus("Error");
      });

      device.on("tokenWillExpire", async () => {
        try {
          const refreshed = await fetchSoftphoneToken();
          device.updateToken(refreshed.token);
        } catch {
          setSoftphoneError("Failed to refresh softphone token.");
        }
      });

      await device.register();
    } catch (error) {
      const message = error?.message || "Unable to initialize softphone";
      setSoftphoneError(message);
      setSoftphoneStatus("Failed");
      setSoftphoneReady(false);
    } finally {
      setSoftphoneLoading(false);
    }
  }, [fetchSoftphoneToken]);

  const attachConnectionListeners = useCallback((connection) => {
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
  }, []);

  const initializeSoftphoneOnLoad = useCallback(async () => {
    try {
      setLoadingActiveTelephony(true);
      setSoftphoneStatus("Checking provider...");
      setSoftphoneError("");

      const activeProviderResponse = await fetch("/api/telephony/active");
      const activeProviderData = await activeProviderResponse.json();

      if (!activeProviderResponse.ok) {
        throw new Error(activeProviderData.error || "Unable to load active telephony provider.");
      }

      const activeProvider = activeProviderData.provider;
      setActiveTelephonyProvider(activeProvider || null);
      if (!activeProvider || activeProvider.type !== "TWILIO") {
        setSoftphoneReady(false);
        setSoftphoneStatus("Softphone unavailable (active provider is not Twilio)");
        return;
      }

      await initSoftphone();
    } catch (error) {
      const message = error?.message || "Unable to initialize softphone.";
      setSoftphoneError(message);
      setSoftphoneStatus("Failed");
    } finally {
      setLoadingActiveTelephony(false);
    }
  }, [initSoftphone]);

  useEffect(() => {
    initializeSoftphoneOnLoad();

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
  }, [initializeSoftphoneOnLoad]);

  async function startBrowserCall() {
    const targetPhone = isNewNumberMode ? String(softphoneTo || "").trim() : selectedCustomer?.phone;
    if (!targetPhone) {
      const message = isNewNumberMode
        ? "Enter a destination phone number."
        : "Selected customer does not have a valid phone number.";
      setSoftphoneError(message);
      toast.error(message);
      return;
    }

    setSoftphoneTo(targetPhone);

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
      let activeContext = manualCallContext;

      if (!isNewNumberMode && (!activeContext || activeContext.customerId !== selectedCustomer.id || !activeContext.callLogId)) {
        const startResponse = await fetch("/api/calls/manual/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId: selectedCustomer.id }),
        });

        const startData = await startResponse.json();

        if (!startResponse.ok) {
          throw new Error(startData.error || "Unable to start manual call session.");
        }

        activeContext = {
          customerId: selectedCustomer.id,
          callLogId: startData.callLog?.id || null,
        };
        setManualCallContext(activeContext);
      } else if (isNewNumberMode) {
        setManualCallContext(null);
      }

      const connection = await deviceRef.current.connect({
        params: {
          To: targetPhone,
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

  async function hangupBrowserCall() {
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

    if (manualCallContext?.customerId && manualCallContext?.callLogId) {
      setCompletingManualCall(true);

      try {
        const response = await fetch("/api/calls/manual/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: manualCallContext.customerId,
            callLogId: manualCallContext.callLogId,
            disposition: manualDisposition,
            summary: `Manual web call completed with disposition: ${manualDisposition}`,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to persist manual call outcome.");
        }

        toast.success("Manual call outcome saved.");
      } catch (error) {
        toast.error(error?.message || "Unable to persist manual call outcome.");
      } finally {
        setCompletingManualCall(false);
      }

      setManualCallContext(null);
    }
  }

  function toggleMuteBrowserCall() {
    if (!connectionRef.current) {
      return;
    }

    const nextMuted = !softphoneMuted;
    connectionRef.current.mute(nextMuted);
    setSoftphoneMuted(nextMuted);
  }

  return (
    <Card className={openFromMenu ? "ring-2 ring-blue-300" : ""}>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>AI Call</CardTitle>
            <CardDescription>
              Start an AI call from this page and track outcomes in the history table below.
            </CardDescription>
          </div>
          <Button
            variant="secondary"
            onClick={initSoftphone}
            disabled={softphoneLoading}
          >
            {softphoneLoading ? "Initializing..." : "Reinitialize Softphone"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {customers.length === 0 ? (
          <p className="text-sm text-slate-600">No customers available for AI call yet.</p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Select customer / number</span>
                <select
                  className="h-9 w-full rounded-md border border-slate-300/90 bg-white px-3 text-sm text-slate-900"
                  value={customerId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setCustomerId(nextId);

                    if (nextId === NEW_NUMBER_OPTION) {
                      setManualCallContext(null);
                      return;
                    }

                    const nextCustomer = customers.find((customer) => customer.id === nextId);
                    setSoftphoneTo(nextCustomer?.phone || "");
                    setManualCallContext(null);
                  }}
                >
                  <option value={NEW_NUMBER_OPTION}>New Number</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} ({customer.phone || "No phone"})
                    </option>
                  ))}
                </select>
              </label>

              {isNewNumberMode ? (
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">New Number</span>
                  <Input
                    ref={newNumberInputRef}
                    value={softphoneTo}
                    onChange={(event) => setSoftphoneTo(event.target.value)}
                    placeholder="Destination phone (E.164)"
                  />
                </label>
              ) : null}
            </div>

            {selectedCustomer ? (
              <p className="text-xs text-slate-600">
                Selected: {selectedCustomer.name} • Status: {selectedCustomer.status}
              </p>
            ) : null}

            {!loadingActiveTelephony && activeTelephonyProvider?.type === "TWILIO" ? (
              <>
                {manualCallContext?.customerId ? (
                  <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-center">
                    <p className="text-sm text-slate-700">
                      Manual call disposition for <span className="font-semibold">{selectedCustomer?.name || "selected customer"}</span>
                    </p>
                    <Select value={manualDisposition} onChange={(event) => setManualDisposition(event.target.value)}>
                      <option value="interested">Interested</option>
                      <option value="not_interested">Not Interested</option>
                      <option value="follow_up">Follow Up</option>
                      <option value="converted">Converted</option>
                      <option value="do_not_call">Do Not Call</option>
                    </Select>
                    <span className="text-xs text-slate-600">
                      {completingManualCall ? "Saving outcome..." : "Outcome is saved when call ends."}
                    </span>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={startBrowserCall} disabled={!canTrigger || softphoneInCall || softphoneLoading || (!isNewNumberMode && !selectedCustomer?.phone) || (isNewNumberMode && !String(softphoneTo || "").trim())}>
                    <PhoneCall className="mr-1 h-4 w-4" />
                    Start AI Call
                  </Button>
                  <Button variant="secondary" onClick={toggleMuteBrowserCall} disabled={!softphoneInCall}>
                    {softphoneMuted ? "Unmute" : "Mute"}
                  </Button>
                  <Button variant="destructive" onClick={hangupBrowserCall} disabled={!softphoneInCall}>
                    Hang Up
                  </Button>
                </div>
              </>
            ) : null}

            {!loadingActiveTelephony && activeTelephonyProvider && activeTelephonyProvider.type !== "TWILIO" ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                Browser softphone is available only when Twilio is the active telephony provider. Current provider is
                {` ${activeTelephonyProvider.name} (${activeTelephonyProvider.type}).`}
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              {!canTrigger ? (
                <span className="text-xs text-amber-700">
                  Your role cannot trigger calls directly.
                </span>
              ) : null}
            </div>

            <p className="text-xs text-slate-600">
              Softphone status: {softphoneStatus}{softphoneReady ? " (ready)" : ""}
            </p>
            {softphoneError ? <p className="text-xs text-rose-700">{softphoneError}</p> : null}

          </>
        )}
      </CardContent>
    </Card>
  );
}
