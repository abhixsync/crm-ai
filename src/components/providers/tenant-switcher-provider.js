"use client";

import { createContext, useContext, useMemo } from "react";
import { useSession } from "next-auth/react";

const TenantSwitcherContext = createContext({
  selectedTenantId: null,
  selectedTenantName: "",
  tenants: [],
  switchTenant: () => {},
  loading: false,
  isSuperAdmin: false,
});

export function TenantSwitcherProvider({ children }) {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";
  const sessionTenantId = session?.user?.tenantId || null;

  const value = useMemo(() => ({
    selectedTenantId: sessionTenantId,
    selectedTenantName: "",
    tenants: [],
    switchTenant: () => {},
    loading: false,
    isSuperAdmin,
  }), [isSuperAdmin, sessionTenantId]);

  return (
    <TenantSwitcherContext.Provider value={value}>
      {children}
    </TenantSwitcherContext.Provider>
  );
}

export function useTenantSwitcher() {
  return useContext(TenantSwitcherContext);
}
