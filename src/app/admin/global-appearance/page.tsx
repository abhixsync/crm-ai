import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { resolveTenantTheme } from "@/modules/theme/theme.service";
import { ModernGlobalThemeView } from "@/components/modern/global-theme-view";

export default async function AdminGlobalAppearancePage() {
  const session = await getServerSession(authOptions as any) as any;

  if (!session?.user) redirect("/login");
  if (session.user.role !== "SUPER_ADMIN") redirect("/dashboard");

  let uiLayout = "modern";
  try {
    const theme = await resolveTenantTheme(null);
    uiLayout = (theme as any).uiLayout || "modern";
  } catch {}

  return <ModernGlobalThemeView user={session.user} initialLayout={uiLayout} />;
}
