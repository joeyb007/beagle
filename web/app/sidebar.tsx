"use client";
// Collapsible rail: click the wordmark to fold to icon-only, with transition.
import { useEffect, useState } from "react";

function DogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 5.5C8 4 9.9 3.5 12 3.5s4 .5 5 2" />
      <path d="M7 5.5C5.2 6.3 4.1 8.6 4.6 11c.3 1.5 1.1 2.7 2.3 3.4" />
      <path d="M17 5.5c1.8.8 2.9 3.1 2.4 5.5-.3 1.5-1.1 2.7-2.3 3.4" />
      <path d="M7 5.5c-.3 2.1 0 4.6.9 6.9C9 15.7 10.4 18 12 18s3-2.3 4.1-5.6c.9-2.3 1.2-4.8.9-6.9" />
      <circle cx="12" cy="12.7" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Sidebar({ footer, children }: { footer: React.ReactNode; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(true); // starts folded
  useEffect(() => {
    if (localStorage.getItem("beagle-rail") === "0") setCollapsed(false);
  }, []);
  const toggle = () =>
    setCollapsed((c) => {
      localStorage.setItem("beagle-rail", c ? "0" : "1");
      return !c;
    });

  return (
    <nav className={`rail${collapsed ? " collapsed" : ""}`}>
      <button className="wordmark" onClick={toggle} title={collapsed ? "expand" : "collapse"}>
        <span className="nav-icon"><DogIcon /></span>
        <span className="nav-label wm-text">Beagle</span>
      </button>
      {children}
      <div className="foot">{footer}</div>
    </nav>
  );
}
