"use client";

import { api } from "../../../../convex/_generated/api";
import { PagedLoans } from "@/components/PagedLoans";
import { PageTitle } from "@/components/ui";

export default function IncomingPage() {
  return (
    <>
      <PageTitle
        title="Incoming"
        hint="Requests for your tools. Approve or decline them, and confirm when a tool comes back."
      />
      <PagedLoans
        source={api.loans.incoming}
        view="owner"
        empty="Nobody has asked for your tools yet."
      />
    </>
  );
}
