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

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.2 18.6c1.1-2.3 3.2-3.6 5.8-3.6s4.7 1.3 5.8 3.6" />
    </svg>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const footer = user ? (
    <div className="me">
      <span className="nav-icon me-icon"><UserIcon /></span>
      <span className="nav-label me-name">{user.name}</span>
      <form action={signOut} className="nav-label">
        <button className="signout" type="submit">sign out</button>
      </form>
    </div>
  ) : (
    <Link href="/login" className="me me-link">
      <span className="nav-icon me-icon"><UserIcon /></span>
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
