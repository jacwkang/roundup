import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ara — your group chat companion",
  description: "Ara lives in your group chat. A small-group messaging pilot, with planning and reservations on the way.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-8">
          <Link href="/" className="text-xl font-semibold tracking-tight">ara<span className="text-accent">.</span></Link>
          <span className="text-xs text-muted">Small-group pilot</span>
        </header>
        <main className="mx-auto max-w-3xl px-6 py-12">{children}</main>
        <footer className="mx-auto max-w-3xl px-6 py-8 text-sm text-muted"><Link href="/privacy">Privacy</Link></footer>
      </body>
    </html>
  );
}
