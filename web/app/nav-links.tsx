"use client";
// Sidebar nav with active-tab indication (Notion-style soft fill).
import Link from "next/link";
import { usePathname } from "next/navigation";

const S = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const ICONS: Record<string, React.ReactNode> = {
  home: (<svg {...S}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>),
  people: (<svg {...S}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" /><path d="M16 5.5a3 3 0 1 1 0 6" /><path d="M17.5 15c2.2.4 3.7 1.9 4.2 4" /></svg>),
  chats: (<svg {...S}><path d="M21 12a8 8 0 0 1-8 8H4l1.5-3A8 8 0 1 1 21 12Z" /></svg>),
  memories: (<svg {...S}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 3v18" /><path d="M13 8h4M13 12h4" /></svg>),
};

const MAIN = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/matches", label: "People", icon: "people" },
  { href: "/chats", label: "Chats", icon: "chats" },
  { href: "/hangouts", label: "Memories", icon: "memories" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname.startsWith(href);
}

export function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {MAIN.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`nav${isActive(pathname, l.href) ? " active" : ""}`}
          aria-current={isActive(pathname, l.href) ? "page" : undefined}
        >
          <span className="nav-icon">{ICONS[l.icon]}</span>
          <span className="nav-label">{l.label}</span>
        </Link>
      ))}
    </>
  );
}
