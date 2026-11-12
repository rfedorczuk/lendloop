"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { LoanList } from "@/components/LoanList";
import { Empty, Loading, PageTitle } from "@/components/ui";

export default function RequestsPage() {
  const loans = useQuery(api.loans.mine);

  return (
    <>
      <PageTitle
        title="My requests"
        hint="Tools you asked to borrow and the loans you have now."
      />
      {loans === undefined ? (
        <Loading />
      ) : loans.length === 0 ? (
        <Empty>You have not requested anything yet. Start on the board.</Empty>
      ) : (
        <LoanList loans={loans} view="borrower" />
      )}
    </>
  );
}
