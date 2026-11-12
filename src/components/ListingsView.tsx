"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { categoryLabel, conditionLabel } from "@/lib/format";
import { useSubmit } from "@/lib/useSubmit";
import { Availability } from "./BoardView";
import { ToolForm } from "./ToolForm";
import {
  Button,
  ConfirmButton,
  Empty,
  FormError,
  List,
  Loading,
  Panel,
  Row,
  SectionHead,
} from "./ui";

export type Listing = FunctionReturnType<typeof api.tools.mine>[number];

function ListingRow({ tool }: { tool: Listing }) {
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState(false);
  const { pending, error, run } = useSubmit();

  if (editing) {
    return (
      <Row>
        <ToolForm tool={tool} onDone={() => setEditing(false)} />
      </Row>
    );
  }

  return (
    <Row>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className="font-medium">{tool.name}</h3>
            <Availability availability={tool.availability} />
          </div>
          <p className="mt-1 text-[13px] text-muted">
            {categoryLabel(tool.category)} · {conditionLabel(tool.condition)}
          </p>
          {tool.description && (
            <p className="mt-1.5 max-w-prose text-[13px] text-muted">
              {tool.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ConfirmButton
            label="Remove"
            confirmLabel="Confirm removal"
            describedAs={tool.name}
            pending={pending}
            onConfirm={() => run(() => remove({ toolId: tool._id }))}
          />
          <Button
            size="sm"
            aria-label={`Edit ${tool.name}`}
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
        </div>
      </div>
      <FormError message={error} />
    </Row>
  );
}

export function ListingsView({ tools }: { tools: Listing[] | undefined }) {
  return (
    <div className="space-y-10">
      <section aria-labelledby="new-listing">
        <SectionHead id="new-listing" title="List a tool" />
        <Panel>
          <ToolForm />
        </Panel>
      </section>

      <section aria-labelledby="your-listings">
        <SectionHead
          id="your-listings"
          title="Your tools"
          aside={tools && tools.length > 0 && tools.length}
        />
        {tools === undefined ? (
          <Loading />
        ) : tools.length === 0 ? (
          <Empty>You have not listed anything yet.</Empty>
        ) : (
          <List>
            {tools.map((tool) => (
              <ListingRow key={tool._id} tool={tool} />
            ))}
          </List>
        )}
      </section>
    </div>
  );
}
