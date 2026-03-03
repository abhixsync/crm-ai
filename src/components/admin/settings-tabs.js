"use client";

import React, { useState } from "react";
import { AccountSettingsPage } from "@/modules/admin/settings/AccountSettingsPage";
import { ThemeSettingsPage } from "@/modules/admin/theme/ThemeSettingsPage";

export function SettingsTabs() {
  const [activeTab, setActiveTab] = useState("account");

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-8">
      <div className="w-full flex-shrink-0 lg:w-64">
        <nav className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
          <button
            onClick={() => setActiveTab("account")}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium lg:w-full lg:text-left ${
              activeTab === "account"
                ? "bg-muted text-foreground border-b-2 border-primary lg:border-b-0 lg:border-r-2"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            Account Settings
          </button>
          <button
            onClick={() => setActiveTab("theme")}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium lg:w-full lg:text-left ${
              activeTab === "theme"
                ? "bg-muted text-foreground border-b-2 border-primary lg:border-b-0 lg:border-r-2"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            Theme Settings
          </button>
        </nav>
      </div>

      <div className="min-w-0 flex-1">
        {activeTab === "account" && <AccountSettingsPage />}
        {activeTab === "theme" && <ThemeSettingsPage />}
      </div>
    </div>
  );
}