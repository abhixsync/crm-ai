import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createTrialSubscription } from "@/lib/subscription/subscription-service";
import { sendEmail, buildVerificationEmail, buildTrialWelcomeEmail } from "@/lib/email/mailer";
import { slugify, isReservedSlug, ensureUniqueSlug } from "@/lib/tenant/slug";

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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Invalid email address." }, { status: 400 });
    }

    if (password.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    // ─── Duplicate email check (global) ──────────────────
    const existingUser = await prisma.user.findFirst({ where: { email } });
    if (existingUser) {
      return Response.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    // ─── Create tenant ────────────────────────────────────
    const base = slugify(company);
    const safeBase = isReservedSlug(base) ? `${base}-crm` : base;
    const slug = await ensureUniqueSlug(prisma, safeBase);

    const tenant = await prisma.tenant.create({
      data: { name: company, slug, isActive: true },
    });

    // ─── Create admin user ────────────────────────────────
    const passwordHash = await bcrypt.hash(password, 12);
    const verifyToken = randomBytes(32).toString("hex");

    const user = await prisma.user.create({
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

    // ─── Create PRO trial subscription ───────────────────
    const subscription = await createTrialSubscription(tenant.id);

    // ─── Send verification email (non-blocking) ───────────
    const verifyEmail = buildVerificationEmail(name, verifyToken);
    sendEmail({ to: email, ...verifyEmail }).catch((err) =>
      console.error("[register] Failed to send verification email:", err?.message)
    );

    return Response.json({ message: "Account created. Please verify your email.", slug }, { status: 201 });
  } catch (err) {
    console.error("[api/auth/register]", err);
    return Response.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
