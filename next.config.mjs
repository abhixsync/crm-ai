import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// CSP is set dynamically per-request in src/middleware.js using a nonce.
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "xlsx"],
  },
  // Landing page: www.wrenforge.com → public/landing.html (served as static asset)
  // To migrate to Option B (separate Vercel project): remove this rewrites() block
  // and move public/landing.html to the new static project as index.html.
  async rewrites() {
    return {
      // beforeFiles runs before filesystem (public/, app/) so this takes
      // priority over src/app/page.js for www.wrenforge.com requests.
      // To migrate to Option B: remove this block and deploy public/landing.html
      // as index.html in a separate Vercel static project.
      beforeFiles: [
        {
          source: "/:path*",
          destination: "/landing.html",
          has: [{ type: "host", value: "www.wrenforge.com" }],
        },
      ],
    };
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
