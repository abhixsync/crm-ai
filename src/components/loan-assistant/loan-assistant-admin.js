"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/loader";
import Link from "next/link";

export function LoanAssistantAdmin() {
  const { data: session } = useSession();
  const [companyName, setCompanyName] = useState("");
  const [callbackPhone, setCallbackPhone] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [aiAgentName, setAiAgentName] = useState("Priya");
  const [humanAdvisorName, setHumanAdvisorName] = useState("John Doe");
  const [language, setLanguage] = useState("hinglish");
  const [tenantName, setTenantName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tenantId, setTenantId] = useState(null);

  const loadSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get tenant ID from session - for super admin, get from API
      let finalTenantId = session?.user?.tenantId;

      // For super admins (tenantId is null), fetch the super admin tenant
      if (!finalTenantId) {
        const tenantResponse = await fetch('/api/tenant/super-admin-tenant', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const tenantData = await tenantResponse.json();

        if (tenantData.success && tenantData.data?.id) {
          finalTenantId = tenantData.data.id;
        } else {
          setError("Super admin tenant not found. Please contact administrator.");
          setIsLoading(false);
          return;
        }
      }

      setTenantId(finalTenantId);

      const response = await fetch('/api/tenant/loan-assistant-settings', {
        method: 'GET',
        headers: {
          'X-Tenant-ID': finalTenantId,
        },
      });

      const data = await response.json();

      if (data.success && data.data) {
        setCompanyName(data.data.loanAssistantCompanyName || "");
        setCallbackPhone(data.data.loanAssistantCallbackPhone || "");
        setNotificationEmail(data.data.loanAssistantNotificationEmail || "");
        setAiAgentName(data.data.aiAgentName || "Priya");
        setHumanAdvisorName(data.data.loanAssistantHumanAdvisorName || "John Doe");
        setLanguage(data.data.loanAssistantLanguage || "hinglish");
        setTenantName(data.data.tenantName);
      } else {
        setError(data.error || "Failed to load settings");
      }
    } catch (err) {
      console.error('Error loading settings:', err);
      setError("Failed to load settings: " + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.tenantId]);

  // Load settings on mount
  useEffect(() => {
    if (session?.user) {
      loadSettings();
    }
  }, [session?.user, loadSettings]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);

      const response = await fetch('/api/tenant/loan-assistant-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId,
        },
        body: JSON.stringify({
          loanAssistantCompanyName: companyName || null,
          loanAssistantHumanAdvisorName: humanAdvisorName || "John Doe",
          loanAssistantCallbackPhone: callbackPhone || null,
          loanAssistantNotificationEmail: notificationEmail || null,
          aiAgentName: aiAgentName || "Priya",
          loanAssistantLanguage: language,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const savedName = String(data?.data?.loanAssistantHumanAdvisorName || humanAdvisorName || "").trim() || "John Doe";
        setHumanAdvisorName(savedName);
        toast.success(`Loan Assistant settings saved. Advisor: ${savedName}`);
      } else {
        setError(data.error || "Failed to save settings");
        toast.error(data.error || "Failed to save settings");
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      setError("Failed to save settings: " + err.message);
      toast.error("Failed to save settings: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <PageLoader label="Loading loan assistant settings..." />;
  }

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="text-sm text-red-700">{error}</div>
          </CardContent>
        </Card>
      )}

      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>Loan Assistant Settings</CardTitle>
          <CardDescription>
            Configure the AI loan calling assistant for your organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="company-name" className="text-sm font-medium text-slate-700">
                Loan Assistant Company Name
              </label>
              <Input
                id="company-name"
                placeholder={`Leave empty to use: ${tenantName}`}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                💡 The name the AI will mention when calling customers.
                {companyName ? (
                  <span className="block text-blue-600 mt-1">
                    Will use: <strong>{companyName}</strong>
                  </span>
                ) : (
                  <span className="block text-slate-600 mt-1">
                    If empty, will fallback to: <strong>{tenantName}</strong>
                  </span>
                )}
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="ai-agent-name" className="text-sm font-medium text-slate-700">
                AI Agent Name
              </label>
              <Input
                id="ai-agent-name"
                placeholder="e.g., Priya"
                value={aiAgentName}
                onChange={(e) => setAiAgentName(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                The name of the AI agent customers will interact with.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="callback-phone" className="text-sm font-medium text-slate-700">
                Callback Phone Number
              </label>
              <Input
                id="callback-phone"
                placeholder="e.g., +91-XXXXXXXXXX"
                value={callbackPhone}
                onChange={(e) => setCallbackPhone(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                Will be used as the callback number for customers and for WhatsApp notifications to your team.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="notification-email" className="text-sm font-medium text-slate-700">
                Notification Email
              </label>
              <Input
                id="notification-email"
                type="email"
                placeholder="e.g., advisor@yourcompany.com"
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                Interested customer details and important loan assistant emails will be sent to this address.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="human-advisor-name" className="text-sm font-medium text-slate-700">
                Human Advisor Name
              </label>
              <Input
                id="human-advisor-name"
                placeholder="e.g., John Doe"
                value={humanAdvisorName}
                onChange={(e) => setHumanAdvisorName(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                This name is used in the final handoff line for interested customers.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Default Loan Types</p>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                ✓ Personal Loan
                <br />✓ Home Loan
                <br />✓ Business Loan
                <br />✓ Auto Loan
                <br />✓ Education Loan
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Supported Languages</p>
              <div className="space-y-2">
                {[
                  { value: "english", label: "English", desc: "Pure English responses" },
                  { value: "hindi", label: "Hindi", desc: "Hindi (Roman script) with common English loan terms" },
                  { value: "hinglish", label: "Hinglish (Hindi Heavy + English)", desc: "Natural Hindi-English mix — default" },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      language === opt.value
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="loanAssistantLanguage"
                      value={opt.value}
                      checked={language === opt.value}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium text-slate-800">{opt.label}</span>
                      <p className="text-xs text-slate-500">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                This controls the LANGUAGE RULES in the AI system prompt. The AI will respond in the selected language style.
              </p>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} loading={isSaving} loadingText="Saving settings..." disabled={!tenantId}>
                Save Changes
              </Button>
            </div>
        </CardContent>
      </Card>

      {/* Quick Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks for managing the loan assistant</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Link href="/llm-loan-assistant-demo">
            <Button variant="outline" className="w-full">
              → Test Call Demo
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={() => alert("Analytics coming soon!")}
          >
            → View Call Analytics
          </Button>
          <Button
            variant="outline"
            onClick={() => alert("Pitch customization coming soon!")}
          >
            → Customize Pitches
          </Button>
          <Button
            variant="outline"
            onClick={() => alert("Lead export coming soon!")}
          >
            → Export Leads
          </Button>
        </CardContent>
      </Card>

    </div>
  );
}
