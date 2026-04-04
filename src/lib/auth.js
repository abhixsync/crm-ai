import bcrypt from "bcryptjs";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";

export const authOptions = {
  trustHost: true,
  session: {
    strategy: "jwt",
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

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: identifier },
              { name: { equals: identifier, mode: "insensitive" } },
            ],
          },
        });

        if (!user) {
          return null;
        }

        if (user.isActive === false) {
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);

        if (!isValid) {
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
        token.userId = user.id;
        token.role = user.role;
        token.tenantId = user.tenantId || null;
        token.isPrimaryOwner = user.isPrimaryOwner ?? false;
        token.isSuspended = user.isSuspended ?? false;
        token.emailVerified = user.emailVerified || null;
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