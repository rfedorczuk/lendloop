"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { BoardView } from "@/components/BoardView";
import type { CategoryFilter } from "@/components/BoardView";
import { PageTitle } from "@/components/ui";

export default function BoardPage() {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const me = useQuery(api.users.me);
  const tools = useQuery(
    api.tools.list,
    category === "all" ? {} : { category },
  );

  return (
    <>
      <PageTitle
        title="Board"
        hint="Every tool your neighbors have listed, with its current status."
      />
      <BoardView
        tools={tools}
        isAdmin={me?.role === "admin"}
        category={category}
        onCategory={setCategory}
      />
    </>
  );
}
