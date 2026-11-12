import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// The Clerk Frontend API host is encoded in the publishable key
// (pk_test_<base64 of "host$">). Clerk serves its scripts from there.
function clerkOrigin(): string[] {
  const encoded = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.split("_")[2];
  if (!encoded) return [];
  const host = Buffer.from(encoded, "base64")
    .toString("utf8")
    .replace(/\$$/, "");
  return host ? [`https://${host}`] : [];
}

// Convex is reached over HTTPS and over a WebSocket on the same host.
function convexOrigins(): string[] {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return [];
  const { origin } = new URL(url);
  return [origin, origin.replace(/^http/, "ws")];
}

// Pages are prerendered, so scripts cannot carry a per-request nonce and
// 'unsafe-inline' has to stay for the framework's own inline scripts. The
// policy still limits where scripts may load from, where the page may send
// data, and forbids framing, plugins and foreign form targets.
function contentSecurityPolicy(): string {
  const clerk = clerkOrigin();
  // Clerk loads its bot protection from this host.
  const clerkProtect = "https://*.protect.clerk.com";
  const turnstile = "https://challenges.cloudflare.com";
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      // React Fast Refresh in development evaluates code.
      ...(isDev ? ["'unsafe-eval'"] : []),
      ...clerk,
      clerkProtect,
      turnstile,
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "https://img.clerk.com"],
    "font-src": ["'self'"],
    "connect-src": [
      "'self'",
      ...clerk,
      ...convexOrigins(),
      // Its probes use several ports.
      `${clerkProtect}:*`,
      "https://clerk-telemetry.com",
    ],
    "frame-src": [turnstile, clerkProtect],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // Ignored over plain HTTP, so it does nothing on localhost.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
