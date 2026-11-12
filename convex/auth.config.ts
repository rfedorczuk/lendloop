import type { AuthConfig } from "convex/server";

// Convex accepts only JWTs issued by this Clerk instance for the "convex"
// audience. Set CLERK_JWT_ISSUER_DOMAIN in the Convex deployment, see README.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
