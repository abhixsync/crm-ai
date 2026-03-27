import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ModernAiSimulatorView } from "@/components/modern/ai-simulator-view";

export default async function AiSimulatorPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return <ModernAiSimulatorView user={session.user} />;
}
