"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const TenantSwitcherContext = createContext({
  selectedTenantId: null,
  selectedTenantName: "",
  tenants: [],
  switchTenant: () => {},
  loading: false,
  isSuperAdmin: false,
});

const STORAGE_KEY = "ms-selected-tenant";

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function writeStored(id, name) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, name }));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// ── Module-level fetch interceptor ──────────────────────────
// Installed once at import time so it's ready before any React render/effect.
// Reads a mutable _activeTenantId that the React component keeps in sync.
let _activeTenantId = null;

if (typeof window !== "undefined") {
  // Seed from localStorage immediately (sync) so first fetches get the header
  try {
    const stored = readStored();
    if (stored?.id) _activeTenantId = stored.id;
  } catch {}

  const _originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    if (_activeTenantId && url.startsWith("/api/")) {
      init = init || {};
      const headers = new Headers(init.headers || {});
      if (!headers.has("X-Tenant-ID")) {
        headers.set("X-Tenant-ID", _activeTenantId);
      }
      init.headers = headers;
    }
    return _originalFetch.call(this, input, init);
  };
}

export function TenantSwitcherProvider({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";
  const sessionTenantId = session?.user?.tenantId || null;

  // For non-super-admin, just use session tenantId
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);

  // Init selected tenant from localStorage synchronously to avoid flash
  const [selected, setSelected] = useState(() => {
    if (typeof window === "undefined") return { id: null, name: "" };
    const stored = readStored();
    return stored || { id: null, name: "" };
  });

  // Keep module-level interceptor in sync with React state
  useEffect(() => {
    _activeTenantId = isSuperAdmin && !sessionTenantId ? selected.id : null;
    return () => { _activeTenantId = null; };
  }, [isSuperAdmin, sessionTenantId, selected.id]);

  // Fetch tenant list for super admin
  useEffect(() => {
    if (status === "loading" || !isSuperAdmin) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/admin/tenants")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled || !data?.tenants) return;
        const list = data.tenants.map((t) => ({ id: t.id, name: t.name, slug: t.slug }));
        setTenants(list);
        // If stored selection is no longer valid, pick first tenant
        if (list.length > 0) {
          const stored = readStored();
          const valid = stored && list.some((t) => t.id === stored.id);
          if (!valid) {
            setSelected({ id: list[0].id, name: list[0].name });
            writeStored(list[0].id, list[0].name);
          }
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [status, isSuperAdmin]);

  const switchTenant = useCallback((tenantId) => {
    const tenant = tenants.find((t) => t.id === tenantId);
    if (!tenant) return;
    setSelected({ id: tenant.id, name: tenant.name });
    writeStored(tenant.id, tenant.name);
    _activeTenantId = tenant.id; // sync update before refresh triggers fetches
    router.refresh();
  }, [tenants, router]);

  const value = useMemo(() => {
    if (!isSuperAdmin) {
      // Non-super-admin: passthrough session tenantId
      return {
        selectedTenantId: sessionTenantId,
        selectedTenantName: "",
        tenants: [],
        switchTenant: () => {},
        loading: false,
        isSuperAdmin: false,
      };
    }
    return {
      selectedTenantId: selected.id,
      selectedTenantName: selected.name,
      tenants,
      switchTenant,
      loading,
      isSuperAdmin: true,
    };
  }, [isSuperAdmin, sessionTenantId, selected, tenants, switchTenant, loading]);

  return (
    <TenantSwitcherContext.Provider value={value}>
      {children}
    </TenantSwitcherContext.Provider>
  );
}

export function useTenantSwitcher() {
  return useContext(TenantSwitcherContext);
}
