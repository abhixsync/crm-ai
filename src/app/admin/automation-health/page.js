import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ModernAutomationHealthView } from "@/components/modern/automation-health-view";

export default async function AutomationHealthPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return <ModernAutomationHealthView user={session.user} />;
}
