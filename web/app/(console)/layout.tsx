import Link from "next/link";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="frame">
      <nav className="rail">
        <Link href="/" className="wordmark">🐶 beagle</Link>
        <Link href="/onboarding" className="nav">Onboarding</Link>
        <Link href="/profiles" className="nav">Profiles</Link>
        <Link href="/hangouts" className="nav">Hangouts</Link>
        <Link href="/matches" className="nav">Matches</Link>
        <span className="foot">operator console</span>
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}
