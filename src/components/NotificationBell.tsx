"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { formatDay } from "@/lib/format";
import { TimeAgo } from "./TimeAgo";

type Notice = FunctionReturnType<
  typeof api.notifications.list
>["items"][number];

function message(notice: Notice): string {
  const { otherName: other, toolName: tool } = notice;
  switch (notice.kind) {
    case "loan.requested":
      return `${other} wants to borrow your ${tool}`;
    case "loan.approved":
      return `${other} approved your request for the ${tool}`;
    case "loan.declined":
      return `Your request for the ${tool} was declined`;
    case "loan.cancelled":
      return `The loan of the ${tool} was cancelled`;
    case "loan.returned":
      return `${other} confirmed the return of the ${tool}`;
  }
}

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5.25 8.25a4.75 4.75 0 0 1 9.5 0c0 3.6 1.5 4.75 1.5 4.75H3.75s1.5-1.15 1.5-4.75Z" />
      <path d="M8.25 15.75a1.9 1.9 0 0 0 3.5 0" />
    </svg>
  );
}

export function NoticeList({
  items,
  fresh,
  onNavigate,
}: {
  items: Notice[];
  // Ids that were unread when the list was opened.
  fresh: ReadonlySet<string>;
  onNavigate: () => void;
}) {
  if (items.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-[13px] text-muted">
        Nothing yet. Requests and decisions on your loans will show up here.
      </p>
    );
  }
  return (
    <ul className="max-h-[min(24rem,70vh)] divide-y divide-line overflow-y-auto">
      {items.map((notice) => (
        <li key={notice._id}>
          <Link
            href={notice.href}
            onClick={onNavigate}
            className="flex gap-2.5 px-4 py-3 transition-colors duration-100 hover:bg-hover focus-visible:-outline-offset-2"
          >
            <span
              aria-hidden="true"
              className={`mt-[7px] size-1.5 shrink-0 rounded-full ${fresh.has(notice._id) ? "bg-accent" : "bg-transparent"}`}
            />
            <span className="min-w-0">
              <span className="block text-[13px] text-ink">
                {fresh.has(notice._id) && (
                  <span className="sr-only">New: </span>
                )}
                {message(notice)}
              </span>
              <span className="mt-0.5 block text-xs tabular-nums text-faint">
                {formatDay(notice.startDate)} to {formatDay(notice.endDate)} ·{" "}
                <TimeAgo at={notice.at} />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function NotificationBell() {
  const { isAuthenticated } = useConvexAuth();
  const data = useQuery(api.notifications.list, isAuthenticated ? {} : "skip");
  const markSeen = useMutation(api.notifications.markSeen);
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  const unread = data?.unread ?? 0;

  // Close on Escape and on a click outside, like a native menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  function toggle() {
    if (open) return setOpen(false);
    // Remember what was new, then clear the counter. The dots stay for as
    // long as the list is open.
    setFresh(
      new Set(
        (data?.items ?? [])
          .filter((item) => item.unread)
          .map((item) => item._id),
      ),
    );
    setOpen(true);
    if (unread > 0) void markSeen({});
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="notifications"
        aria-label={
          unread > 0 ? `Notifications, ${unread} new` : "Notifications"
        }
        onClick={toggle}
        className="relative flex size-8 items-center justify-center rounded-lg text-muted transition-colors duration-100 hover:bg-hover hover:text-ink aria-expanded:bg-hover aria-expanded:text-ink"
      >
        <BellIcon />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-surface"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <section
          id="notifications"
          aria-label="Notifications"
          className="absolute right-0 top-full z-20 mt-2 w-80 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-xl border border-line-strong bg-panel"
        >
          <h2 className="border-b border-line px-4 py-2.5 text-[13px] font-medium">
            Notifications
          </h2>
          <NoticeList
            items={data?.items ?? []}
            fresh={fresh}
            onNavigate={() => setOpen(false)}
          />
        </section>
      )}
    </div>
  );
}
