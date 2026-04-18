import bcrypt from "bcryptjs";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";

const TOKEN_RECHECK_INTERVAL = 5 * 60; // 5 minutes in seconds

export const authOptions = {
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        tenantId: { label: "Tenant", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const identifier = String(credentials.email || "").trim().toLowerCase();
        const rawPassword = String(credentials.password || "");

        if (identifier.length < 3 || rawPassword.length < 6) {
          return null;
        }

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: identifier },
              { name: { equals: identifier, mode: "insensitive" } },
            ],
          },
        });

        // Constant-time: always run bcrypt even if user not found
        const DUMMY_HASH = "$2a$12$dummy.hash.for.timing.equality.only.placeholder.xx";
        const hashToCheck = user ? user.passwordHash : DUMMY_HASH;
        const isValid = await bcrypt.compare(rawPassword, hashToCheck);
        if (!user || !isValid) return null;

        if (user.isActive === false) {
          return null;
        }

        if (user.isSuspended) {
          throw new Error("SUSPENDED");
        }

        // ─── Tenant lock ───────────────────────────────────────────────────────
        if (user.role !== "SUPER_ADMIN") {
          const tenantId = credentials.tenantId || null;
          if (!tenantId || user.tenantId !== tenantId) {
            throw new Error("ACCESS_DENIED_TENANT");
          }
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId || null,
          isPrimaryOwner: user.isPrimaryOwner ?? false,
          isSuspended: user.isSuspended ?? false,
          emailVerified: user.emailVerified ? user.emailVerified.toISOString() : null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Initial sign-in: populate token from authorize() result
        token.userId = user.id;
        token.role = user.role;
        token.tenantId = user.tenantId || null;
        token.isPrimaryOwner = user.isPrimaryOwner ?? false;
        token.isSuspended = user.isSuspended ?? false;
        token.emailVerified = user.emailVerified || null;
        token.tokenCheckedAt = Math.floor(Date.now() / 1000);
        return token;
      }

      // Subsequent requests: re-check DB at most once every 5 minutes
      const now = Math.floor(Date.now() / 1000);
      const lastCheck = token.tokenCheckedAt ?? 0;

      if (now - lastCheck >= TOKEN_RECHECK_INTERVAL) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId },
          select: { isSuspended: true, role: true, emailVerified: true },
        });

        // User deleted or suspended — invalidate session immediately
        if (!dbUser || dbUser.isSuspended) {
          return null;
        }

        token.role = dbUser.role;
        token.emailVerified = dbUser.emailVerified
          ? dbUser.emailVerified.toISOString()
          : null;
        token.isSuspended = false;
        token.tokenCheckedAt = now;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId;
        session.user.role = token.role;
        session.user.tenantId = token.tenantId || null;
        session.user.isPrimaryOwner = token.isPrimaryOwner ?? false;
        session.user.isSuspended = token.isSuspended ?? false;
        session.user.emailVerified = token.emailVerified || null;
      }

      return session;
    },
  },
};