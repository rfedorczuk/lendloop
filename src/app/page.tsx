import { HomeCta } from "@/components/HomeCta";
import { PublicTools } from "@/components/PublicTools";

export default function Home() {
  return (
    <div className="space-y-16 pt-6 sm:pt-12">
      <section className="space-y-6">
        <h1 className="max-w-[16ch] text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.035em] [overflow-wrap:anywhere] sm:text-6xl">
          Borrow what you need. Lend what you don&apos;t.
        </h1>
        <p className="max-w-md text-[17px] leading-7 text-muted">
          A tool-lending board for neighbors. List the drill that sits in your
          closet, or borrow a ladder for the weekend.
        </p>
        <HomeCta />
      </section>

      <PublicTools />
    </div>
  );
}
