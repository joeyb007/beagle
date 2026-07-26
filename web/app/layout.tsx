import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NavLinks } from "@/app/nav-links";
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
            <Link href="/" className="wordmark">Beagle</Link>
            <NavLinks />
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
