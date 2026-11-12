"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CATEGORIES, CONDITIONS } from "@/lib/format";
import type { Category, Condition } from "@/lib/format";
import { useSubmit } from "@/lib/useSubmit";
import {
  Button,
  Field,
  FormError,
  Select,
  inputClass,
  textareaClass,
} from "./ui";

export type ToolDraft = {
  _id?: Id<"tools">;
  name: string;
  category: Category;
  condition: Condition;
  description: string;
};

const EMPTY: ToolDraft = {
  name: "",
  category: "power_tools",
  condition: "good",
  description: "",
};

// Creates a listing, or edits one when `tool` has an id.
export function ToolForm({
  tool = EMPTY,
  onDone,
}: {
  tool?: ToolDraft;
  onDone?: () => void;
}) {
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const [draft, setDraft] = useState(tool);
  const { pending, error, run } = useSubmit();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const { _id, ...fields } = draft;
    const saved = await run(() =>
      _id ? update({ toolId: _id, ...fields }) : create(fields),
    );
    if (!saved) return;
    if (!_id) setDraft(EMPTY);
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" className="sm:col-span-2">
        <input
          required
          minLength={2}
          maxLength={60}
          placeholder="Cordless drill"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Category">
        <Select
          value={draft.category}
          onChange={(e) =>
            setDraft({ ...draft, category: e.target.value as Category })
          }
        >
          {CATEGORIES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Condition">
        <Select
          value={draft.condition}
          onChange={(e) =>
            setDraft({ ...draft, condition: e.target.value as Condition })
          }
        >
          {CONDITIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Short description" className="sm:col-span-2">
        <textarea
          rows={2}
          maxLength={280}
          placeholder="What is in the box, anything a borrower should know"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          className={textareaClass}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button type="submit" variant="primary" pending={pending}>
          {draft._id ? "Save changes" : "List tool"}
        </Button>
        {draft._id && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <FormError message={error} />
      </div>
    </form>
  );
}
