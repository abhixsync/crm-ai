"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";

export function LoanAssistantAdmin() {
  const { data: session } = useSession();
  const [companyName, setCompanyName] = useState("");
  const [callbackPhone, setCallbackPhone] = useState("");
  const [aiAgentName, setAiAgentName] = useState("Priya");
  const [tenantName, setTenantName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tenantId, setTenantId] = useState(null);

  // Load settings on mount
  useEffect(() => {
    if (session?.user) {
      loadSettings();
    }
  }, [session?.user]);

  const loadSettings = async () => {
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
        setAiAgentName(data.data.aiAgentName || "Priya");
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
  };

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
          loanAssistantCallbackPhone: callbackPhone || null,
          aiAgentName: aiAgentName || "Priya",
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(data.error || "Failed to save settings");
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      setError("Failed to save settings: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

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

      {/* Loading State */}
      {isLoading && (
        <Card>
          <CardHeader>
            <CardTitle>Loan Assistant Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-slate-600">Loading settings...</div>
          </CardContent>
        </Card>
      )}

      {/* Configuration Card */}
      {!isLoading && (
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
                Customers will hear this number in the closing message to call your team back.
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
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                ✓ Hinglish (Hindi + English mix)
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
              {saved && <span className="text-sm text-green-600">✓ Saved!</span>}
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Integration Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Integration & API</CardTitle>
          <CardDescription>Technical details for developers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <div>
              <div className="font-semibold text-slate-900">API Endpoint</div>
              <code className="block rounded bg-slate-100 p-2 text-slate-700">
                POST /api/loan-assistant/conversation
              </code>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Status</div>
              <div className="text-slate-600">✓ Active and ready to use</div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Documentation</div>
              <Link
                href="/docs/LOAN_ASSISTANT_SETUP.md"
                className="text-blue-600 hover:underline"
              >
                View Full Documentation →
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
