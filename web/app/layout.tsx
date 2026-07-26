import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { clearUser, currentUser } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "beagle",
  description: "the friend who knows your group — and helps it grow",
};

async function signOut() {
  "use server";
  await clearUser();
  redirect("/login");
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <div className="frame">
          <nav className="rail">
            <Link href="/" className="wordmark">🐶 beagle</Link>
            <Link href="/" className="nav">Home</Link>
            <Link href="/matches" className="nav">People</Link>
            <Link href="/chats" className="nav">Chats</Link>
            <Link href="/hangouts" className="nav">Memories</Link>
            <div className="rail-group">
              <span className="rail-label">operator</span>
              <Link href="/dashboard" className="nav">Routing</Link>
              <Link href="/profiles" className="nav">Profiles</Link>
            </div>
            <div className="foot">
              {user ? (
                <div className="me">
                  <span className="avatar">{user.name[0]}</span>
                  <span className="me-name">{user.name}</span>
                  <form action={signOut}>
                    <button className="linkish" type="submit">sign out</button>
                  </form>
                </div>
              ) : (
                <Link href="/login" className="me me-link">
                  <span className="avatar">?</span>
                  <span className="me-name">sign in</span>
                </Link>
              )}
            </div>
          </nav>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
