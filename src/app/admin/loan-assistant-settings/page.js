import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ModernLoanAssistantSettingsView } from "@/components/modern/loan-assistant-settings-view";

export default async function LoanAssistantSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return <ModernLoanAssistantSettingsView user={session.user} />;
}
