import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hangout Planner",
  description: "Connect calendars, generate hangout options, and vote with friends",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} antialiased min-h-screen`}>
        <Providers>
          <Header />
          <main className="mx-auto max-w-lg px-4 py-6 sm:max-w-3xl sm:py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
