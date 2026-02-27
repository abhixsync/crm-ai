"use client";

import React, { useState } from "react";
import { AccountSettingsPage } from "@/modules/admin/settings/AccountSettingsPage";
import { ThemeSettingsPage } from "@/modules/admin/theme/ThemeSettingsPage";

export function SettingsTabs() {
  const [activeTab, setActiveTab] = useState("account");

  return (
    <div className="flex gap-8">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0">
        <nav className="space-y-1">
          <button
            onClick={() => setActiveTab("account")}
            className={`w-full text-left px-3 py-2 text-sm font-medium rounded-md ${
              activeTab === "account"
                ? "bg-slate-100 text-slate-900 border-r-2 border-slate-500"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            Account Settings
          </button>
          <button
            onClick={() => setActiveTab("theme")}
            className={`w-full text-left px-3 py-2 text-sm font-medium rounded-md ${
              activeTab === "theme"
                ? "bg-slate-100 text-slate-900 border-r-2 border-slate-500"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            Theme Settings
          </button>
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {activeTab === "account" && <AccountSettingsPage />}
        {activeTab === "theme" && <ThemeSettingsPage />}
      </div>
    </div>
  );
}