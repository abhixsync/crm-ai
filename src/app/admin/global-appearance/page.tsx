import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ModernGlobalThemeView } from "@/components/modern/global-theme-view";

export default async function AdminGlobalAppearancePage() {
  const session = await getServerSession(authOptions as any) as any;

  if (!session?.user) redirect("/login");
  if (session.user.role !== "SUPER_ADMIN") redirect("/dashboard");

  return <ModernGlobalThemeView user={session.user} />;
}
