"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { AdminView } from "@/components/AdminView";
import { Empty, Loading, PageTitle } from "@/components/ui";

function AdminPanels() {
  return (
    <AdminView
      members={useQuery(api.admin.users)}
      issues={useQuery(api.admin.automationIssues)}
      loans={useQuery(api.loans.all)}
    />
  );
}

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
        <AdminPanels />
      ) : (
        // The admin queries would reject this user anyway, so do not run them.
        <Empty>This page is for admins only.</Empty>
      )}
    </>
  );
}
