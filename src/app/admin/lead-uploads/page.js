import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ModernLeadUploadsView } from "@/components/modern/lead-uploads-view";

export default async function LeadUploadsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return <ModernLeadUploadsView user={session.user} />;
}
