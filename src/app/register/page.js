import { headers } from "next/headers";
import { redirect } from "next/navigation";
import RegisterForm from "./register-form";

export default async function RegisterPage() {
  const headersList = await headers();
  const tenantId = headersList.get("x-resolved-tenant-id");
  if (tenantId) redirect("/login");

  return <RegisterForm />;
}
