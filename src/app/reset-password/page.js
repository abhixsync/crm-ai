import ResetPasswordForm from "./reset-password-form";

export const metadata = { title: "Reset Password" };

export default function ResetPasswordPage({ searchParams }) {
  const token = searchParams?.token || "";
  return <ResetPasswordForm token={token} />;
}
