"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AccountSettingsPage } from "@/modules/admin/settings/AccountSettingsPage";
import { MyAccountSettingsPage } from "@/modules/admin/settings/MyAccountSettingsPage";
import { ThemeSettingsPage } from "@/modules/admin/theme/ThemeSettingsPage";
import { LoanAssistantAdmin } from "@/components/loan-assistant/loan-assistant-admin";

const TAB_TO_TYPE = {
  "my-profile": "profile",
  account: "account",
  theme: "theme",
  "loan-assistant": "loan",
};

const TYPE_TO_TAB = {
  profile: "my-profile",
  "my-profile": "my-profile",
  "my-account": "my-profile",
  account: "account",
  theme: "theme",
  loan: "loan-assistant",
  "loan-assistant": "loan-assistant",
};

function resolveTabFromTypeParam(typeParam) {
  const normalizedType = String(typeParam || "").trim().toLowerCase();
  return TYPE_TO_TAB[normalizedType] || "account";
}

function resolveTypeFromTab(tabKey) {
  return TAB_TO_TYPE[tabKey] || "account";
}

export function SettingsTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const queryString = searchParams.toString();
  const activeTab = resolveTabFromTypeParam(typeParam);

  useEffect(() => {
    const canonicalType = resolveTypeFromTab(activeTab);
    const normalizedType = String(typeParam || "").trim().toLowerCase();

    if (normalizedType === canonicalType) {
      return;
    }

    const nextParams = new URLSearchParams(queryString);
    nextParams.set("type", canonicalType);
    router.replace(`${pathname}?${nextParams.toString()}`);
  }, [activeTab, typeParam, queryString, pathname, router]);

  function openTab(tabKey) {
    const nextType = resolveTypeFromTab(tabKey);
    const normalizedType = String(typeParam || "").trim().toLowerCase();

    if (normalizedType === nextType) {
      return;
    }

    const nextParams = new URLSearchParams(queryString);
    nextParams.set("type", nextType);
    router.push(`${pathname}?${nextParams.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-8">
      <div className="w-full flex-shrink-0 lg:w-64">
        <nav className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
          <button
            onClick={() => openTab("my-profile")}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium lg:w-full lg:text-left ${
              activeTab === "my-profile"
                ? "bg-muted text-foreground border-b-2 border-primary lg:border-b-0 lg:border-r-2"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            My Profile
          </button>
          <button
            onClick={() => openTab("account")}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium lg:w-full lg:text-left ${
              activeTab === "account"
                ? "bg-muted text-foreground border-b-2 border-primary lg:border-b-0 lg:border-r-2"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            Account Settings
          </button>
          <button
            onClick={() => openTab("theme")}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium lg:w-full lg:text-left ${
              activeTab === "theme"
                ? "bg-muted text-foreground border-b-2 border-primary lg:border-b-0 lg:border-r-2"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            Theme Settings
          </button>
          <button
            onClick={() => openTab("loan-assistant")}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium lg:w-full lg:text-left ${
              activeTab === "loan-assistant"
                ? "bg-muted text-foreground border-b-2 border-primary lg:border-b-0 lg:border-r-2"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            Loan Assistant
          </button>
        </nav>
      </div>

      <div className="min-w-0 flex-1">
        {activeTab === "my-profile" && <MyAccountSettingsPage />}
        {activeTab === "account" && <AccountSettingsPage />}
        {activeTab === "theme" && <ThemeSettingsPage />}
        {activeTab === "loan-assistant" && <LoanAssistantAdmin />}
      </div>
    </div>
  );
}