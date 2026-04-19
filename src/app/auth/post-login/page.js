import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || "wrenforge.com";

export default async function PostLoginPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) redirect("/login");

  if (session.user.pendingGoogleSignup) redirect("/auth/complete-signup");

  // Tenant user on platform host → redirect to their subdomain
  if (session.user.tenantSlug) {
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    redirect(`${protocol}://${session.user.tenantSlug}.${APP_DOMAIN}/dashboard`);
  }

  // SUPER_ADMIN or no tenant
  redirect("/dashboard");
}
