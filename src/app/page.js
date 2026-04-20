import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import LandingPage from "./landing-page";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (session?.user) {
    // Tenant user on platform host → send to their subdomain
    if (session.user.tenantSlug) {
      const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
      const domain = process.env.NEXT_PUBLIC_APP_DOMAIN || "wrenforge.com";
      redirect(`${protocol}://${session.user.tenantSlug}.${domain}/dashboard`);
    }
    // SUPER_ADMIN or platform admin
    if (session.user.role === "SUPER_ADMIN") redirect("/admin/tenants");
    redirect("/dashboard");
  }

  return <LandingPage />;
}
