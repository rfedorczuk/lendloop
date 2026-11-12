"use client";

import Link from "next/link";
import { Show, SignInButton } from "@clerk/nextjs";
import { buttonClass } from "./ui";

// A client component, so the home page itself stays static: the session is
// read in the browser, not while the page renders on the server.
export function HomeCta() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button type="button" className={buttonClass("primary", "lg")}>
            Sign in to lend or borrow
          </button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <Link href="/board" className={buttonClass("primary", "lg")}>
          Open the board
        </Link>
      </Show>
      <a href="#available" className={buttonClass("ghost", "lg")}>
        See what is available
      </a>
    </div>
  );
}
