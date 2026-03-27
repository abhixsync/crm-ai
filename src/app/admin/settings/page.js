import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ModernSettingsView } from "@/components/modern/settings-view";

export default async function AdminSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  if (!role || !["ADMIN", "SUPER_ADMIN"].includes(role)) {
    redirect("/dashboard");
  }

  return <ModernSettingsView initialRole={role} />;
}
