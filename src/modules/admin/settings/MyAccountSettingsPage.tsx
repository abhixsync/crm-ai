"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/loader";

export function MyAccountSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  useEffect(() => {
    void fetchMyAccount();
  }, []);

  async function fetchMyAccount() {
    try {
      const response = await fetch("/api/admin/settings/my-account", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load account settings.");
      }

      const nextEmail = String(data.user?.email || "").trim();
      setEmail(nextEmail);
    } catch (error: any) {
      toast.error(error?.message || "Unable to load account settings.");
    } finally {
      setLoading(false);
    }
  }

  function resetPasswordFields() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
  }

  async function savePassword() {
    const trimmedCurrentPassword = String(currentPassword || "").trim();
    const trimmedNewPassword = String(newPassword || "");
    const trimmedConfirmPassword = String(confirmNewPassword || "");

    if (!trimmedCurrentPassword && !trimmedNewPassword && !trimmedConfirmPassword) {
      toast.info("Enter password details to continue.");
      return;
    }

    if (!trimmedCurrentPassword) {
      toast.error("Current password is required.");
      return;
    }

    if (!trimmedNewPassword) {
      toast.error("New password is required.");
      return;
    }

    if (trimmedNewPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }

    if (trimmedNewPassword !== trimmedConfirmPassword) {
      toast.error("New password and confirm password must match.");
      return;
    }

    if (trimmedCurrentPassword === trimmedNewPassword) {
      toast.error("New password must be different from current password.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/admin/settings/my-account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: trimmedCurrentPassword,
          newPassword: trimmedNewPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to update account settings.");
      }

      const updatedEmail = String(data.user?.email || email).trim();
      setEmail(updatedEmail);
      resetPasswordFields();

      toast.success("Password changed successfully.");
    } catch (error: any) {
      toast.error(error?.message || "Unable to update account settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <PageLoader label="Loading my profile..." />;
  }

  return (
    <div className="my-account-settings-root space-y-4">
      <Card className="my-account-settings-card">
        <CardHeader>
          <CardTitle>My Profile</CardTitle>
          <CardDescription>Your account email is shown below.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              Email
            </label>
            <Input
              type="email"
              value={email}
              readOnly
              disabled
            />
          </div>
        </CardContent>
      </Card>

      <Card className="my-account-password-card">
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Enter your current password, then choose and confirm your new password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              Current Password
            </label>
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Current password"
              disabled={saving}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                New Password
              </label>
              <Input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="New password"
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Re-type New Password
              </label>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                placeholder="Re-type new password"
                disabled={saving}
              />
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Use at least 6 characters and avoid reusing your current password.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={savePassword}
              loading={saving}
              loadingText="Saving password..."
              className="w-full sm:w-auto"
            >
              Save Changes
            </Button>
            <Button
              variant="secondary"
              onClick={resetPasswordFields}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
