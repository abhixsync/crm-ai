import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ModernSubscriptionConfigView } from "@/components/modern/subscription-config-view";

export default async function SubscriptionConfigPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role !== "SUPER_ADMIN") redirect("/dashboard");
  return <ModernSubscriptionConfigView user={session.user} />;
}
