import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import CompleteSignupForm from "./complete-signup-form";

export default async function CompleteSignupPage() {
  const session = await getServerSession(authOptions);

  // Not logged in at all
  if (!session?.user) redirect("/login");

  // Already fully signed up
  if (!session.user.pendingGoogleSignup) redirect("/auth/post-login");

  return <CompleteSignupForm user={session.user} />;
}
