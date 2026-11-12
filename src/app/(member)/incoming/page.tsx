"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { LoanList } from "@/components/LoanList";
import { Empty, Loading, PageTitle } from "@/components/ui";

export default function IncomingPage() {
  const loans = useQuery(api.loans.incoming);

  return (
    <>
      <PageTitle
        title="Incoming"
        hint="Requests for your tools. Approve or decline them, and confirm when a tool comes back."
      />
      {loans === undefined ? (
        <Loading />
      ) : loans.length === 0 ? (
        <Empty>Nobody has asked for your tools yet.</Empty>
      ) : (
        <LoanList loans={loans} view="owner" />
      )}
    </>
  );
}
