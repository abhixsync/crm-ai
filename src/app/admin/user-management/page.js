import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ModernRolesPermissionsView } from "@/components/modern/roles-permissions-view";

export default async function UserManagementPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) redirect("/login");
  if (session.user.role !== "SUPER_ADMIN") redirect("/dashboard");

  return <ModernRolesPermissionsView user={session.user} />;
}
