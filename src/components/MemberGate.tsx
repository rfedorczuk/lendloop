"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "@/lib/format";
import { FormError, Loading } from "./ui";

// Member pages render only after Convex has accepted the Clerk token and the
// user row exists, so the queries inside never run without a user.
export function MemberGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const storeUser = useMutation(api.users.store);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    storeUser({})
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, storeUser]);

  if (error !== null) return <FormError message={error} />;
  if (!isLoading && !isAuthenticated) {
    // Clerk has a session but Convex did not accept its token, or the
    // session ended. Waiting would not help.
    return (
      <FormError message="We could not confirm your session. Reload the page or sign in again." />
    );
  }
  if (!ready) return <Loading />;
  return <>{children}</>;
}
