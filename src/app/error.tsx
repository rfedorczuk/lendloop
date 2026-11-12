"use client";

import { Button } from "@/components/ui";

// Shown when a page throws while rendering. The details go to the console
// and to the server logs, not to the screen.
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="pt-16 text-center">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
        Something went wrong
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-muted">
        The page could not be shown. Your data is safe. Try again, and if it
        keeps happening, reload the page.
      </p>
      <div className="mt-6">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
