import Link from "next/link";
import { Button } from "@/components/ui/button";

const SUPER_ADMIN_LINKS = [
  { href: "/admin/tenants", label: "Tenants" },
  { href: "/admin/user-management", label: "Users" },
];

export function SuperAdminNav({ currentPath }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SUPER_ADMIN_LINKS.map((item) => (
        <Link key={item.href} href={item.href}>
          <Button variant={currentPath === item.href ? "default" : "secondary"}>{item.label}</Button>
        </Link>
      ))}
    </div>
  );
}
