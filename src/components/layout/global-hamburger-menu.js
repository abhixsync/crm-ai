"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

function buildMenuItems(role) {
  const items = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/calls?aiCall=1", label: "AI Call", matchPath: "/calls" },
  ];

  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    items.push({ href: "/admin/settings", label: "Settings" });
  }

  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    items.push({ href: "/admin/user-management", label: "Users" });
  }

  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    items.push({ href: "/admin/automation", label: "Automation" });
  }

  if (role === "SUPER_ADMIN") {
    items.push(
      { href: "/admin/tenants", label: "Tenants" },
      { href: "/admin/providers", label: "Providers" }
    );
  }

  return items;
}

export function GlobalHamburgerMenu() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function onDocumentClick(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [open]);

  if (pathname === "/login") {
    return null;
  }

  if (status !== "authenticated" || !session?.user) {
    return null;
  }

  const role = session.user.role;
  const items = buildMenuItems(role);

  return (
    <div ref={rootRef} className="fixed right-3 top-3 z-50 sm:right-4 sm:top-4">
      <div className="relative">
        <Button
          variant="outline"
          className="h-10 w-10 px-0 border-slate-300 bg-white/90 backdrop-blur-sm hover:bg-white"
          onClick={() => setOpen((previous) => !previous)}
          aria-label={open ? "Close menu" : "Open menu"}
          title={open ? "Close menu" : "Open menu"}
        >
          <Menu className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
        </Button>

        {open ? (
          <div className="absolute right-0 top-full mt-1 w-[calc(100vw-1.5rem)] max-w-56 max-h-[calc(100vh-4.5rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg sm:w-56 sm:max-h-[70vh]">
            <div className="mb-2 px-2 pt-1 text-xs text-slate-500">
              {session.user.name || session.user.email || "User"}
            </div>

            <div className="space-y-1">
              {items.map((item) => (
                <Link key={item.href} href={item.href} className="block">
                  <Button
                    variant={pathname === (item.matchPath || item.href) ? "default" : "ghost"}
                    className="h-9 w-full justify-start"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Button>
                </Link>
              ))}
            </div>

            <div className="mt-2 border-t border-slate-200 pt-2">
              <Button
                variant="secondary"
                className="h-9 w-full justify-start"
                onClick={() => {
                  setOpen(false);
                  signOut({ callbackUrl: "/login" });
                }}
              >
                Logout
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
