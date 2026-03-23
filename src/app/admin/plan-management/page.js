import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ModernPlanManagementView } from "@/components/modern/plan-management-view";

export default async function PlanManagementPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role !== "SUPER_ADMIN") redirect("/dashboard");
  return <ModernPlanManagementView user={session.user} />;
}
