const RESERVED_SLUGS = new Set([
  "app", "www", "api", "admin", "mail", "support",
  "help", "status", "blog", "assets", "static", "auth",
]);

export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63) || "tenant";
}

export function isReservedSlug(slug) {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

export function isValidSlug(slug) {
  if (!slug || typeof slug !== "string") return false;
  if (slug.length > 63) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug);
}

export async function ensureUniqueSlug(prisma, base) {
  let slug = base;
  let i = 2;
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    slug = `${base.slice(0, 60)}-${i++}`;
  }
  return slug;
}
