"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { ListingsView } from "@/components/ListingsView";
import { PageTitle } from "@/components/ui";

export default function ListingsPage() {
  return (
    <>
      <PageTitle
        title="My listings"
        hint="Tools you are willing to lend. Removing a listing declines its open requests."
      />
      <ListingsView tools={useQuery(api.tools.mine)} />
    </>
  );
}
