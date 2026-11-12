"use client";

import { Suspense } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { buttonClass } from "./ui";

const LINKS = [
  { href: "/board", label: "Board" },
  { href: "/listings", label: "My listings" },
  { href: "/requests", label: "My requests" },
  { href: "/incoming", label: "Incoming" },
];

function Mark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <circle cx="7.5" cy="10" r="4.75" />
      <circle cx="12.5" cy="10" r="4.75" />
    </svg>
  );
}

export function NavLinks({
  links,
  pathname,
}: {
  links: { href: string; label: string }[];
  pathname: string;
}) {
  return (
    <nav
      aria-label="Main"
      className="no-scrollbar -mx-1 flex min-w-0 gap-0.5 overflow-x-auto px-1 py-1"
    >
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className="flex h-7 shrink-0 items-center whitespace-nowrap rounded-md px-2.5 text-[13px] text-muted transition-colors duration-100 hover:bg-hover hover:text-ink aria-[current=page]:bg-hover aria-[current=page]:font-medium aria-[current=page]:text-ink"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

// The bar itself, without any data fetching.
export function HeaderBar({ nav, end }: { nav?: ReactNode; end: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface">
      <div className="mx-auto flex h-12 max-w-[52rem] items-center gap-4 px-5 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-md text-sm font-semibold tracking-[-0.01em]"
        >
          <Mark />
          LendLoop
        </Link>
        <div className="min-w-0 flex-1">{nav}</div>
        <div className="flex shrink-0 items-center">{end}</div>
      </div>
    </header>
  );
}

function MemberNav() {
  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  // Hiding the link is cosmetic. The admin queries check the role themselves.
  const links =
    me?.role === "admin"
      ? [...LINKS, { href: "/admin", label: "Admin" }]
      : LINKS;
  return <NavLinks links={links} pathname={pathname} />;
}

export function Header() {
  return (
    <HeaderBar
      nav={
        <Show when="signed-in">
          {/* usePathname needs a Suspense boundary on prerendered routes. */}
          <Suspense fallback={null}>
            <MemberNav />
          </Suspense>
        </Show>
      }
      end={
        <>
          <Show when="signed-in">
            <UserButton />
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button type="button" className={buttonClass("ghost", "md")}>
                Sign in
              </button>
            </SignInButton>
          </Show>
        </>
      }
    />
  );
}
