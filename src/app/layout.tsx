import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LendLoop",
  description: "Borrow what you need. Lend what you don't.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      {/* Browser extensions add attributes to <body> before React loads. */}
      <body
        className="flex min-h-full flex-col font-sans"
        suppressHydrationWarning
      >
        <ClerkProvider>
          <Providers>
            <Header />
            <main className="mx-auto w-full max-w-[52rem] flex-1 px-5 pb-20 pt-10 sm:px-6">
              {children}
            </main>
            <footer className="border-t border-line">
              <div className="mx-auto flex max-w-[52rem] items-center justify-between gap-4 px-5 py-5 text-[13px] text-faint sm:px-6">
                <span>LendLoop</span>
                <span>Next.js, Clerk, Convex and n8n</span>
              </div>
            </footer>
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
