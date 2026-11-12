"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { BoardView } from "@/components/BoardView";
import type { CategoryFilter } from "@/components/BoardView";
import { PageTitle } from "@/components/ui";
import { useLatest, useListState } from "@/lib/useListState";

export default function BoardPage() {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const list = useListState();
  const me = useQuery(api.users.me);
  const data = useLatest(
    useQuery(
      api.tools.list,
      category === "all" ? list.args : { ...list.args, category },
    ),
  );

  return (
    <>
      <PageTitle
        title="Board"
        hint="Every tool your neighbors have listed, with its current status."
      />
      <BoardView
        data={data}
        isAdmin={me?.role === "admin"}
        category={category}
        onCategory={(next) => {
          setCategory(next);
          list.setPage(1);
        }}
        search={list.input}
        onSearch={list.setInput}
        searching={list.searching}
        onPage={list.setPage}
      />
    </>
  );
}
