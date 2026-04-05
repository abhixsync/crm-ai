import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveTheme } from "@/modules/theme/theme.service";
import RegisterForm from "./register-form";

export default async function RegisterPage() {
  const headersList = await headers();
  const tenantId = headersList.get("x-resolved-tenant-id");
  if (tenantId) redirect("/login");

  let theme = {
    loginBackgroundUrl: null,
    logoUrl: null,
    primaryColor: null,
    accentColor: null,
    uiLayout: "modern",
  };

  try {
    const active = await getActiveTheme(null);
    if (active) {
      theme = {
        loginBackgroundUrl: active.loginBackgroundUrl || null,
        logoUrl: active.logoUrl || null,
        primaryColor: active.primaryColor || null,
        accentColor: active.accentColor || null,
        uiLayout: active.uiLayout || "modern",
      };
    }
  } catch {}

  return <RegisterForm theme={theme} />;
}
