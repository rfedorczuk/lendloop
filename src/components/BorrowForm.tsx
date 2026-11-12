"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { todayUtc } from "@/lib/format";
import { useSubmit } from "@/lib/useSubmit";
import { Button, Field, FormError, inputClass } from "./ui";

export function BorrowForm({
  toolId,
  onDone,
}: {
  toolId: Id<"tools">;
  onDone: () => void;
}) {
  const request = useMutation(api.loans.request);
  const [startDate, setStartDate] = useState(todayUtc());
  const [endDate, setEndDate] = useState(todayUtc());
  const { pending, error, run } = useSubmit();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await run(() => request({ toolId, startDate, endDate }))) onDone();
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3.5 flex flex-wrap items-end gap-x-2 gap-y-3 border-t border-line pt-3.5"
    >
      <Field label="From" className="min-w-[8.5rem] flex-1 sm:max-w-[10rem]">
        <input
          type="date"
          required
          autoFocus
          min={todayUtc()}
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            if (e.target.value > endDate) setEndDate(e.target.value);
          }}
          className={inputClass}
        />
      </Field>
      <Field label="Until" className="min-w-[8.5rem] flex-1 sm:max-w-[10rem]">
        <input
          type="date"
          required
          min={startDate}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className={inputClass}
        />
      </Field>
      <div className="flex h-9 items-center gap-2">
        <Button type="submit" variant="primary" pending={pending}>
          Send request
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <div className="basis-full empty:hidden">
        <FormError message={error} />
      </div>
    </form>
  );
}
