import Link from "next/link";

export default function NotFound() {
  return (
    <div className="pt-16 text-center">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
        Page not found
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-muted">
        There is nothing at this address.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[13px] font-medium text-surface"
      >
        Back to the start
      </Link>
    </div>
  );
}
