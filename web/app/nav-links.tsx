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
  routing: (<svg {...S}><path d="M3 17l5-5 4 4 8-8" /><path d="M15 8h5v5" /></svg>),
  profiles: (<svg {...S}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.9-3.5 3.8-5.5 7-5.5s6.1 2 7 5.5" /></svg>),
};

const MAIN = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/matches", label: "People", icon: "people" },
  { href: "/chats", label: "Chats", icon: "chats" },
  { href: "/hangouts", label: "Memories", icon: "memories" },
];

const OPERATOR = [
  { href: "/dashboard", label: "Routing", icon: "routing" },
  { href: "/profiles", label: "Profiles", icon: "profiles" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function NavLinks() {
  const pathname = usePathname();
  const item = (l: { href: string; label: string; icon: string }) => (
    <Link
      key={l.href}
      href={l.href}
      className={`nav${isActive(pathname, l.href) ? " active" : ""}`}
      aria-current={isActive(pathname, l.href) ? "page" : undefined}
    >
      <span className="nav-icon">{ICONS[l.icon]}</span>
      {l.label}
    </Link>
  );
  return (
    <>
      {MAIN.map(item)}
      <div className="rail-group">
        <span className="rail-label">Operator</span>
        {OPERATOR.map(item)}
      </div>
    </>
  );
}
