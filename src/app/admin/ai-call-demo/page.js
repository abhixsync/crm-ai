import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ModernAiCallDemoView } from "@/components/modern/ai-call-demo-view";

export default async function AiCallDemoPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return <ModernAiCallDemoView user={session.user} />;
}
