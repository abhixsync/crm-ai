import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createTrialSubscription } from "@/lib/subscription/subscription-service";
import { sendEmail, buildVerificationEmail, buildTrialWelcomeEmail } from "@/lib/email/mailer";
import { slugify, isReservedSlug, ensureUniqueSlug } from "@/lib/tenant/slug";
import { resolveTenantTheme } from "@/modules/theme/theme.service";

export async function POST(request) {
  try {
    const body = await request.json();
    const name     = String(body.name    || "").trim();
    const email    = String(body.email   || "").trim().toLowerCase();
    const password = String(body.password || "").trim();
    const company  = String(body.company || "").trim();
    const phone    = String(body.phone   || "").trim();

    // ─── Validation ──────────────────────────────────────
    if (!name || !email || !password || !company) {
      return Response.json({ error: "name, email, password, and company are required." }, { status: 400 });
    }

    if (name.length < 2 || name.length > 100) {
      return Response.json({ error: "Full name must be 2–100 characters." }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Invalid email address." }, { status: 400 });
    }

    if (password.length < 12) {
      return Response.json({ error: "Password must be at least 12 characters." }, { status: 400 });
    }

    if (password.length > 128) {
      return Response.json({ error: "Password is too long (max 128 characters)." }, { status: 400 });
    }

    if (!/[A-Z]/.test(password)) {
      return Response.json({ error: "Password must include at least one uppercase letter." }, { status: 400 });
    }

    if (!/[a-z]/.test(password)) {
      return Response.json({ error: "Password must include at least one lowercase letter." }, { status: 400 });
    }

    if (!/[0-9]/.test(password)) {
      return Response.json({ error: "Password must include at least one number." }, { status: 400 });
    }

    if (!/[!@#$%^&*()_\-+=\[\]{}|;':,./<>?]/.test(password)) {
      return Response.json({ error: "Password must include at least one special character." }, { status: 400 });
    }

    if (company.length < 2 || company.length > 100) {
      return Response.json({ error: "Company name must be 2–100 characters." }, { status: 400 });
    }

    if (phone && !/^[+\d][\d\s\-(). ]{5,19}$/.test(phone)) {
      return Response.json({ error: "Invalid phone number format." }, { status: 400 });
    }

    // ─── Create tenant + user atomically ─────────────────
    const base = slugify(company);
    const safeBase = isReservedSlug(base) ? `${base}-crm` : base;
    const slug = await ensureUniqueSlug(prisma, safeBase);

    let verifyToken;
    const { tenant, user } = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findFirst({ where: { email } });
      if (existingUser) {
        const err = new Error("EMAIL_EXISTS");
        err.status = 409;
        throw err;
      }

      const tenant = await tx.tenant.create({
        data: { name: company, slug, isActive: true },
      });

      const passwordHash = await bcrypt.hash(password, 12);
      verifyToken = randomBytes(32).toString("hex");

      const user = await tx.user.create({
        data: {
          tenantId:        tenant.id,
          name,
          email,
          passwordHash,
          role:            "ADMIN",
          isPrimaryOwner:  true,
          emailVerifyToken: verifyToken,
          // emailVerified left null until verified
          ...(phone ? { /* phone not on User model — skip */ } : {}),
        },
      });

      return { tenant, user };
    });

    // ─── Create PRO trial subscription ───────────────────
    const subscription = await createTrialSubscription(tenant.id);

    // ─── Send verification email (non-blocking) ───────────
    const theme = await resolveTenantTheme(tenant.id).catch(() => null);
    const emailCtx = {
      brandName:    theme?.emailFromName || theme?.brandName || null,
      primaryColor: theme?.primaryColor || null,
      fromName:     theme?.emailFromName || theme?.brandName || null,
    };
    const verifyEmail = buildVerificationEmail(name, verifyToken, emailCtx);
    sendEmail({ to: email, ...verifyEmail, fromName: verifyEmail.fromName }).catch((err) =>
      console.error("[register] Failed to send verification email:", err?.message)
    );

    return Response.json({ success: true, slug }, { status: 201 });
  } catch (err) {
    if (err.message === "EMAIL_EXISTS") {
      // Return indistinguishable success to prevent email enumeration (dummy slug matches shape)
      return Response.json({ success: true, slug: "setup" }, { status: 201 });
    }
    console.error("[api/auth/register]", err);
    return Response.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
