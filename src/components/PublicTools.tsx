"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { categoryLabel } from "@/lib/format";
import { Empty, List, Loading, SectionHead } from "./ui";

type PublicTool = FunctionReturnType<typeof api.tools.listPublic>[number];

export function PublicToolsView({
  tools,
}: {
  tools: PublicTool[] | undefined;
}) {
  return (
    <section aria-labelledby="available" className="scroll-mt-20">
      <SectionHead
        id="available"
        title="Available now"
        aside={
          tools &&
          tools.length > 0 &&
          `${tools.length} ${tools.length === 1 ? "tool" : "tools"}`
        }
      />
      {tools === undefined ? (
        <Loading lines={1} />
      ) : tools.length === 0 ? (
        <Empty>
          No tools are available right now. Be the first to list one.
        </Empty>
      ) : (
        <List>
          {tools.map((tool) => (
            <li
              key={tool._id}
              className="flex items-baseline justify-between gap-4 px-4 py-3"
            >
              <span className="min-w-0 truncate font-medium">{tool.name}</span>
              <span className="shrink-0 text-[13px] text-muted">
                {categoryLabel(tool.category)}
              </span>
            </li>
          ))}
        </List>
      )}
      <p className="mt-3 text-[13px] text-faint">
        Sign in to see who lends each tool and to send a request.
      </p>
    </section>
  );
}

export function PublicTools() {
  return <PublicToolsView tools={useQuery(api.tools.listPublic)} />;
}
