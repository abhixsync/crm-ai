import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import LandingPage from "./landing-page";

export const metadata = {
  title: "WrenForge - Forge Every Deal",
  description: "AI-automated Sales Engine for Loan Management",
  openGraph: {
    title: "WrenForge - Forge Every Deal",
    description: "AI-automated Sales Engine for Loan Management",
    siteName: "WrenForge",
    type: "website",
    url: "https://www.wrenforge.com",
    images: [
      {
        url: "https://www.wrenforge.com/opengraph-image",
        width: 1200,
        height: 630,
        alt: "WrenForge - Forge Every Deal",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "WrenForge - Forge Every Deal",
    description: "AI-automated Sales Engine for Loan Management",
    images: ["https://www.wrenforge.com/opengraph-image"],
  },
};

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
