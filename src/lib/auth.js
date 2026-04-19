import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

const TOKEN_RECHECK_INTERVAL = 5 * 60;
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || "wrenforge.com";
const IS_PROD = process.env.NODE_ENV === "production";

export const authOptions = {
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  // Parent-domain cookie so session is shared across *.wrenforge.com subdomains
  cookies: {
    sessionToken: {
      name: IS_PROD ? `__Secure-next-auth.session-token` : `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: IS_PROD,
        domain: IS_PROD ? `.${APP_DOMAIN}` : undefined,
      },
    },
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        tenantId: { label: "Tenant", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const identifier = String(credentials.email || "").trim().toLowerCase();
        const rawPassword = String(credentials.password || "");

        if (identifier.length < 3 || rawPassword.length < 6) return null;

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: identifier },
              { name: { equals: identifier, mode: "insensitive" } },
            ],
          },
        });

        // Block OAuth-only users from password login
        if (user && !user.passwordHash) return null;

        const DUMMY_HASH = "$2a$12$dummy.hash.for.timing.equality.only.placeholder.xx";
        const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
        const isValid = await bcrypt.compare(rawPassword, hashToCheck);
        if (!user || !isValid) return null;

        if (user.isActive === false) return null;
        if (user.isSuspended) throw new Error("SUSPENDED");

        if (user.role !== "SUPER_ADMIN") {
          const tenantId = credentials.tenantId || null;
          if (tenantId) {
            // Tenant subdomain: strict match required
            if (user.tenantId !== tenantId) throw new Error("ACCESS_DENIED_TENANT");
          }
          // Platform host (no tenantId provided): allow — post-login page redirects to tenant
        }

        // Resolve tenant slug so post-login page can redirect cross-domain
        let tenantSlug = null;
        if (user.tenantId) {
          const tenant = await prisma.tenant.findUnique({
            where: { id: user.tenantId },
            select: { slug: true },
          });
          tenantSlug = tenant?.slug || null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId || null,
          tenantSlug,
          isPrimaryOwner: user.isPrimaryOwner ?? false,
          isSuspended: user.isSuspended ?? false,
          emailVerified: user.emailVerified ? user.emailVerified.toISOString() : null,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;

      const email = profile?.email?.toLowerCase();
      if (!email) return false;

      // Read pre-auth tenant cookie (set by tenant subdomain before redirect to Google)
      let tenantSlug = null;
      try {
        const cookieStore = await cookies();
        tenantSlug = cookieStore.get("_goa_tenant")?.value || null;
      } catch {
        // cookies() may throw outside request context — safe to ignore
      }

      if (tenantSlug) {
        // Tenant subdomain flow: user must already exist in this tenant
        const tenant = await prisma.tenant.findFirst({
          where: { slug: tenantSlug, isActive: true },
          select: { id: true },
        });
        if (!tenant) return false;

        const existingUser = await prisma.user.findFirst({
          where: { email, tenantId: tenant.id },
          select: { id: true, isActive: true, isSuspended: true, googleId: true },
        });
        if (!existingUser || !existingUser.isActive || existingUser.isSuspended) return false;

        if (!existingUser.googleId && profile.email_verified !== false) {
          await prisma.user.update({
            where: { id: existingUser.id },
            data: { googleId: account.providerAccountId },
          });
        }
        return true;
      }

      // Platform host flow
      const existingUser = await prisma.user.findFirst({
        where: { email },
        select: { id: true, isActive: true, isSuspended: true, googleId: true, metadata: true },
      });

      if (existingUser) {
        if (!existingUser.isActive || existingUser.isSuspended) return false;
        if (!existingUser.googleId && profile.email_verified !== false) {
          await prisma.user.update({
            where: { id: existingUser.id },
            data: { googleId: account.providerAccountId },
          });
        }
        return true;
      }

      // New user: upsert pending record (idempotent for concurrent/retry requests)
      await prisma.user.upsert({
        where: { googleId: account.providerAccountId },
        update: {}, // no-op if already exists
        create: {
          name: profile.name || email,
          email,
          googleId: account.providerAccountId,
          isActive: false,
          metadata: { pendingGoogleSignup: true },
        },
      });
      return true;
    },

    async jwt({ token, user, account, profile, trigger }) {
      // Handle explicit session update (called after workspace creation to refresh stale JWT)
      if (trigger === "update" && token.userId && !user && !account) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.userId },
            select: { isSuspended: true, role: true, emailVerified: true, metadata: true, tenantId: true },
          });
          if (!dbUser || dbUser.isSuspended) return null;
          token.role = dbUser.role;
          token.emailVerified = dbUser.emailVerified ? dbUser.emailVerified.toISOString() : null;
          token.isSuspended = false;
          const meta = dbUser.metadata;
          token.pendingGoogleSignup = meta && typeof meta === "object" && meta.pendingGoogleSignup === true;
          const prevTenantId = token.tenantId;
          token.tenantId = dbUser.tenantId || null;
          if (dbUser.tenantId && dbUser.tenantId !== prevTenantId) {
            const tenant = await prisma.tenant.findUnique({
              where: { id: dbUser.tenantId },
              select: { slug: true },
            });
            token.tenantSlug = tenant?.slug || null;
          } else if (!dbUser.tenantId) {
            token.tenantSlug = null;
          }
          token.tokenCheckedAt = Math.floor(Date.now() / 1000);
        } catch {
          // Transient DB error — return token as-is rather than invalidating the session
        }
        return token;
      }

      if (user) {
        // Credentials sign-in: user object comes from authorize()
        if (!account || account.provider === "credentials") {
          token.userId = user.id;
          token.role = user.role;
          token.tenantId = user.tenantId || null;
          token.tenantSlug = user.tenantSlug || null;
          token.isPrimaryOwner = user.isPrimaryOwner ?? false;
          token.isSuspended = user.isSuspended ?? false;
          token.emailVerified = user.emailVerified || null;
          token.pendingGoogleSignup = false;
          token.tokenCheckedAt = Math.floor(Date.now() / 1000);
          return token;
        }
      }

      if (account?.provider === "google") {
        // Google OAuth first sign-in
        const email = (profile?.email || token.email || "").toLowerCase();
        const dbUser = await prisma.user.findFirst({
          where: { email },
          select: {
            id: true, role: true, tenantId: true, isPrimaryOwner: true,
            isSuspended: true, emailVerified: true, metadata: true,
          },
        });
        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
          token.tenantId = dbUser.tenantId || null;
          token.isPrimaryOwner = dbUser.isPrimaryOwner ?? false;
          token.isSuspended = dbUser.isSuspended ?? false;
          token.emailVerified = dbUser.emailVerified ? dbUser.emailVerified.toISOString() : null;
          const meta = dbUser.metadata;
          token.pendingGoogleSignup = meta && typeof meta === "object" && meta.pendingGoogleSignup === true;
          token.tokenCheckedAt = Math.floor(Date.now() / 1000);
          // Resolve tenant slug for post-login redirect
          if (dbUser.tenantId) {
            const tenant = await prisma.tenant.findUnique({
              where: { id: dbUser.tenantId },
              select: { slug: true },
            });
            token.tenantSlug = tenant?.slug || null;
          } else {
            token.tenantSlug = null;
          }
        }
        return token;
      }

      // Subsequent requests: periodic DB re-check
      const now = Math.floor(Date.now() / 1000);
      const lastCheck = token.tokenCheckedAt ?? 0;

      if (now - lastCheck >= TOKEN_RECHECK_INTERVAL) {
        // Guard: skip recheck if no userId (e.g. mid-signup Google flow)
        if (!token.userId) {
          token.tokenCheckedAt = now;
          return token;
        }
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId },
          select: { isSuspended: true, role: true, emailVerified: true, metadata: true, tenantId: true },
        });

        if (!dbUser || dbUser.isSuspended) return null;

        token.role = dbUser.role;
        token.emailVerified = dbUser.emailVerified ? dbUser.emailVerified.toISOString() : null;
        token.isSuspended = false;
        const meta = dbUser.metadata;
        token.pendingGoogleSignup = meta && typeof meta === "object" && meta.pendingGoogleSignup === true;

        // Refresh tenantId — it changes when Google signup completes
        const prevTenantId = token.tenantId;
        token.tenantId = dbUser.tenantId || null;
        // Refresh tenantSlug if tenantId changed
        if (dbUser.tenantId && dbUser.tenantId !== prevTenantId) {
          const tenant = await prisma.tenant.findUnique({
            where: { id: dbUser.tenantId },
            select: { slug: true },
          });
          token.tenantSlug = tenant?.slug || null;
        } else if (!dbUser.tenantId) {
          token.tenantSlug = null;
        }

        token.tokenCheckedAt = now;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId;
        session.user.role = token.role;
        session.user.tenantId = token.tenantId || null;
        session.user.tenantSlug = token.tenantSlug || null;
        session.user.isPrimaryOwner = token.isPrimaryOwner ?? false;
        session.user.isSuspended = token.isSuspended ?? false;
        session.user.emailVerified = token.emailVerified || null;
        session.user.pendingGoogleSignup = token.pendingGoogleSignup ?? false;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      // Allow redirects to *.wrenforge.com and relative URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      try {
        const { hostname } = new URL(url);
        const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "wrenforge.com";
        if (hostname === appDomain || hostname.endsWith(`.${appDomain}`)) return url;
      } catch {}
      return baseUrl;
    },
  },
};
