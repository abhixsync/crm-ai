import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ModernModularThemeView } from "@/components/modern/modular-theme-view";

export default async function ModularThemePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) redirect("/login");

  const role = session.user.role;
  if (!role || !["ADMIN", "SUPER_ADMIN"].includes(role)) redirect("/dashboard");

  return <ModernModularThemeView user={session.user} />;
}
