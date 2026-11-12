"use client";

import { api } from "../../../../convex/_generated/api";
import { PagedLoans } from "@/components/PagedLoans";
import { PageTitle } from "@/components/ui";

export default function RequestsPage() {
  return (
    <>
      <PageTitle
        title="My requests"
        hint="Tools you asked to borrow and the loans you have now."
      />
      <PagedLoans
        source={api.loans.mine}
        view="borrower"
        empty="You have not requested anything yet. Start on the board."
      />
    </>
  );
}
