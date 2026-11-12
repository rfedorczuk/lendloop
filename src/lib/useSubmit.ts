"use client";

import { useState } from "react";
import { errorMessage } from "./format";

// Runs a mutation and keeps its pending and error state for the form or
// button that started it.
export function useSubmit() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    } finally {
      setPending(false);
    }
  }

  return { pending, error, run };
}
