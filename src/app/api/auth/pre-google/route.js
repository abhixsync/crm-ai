const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || "wrenforge.com";
const IS_PROD = process.env.NODE_ENV === "production";

export async function POST(request) {
  try {
    const { tenantSlug } = await request.json();
    const slug = String(tenantSlug || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!slug) return Response.json({ error: "tenantSlug required" }, { status: 400 });

    const cookieValue = `_goa_tenant=${encodeURIComponent(slug)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=300${IS_PROD ? `; Secure; Domain=.${APP_DOMAIN}` : ""}`;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookieValue,
      },
    });
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
}
