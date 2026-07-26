import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NavLinks } from "@/app/nav-links";
import { Sidebar } from "@/app/sidebar";
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
  const footer = user ? (
    <div className="me">
      <span className="avatar">{user.name[0]}</span>
      <span className="nav-label me-name">{user.name}</span>
      <form action={signOut} className="nav-label">
        <button className="linkish" type="submit">sign out</button>
      </form>
    </div>
  ) : (
    <Link href="/login" className="me me-link">
      <span className="avatar">?</span>
      <span className="nav-label me-name">sign in</span>
    </Link>
  );

  return (
    <html lang="en">
      <body>
        <div className="frame">
          <Sidebar footer={footer}>
            <NavLinks />
          </Sidebar>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
