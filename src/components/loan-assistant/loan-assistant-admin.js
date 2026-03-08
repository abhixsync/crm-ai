"use client";

import { useState } from "react";
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
  const [companyName, setCompanyName] = useState("XYZ Finance");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate save - in production, would call an API
    await new Promise((resolve) => setTimeout(resolve, 500));
    setSaved(true);
    setIsSaving(false);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
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
            <label htmlFor="company-name" className="text-sm font-medium text-slate-700">Company Name</label>
            <Input
              id="company-name"
              placeholder="e.g., XYZ Finance"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              description="The name the AI will mention when calling customers"
            />
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

      {/* Quick Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks for managing the loan assistant</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Link href="/loan-assistant-demo">
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
