import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "beagle",
  description: "the friend who knows your group — and helps it grow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="frame">
          <nav className="rail">
            <Link href="/" className="wordmark">🐶 beagle</Link>
            <Link href="/" className="nav">Onboarding</Link>
            <Link href="/profiles" className="nav">Profiles</Link>
            <Link href="/hangouts" className="nav">Hangouts</Link>
            <Link href="/matches" className="nav">Matches</Link>
            <Link href="/dashboard" className="nav">Routing</Link>
            <span className="foot">operator console</span>
          </nav>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
