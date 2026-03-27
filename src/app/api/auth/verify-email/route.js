import { prisma } from "@/lib/prisma";
import { sendEmail, buildTrialWelcomeEmail } from "@/lib/email/mailer";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token || typeof token !== "string" || token.length < 32) {
    return Response.redirect(new URL("/login?verified=invalid", request.url));
  }

  const user = await prisma.user.findUnique({ where: { emailVerifyToken: token } });

  if (!user) {
    return Response.redirect(new URL("/login?verified=invalid", request.url));
  }

  if (user.emailVerified) {
    // Already verified — just redirect to login
    return Response.redirect(new URL("/login?verified=already", request.url));
  }

  await prisma.user.update({
    where: { id: user.id },
    data:  { emailVerified: new Date(), emailVerifyToken: null },
  });

  // Send welcome / trial info email (non-blocking)
  const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId: user.tenantId } });
  if (sub?.trialEndsAt) {
    const welcome = buildTrialWelcomeEmail(user.name, sub.trialEndsAt);
    sendEmail({ to: user.email, ...welcome }).catch(() => {});
  }

  return Response.redirect(new URL("/login?verified=success", request.url));
}
