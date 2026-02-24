import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function requireSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { session };
}

export function hasRole(session, roles) {
  const role = session?.user?.role;
  if (role === "SUPER_ADMIN") {
    return true;
  }
  return roles.includes(role);
}