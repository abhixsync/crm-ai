import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ModernIntentTrainingView } from "@/components/modern/intent-training-view";

export default async function IntentTrainingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return <ModernIntentTrainingView user={session.user} />;
}
