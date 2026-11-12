"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { AdminView } from "@/components/AdminView";
import { Empty, Loading, PageTitle } from "@/components/ui";

export default function AdminPage() {
  const me = useQuery(api.users.me);

  return (
    <>
      <PageTitle
        title="Admin"
        hint="Manage members and watch the automation. Listings are removed from the board."
      />
      {me === undefined ? (
        <Loading />
      ) : me?.role === "admin" ? (
        <AdminView />
      ) : (
        // The admin queries would reject this user anyway, so do not run them.
        <Empty>This page is for admins only.</Empty>
      )}
    </>
  );
}
