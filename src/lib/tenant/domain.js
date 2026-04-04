const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || "wrenforge.com";

/** True if the domain is a valid custom domain (not our own subdomain). */
export function isValidCustomDomain(domain) {
  if (!domain || typeof domain !== "string") return false;
  if (domain.endsWith(`.${APP_DOMAIN}`)) return false;
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$/i.test(domain);
}

/**
 * Verify a domain's CNAME points to Vercel using Cloudflare DNS-over-HTTPS.
 * Works in both Edge Runtime and Node.js.
 */
export async function verifyDomainCname(domain) {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=CNAME`,
      { headers: { Accept: "application/dns-json" } }
    );
    const data = await res.json();
    const cname = data.Answer?.find((r) => r.type === 5);
    return Boolean(cname?.data?.includes("vercel"));
  } catch {
    return false;
  }
}

/** Register a custom domain with this Vercel project. */
export async function addDomainToVercel(domain) {
  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) {
    throw new Error("VERCEL_TOKEN and VERCEL_PROJECT_ID must be set");
  }
  const res = await fetch(
    `https://api.vercel.com/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domain }),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || `Vercel API error ${res.status}`);
  }
  return true;
}

/** Remove a custom domain from this Vercel project. */
export async function removeDomainFromVercel(domain) {
  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) return;
  await fetch(
    `https://api.vercel.com/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
    }
  );
}
