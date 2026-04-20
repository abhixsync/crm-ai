import { readFile } from "fs/promises";
import path from "path";

const PLATFORM_URL = `https://app.${process.env.NEXT_PUBLIC_APP_DOMAIN || "wrenforge.com"}`;

export async function GET() {
  const filePath = path.join(process.cwd(), "wrenforge-landing.html");
  let html = await readFile(filePath, "utf-8");

  // Rewrite relative auth links so CTAs go to app.wrenforge.com, not www.wrenforge.com
  html = html.replace(/href="\/auth\//g, `href="${PLATFORM_URL}/auth/`);

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
