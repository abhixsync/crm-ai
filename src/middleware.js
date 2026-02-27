import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  const isUserManagementPage = pathname.startsWith("/admin/user-management");
  const isUserManagementApi = pathname.startsWith("/api/admin/user-management");
  const isThemePage = pathname.startsWith("/admin/theme");
  const isThemeApi = pathname.startsWith("/api/admin/theme");

  if (!isUserManagementPage && !isUserManagementApi && !isThemePage && !isThemeApi) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (!token?.userId) {
    if (isUserManagementApi || isThemeApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (isUserManagementPage || isUserManagementApi) {
    if (token.role !== "SUPER_ADMIN") {
      if (isUserManagementApi) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const dashboardUrl = new URL("/dashboard", request.url);
      return NextResponse.redirect(dashboardUrl);
    }
  }

  if (isThemePage || isThemeApi) {
    if (!token.role || !["ADMIN", "SUPER_ADMIN"].includes(token.role)) {
      if (isThemeApi) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const dashboardUrl = new URL("/dashboard", request.url);
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/user-management/:path*",
    "/api/admin/user-management/:path*",
    "/admin/theme/:path*",
    "/api/admin/theme/:path*",
  ],
};
